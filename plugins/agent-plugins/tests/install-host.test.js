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
import { provideMcpManager } from './mcp-manager-double.js'
import { apply } from '../lib/index.js'
import { mcpServerName } from '../lib/mcp.js'

const fixture = fileURLToPath(new URL('./fixtures/agent-plugin', import.meta.url))

async function call(route, method, payload) {
  const response = await route.fetch(new Request(`http://localhost/api/agent-plugins/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'host-test', method: `agent-plugins/${method}`, payload }),
  }))
  return (await response.json()).result
}

async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('condition did not become true before timeout')
}

test('Host Git install refreshes the catalog, registers the Skill, and starts MCP', { timeout: 30_000 }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-agent-install-host-'))
  const repository = join(home, 'source')
  await mkdir(join(repository, 'plugins'), { recursive: true })
  await cp(fixture, join(repository, 'plugins', 'demo'), { recursive: true })
  await execa('git', ['init', '-b', 'main', repository])
  await execa('git', ['-C', repository, 'add', '.'])
  await execa('git', ['-C', repository, '-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture'])

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
  ctx.provide('connection', {
    fetch: {
      register: route => {
        calls.push(route)
        return async () => {}
      },
    },
  })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  provideMcpManager(ctx)
  t.after(async () => {
    await ctx.fiber.dispose()
    process.env.HOME = previousHome
    if (previousDshHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousDshHome
    await rm(home, { recursive: true, force: true })
  })

  await apply(ctx)
  assert.equal(calls[0].path, '/api/agent-plugins/catalog')
  const installRoute = calls.find(route => route.path === '/api/agent-plugins/install')
  const result = await call(installRoute, 'install', { spec: `file://${repository}&path:/plugins/demo` })
  assert.equal(result.ok, true)
  assert.equal(result.value.name, 'demo')
  await assert.rejects(stat(join(home, '.agents', 'plugins', 'demo', '.git')), { code: 'ENOENT' })

  const catalog = await call(calls[0], 'catalog', null)
  assert.equal(catalog.value.plugins[0].manifest.name, 'demo')
  assert.deepEqual((await ctx.skills.list()).map(skill => skill.name), ['verify'])
  assert.ok(skillChanges > 0, 'Git install must invalidate the live SkillRegistry')
  assert.ok(managerChanges > 0, 'Git install must notify cached skill catalogs')
  const tool = await waitFor(() => ctx.tools.get(`mcp__${mcpServerName('demo', 'local')}__add`))
  const value = await tool.execute({ a: 2, b: 3 }, { signal: new AbortController().signal })
  assert.equal(tool.output.render({ a: 2, b: 3 }, value)[0].text, '5')
  assert.equal(JSON.parse(await readFile(join(home, '.agents', 'plugins', 'demo', 'plugin.json'), 'utf8')).name, 'demo')
})
