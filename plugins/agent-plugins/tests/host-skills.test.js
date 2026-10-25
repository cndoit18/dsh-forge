import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { apply } from '../lib/index.js'
import { createAgentPluginsRpcHandler } from '../lib/rpc.js'
import { discoverAgentPlugins } from '../lib/discovery.js'

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

test('Host activation exposes a real skill and its startup catalog through Connection RPC', async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-agent-host-'))
  const previousHome = process.env.HOME
  process.env.HOME = home
  const ctx = new Context()
  const calls = []
  ctx.provide('connection', {
    admit: () => ({ peer: { principal: { kind: 'owner' } } }),
  })
  ctx.provide('webServer', {
    register: route => {
      calls.push({ channel: route.path, handler: route.handler })
      return () => {}
    },
  })
  await ctx.plugin(SkillRegistry)
  t.after(async () => {
    process.env.HOME = previousHome
    await ctx.fiber.dispose()
    await rm(home, { recursive: true, force: true })
  })

  const root = join(home, '.agents', 'plugins')
  const manifestPath = join(root, 'demo', 'plugin.json')
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify({ $schema: SCHEMA, name: 'demo' }))
  const skillPath = join(root, 'demo', 'skills', 'verify', 'SKILL.md')
  await mkdir(dirname(skillPath), { recursive: true })
  await writeFile(skillPath, '---\nname: verify\ndescription: Verify Host loading.\n---\n\nHost-loaded instructions.\n')

  await apply(ctx)
  const catalog = await discoverAgentPlugins({ pluginsDirectory: root })
  assert.deepEqual((await ctx.skills.list()).map(skill => skill.name), ['verify'])
  assert.equal((await ctx.skills.get('verify')).content, 'Host-loaded instructions.')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].channel, '/agent-plugins')
  const result = await createAgentPluginsRpcHandler(catalog)('catalog', null, new AbortController().signal, { principal: { kind: 'owner' } })
  assert.equal(result.ok, true)
  assert.equal(result.value.plugins[0].manifest.name, 'demo')
  assert.equal(result.value.plugins[0].skills[0].name, 'verify')
})
