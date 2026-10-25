import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  createMcpClientConfig, expandPluginVariables, mcpServerName, mountAgentPluginMcpServers,
} from '../lib/mcp.js'

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-agent-mcp-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

function plugin(root, servers) {
  return { name: 'demo', directoryName: 'demo', root, mcpServers: servers }
}

test('server names are stable, DSH-safe, bounded, and package-qualified', () => {
  const first = mcpServerName('demo.plugin', 'search/api')
  assert.match(first, /^[A-Za-z0-9_-]{1,32}$/)
  assert.equal(first, mcpServerName('demo.plugin', 'search/api'))
  assert.notEqual(first, mcpServerName('other', 'search/api'))
  assert.notEqual(first, mcpServerName('demo.plugin', 'other'))
})

test('plugin variables expand exactly once', () => {
  const expanded = expandPluginVariables('${PLUGIN_ROOT}/value/${PLUGIN_DATA}', '${PLUGIN_DATA}/root', '/data')
  assert.equal(expanded, '${PLUGIN_DATA}/root/value//data')
  assert.equal(expandPluginVariables('${UNKNOWN}', '/root', '/data'), '${UNKNOWN}')
})

test('stdio config resolves command, defaults cwd, and injects reserved environment last', async (t) => {
  const root = await fixture(t)
  const dataDirectory = join(root, 'data')
  const config = await createMcpClientConfig({
    plugin: plugin(root, []),
    server: {
      name: 'local', type: 'stdio', command: './bin/server',
      args: ['--root', '${PLUGIN_ROOT}', '--data', '${PLUGIN_DATA}'],
      env: { CONFIG: '${PLUGIN_ROOT}/config.json', CACHE: '${PLUGIN_DATA}/cache' },
    },
    dataDirectory,
  })
  assert.equal(config.transport, 'stdio')
  assert.equal(config.command, join(root, 'bin/server'))
  assert.equal(config.cwd, root)
  assert.deepEqual(config.args, ['--root', root, '--data', join(dataDirectory, 'demo')])
  assert.equal(config.env.CONFIG, join(root, 'config.json'))
  assert.equal(config.env.CACHE, join(dataDirectory, 'demo', 'cache'))
  assert.equal(config.env.PLUGIN_ROOT, root)
  assert.equal(config.env.PLUGIN_DATA, join(dataDirectory, 'demo'))
  assert.equal((await stat(config.env.PLUGIN_DATA)).isDirectory(), true)
})

test('PLUGIN_DATA cwd remains inside the dedicated data root', async (t) => {
  const root = await fixture(t)
  const dataDirectory = join(root, 'data')
  const config = await createMcpClientConfig({
    plugin: plugin(root, []),
    server: { name: 'local', type: 'stdio', command: 'node', cwd: '${PLUGIN_DATA}/nested/cache' },
    dataDirectory,
  })
  assert.equal(config.cwd, join(dataDirectory, 'demo', 'nested', 'cache'))
})

test('escaping command and cwd paths reject only the offending server', async (t) => {
  const root = await fixture(t)
  const dataDirectory = join(root, 'data')
  await assert.rejects(createMcpClientConfig({
    plugin: plugin(root, []),
    server: { name: 'bad', type: 'stdio', command: './../outside' },
    dataDirectory,
  }), /outside/)
  await assert.rejects(createMcpClientConfig({
    plugin: plugin(root, []),
    server: { name: 'bad', type: 'stdio', command: 'node', cwd: '${PLUGIN_DATA}/../outside' },
    dataDirectory,
  }), /outside/)
})

test('HTTP config keeps URL and header values literal', async (t) => {
  const root = await fixture(t)
  const config = await createMcpClientConfig({
    plugin: plugin(root, []),
    server: {
      name: 'remote', type: 'streamable-http', url: 'https://example.com/mcp',
      headers: { 'X-Plugin-Root': '${PLUGIN_ROOT}', Authorization: 'literal-token' },
    },
    dataDirectory: join(root, 'data'),
  })
  assert.equal(config.transport, 'streamable-http')
  assert.equal(config.url, 'https://example.com/mcp')
  assert.equal(config.headers['X-Plugin-Root'], '${PLUGIN_ROOT}')
  assert.equal(config.headers.Authorization, 'literal-token')
})

test('legacy SSE is skipped as unsupported', async (t) => {
  const root = await fixture(t)
  await assert.rejects(createMcpClientConfig({
    plugin: plugin(root, []),
    server: { name: 'legacy', type: 'sse', url: 'https://example.com/sse' },
    dataDirectory: join(root, 'data'),
  }), /unsupported MCP transport/)
})

test('mounting isolates config and startup failures without exposing config values', async (t) => {
  const root = await fixture(t)
  const dataDirectory = join(root, 'data')
  const calls = []
  const warnings = []
  const ctx = {
    plugin: async (_client, config) => {
      calls.push(config)
      if (calls.length === 2) throw new Error('startup failed')
      return { config }
    },
    logger: { warn: message => warnings.push(message) },
    effect: callback => callback(),
  }
  const packages = [plugin(root, [
    { name: 'bad', type: 'stdio', command: './../outside' },
    { name: 'good', type: 'stdio', command: 'node' },
    { name: 'remote', type: 'streamable-http', url: 'https://example.com/mcp' },
  ])]
  const children = await mountAgentPluginMcpServers(ctx, packages, { dataDirectory })
  assert.equal(calls.length, 2)
  assert.equal(children.length, 1)
  assert.equal(warnings.some(message => message.includes('bad')), true)
  assert.equal(warnings.some(message => message.includes('startup failed')), true)
})
