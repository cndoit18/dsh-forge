import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { apply, inject, name } from '../lib/index.js'

function createHarness() {
  const commands = new Map()
  const tools = new Map()
  const listeners = new Map()
  const runs = []
  const jobs = []
  const messages = []
  const disposers = []
  const agent = { id: 'session-test', session: { id: 'session-test' }, followup(message) { messages.push(message) } }
  const workflowEngine = {
    start(spec) {
      const run = {
        id: 'run-test', disposed: false, result: Promise.resolve({ stopReason: 'completed', value: { ok: true } }),
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
    agentPresets: { serviceFor(subject, service) { assert.equal(subject, agent); assert.equal(service, 'workflowEngine'); return workflowEngine } },
    effect(contribute) { disposers.push(contribute()) },
    on(event, listener) { listeners.set(event, listener); disposers.push(() => listeners.delete(event)) },
  }
  return { ctx, agent, commands, tools, runs, jobs, messages, listeners, disposers, workflowEngine }
}

const execution = agent => ({ agent, signal: new AbortController().signal, callId: 'call-test', rootCallId: 'root-test' })

test('submitting a command queues the visible user message before any workflow starts', async () => {
  const { ctx, agent, commands, runs, jobs, messages } = createHarness()
  apply(ctx)
  assert.equal(name, 'devflow')
  for (const dependency of ['commands', 'agentPresets', 'tools', 'jobs']) assert.ok(inject.includes(dependency))
  assert.ok(!inject.includes('workflowEngine'))
  const result = await commands.get('deep-research').handler({ agent, rawInput: ' Compare DSH Skills and Workflows' })
  assert.deepEqual(result, { kind: 'success' })
  assert.equal(runs.length, 0)
  assert.equal(jobs.length, 0)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].source.kind, 'user')
  assert.ok(messages[0].id)
  assert.equal(messages[0].content[0].text, '/deep-research Compare DSH Skills and Workflows')
  assert.equal(commands.get('deep-research').recordInput, false)
})

test('the model tool publishes an owned job immediately while its workflow is still pending', async () => {
  const { ctx, agent, commands, tools, runs, jobs, workflowEngine } = createHarness()
  const pending = Promise.withResolvers()
  const start = workflowEngine.start
  workflowEngine.start = spec => { const run = start(spec); run.result = pending.promise; return run }
  apply(ctx)
  await commands.get('deep-research').handler({ agent, rawInput: 'question' })
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

test('workflow comments do not expose literal Unicode escape sequences', async () => {
  const source = await readFile(new URL('../workflows/deep-research.js', import.meta.url), 'utf8')
  const comments = source.split('\n').filter(line => line.trimStart().startsWith('//'))
  assert.ok(!comments.some(line => /\\u[0-9a-fA-F]{4}/.test(line)))
})

test('empty commands fail before queuing a message or starting a workflow', async () => {
  const { ctx, agent, commands, tools, runs, messages } = createHarness()
  apply(ctx)
  const result = await commands.get('deep-research').handler({ agent, rawInput: ' ' })
  assert.equal(result.kind, 'error')
  await assert.rejects(tools.get('devflow').execute({ command: 'deep-research', input: ' ' }, execution(agent)), /requires input/)
  assert.equal(messages.length, 0)
  assert.equal(runs.length, 0)
})

test('an aborted tool call cannot start a background job after loading its script', async () => {
  const { ctx, agent, tools, jobs } = createHarness()
  apply(ctx)
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(tools.get('devflow').execute({ command: 'deep-research', input: 'question' }, { ...execution(agent), signal: abort.signal }), { name: 'AbortError' })
  assert.equal(jobs.length, 0)
})

test('a missing workflow engine rejects before queuing a user message', async () => {
  const { ctx, agent, commands, messages } = createHarness()
  ctx.agentPresets.serviceFor = () => undefined
  apply(ctx)
  const result = await commands.get('deep-research').handler({ agent, rawInput: 'question' })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /Workflow support/)
  assert.equal(messages.length, 0)
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

test('all development commands queue messages and use their packaged workflows', async () => {
  const { ctx, agent, commands, tools, runs, jobs, messages } = createHarness()
  apply(ctx)
  for (const command of ['batch', 'init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']) {
    const input = command === 'init' ? '' : 'target'
    assert.deepEqual(await commands.get(command).handler({ agent, rawInput: input }), { kind: 'success' })
    assert.equal(messages.at(-1).content[0].text, `/${command}${input ? ` ${input}` : ''}`)
    const result = await tools.get('devflow').execute({ command, input }, execution(agent))
    assert.equal(result.command, command)
    assert.equal(runs.at(-1).spec.args.instruction, input)
    await jobs.at(-1).hooks.done
  }
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
