import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveExistingInside } from './paths.js'
import { errorMessage } from './validation.js'

/** Build the owner-only Connection RPC handler without exposing static config values. */
export function createAgentPluginsRpcHandler(catalog, { install, oauthSessions } = {}) {
  const readCatalog = () => typeof catalog === 'function' ? catalog() : catalog
  return async (endpoint, payload, signal, peer) => {
    if (peer.principal.kind !== 'owner') {
      return failure('agent-plugins/forbidden', 'Agent Plugins catalog is available to owner peers only')
    }
    if (signal.aborted) return failure('agent-plugins/cancelled', 'Agent Plugins catalog request was cancelled')
    if (endpoint === 'catalog') return { ok: true, value: projectCatalog(readCatalog()) }
    if (endpoint === 'files') return listPluginDirectory(readCatalog(), payload)
    if (endpoint === 'oauth') return oauthStatus(readCatalog(), oauthSessions, payload)
    if (endpoint === 'install' && install !== undefined) {
      if (typeof payload?.spec !== 'string') return failure('agent-plugins/invalid-request', 'install requires a Git spec')
      try {
        return { ok: true, value: await install(payload.spec, signal) }
      } catch (error) {
        return failure(typeof error?.code === 'string' && error.code.startsWith('agent-plugins/')
          ? error.code
          : 'agent-plugins/install-failed', errorMessage(error))
      }
    }
    return failure('agent-plugins/not-found', `Unknown Agent Plugins endpoint ${JSON.stringify(endpoint)}`)
  }
}

function oauthStatus(catalog, oauthSessions, payload) {
  if (typeof payload?.root !== 'string' || typeof payload.server !== 'string') {
    return failure('agent-plugins/invalid-request', 'oauth requires root and server')
  }
  const plugin = catalog.plugins.find(entry => entry.directoryName === payload.root)
  const server = plugin?.mcpServers.find(entry => entry.name === payload.server)
  if (!plugin || plugin.status !== 'ready' || !server) return failure('agent-plugins/not-found', 'MCP server was not found')
  const status = oauthSessions?.get(`${payload.root}/${payload.server}`)?.status() ?? { state: 'unavailable' }
  return { ok: true, value: status }
}

async function listPluginDirectory(catalog, payload) {
  if (typeof payload?.root !== 'string' || typeof payload.path !== 'string') {
    return failure('agent-plugins/invalid-request', 'files requires root and path')
  }
  const plugin = catalog.plugins.find(entry => entry.directoryName === payload.root)
  if (!plugin || plugin.status !== 'ready') return failure('agent-plugins/not-found', 'Plugin directory was not found')
  const relative = payload.path
  if (relative.includes('\0') || relative.includes('\\') || relative.startsWith('/') || relative.split('/').includes('..')) {
    return failure('agent-plugins/invalid-path', 'Directory path must stay within the plugin root')
  }
  const directory = join(plugin.root, relative)
  let resolved
  try {
    resolved = await resolveExistingInside(plugin.root, directory)
    if (!(await stat(resolved)).isDirectory()) {
      return failure('agent-plugins/not-directory', 'Requested path is not a directory')
    }
  } catch (error) {
    return failure('agent-plugins/invalid-path', errorMessage(error))
  }
  let entries
  try {
    entries = await readdir(resolved, { withFileTypes: true })
  } catch (error) {
    return failure('agent-plugins/unavailable', errorMessage(error))
  }
  const rows = entries
    .filter(entry => !entry.isSymbolicLink() && (entry.isDirectory() || entry.isFile()))
    .map(entry => ({
      name: entry.name,
      kind: entry.isDirectory() ? 'directory' : 'file',
      path: relative ? `${relative}/${entry.name}` : entry.name,
    }))
    .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1)
  return { ok: true, value: { path: relative, entries: rows.slice(0, 200), truncated: rows.length > 200 } }
}

/** Register exact catalog routes on the shared Connection API channel. */
export function registerAgentPluginsRpc(ctx, catalog, options) {
  const handler = createAgentPluginsRpcHandler(catalog, options)
  const disposers = ['catalog', 'files', 'install', 'oauth'].map(method => ctx.connection.fetch.register({
    path: `/api/agent-plugins/${method}`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async request => {
      let message
      try {
        message = clientRequestSchema.parse(await request.json())
      } catch {
        return new Response('invalid client-request message', { status: 400 })
      }
      if (message.method !== `agent-plugins/${method}`) return new Response('method does not match endpoint', { status: 400 })
      const result = await handler(method, message.payload, request.signal, { principal: { kind: 'owner' } })
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result })
    },
  }))
  return async () => { await Promise.all(disposers.map(dispose => dispose())) }
}

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

/** Keep transport config useful to the UI without exposing env or header values. */
function projectCatalog(catalog) {
  return {
    ...catalog,
    plugins: catalog.plugins.map(plugin => ({
      ...plugin,
      mcpServers: plugin.mcpServers.map(server => ({
        name: server.name,
        type: server.type,
        ...server.type === 'stdio' ? {
          command: server.command,
          args: server.args ?? [],
          ...server.cwd === undefined ? {} : { cwd: server.cwd },
        } : {
          url: server.url,
          headerNames: Object.keys(server.headers ?? {}),
        },
      })),
    })),
  }
}
