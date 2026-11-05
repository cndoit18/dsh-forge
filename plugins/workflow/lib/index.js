import { WorkflowRegistry } from './registry.js'

export const name = 'dsh-workflow'
export const inject = ['agents', 'commands', 'tools', 'jobs', 'workingDirectory', 'workflowEngine']
export { BUNDLED_WORKFLOW_RANK, WorkflowRegistry, isWorkflowName } from './registry.js'
export { parseWorkflowSource } from './source.js'

function catalogText(workflows) {
  if (workflows.length === 0) return '没有可用的已保存工作流。'
  return workflows.map(workflow => `/${workflow.name} — ${workflow.description} [${workflow.source}]`).join('\n')
}

export function apply(ctx) {
  const workflows = new WorkflowRegistry(ctx)
  const commandStates = new Map()
  let disposed = false

  const refreshAgent = async (agent, signal, options = {}) => {
    let state = commandStates.get(agent)
    if (state === undefined) {
      state = { version: 0, disposers: new Map(), definitions: [] }
      commandStates.set(agent, state)
    }
    const version = ++state.version
    if (state.commandCtx === undefined) {
      await agent.ctx.inject(['commands'], commandCtx => { state.commandCtx = commandCtx })
    }
    const cwd = await ctx.workingDirectory.ensure(agent, signal)
    const definitions = await workflows.list({ cwd, signal, strict: options.strict === true })
    const previous = state.disposers
    if (disposed || state.version !== version) return state.definitions
    const externalNames = new Set(ctx.commands.list(agent)
      .map(command => command.name)
      .filter(name => !previous.has(name)))
    for (const dispose of previous.values()) dispose()
    const disposers = new Map()
    for (const definition of definitions) {
      if (externalNames.has(definition.name)) {
        ctx.logger.warn(`dsh-workflow: /${definition.name} does not replace an existing command`)
        continue
      }
      const dispose = state.commandCtx.commands.register({
        name: definition.name,
        description: definition.description,
        input: { hint: definition.input?.hint ?? '[输入]' },
        handler: async ({ agent: parent, rawInput, signal: invocationSignal }) => {
          try {
            const { jobId } = await workflows.start({
              name: definition.name,
              input: rawInput,
              parent,
              signal: invocationSignal,
            })
            return { kind: 'success', text: `工作流已启动，任务编号：${jobId}。` }
          } catch (error) {
            if (invocationSignal.aborted) throw error
            return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
          }
        },
      })
      disposers.set(definition.name, dispose)
    }
    state.disposers = disposers
    state.definitions = definitions
    return definitions
  }

  const containRefresh = (agent, signal) => refreshAgent(agent, signal).catch(error => {
    if (disposed) return
    ctx.logger.warn(`dsh-workflow: failed to refresh commands for agent ${agent.id}: ${String(error)}`)
    const state = commandStates.get(agent)
    if (state === undefined) return
    for (const dispose of state.disposers.values()) dispose()
    state.disposers = new Map()
    state.definitions = []
  })

  const refreshExplicit = async agent => {
    const state = commandStates.get(agent)
    const version = state === undefined ? undefined : state.version
    try {
      return await refreshAgent(agent, undefined, { strict: true })
    } catch (error) {
      const current = commandStates.get(agent)
      if (current !== undefined && (version === undefined || current.version === version)) {
        for (const dispose of current.disposers.values()) dispose()
        current.disposers = new Map()
        current.definitions = []
      }
      throw error
    }
  }

  ctx.on('agent/created', ({ agent, signal }) => refreshAgent(agent, signal))
  ctx.on('agent/disposed', ({ agent }) => {
    const state = commandStates.get(agent)
    if (state === undefined) return
    state.version++
    for (const dispose of state.disposers.values()) dispose()
    state.commandCtx = undefined
    commandStates.delete(agent)
  })
  ctx.on('workflows/change', () => {
    for (const agent of ctx.agents.list()) void containRefresh(agent)
  })
  for (const agent of ctx.agents.list()) void containRefresh(agent)

  ctx.effect(() => ctx.commands.register({
    name: 'workflows',
    description: '列出或重新加载已保存的工作流。',
    input: { hint: '[reload]' },
    handler: async ({ agent, rawInput }) => {
      try {
        const definitions = await refreshExplicit(agent)
        const prefix = rawInput.trim() === 'reload' ? '已重新加载工作流：\n' : ''
        return { kind: 'success', text: prefix + catalogText(definitions) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'dsh-workflow: catalog command')

  ctx.effect(() => ctx.tools.register({
    name: 'run_workflow',
    description: 'Start a saved workflow by its exact name when the user explicitly requests that workflow. Saved workflows come from the active project, user directories, or installed bundles. Returns a background job ID; use job_output to collect it and job_kill to cancel it. Do not use this for an ad-hoc JavaScript script; use the workflow tool instead.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Exact saved workflow name without the leading slash.' },
        input: { type: 'string', description: 'Input passed to the saved workflow. Its definition controls whether this may be empty.' },
      },
      required: ['name', 'input'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, runId: { type: 'string' }, jobId: { type: 'string' } },
        required: ['name', 'runId', 'jobId'],
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `/${value.name} 已启动，任务编号：${value.jobId}。完成结果会回到当前会话；用 job_output 查看结果，用 job_kill 停止任务。`,
      }],
    },
    execute: async ({ name, input }, exec) => workflows.start({
      name,
      input,
      parent: exec.agent,
      toolCall: { callId: exec.callId, rootCallId: exec.rootCallId },
      signal: exec.signal,
    }),
  }), 'dsh-workflow: saved workflow tool')

  ctx.effect(() => () => {
    disposed = true
    for (const state of commandStates.values()) {
      state.version++
      state.commandCtx = undefined
      for (const dispose of state.disposers.values()) dispose()
    }
    commandStates.clear()
  }, 'dsh-workflow: command cleanup')
}
