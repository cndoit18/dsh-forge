import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPlugins, createHarness, execution, registerWorkflow } from './harness.js'

function memoryCandidate(name, rank, description = name) {
  return {
    name,
    description,
    source: 'memory',
    provider: 'memory',
    rank,
    locator: { script: `return "${description}"` },
  }
}

function memoryProvider(name, candidates) {
  return {
    name,
    async list() { return candidates },
    async get(candidate) {
      return {
        name: candidate.name,
        description: candidate.description,
        source: candidate.source,
        provider: candidate.provider,
        script: candidate.locator.script,
      }
    },
  }
}

test('registry resolves rank before provider order and reloads after disposal', async () => {
  const { ctx } = createHarness()
  applyPlugins(ctx)
  const disposeUser = ctx.workflows.registerProvider(() => memoryProvider('user', [
    memoryCandidate('shared', 400, 'user'),
    memoryCandidate('z-last', 400),
  ]))
  const disposeProject = ctx.workflows.registerProvider(() => memoryProvider('project', [
    memoryCandidate('shared', 100, 'project'),
    memoryCandidate('a-first', 100),
  ]))
  registerWorkflow(ctx, { name: 'shared', description: 'bundled', script: 'return "bundled"' })

  assert.deepEqual((await ctx.workflows.list()).map(workflow => workflow.name), ['a-first', 'shared', 'z-last'])
  assert.equal((await ctx.workflows.get('shared')).description, 'project')
  disposeProject()
  assert.equal((await ctx.workflows.get('shared')).description, 'user')
  disposeUser()
  assert.equal((await ctx.workflows.get('shared')).description, 'bundled')
})

test('runtime duplicates are first-wins and cannot remove the winner', async () => {
  const { ctx, warnings } = createHarness()
  applyPlugins(ctx)
  registerWorkflow(ctx, { description: 'first' })
  const disposeDuplicate = registerWorkflow(ctx, { description: 'duplicate' })
  assert.equal((await ctx.workflows.get('example')).description, 'first')
  assert.match(warnings[0], /already registered/)
  disposeDuplicate()
  assert.equal((await ctx.workflows.get('example')).description, 'first')
})

test('agent commands refresh from the catalog without replacing external commands', async () => {
  const { ctx, agent, globalCommands, command, activateAgent, warnings } = createHarness()
  applyPlugins(ctx)
  globalCommands.set('permission', { name: 'permission', description: 'external', handler: () => ({ kind: 'success', text: 'external' }) })
  const disposeAlpha = registerWorkflow(ctx, { name: 'alpha', description: 'Alpha' })
  registerWorkflow(ctx, { name: 'permission', description: 'Must not shadow' })
  await activateAgent()
  assert.equal(command('alpha').description, 'Alpha')
  assert.equal(command('permission').description, 'external')
  assert.ok(warnings.some(message => message.includes('/permission')))

  registerWorkflow(ctx, { name: 'beta', description: 'Beta' })
  const reloaded = await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.equal(reloaded.kind, 'success')
  assert.match(reloaded.text, /已重新加载工作流/)
  assert.match(reloaded.text, /\/alpha/)
  assert.match(reloaded.text, /\/beta/)
  assert.equal(command('beta').description, 'Beta')

  disposeAlpha()
  await globalCommands.get('workflows').handler({ agent, rawInput: '' })
  assert.equal(command('alpha'), undefined)
})

test('slash commands start jobs without queuing a user message', async () => {
  const { ctx, agent, command, runs, jobs, messages, activateAgent } = createHarness()
  applyPlugins(ctx)
  registerWorkflow(ctx)
  await activateAgent()

  const result = await command('example').handler({ agent, rawInput: ' target', signal: new AbortController().signal })
  assert.deepEqual(result, { kind: 'success', text: '工作流已启动，任务编号：workflow-test-1。' })
  assert.equal(runs.length, 1)
  assert.equal(jobs.length, 1)
  assert.equal(messages.length, 0)
  assert.deepEqual(runs[0].spec.args, { input: 'target' })
  await jobs[0].hooks.done
})

test('catalog sections follow reloads without user messages and disappear when empty', async () => {
  const { ctx, agent, globalCommands, messages, activateAgent, assemble } = createHarness()
  applyPlugins(ctx)
  const disposeAlpha = registerWorkflow(ctx, { name: 'alpha', description: 'Alpha', whenToUse: 'Use for <research>' })
  await activateAgent()

  const initial = assemble(agent)
  assert.equal(initial.length, 1)
  assert.equal(initial[0].name, 'dsh-workflow:catalog')
  assert.equal(initial[0].order, 2600)
  assert.equal(initial[0].interpolate, false)
  assert.match(initial[0].text, /<available_workflows>/)
  assert.ok(initial[0].text.includes('/alpha: Alpha When to use: Use for &lt;research&gt;'))
  assert.equal(messages.length, 0)

  const disposeBeta = registerWorkflow(ctx, { name: 'beta', description: 'Beta' })
  await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.ok(assemble(agent)[0].text.includes('/beta: Beta'))

  disposeAlpha()
  await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.ok(!assemble(agent)[0].text.includes('/alpha'))

  disposeBeta()
  await globalCommands.get('workflows').handler({ agent, rawInput: 'reload' })
  assert.deepEqual(assemble(agent), [])
  assert.equal(messages.length, 0)
})

test('generic saved workflows receive input and reject unknown names before creating jobs', async () => {
  const { ctx, agent, tools, command, runs, jobs, activateAgent } = createHarness()
  applyPlugins(ctx)
  registerWorkflow(ctx, { input: { hint: '<目标>', required: true } })
  await activateAgent()

  const empty = await command('example').handler({ agent, rawInput: ' ', signal: new AbortController().signal })
  assert.equal(empty.kind, 'error')
  assert.match(empty.text, /requires input/)
  const started = await tools.get('run_workflow').execute({ name: 'example', input: ' target' }, execution(agent))
  assert.equal(started.name, 'example')
  assert.deepEqual(runs[0].spec.args, { input: 'target' })
  await jobs[0].hooks.done
  await assert.rejects(tools.get('run_workflow').execute({ name: 'missing', input: '' }, execution(agent)), /Unknown saved workflow/)
  assert.equal(jobs.length, 1)
})

test('provider disposal aborts its consumers and emits catalog changes', async () => {
  const { ctx, listeners } = createHarness()
  applyPlugins(ctx)
  let control
  let changes = 0
  ctx.on('workflows/change', () => { changes++ })
  const dispose = ctx.workflows.registerProvider(given => {
    control = given
    return memoryProvider('memory', [])
  })
  assert.equal(control.signal.aborted, false)
  assert.equal(changes, 1)
  control.invalidate()
  assert.equal(changes, 2)
  dispose()
  assert.equal(control.signal.aborted, true)
  assert.equal(changes, 3)
  assert.equal(ctx.workflows.providers.size, 0)
  assert.ok(listeners.has('workflows/change'))
})
