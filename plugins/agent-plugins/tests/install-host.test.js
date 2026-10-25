import assert from 'node:assert/strict'
import { execa } from 'execa'
import { cp, mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'
import { mcpServerName } from '../lib/mcp.js'

const fixture = fileURLToPath(new URL('./fixtures/agent-plugin', import.meta.url))

async function post(route, method, payload) {
  let status
  let body = ''
  const request = {
    method: 'POST', url: `/agent-plugins/${method}`,
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'install-test', method, payload })) },
    destroy() {},
  }
  const response = {
    on() {},
    writeHead(code) { status = code; return this },
    end(chunk) { body += chunk ?? ''; return this },
  }
  await route.handler(request, response)
  return { status, body: JSON.parse(body) }
}

test('Host Git install refreshes the catalog, registers the Skill, and starts MCP', { timeout: 30_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-agent-install-host-'))
  const repository = join(home, 'source')
  await mkdir(join(repository, 'plugins'), { recursive: true })
  await cp(fixture, join(repository, 'plugins', 'demo'), { recursive: true })
  await execa('git', ['init', '-b', 'main', repository])
  await execa('git', ['-C', repository, 'add', '.'])
  await execa('git', ['-C', repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture'])

  const previousHome = process.env.HOME
  const previousDshHome = process.env.DSH_HOME
  process.env.HOME = home
  process.env.DSH_HOME = join(home, '.dsh')
  const ctx = new Context()
  let skillChanges = 0
  ctx.on('skills/change', () => { skillChanges++ })
  let managerChanges = 0
  ctx.on('plugin-manager/changed', () => { managerChanges++ })
  const calls = []
  ctx.provide('connection', { admit: () => ({ peer: { principal: { kind: 'owner' } } }) })
  ctx.provide('webServer', { register: route => { calls.push(route); return () => {} } })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  t.after(async () => {
    await ctx.fiber.dispose()
    process.env.HOME = previousHome
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    await rm(home, { recursive: true, force: true })
  })

  await apply(ctx)
  const result = await post(calls[0], 'install', { spec: `file://${repository}&path:/plugins/demo` })
  assert.equal(result.status, 200)
  assert.equal(result.body.result.ok, true)
  assert.equal(result.body.result.value.name, 'demo')
  await assert.rejects(stat(join(home, '.agents', 'plugins', 'demo', '.git')), { code: 'ENOENT' })

  const catalog = await post(calls[0], 'catalog', null)
  assert.equal(catalog.body.result.value.plugins[0].manifest.name, 'demo')
  assert.deepEqual((await ctx.skills.list()).map(skill => skill.name), ['verify'])
  assert.ok(skillChanges > 0, 'Git install must invalidate the live SkillRegistry')
  assert.ok(managerChanges > 0, 'Git install must notify cached skill catalogs')
  const tool = ctx.tools.get(`mcp__${mcpServerName('demo', 'local')}__add`)
  const value = await tool.execute({ a: 2, b: 3 }, { signal: new AbortController().signal })
  assert.equal(tool.output.render({ a: 2, b: 3 }, value)[0].text, '5')
  assert.equal(JSON.parse(await readFile(join(home, '.agents', 'plugins', 'demo', 'plugin.json'), 'utf8')).name, 'demo')
})
