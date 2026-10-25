import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { createAgentPluginsRpcHandler } from '../lib/rpc.js'

const OWNER = { principal: { kind: 'owner' } }

test('files returns bounded directory entries and rejects paths outside the plugin root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-files-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'skills', 'verify'), { recursive: true })
  await writeFile(join(root, 'skills', 'verify', 'SKILL.md'), '# Verify\n')
  await writeFile(join(root, 'plugin.json'), '{"name":"demo"}')
  const outside = join(root, '..', 'outside')
  await mkdir(outside, { recursive: true })
  await symlink(outside, join(root, 'escape'), 'dir')
  const catalog = {
    plugins: [{ name: 'demo', directoryName: 'demo', root, status: 'ready', skills: [], mcpServers: [] }],
    diagnostics: [],
  }
  const handler = createAgentPluginsRpcHandler(catalog)

  const rootResult = await handler('files', { root: 'demo', path: '' }, new AbortController().signal, OWNER)
  assert.equal(rootResult.ok, true)
  assert.deepEqual(rootResult.value.entries.map(entry => [entry.kind, entry.path]), [
    ['directory', 'skills'],
    ['file', 'plugin.json'],
  ])

  const nested = await handler('files', { root: 'demo', path: 'skills/verify' }, new AbortController().signal, OWNER)
  assert.deepEqual(nested.value.entries, [{ name: 'SKILL.md', kind: 'file', path: 'skills/verify/SKILL.md' }])

  const escape = await handler('files', { root: 'demo', path: '../outside' }, new AbortController().signal, OWNER)
  assert.equal(escape.ok, false)
  assert.equal(escape.error.code, 'agent-plugins/invalid-path')

  const missing = await handler('files', { root: 'demo', path: 'escape' }, new AbortController().signal, OWNER)
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'agent-plugins/invalid-path')
})

test('files returns an empty directory and rejects an unknown plugin', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-agent-files-empty-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const catalog = { plugins: [{ name: 'demo', directoryName: 'demo', root, status: 'ready', skills: [], mcpServers: [] }], diagnostics: [] }
  const handler = createAgentPluginsRpcHandler(catalog)
  const empty = await handler('files', { root: 'demo', path: '' }, new AbortController().signal, OWNER)
  assert.deepEqual(empty.value.entries, [])
  const unknown = await handler('files', { root: 'unknown', path: '' }, new AbortController().signal, OWNER)
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'agent-plugins/not-found')
})
