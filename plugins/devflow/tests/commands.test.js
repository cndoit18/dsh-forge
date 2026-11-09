import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { parseWorkflowSource } from '@dshforge/workflow/source'
import { applyPlugins, createHarness, execution } from '../../workflow/tests/harness.js'
import { apply, inject, name } from '../lib/index.js'

async function setup() {
  const harness = createHarness()
  applyPlugins(harness.ctx)
  apply(harness.ctx)
  await harness.activateAgent()
  return harness
}

test('slash commands start bundled workflows directly without queuing a user message', async () => {
  const { agent, command, runs, jobs, messages, events } = await setup()
  const result = await command('deep-research').handler({ agent, rawInput: ' Compare DSH Skills and Workflows', signal: new AbortController().signal })
  assert.deepEqual(result, { kind: 'success', text: '工作流已启动，任务编号：workflow-test-1。' })
  assert.equal(name, 'devflow')
  assert.deepEqual(inject, ['workflows'])
  assert.equal(runs.length, 1)
  assert.equal(jobs.length, 1)
  assert.equal(messages.length, 0)
  assert.equal(runs[0].spec.parent, agent)
  assert.equal(runs[0].spec.args.question, 'Compare DSH Skills and Workflows')
  assert.equal(jobs[0].spec.toolCall, undefined)
  assert.ok(events.some(event => event.type === 'tool-workflow/run-start' && event.data.name === 'deep-research'))
  assert.equal(command('deep-research').recordInput, undefined)
  await jobs[0].hooks.done
})

test('the generic model tool publishes an owned job immediately while its workflow is pending', async () => {
  const { ctx, agent, tools, runs, jobs, workflowEngine } = await setup()
  const pending = Promise.withResolvers()
  const start = workflowEngine.start
  workflowEngine.start = spec => { const run = start(spec); run.result = pending.promise; return run }
  const abort = new AbortController()
  const exec = { ...execution(agent), signal: abort.signal }
  const tool = tools.get('run_workflow')
  const result = await tool.execute({ name: 'deep-research', input: 'question' }, exec)
  assert.deepEqual(result, { name: 'deep-research', runId: 'run-test-1', jobId: 'workflow-test-1' })
  assert.equal(runs[0].spec.parent, agent)
  assert.equal(runs[0].spec.signal, undefined)
  assert.equal(runs[0].spec.args.question, 'question')
  assert.match(runs[0].spec.script, /const VOTES_PER_CLAIM = 3/)
  assert.match(runs[0].spec.script, /phase\(['"]Scope['"]\)/)
  assert.equal(jobs[0].spec.owner, agent.id)
  assert.deepEqual(jobs[0].spec.toolCall, { callId: 'call-test', rootCallId: 'root-test' })
  assert.equal(runs[0].run.disposed, false)
  abort.abort()
  assert.equal(runs[0].run.cancelReason, undefined)
  assert.match(tool.output.render({}, result)[0].text, /workflow-test-1/)
  pending.resolve({ stopReason: 'completed', value: { ok: true } })
  assert.deepEqual(await jobs[0].hooks.done, { status: 'completed', result: '{\n  "ok": true\n}' })
  assert.equal(runs[0].run.disposed, true)
  assert.ok(ctx.workflows)
})

test('job cancellation reaches the workflow and settlement releases it', async () => {
  const { agent, tools, runs, jobs } = await setup()
  await tools.get('run_workflow').execute({ name: 'deep-research', input: 'question' }, execution(agent))
  jobs[0].hooks.cancel('user stopped research')
  assert.equal(runs[0].run.cancelReason, 'user stopped research')
  await jobs[0].hooks.done
  assert.equal(runs[0].run.disposed, true)
})

test('live phases and narration reach the owned job', async () => {
  const { ctx, agent, tools, jobs, workflowEngine } = await setup()
  const pending = Promise.withResolvers()
  const start = workflowEngine.start
  workflowEngine.start = spec => { const run = start(spec); run.result = pending.promise; return run }
  await tools.get('run_workflow').execute({ name: 'deep-research', input: 'question' }, execution(agent))
  ctx.emit('workflow/phase', { id: 'run-test-1' }, 'Scope')
  ctx.emit('workflow/log', { id: 'run-test-1' }, 'Searching sources')
  assert.equal(jobs[0].job.progress, 'Scope')
  assert.deepEqual(jobs[0].job.output, ['▸ Scope\n', 'Searching sources\n'])
  pending.resolve({ stopReason: 'completed', value: 'done' })
  await jobs[0].hooks.done
})

test('command menu copy and input hints remain Chinese', async () => {
  const { ctx, agent } = await setup()
  const bundled = ['deep-research', 'batch', 'init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']
  for (const name of bundled) {
    const definition = ctx.commands.find(agent, name)
    assert.match(definition.description, /[\u3400-\u9fff]/)
    assert.match(definition.input.hint, /[\u3400-\u9fff]/)
  }
})

test('unknown names are not registered or exposed as workflows', async () => {
  const { agent, command, tools, runs } = await setup()
  assert.equal(command('skillopt'), undefined)
  await assert.rejects(tools.get('run_workflow').execute({ name: 'skillopt', input: 'target' }, execution(agent)), /Unknown workflow: skillopt/)
  assert.equal(runs.length, 0)
})

test('workflow source uses readable Unicode in comments and printable strings', async () => {
  const source = await readFile(new URL('../workflows/deep-research.js', import.meta.url), 'utf8')
  const comments = source.split('\n').filter(line => line.trimStart().startsWith('//'))
  assert.ok(!comments.some(line => /\\u[0-9a-fA-F]{4}/.test(line)))
  assert.ok(!/\\(?:xB7|u00B7|u2014|u2026|u2192|u2265|u2713|u2717)/i.test(source))
})

test('empty commands fail before starting a workflow', async () => {
  const { agent, command, tools, runs, messages } = await setup()
  const result = await command('deep-research').handler({ agent, rawInput: ' ', signal: new AbortController().signal })
  assert.equal(result.kind, 'error')
  await assert.rejects(tools.get('run_workflow').execute({ name: 'deep-research', input: ' ' }, execution(agent)), /requires input/)
  assert.equal(messages.length, 0)
  assert.equal(runs.length, 0)
})

test('cancellation during script loading prevents slash and tool jobs', async () => {
  for (const kind of ['command', 'tool']) {
    const { agent, command, tools, runs, jobs } = await setup()
    const abort = new AbortController()
    const pending = kind === 'command'
      ? command('deep-research').handler({ agent, rawInput: 'question', signal: abort.signal })
      : tools.get('run_workflow').execute({ name: 'deep-research', input: 'question' }, { ...execution(agent), signal: abort.signal })
    abort.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(jobs.length, 0)
    assert.equal(runs.length, 0)
  }
})

test('workflow failure and cancellation become terminal job outcomes and dispose the run', async () => {
  for (const stopReason of ['error', 'cancelled']) {
    const { agent, tools, runs, jobs, workflowEngine } = await setup()
    const start = workflowEngine.start
    workflowEngine.start = spec => {
      const run = start(spec)
      run.result = Promise.resolve({ stopReason, error: 'scope stopped' })
      return run
    }
    await tools.get('run_workflow').execute({ name: 'deep-research', input: 'target' }, execution(agent))
    const outcome = await jobs[0].hooks.done
    assert.equal(outcome.status, stopReason === 'cancelled' ? 'killed' : 'failed')
    if (stopReason === 'error') assert.match(outcome.detail, /scope stopped/)
    assert.equal(runs[0].run.disposed, true)
  }
})

test('dispose failure preserves the result and releases run state', async () => {
  const { ctx, agent, tools, runs, jobs, events, workflowEngine } = await setup()
  const start = workflowEngine.start
  workflowEngine.start = spec => {
    const run = start(spec)
    run.result = Promise.resolve({ stopReason: 'completed', value: 'done' })
    run.dispose = async () => { throw new Error('dispose failed') }
    return run
  }
  await tools.get('run_workflow').execute({ name: 'deep-research', input: 'question' }, execution(agent))
  assert.deepEqual(await jobs[0].hooks.done, { status: 'completed', result: 'done' })
  assert.ok(events.some(event => event.type === 'tool-workflow/run-end' && event.data.stopReason === 'completed'))
  const eventCount = events.length
  ctx.emit('workflow/agent-start', { id: 'run-test-1' }, { seq: 1, label: 'late', childId: 'child' })
  assert.equal(events.length, eventCount)
  ctx.emit('workflow/log', { id: 'run-test-1' }, 'late log')
  assert.equal(jobs[0].job.output.length, 0)
})

test('all development commands start packaged workflows without queuing messages', async () => {
  const { agent, command, tools, runs, jobs, messages } = await setup()
  for (const name of ['batch', 'init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']) {
    const input = ['init', 'review'].includes(name) ? '' : 'target'
    const started = await command(name).handler({ agent, rawInput: input, signal: new AbortController().signal })
    assert.equal(started.kind, 'success')
    assert.match(started.text, /^工作流已启动，任务编号：workflow-test-\d+。$/)
    assert.equal(messages.length, 0)
    assert.equal(runs.at(-1).spec.args.instruction, input)
    await jobs.at(-1).hooks.done
    const result = await tools.get('run_workflow').execute({ name, input }, execution(agent))
    assert.equal(result.name, name)
    assert.equal(runs.at(-1).spec.args.instruction, input)
    await jobs.at(-1).hooks.done
  }
})

test('review defaults to low only when no recognized strength is supplied', async () => {
  const source = await readFile(new URL('../workflows/review.js', import.meta.url), 'utf8')
  const { script } = parseWorkflowSource(source, 'review.js')
  const run = async instruction => {
    const prompts = []
    await runInNewContext(`(async () => { ${script}
 })()`, { args: { instruction }, phase() {}, async agent(prompt) { prompts.push(prompt); return 'reviewed' } })
    return prompts[0]
  }
  assert.match(await run(''), /Review strength: low\./)
  assert.match(await run('src/index.js'), /Review strength: low\./)
  assert.match(await run('max'), /Review strength: max\./)
})

test('unloading removes generated slash commands, model tool, and progress listeners', async () => {
  const { ctx, agent, tools, listeners, dispose } = await setup()
  assert.equal(ctx.commands.list(agent).filter(command => command.name !== 'workflows').length, 9)
  assert.equal(tools.size, 1)
  dispose()
  assert.equal(ctx.commands.list(agent).length, 0)
  assert.equal(tools.size, 0)
  for (const entries of listeners.values()) assert.equal(entries.size, 0)
})
