import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  INVALID_AGENT_PLUGIN, errorMessage, invalidAgentPlugin, isMissingPath,
  parseSkillDocument, validateManifest, validateMcpDocument, validateMcpServer,
} from './validation.js'
import { resolveExistingInside } from './paths.js'

/** Discover Agent Plugins below one explicit user-owned directory. */
export async function discoverAgentPlugins({ pluginsDirectory }) {
  const plugins = []
  const diagnostics = []
  let entries
  try {
    entries = await readdir(pluginsDirectory, { withFileTypes: true })
  } catch (error) {
    if (isMissingPath(error)) return { plugins, diagnostics }
    throw error
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const candidate = join(pluginsDirectory, entry.name)
    let root
    try {
      root = await realpath(candidate)
      if (!(await stat(root)).isDirectory()) continue
    } catch (error) {
      if (isMissingPath(error)) continue
      throw error
    }

    let manifest
    try {
      const document = await readJson(root, join(root, 'plugin.json'))
      const validated = validateManifest(document, join(root, 'plugin.json'))
      manifest = validated.manifest
      diagnostics.push(...validated.diagnostics.map(issue => ({ ...issue, plugin: manifest.name })))
    } catch (error) {
      if (isMissingPath(error) || error.code === INVALID_AGENT_PLUGIN) {
        const reason = errorMessage(error)
        diagnostics.push({ component: 'manifest', path: join(root, 'plugin.json'), message: reason, plugin: entry.name })
        plugins.push({
          name: entry.name, directoryName: entry.name, root, manifest: null, status: 'invalid', invalidReason: reason,
          skills: [], mcpServers: [],
        })
        continue
      }
      throw error
    }

    const [skills, mcp] = await Promise.all([
      discoverSkills(root, manifest.name, diagnostics),
      discoverMcp(root, manifest, diagnostics),
    ])
    plugins.push({
      name: manifest.name,
      directoryName: entry.name,
      root,
      manifest,
      status: 'ready',
      skills,
      mcpServers: mcp.servers,
      mcpPresent: mcp.present,
      ...mcp.error === undefined ? {} : { mcpError: mcp.error },
    })
  }

  const seenSkills = new Set()
  for (const plugin of plugins) {
    for (const skill of plugin.skills) {
      if (seenSkills.has(skill.name)) {
        diagnostics.push({
          component: 'skills', path: skill.path, plugin: plugin.name,
          message: `duplicate skill ${JSON.stringify(skill.name)}; the first package in sorted order wins`,
        })
      }
      seenSkills.add(skill.name)
    }
  }
  return { plugins, diagnostics }
}

async function discoverSkills(root, pluginName, diagnostics) {
  const skillsRoot = join(root, 'skills')
  let resolvedRoot
  try {
    resolvedRoot = await resolveExistingInside(root, skillsRoot)
    if (!(await stat(resolvedRoot)).isDirectory()) {
      throw invalidAgentPlugin('skills must be a directory when present', skillsRoot)
    }
  } catch (error) {
    if (isMissingPath(error)) return []
    if (error.code === INVALID_AGENT_PLUGIN) {
      diagnostics.push({ component: 'skills', path: skillsRoot, message: errorMessage(error), plugin: pluginName })
      return []
    }
    throw error
  }

  const entries = await readdir(resolvedRoot, { withFileTypes: true })
  const skills = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const directory = join(resolvedRoot, entry.name)
    try {
      const resolvedDirectory = await resolveExistingInside(root, directory)
      if (!(await stat(resolvedDirectory)).isDirectory()) continue
      const path = await resolveExistingInside(root, join(resolvedDirectory, 'SKILL.md'))
      if (!(await stat(path)).isFile()) continue
      const document = parseSkillDocument(await readFile(path, 'utf8'), entry.name, path)
      skills.push({
        name: document.name,
        description: document.description,
        path,
        directory: resolvedDirectory,
        packageDirectory: entry.name,
        ...document.license === undefined ? {} : { license: document.license },
        ...document.compatibility === undefined ? {} : { compatibility: document.compatibility },
        ...document.metadata === undefined ? {} : { metadata: document.metadata },
        ...document.allowedTools === undefined ? {} : { allowedTools: document.allowedTools },
      })
    } catch (error) {
      if (isMissingPath(error)) continue
      if (error.code === INVALID_AGENT_PLUGIN) {
        diagnostics.push({ component: 'skills', path: directory, message: errorMessage(error), plugin: pluginName })
        continue
      }
      throw error
    }
  }
  return skills
}

async function discoverMcp(root, manifest, diagnostics) {
  const path = join(root, 'mcp.json')
  let document
  try {
    document = await readJson(root, path)
  } catch (error) {
    if (isMissingPath(error)) return { servers: [], present: false }
    if (error.code === INVALID_AGENT_PLUGIN) return { servers: [], present: true, error: errorMessage(error) }
    throw error
  }

  try {
    validateMcpDocument(document, manifest.$schema, path)
  } catch (error) {
    if (error.code === INVALID_AGENT_PLUGIN) return { servers: [], present: true, error: errorMessage(error) }
    throw error
  }

  const servers = []
  for (const [name, config] of Object.entries(document.mcpServers).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      validateMcpServer(name, config, path)
      servers.push({ name, ...config })
    } catch (error) {
      if (error.code === INVALID_AGENT_PLUGIN) {
        diagnostics.push({ component: 'mcp', path, message: errorMessage(error), plugin: manifest.name })
        continue
      }
      throw error
    }
  }
  return { servers, present: true }
}

/** Revalidate and read one skill body for an on-demand provider get(). */
export async function loadAgentSkill({ pluginRoot, skillDirectory, packageDirectory, signal }) {
  const root = await realpath(pluginRoot)
  validateManifest(await readJson(root, join(root, 'plugin.json')), join(root, 'plugin.json'))
  const resolvedSkillsRoot = await resolveExistingInside(root, join(root, 'skills'))
  const directory = await resolveExistingInside(root, skillDirectory)
  if (dirname(directory) !== resolvedSkillsRoot || !(await stat(directory)).isDirectory()) return undefined
  const path = await resolveExistingInside(root, join(directory, 'SKILL.md'))
  if (!(await stat(path)).isFile()) return undefined
  const expectedName = packageDirectory ?? basename(skillDirectory)
  return parseSkillDocument(await readFile(path, { encoding: 'utf8', signal }), expectedName, path)
}

async function readJson(root, path) {
  const resolved = await resolveExistingInside(root, path)
  if (!(await stat(resolved)).isFile()) throw invalidAgentPlugin('expected a regular JSON file', path)
  const text = await readFile(resolved, 'utf8')
  try {
    return JSON.parse(text)
  } catch (error) {
    throw invalidAgentPlugin(`invalid JSON: ${errorMessage(error)}`, path)
  }
}
