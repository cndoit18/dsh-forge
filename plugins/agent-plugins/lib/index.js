import { homedir } from 'node:os'
import { join } from 'node:path'
import { discoverAgentPlugins } from './discovery.js'
import { createAgentSkillProvider } from './skills.js'
import { registerAgentPluginsRpc } from './rpc.js'
import { mountAgentPluginMcpServers } from './mcp.js'
import { installAgentPlugin } from './install.js'

export const name = 'agent-plugins'
export const inject = ['skills', 'connection', 'mcpManager']

/** Mount Agent Plugin discovery and the strict Skills provider. */
export async function apply(ctx) {
  const pluginsDirectory = join(homedir(), '.agents', 'plugins')
  let invalidateSkills = () => {}
  ctx.effect(() => ctx.skills.registerProvider((control) => {
    invalidateSkills = control.invalidate
    return createAgentSkillProvider({ pluginsDirectory })
  }), 'agent-plugins: skills provider')
  const dataDirectory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'agent-plugins', 'data')
  const oauthSessions = new Map()
  let catalog = await discoverAgentPlugins({ pluginsDirectory })
  const install = async (spec, signal) => {
    const installed = await installAgentPlugin({ pluginsDirectory, spec, signal })
    catalog = await discoverAgentPlugins({ pluginsDirectory })
    invalidateSkills()
    ctx.emit('plugin-manager/changed', { reason: 'install' })
    const plugin = catalog.plugins.find(entry => entry.directoryName === installed.name && entry.status === 'ready')
    if (plugin !== undefined) await mountAgentPluginMcpServers(ctx, [plugin], { dataDirectory, oauthSessions })
    return installed
  }
  for (const issue of catalog.diagnostics) {
    ctx.logger.warn(`[agent-plugins] ${issue.plugin ?? 'catalog'}: ${issue.message}`)
  }
  ctx.effect(() => registerAgentPluginsRpc(ctx.root, () => catalog, { install, oauthSessions }), 'agent-plugins: catalog route')
  await mountAgentPluginMcpServers(ctx, catalog.plugins, { dataDirectory, oauthSessions })
}
