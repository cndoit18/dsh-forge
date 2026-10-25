import { BUNDLED_SKILL_RANK } from '@deepseek-ai/dsh-skill'
import { discoverAgentPlugins, loadAgentSkill } from './discovery.js'
import { INVALID_AGENT_PLUGIN, isMissingPath } from './validation.js'

const PROVIDER = 'agent-plugins'
const INVOCATION = { modelInvocable: true, userInvocable: true }

/** Create a strict Agent Plugins v1 skill provider with on-demand body loading. */
export function createAgentSkillProvider({ pluginsDirectory }) {
  return {
    name: PROVIDER,
    async list(options = {}) {
      options.signal?.throwIfAborted()
      const catalog = await discoverAgentPlugins({ pluginsDirectory })
      options.signal?.throwIfAborted()
      return catalog.plugins.flatMap(plugin => plugin.skills.map(skill => ({
        name: skill.name,
        description: skill.description,
        path: skill.path,
        provider: PROVIDER,
        source: PROVIDER,
        rank: BUNDLED_SKILL_RANK,
        invocation: INVOCATION,
        resourceBase: { kind: 'directory', path: skill.directory },
        locator: {
          pluginRoot: plugin.root,
          skillDirectory: skill.directory,
          packageDirectory: skill.packageDirectory,
        },
        ...skill.metadata === undefined ? {} : { metadata: skill.metadata },
      })))
    },
    async get(candidate, options = {}) {
      try {
        const document = await loadAgentSkill({ ...candidate.locator, signal: options.signal })
        if (document === undefined) return undefined
        return {
          name: document.name,
          description: document.description,
          path: candidate.path,
          provider: PROVIDER,
          source: PROVIDER,
          invocation: INVOCATION,
          resourceBase: candidate.resourceBase,
          content: document.content,
          ...document.metadata === undefined ? {} : { metadata: document.metadata },
        }
      } catch (error) {
        if (isMissingPath(error) || error.code === INVALID_AGENT_PLUGIN) return undefined
        throw error
      }
    },
  }
}
