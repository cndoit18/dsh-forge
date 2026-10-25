import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
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
export async function mountAgentPluginMcpServers(ctx, plugins, { dataDirectory }) {
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
          const guarded = await guardMcpEndpoint(server, config, proxies, lifecycle)
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
async function guardMcpEndpoint(server, config, proxies, lifecycle) {
  if (server.type !== 'streamable-http' || Object.keys(server.headers ?? {}).length === 0) return { config, proxy: undefined }
  const proxy = await createRedirectGuard(server.url)
  if (lifecycle.disposed) {
    await proxy.close()
    throw new Error('Agent Plugins mount was disposed during proxy creation')
  }
  proxies.push(proxy)
  return { config: { ...config, url: proxy.url }, proxy }
}

async function createRedirectGuard(targetUrl) {
  const token = randomBytes(16).toString('hex')
  const controllers = new Set()
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1')
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
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request,
        duplex: 'half',
        redirect: 'manual',
        signal: controller.signal,
      })
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Agent Plugins redirect with configured headers refused')
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('unable to bind MCP redirect guard')
  let closed = false
  return {
    url: `http://127.0.0.1:${address.port}/${token}`,
    async close() {
      if (closed) return
      closed = true
      for (const controller of controllers) controller.abort()
      server.close()
      server.closeAllConnections()
      server.closeIdleConnections()
      server.unref()
    },
  }
}
