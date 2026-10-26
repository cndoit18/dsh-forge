import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { createMcpOAuthSession } from './mcp-oauth.js'
import { resolveLaunchInside } from './paths.js'
import { errorMessage, invalidAgentPlugin } from './validation.js'

/** Derive a stable DSH-safe server identity from package directory and server key. */
export function mcpServerName(packageDirectory, serverKey) {
  const identity = `${packageDirectory}/${serverKey}`
  const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 8)
  const normalized = identity.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'agent'
  return `${normalized.slice(0, 32 - suffix.length - 1)}_${suffix}`
}

/** Expand both plugin variables once, without rescanning replacement text. */
export function expandPluginVariables(value, pluginRoot, pluginData) {
  return value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (_match, name) => name === 'ROOT' ? pluginRoot : pluginData)
}

/** Translate one validated Agent Plugins server into the existing DSH client config. */
export async function createMcpClientConfig({ plugin, server, dataDirectory }) {
  const serverName = mcpServerName(plugin.directoryName, server.name)
  if (server.type === 'streamable-http') {
    return McpClient.Config({
      transport: 'streamable-http',
      serverName,
      url: server.url,
      headers: server.headers ?? {},
      failOnStartupError: false,
    })
  }
  if (server.type !== 'stdio') {
    throw invalidAgentPlugin(`unsupported MCP transport ${JSON.stringify(server.type)}`, join(plugin.root, 'mcp.json'))
  }

  const pluginRoot = plugin.root
  const pluginData = join(dataDirectory, plugin.directoryName)
  await mkdir(pluginData, { recursive: true })
  const command = server.command.startsWith('./')
    ? await resolveLaunchInside(pluginRoot, resolve(pluginRoot, server.command))
    : server.command
  const rawCwd = server.cwd ?? '${PLUGIN_ROOT}'
  const expandedCwd = expandPluginVariables(rawCwd, pluginRoot, pluginData)
  const cwdRoot = rawCwd.startsWith('${PLUGIN_DATA}') ? pluginData : pluginRoot
  const cwd = await resolveLaunchInside(cwdRoot, resolve(cwdRoot, expandedCwd))
  const args = (server.args ?? []).map(value => expandPluginVariables(value, pluginRoot, pluginData))
  const env = Object.fromEntries(Object.entries(server.env ?? {})
    .map(([name, value]) => [name, expandPluginVariables(value, pluginRoot, pluginData)]))
  env.PLUGIN_ROOT = pluginRoot
  env.PLUGIN_DATA = pluginData

  return McpClient.Config({
    transport: 'stdio',
    serverName,
    command,
    args,
    env,
    cwd,
    failOnStartupError: false,
  })
}

/** Mount every valid server independently; one failure never blocks siblings. */
export async function mountAgentPluginMcpServers(ctx, plugins, {
  dataDirectory, oauthSessions = new Map(), fetch: fetchFn = fetch,
  oauthBindHost = process.env.AGENT_PLUGINS_OAUTH_BIND_HOST ?? '127.0.0.1',
}) {
  const proxies = []
  const lifecycle = { disposed: false }
  ctx.effect(() => async () => {
    lifecycle.disposed = true
    await Promise.all(proxies.map(proxy => proxy.close()))
  }, 'agent-plugins: redirect-denying HTTP forwarders')
  const starts = []
  for (const plugin of plugins) {
    for (const server of plugin.mcpServers) {
      starts.push((async () => {
        let proxy
        try {
          const config = await createMcpClientConfig({ plugin, server, dataDirectory })
          const guarded = await guardMcpEndpoint({
            plugin, server, config, proxies, lifecycle, dataDirectory, oauthSessions, fetchFn, oauthBindHost,
          })
          proxy = guarded.proxy
          if (lifecycle.disposed) throw new Error('Agent Plugins mount was disposed during startup')
          return await ctx.plugin(McpClient, guarded.config)
        } catch (error) {
          if (proxy) {
            const index = proxies.indexOf(proxy)
            if (index >= 0) proxies.splice(index, 1)
            await proxy.close().catch(closeError => {
              ctx.logger.warn(`[agent-plugins] MCP ${plugin.name}/${server.name}: redirect guard cleanup failed: ${errorMessage(closeError)}`)
            })
          }
          ctx.logger.warn(`[agent-plugins] MCP ${plugin.name}/${server.name}: ${errorMessage(error)}`)
          return undefined
        }
      })())
    }
  }
  return (await Promise.all(starts)).filter(Boolean)
}

/** Refuse every redirect response for credentialed endpoints, per actual response. */
async function guardMcpEndpoint({ plugin, server, config, proxies, lifecycle, dataDirectory, oauthSessions, fetchFn, oauthBindHost }) {
  if (server.type !== 'streamable-http') return { config, proxy: undefined }
  const hasConfiguredHeaders = Object.keys(server.headers ?? {}).length > 0
  const key = `${plugin.directoryName}/${server.name}`
  const oauth = !hasConfiguredHeaders && await requiresOAuth(server.url, fetchFn)
    ? await createMcpOAuthSession({
        serverUrl: server.url,
        stateFile: join(dataDirectory, plugin.directoryName, `${mcpServerName(plugin.directoryName, server.name)}.oauth.json`),
      })
    : undefined
  if (!hasConfiguredHeaders && !oauth) return { config, proxy: undefined }
  const proxy = await createRedirectGuard(server.url, {
    oauth, oauthBindHost,
    onClose: () => {
      if (oauth && oauthSessions.get(key) === oauth) oauthSessions.delete(key)
    },
  })
  if (lifecycle.disposed) {
    await proxy.close()
    throw new Error('Agent Plugins mount was disposed during proxy creation')
  }
  proxies.push(proxy)
  if (oauth) {
    oauthSessions.set(key, oauth)
    config = {
      ...config,
      reconnect: { ...config.reconnect, maxAttempts: Number.MAX_SAFE_INTEGER },
    }
  }
  return { config: { ...config, url: proxy.url }, proxy }
}

async function requiresOAuth(url, fetchFn) {
  try {
    const response = await fetchFn(url, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5_000),
    })
    const challenge = response.headers.get('www-authenticate') ?? ''
    await response.body?.cancel().catch(() => {})
    return response.status === 401 && /^Bearer(?:\s|$)/i.test(challenge)
  } catch {
    return false
  }
}

async function createRedirectGuard(targetUrl, { oauth, oauthBindHost = '127.0.0.1', onClose } = {}) {
  const token = randomBytes(16).toString('hex')
  const controllers = new Set()
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1')
    if (oauth && requestUrl.pathname === '/oauth/callback') {
      try {
        await oauth.complete(Object.fromEntries(requestUrl.searchParams))
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        response.end(renderOAuthCallbackPage({
          title: 'Authorization complete',
          message: 'Return to DeepSeek Harness. You can close this page.',
          autoClose: true,
        }))
      } catch (error) {
        response.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        response.end(renderOAuthCallbackPage({ title: 'Authorization failed', message: errorMessage(error), error: true }))
      }
      return
    }
    if (requestUrl.pathname !== `/${token}`) {
      response.writeHead(404).end()
      return
    }
    const upstreamUrl = new URL(targetUrl)
    if (requestUrl.search) upstreamUrl.search = requestUrl.search
    const controller = new AbortController()
    controllers.add(controller)
    response.on('close', () => controller.abort())
    try {
      const headers = { ...request.headers }
      delete headers.host
      delete headers.connection
      delete headers['content-length']
      delete headers['transfer-encoding']
      const body = ['GET', 'HEAD'].includes(request.method)
        ? undefined
        : oauth ? await readRequestBody(request) : request
      const upstream = await (oauth?.fetch ?? fetch)(upstreamUrl, {
        method: request.method,
        headers,
        body,
        duplex: 'half',
        redirect: 'manual',
        signal: controller.signal,
      })
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Agent Plugins redirect with configured credentials refused')
        return
      }
      const responseHeaders = {}
      for (const [name, value] of upstream.headers) {
        if (!['connection', 'keep-alive', 'transfer-encoding', 'content-length', 'content-encoding'].includes(name)) {
          responseHeaders[name] = value
        }
      }
      response.writeHead(upstream.status, responseHeaders)
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response, { signal: controller.signal })
      else response.end()
    } catch (error) {
      if (!controller.signal.aborted) {
        if (response.headersSent) {
          response.destroy()
        } else {
          response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
          response.end('MCP upstream request failed')
        }
      }
    } finally {
      controllers.delete(controller)
    }
  })
  const preferredPort = oauth ? preferredCallbackPort(oauth.preferredRedirectUrl) : 0
  const bindHost = oauth ? oauthBindHost : '127.0.0.1'
  if (preferredPort) {
    try {
      await listen(server, preferredPort, bindHost)
    } catch {
      await listen(server, 0, bindHost)
    }
  } else {
    await listen(server, 0, bindHost)
  }
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('unable to bind MCP redirect guard')
  if (oauth) {
    try {
      await oauth.useRedirectUrl(`http://127.0.0.1:${address.port}/oauth/callback`)
    } catch (error) {
      server.close()
      throw error
    }
  }
  let closed = false
  return {
    url: `http://127.0.0.1:${address.port}/${token}`,
    async close() {
      if (closed) return
      closed = true
      await onClose?.()
      for (const controller of controllers) controller.abort()
      server.close()
      server.closeAllConnections()
      server.closeIdleConnections()
      server.unref()
    },
  }
}

function renderOAuthCallbackPage({ title, message, error = false, autoClose = false }) {
  const style = `
    :root{color-scheme:light;--background:#f5f6f7;--surface:#ffffff;--text:#0f1115;--secondary:#61666b;--border:#0000001a;--status:#22c55e}
    @media(prefers-color-scheme:dark){:root{color-scheme:dark;--background:#151517;--surface:#2c2c2e;--text:#f9fafb;--secondary:#cfd3d6;--border:rgba(255,255,255,.12)}main{box-shadow:none}}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--background);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif}
    main{display:flex;gap:12px;width:min(100%,420px);padding:24px;border:.5px solid var(--border);border-radius:20px;background:var(--surface);box-shadow:0 3px 8px #00000008,0 0 16px #00000005}
    .dot{flex:none;width:8px;height:8px;margin-top:10px;border-radius:999px;background:var(--status)}
    h1{margin:0 0 8px;font-size:20px;line-height:28px;font-weight:500}
    p{margin:0;color:var(--secondary);font-size:13px;line-height:20px;overflow-wrap:anywhere}
    .error{--status:#ec1313}
    @media(prefers-color-scheme:dark){.error{--status:#f25a5a}}
  `
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${style}</style></head><body><main class="${error ? 'error' : 'success'}" role="${error ? 'alert' : 'status'}"><span class="dot" aria-hidden="true"></span><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></main>${autoClose ? '<script>window.close()</script>' : ''}</body></html>`
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function preferredCallbackPort(value) {
  if (!value) return 0
  try {
    const url = new URL(value)
    const port = Number(url.port)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number.isInteger(port) && port > 0 && port <= 65_535 ? port : 0
  } catch {
    return 0
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })
}

async function readRequestBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.byteLength
    if (size > 16 * 1024 * 1024) throw new Error('OAuth MCP request body exceeds 16 MiB')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
