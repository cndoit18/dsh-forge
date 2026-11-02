import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { apply, inject, name } from '../lib/index.js'

function createHarness() {
  const commands = new Map()
  const tools = new Map()
  const listeners = new Map()
  const runs = []
  const jobs = []
  const messages = []
  const disposers = []
  const events = []
  const agent = { id: 'session-test', session: { id: 'session-test', append(type, data) { events.push({ type, data }) } }, followup(message) { messages.push(message) } }
  const workflowEngine = {
    start(spec) {
      const run = {
        id: 'run-test', meta: spec.meta, disposed: false, result: Promise.resolve({ stopReason: 'completed', value: { ok: true } }),
        cancel(reason) { this.cancelReason = reason },
        async dispose() { this.disposed = true },
      }
      runs.push({ spec, run })
      return run
    },
  }
  const registry = entries => ({ register(definition) { entries.set(definition.name, definition); return () => entries.delete(definition.name) } })
  const ctx = {
    commands: registry(commands),
    tools: registry(tools),
    jobs: { start(spec) {
      const job = { id: `workflow-test-${jobs.length + 1}`, output: [], updateProgress(text) { this.progress = text }, append(text) { this.output.push(text) } }
      const hooks = spec.run(job)
      jobs.push({ spec, job, hooks })
      return job.id
    } },
    workflowEngine,
    effect(contribute) { disposers.push(contribute()) },
    logger: { warn() {} },
    on(event, listener) { listeners.set(event, listener); disposers.push(() => listeners.delete(event)) },
  }
  return { ctx, agent, commands, tools, runs, jobs, messages, events, listeners, disposers, workflowEngine }
}

const execution = agent => ({ agent, signal: new AbortController().signal, callId: 'call-test', rootCallId: 'root-test' })

test('slash commands start workflows directly without queuing a user message', async () => {
  const { ctx, agent, commands, runs, jobs, messages, events } = createHarness()
  apply(ctx)
  assert.equal(name, 'devflow')
  for (const dependency of ['commands', 'tools', 'jobs', 'workflowEngine']) assert.ok(inject.includes(dependency))
  const result = await commands.get('deep-research').handler({ agent, rawInput: ' Compare DSH Skills and Workflows' })
  assert.deepEqual(result, { kind: 'success', text: '工作流已启动，任务编号：workflow-test-1。' })
  assert.equal(runs.length, 1)
  assert.equal(jobs.length, 1)
  assert.equal(messages.length, 0)
  assert.equal(runs[0].spec.parent, agent)
  assert.equal(runs[0].spec.args.question, 'Compare DSH Skills and Workflows')
  assert.equal(jobs[0].spec.toolCall, undefined)
  assert.ok(events.some(event => event.type === 'tool-workflow/run-start' && event.data.name === 'deep-research'))
  assert.equal(commands.get('deep-research').recordInput, undefined)
  await jobs[0].hooks.done
})

test('the model tool publishes an owned job immediately while its workflow is still pending', async () => {
  const { ctx, agent, commands, tools, runs, jobs, workflowEngine } = createHarness()
  const pending = Promise.withResolvers()
  const start = workflowEngine.start
  workflowEngine.start = spec => { const run = start(spec); run.result = pending.promise; return run }
  apply(ctx)
  assert.equal(runs.length, 0)
  const abort = new AbortController()
  const exec = { ...execution(agent), signal: abort.signal }
  const tool = tools.get('devflow')
  const result = await tool.execute({ command: 'deep-research', input: 'question' }, exec)
  assert.deepEqual(result, { command: 'deep-research', runId: 'run-test', jobId: 'workflow-test-1' })
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
})

test('job cancellation reaches the workflow and settlement releases it', async () => {
  const { ctx, agent, tools, runs, jobs } = createHarness()
  apply(ctx)
  await tools.get('devflow').execute({ command: 'deep-research', input: 'question' }, execution(agent))
  jobs[0].hooks.cancel('user stopped research')
  assert.equal(runs[0].run.cancelReason, 'user stopped research')
  await jobs[0].hooks.done
  assert.equal(runs[0].run.disposed, true)
})

test('live phases and narration reach the owned job', async () => {
  const { ctx, agent, tools, jobs, listeners, workflowEngine } = createHarness()
  const pending = Promise.withResolvers()
  const start = workflowEngine.start
  workflowEngine.start = spec => { const run = start(spec); run.result = pending.promise; return run }
  apply(ctx)
  await tools.get('devflow').execute({ command: 'deep-research', input: 'question' }, execution(agent))
  listeners.get('workflow/phase')({ id: 'run-test' }, 'Scope')
  listeners.get('workflow/log')({ id: 'run-test' }, 'Searching sources')
  assert.equal(jobs[0].job.progress, 'Scope')
  assert.deepEqual(jobs[0].job.output, ['▸ Scope\n', 'Searching sources\n'])
  pending.resolve({ stopReason: 'completed', value: 'done' })
  await jobs[0].hooks.done
})

test('command menu copy and input hints are Chinese', () => {
  const { ctx, commands } = createHarness()
  apply(ctx)
  for (const definition of commands.values()) {
    assert.match(definition.description, /[\u3400-\u9fff]/)
    assert.match(definition.input.hint, /[\u3400-\u9fff]/)
  }
})

test('skillopt is not registered or exposed through the model tool', async () => {
  const { ctx, agent, commands, tools, runs } = createHarness()
  apply(ctx)
  assert.equal(commands.has('skillopt'), false)
  assert.ok(!tools.get('devflow').parameters.properties.command.enum.includes('skillopt'))
  await assert.rejects(tools.get('devflow').execute({ command: 'skillopt', input: 'target' }, execution(agent)), /Unknown DevFlow command: skillopt/)
  assert.equal(runs.length, 0)
})

test('workflow source uses readable Unicode in comments and printable strings', async () => {
  const source = await readFile(new URL('../workflows/deep-research.js', import.meta.url), 'utf8')
  const comments = source.split('\n').filter(line => line.trimStart().startsWith('//'))
  assert.ok(!comments.some(line => /\\u[0-9a-fA-F]{4}/.test(line)))
  assert.ok(!/\\(?:xB7|u00B7|u2014|u2026|u2192|u2265|u2713|u2717)/i.test(source))
})

test('empty commands fail before starting a workflow', async () => {
  const { ctx, agent, commands, tools, runs, messages } = createHarness()
  apply(ctx)
  const result = await commands.get('deep-research').handler({ agent, rawInput: ' ' })
  assert.equal(result.kind, 'error')
  await assert.rejects(tools.get('devflow').execute({ command: 'deep-research', input: ' ' }, execution(agent)), /requires input/)
  assert.equal(messages.length, 0)
  assert.equal(runs.length, 0)
})

test('cancellation during script loading prevents slash and tool jobs', async () => {
  for (const kind of ['command', 'tool']) {
    const { ctx, agent, commands, tools, runs, jobs } = createHarness()
    apply(ctx)
    const abort = new AbortController()
    const pending = kind === 'command'
      ? commands.get('deep-research').handler({ agent, rawInput: 'question', signal: abort.signal })
      : tools.get('devflow').execute({ command: 'deep-research', input: 'question' }, { ...execution(agent), signal: abort.signal })
    abort.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(jobs.length, 0)
    assert.equal(runs.length, 0)
  }
})

test('workflow failure and cancellation become terminal job outcomes and dispose the run', async () => {
  for (const stopReason of ['error', 'cancelled']) {
    const { ctx, agent, tools, runs, jobs, workflowEngine } = createHarness()
    const start = workflowEngine.start
    workflowEngine.start = spec => {
      const run = start(spec)
      run.result = Promise.resolve({ stopReason, error: 'scope stopped' })
      return run
    }
    apply(ctx)
    await tools.get('devflow').execute({ command: 'deep-research', input: 'target' }, execution(agent))
    const outcome = await jobs[0].hooks.done
    assert.equal(outcome.status, stopReason === 'cancelled' ? 'killed' : 'failed')
    if (stopReason === 'error') assert.match(outcome.detail, /scope stopped/)
    assert.equal(runs[0].run.disposed, true)
  }
})

test('dispose failure preserves the result and releases run state', async () => {
  const { ctx, agent, tools, runs, jobs, events, listeners, workflowEngine } = createHarness()
  const start = workflowEngine.start
  workflowEngine.start = spec => {
    const run = start(spec)
    run.result = Promise.resolve({ stopReason: 'completed', value: 'done' })
    run.dispose = async () => { throw new Error('dispose failed') }
    return run
  }
  apply(ctx)
  await tools.get('devflow').execute({ command: 'deep-research', input: 'question' }, execution(agent))
  assert.deepEqual(await jobs[0].hooks.done, { status: 'completed', result: 'done' })
  assert.ok(events.some(event => event.type === 'tool-workflow/run-end' && event.data.stopReason === 'completed'))
  const eventCount = events.length
  listeners.get('workflow/agent-start')({ id: 'run-test' }, { seq: 1, label: 'late', childId: 'child' })
  assert.equal(events.length, eventCount)
  listeners.get('workflow/log')({ id: 'run-test' }, 'late log')
  assert.equal(jobs[0].job.output.length, 0)
})

test('all development commands start packaged workflows without queuing messages', async () => {
  const { ctx, agent, commands, tools, runs, jobs, messages } = createHarness()
  apply(ctx)
  for (const command of ['batch', 'init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']) {
    const input = ['init', 'review'].includes(command) ? '' : 'target'
    const started = await commands.get(command).handler({ agent, rawInput: input })
    assert.equal(started.kind, 'success')
    assert.match(started.text, /^工作流已启动，任务编号：workflow-test-\d+。$/)
    assert.equal(messages.length, 0)
    assert.equal(runs.at(-1).spec.args.instruction, input)
    await jobs.at(-1).hooks.done
    const result = await tools.get('devflow').execute({ command, input }, execution(agent))
    assert.equal(result.command, command)
    assert.equal(runs.at(-1).spec.args.instruction, input)
    await jobs.at(-1).hooks.done
  }
})

test('review defaults to low only when no recognized strength is supplied', async () => {
  const { ctx, tools } = createHarness()
  apply(ctx)
  assert.match(tools.get('devflow').parameters.properties.input.description, /init and review/)
  const source = await readFile(new URL('../workflows/review.js', import.meta.url), 'utf8')
  const run = async (instruction) => {
    const prompts = []
    await runInNewContext(`(async () => { ${source}
 })()`, { args: { instruction }, phase() {}, async agent(prompt) { prompts.push(prompt); return 'reviewed' } })
    return prompts[0]
  }
  assert.match(await run(''), /Review strength: low\./)
  assert.match(await run('src/client.js'), /Review strength: low\./)
  assert.match(await run('max'), /Review strength: max\./)
})

test('unloading removes the slash commands, model tool, and progress listeners', () => {
  const { ctx, commands, tools, listeners, disposers } = createHarness()
  apply(ctx)
  assert.equal(commands.size, 9)
  assert.equal(tools.size, 1)
  for (const dispose of disposers) dispose()
  assert.equal(commands.size, 0)
  assert.equal(tools.size, 0)
  assert.equal(listeners.size, 0)
})
