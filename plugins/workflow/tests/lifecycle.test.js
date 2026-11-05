import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPlugins, createHarness, execution, registerWorkflow } from './harness.js'

test('a failing provider does not remove healthy bundled workflows or block execution', async () => {
  const { ctx, agent, command, tools, runs, jobs, activateAgent, warnings } = createHarness()
  applyPlugins(ctx)
  for (const name of ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research']) {
    registerWorkflow(ctx, { name, description: name, script: 'return "ok"' })
  }
  let failing = true
  const disposeFailure = ctx.workflows.registerProvider(() => ({
    name: 'failing-filesystem',
    async list() {
      if (failing) throw new Error('EACCES')
      return [{
        name: 'recovered', description: 'Recovered', source: 'project-dsh', provider: 'filesystem', rank: 100, locator: null,
      }]
    },
    async get() { throw new Error('unreachable') },
  }))
  await activateAgent()
  for (const name of ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify', 'batch', 'deep-research']) {
    assert.ok(command(name), `missing healthy /${name}`)
  }
  const started = await tools.get('run_workflow').execute({ name: 'init', input: '' }, execution(agent))
  assert.equal(started.name, 'init')
  await jobs[0].hooks.done
  assert.ok(warnings.some(message => message.includes('failing-filesystem')))

  failing = false
  const reloaded = await ctx.commands.find(agent, 'workflows').handler({ agent, rawInput: 'reload' })
  assert.equal(reloaded.kind, 'success')
  assert.ok(command('recovered'))
  assert.equal(runs.length, 1)
  disposeFailure()
})

test('agent creation waits for initial scoped workflow commands', async () => {
  const { ctx, command, activateAgent } = createHarness()
  applyPlugins(ctx)
  registerWorkflow(ctx)
  const pending = Promise.withResolvers()
  const ensure = ctx.workingDirectory.ensure.bind(ctx.workingDirectory)
  ctx.workingDirectory.ensure = async (...args) => {
    await pending.promise
    return ensure(...args)
  }
  let settled = false
  const creating = activateAgent().then(() => { settled = true })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false)
  assert.equal(command('example'), undefined)
  pending.resolve()
  await creating
  assert.equal(settled, true)
  assert.ok(command('example'))
})

test('disposal aborts an uncooperative list and does not leak its candidates', { timeout: 5000 }, async () => {
  const { ctx } = createHarness()
  applyPlugins(ctx)
  const pending = Promise.withResolvers()
  let dispose
  dispose = ctx.workflows.registerProvider(() => ({
    name: 'slow-list',
    async list() {
      dispose()
      return pending.promise
    },
    async get() { throw new Error('list() must not call get()') },
  }))
  await assert.rejects(ctx.workflows.list(), { name: 'AbortError' })
})

test('disposal aborts an uncooperative get and cannot start its workflow', { timeout: 5000 }, async () => {
  const { ctx, agent, tools, jobs } = createHarness()
  applyPlugins(ctx)
  let observedSignal
  const pending = Promise.withResolvers()
  const dispose = ctx.workflows.registerProvider(() => ({
    name: 'slow-get',
    async list() {
      return [{
        name: 'example', description: 'Example', source: 'memory', provider: 'slow-get', rank: 100, locator: null,
      }]
    },
    async get(_candidate, options) {
      observedSignal = options.signal
      return pending.promise
    },
  }))
  const starting = tools.get('run_workflow').execute({ name: 'example', input: '' }, execution(agent))
  while (observedSignal === undefined) await new Promise(resolve => setImmediate(resolve))
  dispose()
  await assert.rejects(starting, { name: 'AbortError' })
  assert.equal(observedSignal.aborted, true)
  assert.equal(jobs.length, 0)
})



test('provider list receives cwd and get receives the selected candidate with the same lookup signal', async () => {
  const { ctx } = createHarness()
  applyPlugins(ctx)
  const calls = []
  const controller = new AbortController()
  ctx.workflows.registerProvider(() => ({
    name: 'lookup',
    async list(options) {
      calls.push({ method: 'list', options })
      return [{ name: 'example', description: 'Example', source: 'memory', provider: 'lookup', rank: 100, locator: { id: 42 } }]
    },
    async get(candidate, options) {
      calls.push({ method: 'get', candidate, options })
      return { name: candidate.name, description: candidate.description, source: candidate.source, provider: candidate.provider, script: 'return 1' }
    },
  }))
  await ctx.workflows.get('example', { cwd: '/selected-project', signal: controller.signal })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].method, 'list')
  assert.equal(calls[0].options.cwd, '/selected-project')
  assert.equal(calls[0].options.signal.aborted, false)
  assert.equal(calls[1].method, 'get')
  assert.deepEqual(calls[1].candidate.locator, { id: 42 })
  assert.equal(calls[1].options.cwd, '/selected-project')
  assert.equal(calls[1].options.signal.aborted, false)
})

test('failed automatic and explicit refreshes withdraw stale commands', async () => {
  const { ctx, agent, globalCommands, command, activateAgent } = createHarness()
  applyPlugins(ctx)
  let failing = false
  ctx.workflows.registerProvider(() => ({
    name: 'reloadable',
    async list() {
      if (failing) throw new Error('discovery failed')
      return [{
        name: 'example', description: 'Example', source: 'memory', provider: 'reloadable', rank: 100, locator: null,
      }]
    },
    async get() { throw new Error('unreachable') },
  }))
  await activateAgent()
  assert.ok(command('example'))

  failing = true
  ctx.emit('workflows/change')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(command('example'), undefined)
  const reloaded = await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.equal(reloaded.kind, 'error')
  assert.match(reloaded.text, /discovery failed/)
  assert.equal(command('example'), undefined)

  failing = false
  const recovered = await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.equal(recovered.kind, 'success')
  assert.ok(command('example'))
})
