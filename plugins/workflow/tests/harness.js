import { apply as applyCore } from '../lib/index.js'

export function createHarness() {
  const globalCommands = new Map()
  const tools = new Map()
  const listeners = new Map()
  const runs = []
  const jobs = []
  const messages = []
  const disposers = []
  const events = []
  const warnings = []
  const agents = []
  const scoped = new Map()
  const agent = {
    id: 'session-test',
    session: { id: 'session-test', append(type, data) { events.push({ type, data }) } },
    followup(message) { messages.push(message) },
  }
  agent.ctx = {
    async inject(_dependencies, callback) { return callback(this) },
    commands: {
      register(definition) {
        const entries = scoped.get(agent) ?? new Map()
        scoped.set(agent, entries)
        if (entries.has(definition.name)) throw new Error(`scoped command "${definition.name}" is already registered`)
        entries.set(definition.name, definition)
        return () => entries.delete(definition.name)
      },
    },
  }
  const workflowEngine = {
    start(spec) {
      const run = {
        id: `run-test-${runs.length + 1}`,
        meta: spec.meta,
        disposed: false,
        result: Promise.resolve({ stopReason: 'completed', value: { ok: true } }),
        cancel(reason) { this.cancelReason = reason },
        async dispose() { this.disposed = true },
      }
      runs.push({ spec, run })
      return run
    },
  }
  const registry = entries => ({
    register(definition) {
      if (entries.has(definition.name)) throw new Error(`command "${definition.name}" is already registered`)
      entries.set(definition.name, definition)
      return () => entries.delete(definition.name)
    },
  })
  const ctx = {
    agents: { list: () => agents },
    commands: {
      ...registry(globalCommands),
      list(receivingAgent) {
        return [...new Map([...globalCommands, ...(scoped.get(receivingAgent) ?? [])]).values()]
          .sort((left, right) => left.name < right.name ? -1 : 1)
      },
      find(receivingAgent, name) {
        return scoped.get(receivingAgent)?.get(name) ?? globalCommands.get(name)
      },
    },
    tools: registry(tools),
    workingDirectory: { cwd: '/project', async ensure() { return this.cwd } },
    jobs: { start(spec) {
      const job = {
        id: `workflow-test-${jobs.length + 1}`,
        output: [],
        updateProgress(text) { this.progress = text },
        append(text) { this.output.push(text) },
      }
      const hooks = spec.run(job)
      jobs.push({ spec, job, hooks })
      return job.id
    } },
    workflowEngine,
    provide(name, value) { this[name] = value; return () => { delete this[name] } },
    effect(contribute) { disposers.push(contribute()) },
    logger: { warn(message) { warnings.push(message) } },
    on(event, listener) {
      const entries = listeners.get(event) ?? new Set()
      listeners.set(event, entries)
      entries.add(listener)
      const dispose = () => entries.delete(listener)
      disposers.push(dispose)
      return dispose
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
  const activateAgent = async () => {
    if (!agents.includes(agent)) agents.push(agent)
    for (const listener of listeners.get('agent/created') ?? []) await listener({ agent, source: 'startup' })
  }
  const dispose = () => {
    for (const undo of [...disposers].reverse()) {
      if (typeof undo === 'function') undo()
    }
  }
  const command = name => ctx.commands.find(agent, name)
  return {
    ctx, agent, agents, globalCommands, scoped, tools, runs, jobs, messages, events, warnings,
    listeners, disposers, workflowEngine, activateAgent, dispose, command,
  }
}

export function applyPlugins(ctx) {
  applyCore(ctx)
}

export const execution = agent => ({
  agent,
  signal: new AbortController().signal,
  callId: 'call-test',
  rootCallId: 'root-test',
})

export function registerWorkflow(ctx, overrides = {}) {
  return ctx.workflows.register({
    name: 'example',
    description: 'Example workflow',
    script: 'return { ok: true }',
    ...overrides,
  })
}
