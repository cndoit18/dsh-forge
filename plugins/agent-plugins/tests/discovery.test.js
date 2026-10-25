import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { discoverAgentPlugins } from '../lib/discovery.js'

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-plugins-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function write(root, path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  return target
}

function manifest(name, extra = {}) {
  return JSON.stringify({ $schema: SCHEMA, name, ...extra })
}

function skill(name, description = 'Use this skill for focused verification.', extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\nFollow the verification instructions.\n`
}

function mcp(servers) {
  return JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: servers })
}

function plugin(catalog, name) {
  return catalog.plugins.find(entry => entry.manifest?.name === name || entry.name === name)
}

test('a missing user plugin directory is empty and no workspace directory is consulted', async (t) => {
  const root = await workspace(t)
  const workspaceOnly = join(root, 'workspace', '.agent', 'plugins')
  await write(workspaceOnly, 'workspace-only/plugin.json', manifest('workspace-only'))
  const catalog = await discoverAgentPlugins({ pluginsDirectory: join(root, 'home', '.agent', 'plugins') })
  assert.deepEqual(catalog, { plugins: [], diagnostics: [] })
})

test('discovers only direct packages and immediate skill directories', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha', { version: '1.2.0' }))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(home, 'alpha/skills/flat.md', skill('flat'))
  await write(home, 'alpha/skills/nested/deep/SKILL.md', skill('deep'))
  await write(home, 'alpha/notes.txt', 'not a component')
  await write(home, 'not-a-package.txt', 'not a plugin')

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(catalog.plugins.length, 1)
  assert.equal(plugin(catalog, 'alpha').status, 'ready')
  assert.deepEqual(plugin(catalog, 'alpha').skills.map(entry => entry.name), ['good'])
  assert.equal(plugin(catalog, 'alpha').manifest.version, '1.2.0')
})

test('unknown manifest fields and non-object extensions are reported but do not reject the plugin', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha', {
    extensions: false,
    futureField: { ignored: true },
  }))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(plugin(catalog, 'alpha').status, 'ready')
  assert.equal(plugin(catalog, 'alpha').skills.length, 1)
  assert.equal(plugin(catalog, 'alpha').manifest.extensions, undefined)
  assert.equal(plugin(catalog, 'alpha').manifest.futureField, undefined)
  assert.equal(catalog.diagnostics.length, 2)
})

test('unimplemented extension namespaces are ignored without validating their values', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha', {
    extensions: { 'com.example.client': false, 'ai.deepseek.dsh': { hooks: { enabled: true } } },
  }))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(plugin(catalog, 'alpha').status, 'ready')
  assert.equal(plugin(catalog, 'alpha').skills.length, 1)
  assert.deepEqual(plugin(catalog, 'alpha').manifest.extensions['com.example.client'], false)
})

test('a fatal manifest error rejects the package without discovering its skills', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'Bad_Name/plugin.json', manifest('Bad_Name'))
  await write(home, 'Bad_Name/skills/good/SKILL.md', skill('good'))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(plugin(catalog, 'Bad_Name').status, 'invalid')
  assert.equal(plugin(catalog, 'Bad_Name').skills.length, 0)
  assert.match(plugin(catalog, 'Bad_Name').invalidReason, /plugin\.json/)
})

test('skill validation failures stay isolated to the offending skill', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(home, 'alpha/skills/mismatch/SKILL.md', skill('other-name'))
  await write(home, 'alpha/skills/metadata/SKILL.md', skill('metadata', 'A valid description.', 'metadata:\n  version: 1\n'))
  await write(home, 'alpha/skills/missing/SKILL.md', 'not frontmatter')

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.deepEqual(plugin(catalog, 'alpha').skills.map(entry => entry.name), ['good'])
  assert.equal(catalog.diagnostics.filter(entry => entry.component === 'skills').length, 3)
})

test('Agent Skills optional fields retain their validated values', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good', 'A valid description.', [
    'license: Apache-2.0',
    'compatibility: Requires Node.js',
    'metadata:',
    '  author: example',
    '  version: "1.0"',
    'allowed-tools: Bash(git:*) Read',
  ].join('\n') + '\n'))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  const [entry] = plugin(catalog, 'alpha').skills
  assert.equal(entry.license, 'Apache-2.0')
  assert.equal(entry.compatibility, 'Requires Node.js')
  assert.deepEqual(entry.metadata, { author: 'example', version: '1.0' })
  assert.equal(entry.allowedTools, 'Bash(git:*) Read')
})

test('realpath escapes use the narrowest component failure boundary', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(home, 'alpha/mcp.json', mcp({}))
  await write(root, 'outside/SKILL.md', skill('outside'))
  await symlink(join(root, 'outside'), join(home, 'alpha/skills/escape'), 'dir')
  await write(home, 'broken/plugin.json', manifest('broken'))
  await symlink(join(root, 'outside'), join(home, 'broken/skills'), 'dir')

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.deepEqual(plugin(catalog, 'alpha').skills.map(entry => entry.name), ['good'])
  assert.equal(plugin(catalog, 'alpha').mcpServers.length, 0)
  assert.equal(plugin(catalog, 'broken').status, 'ready')
  assert.equal(plugin(catalog, 'broken').skills.length, 0)
  assert.equal(plugin(catalog, 'broken').mcpServers.length, 0)
  assert.ok(catalog.diagnostics.some(entry => entry.component === 'skills'))
})

test('a manifest symlink escaping its package root rejects the package', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(root, 'outside/plugin.json', manifest('alpha'))
  await symlink(join(root, 'outside/plugin.json'), join(home, 'alpha/plugin.json'))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(plugin(catalog, 'alpha').status, 'invalid')
  assert.equal(plugin(catalog, 'alpha').skills.length, 0)
})

test('invalid MCP configuration disables only MCP for that package', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(home, 'alpha/mcp.json', JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: {}, extra: true }))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.equal(plugin(catalog, 'alpha').status, 'ready')
  assert.equal(plugin(catalog, 'alpha').skills.length, 1)
  assert.equal(plugin(catalog, 'alpha').mcpServers.length, 0)
  assert.match(plugin(catalog, 'alpha').mcpError, /mcp\.json/)
})

test('an invalid MCP server is skipped while other servers and skills remain valid', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/skills/good/SKILL.md', skill('good'))
  await write(home, 'alpha/mcp.json', mcp({
    good: { type: 'streamable-http', url: 'https://example.com/mcp' },
    bad: { type: 'streamable-http', url: 'https://user:secret@example.com/mcp' },
  }))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.deepEqual(plugin(catalog, 'alpha').mcpServers.map(entry => entry.name), ['good'])
  assert.equal(plugin(catalog, 'alpha').skills.length, 1)
  assert.equal(catalog.diagnostics.filter(entry => entry.component === 'mcp').length, 1)
})

test('MCP schema and transport validation accepts both supported types and legacy SSE for later optional handling', async (t) => {
  const root = await workspace(t)
  const home = join(root, 'home', '.agent', 'plugins')
  await write(home, 'alpha/plugin.json', manifest('alpha'))
  await write(home, 'alpha/mcp.json', mcp({
    local: { type: 'stdio', command: './bin/server', args: ['${PLUGIN_DATA}/cache'] },
    remote: { type: 'streamable-http', url: 'https://example.com/mcp' },
    legacy: { type: 'sse', url: 'https://example.com/sse' },
  }))

  const catalog = await discoverAgentPlugins({ pluginsDirectory: home })
  assert.deepEqual(plugin(catalog, 'alpha').mcpServers.map(entry => entry.type), ['sse', 'stdio', 'streamable-http'])
})
