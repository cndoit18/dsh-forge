import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const name = 'devflow'
export const inject = ['commands', 'agentPresets', 'tools', 'jobs']

const descriptions = {
  'deep-research': '并行搜索并提取证据，每条论断三票核验，最后汇总带引用的结论。',
  batch: '规划大型变更，经批准后让独立单元在隔离 worktree 中并行实施。',
  init: '初始化或改进项目 AGENTS.md 指令与可复用技能。',
  review: '审查 diff、PR、分支或路径中的正确性缺陷与回归。',
  simplify: '从复用、简化、效率和抽象层级审查代码，并实施合理修正。',
  'security-review': '审查待提交变更中的可利用安全风险，并过滤误报。',
  debug: '根据运行时证据、日志和最小复现定位并修复问题。',
  run: '启动并实际操作项目，通过真实用户入口验证变更。',
  verify: '通过真实应用流程端到端验证变更，不只依赖测试或类型检查。',
}
const hints = {
  'deep-research': '<研究问题>', batch: '<大型变更>', init: '[项目偏好]',
  review: '[审查强度] [--fix] [--comment] [目标]', simplify: '[目标]',
  'security-review': '[目标]', debug: '[问题现象]', run: '[运行任务]', verify: '[预期结果]',
}
const scriptFile = name => name === 'init' ? 'init-workflow' : name === 'batch' ? 'batch-workflow' : name
const metaFor = name => ({
  name,
  description: descriptions[name],
  phases: name === 'deep-research'
    ? ['范围界定', '并行搜索', '抓取与提取', '三票核验', '综合结论'].map(title => ({ title }))
    : undefined,
})

export function apply(ctx) {
  const activeJobs = new Map()
  const activeSessions = new Map()
  const append = (session, type, data) => {
    try {
      session.append(type, data)
      return true
    } catch (error) {
      ctx.logger.warn(`devflow: disabled workflow record after ${type} append failed: ${String(error)}`)
      return false
    }
  }
  ctx.on('workflow/agent-start', (info, agent) => {
    const session = activeSessions.get(info.id)
    if (session !== undefined && !append(session, 'tool-workflow/agent-start', {
      runId: info.id,
      seq: agent.seq,
      label: agent.label,
      ...agent.phase === undefined ? {} : { phase: agent.phase },
      childId: agent.childId,
    })) activeSessions.delete(info.id)
  })
  ctx.on('workflow/agent-end', (info, agent) => {
    const session = activeSessions.get(info.id)
    if (session !== undefined && !append(session, 'tool-workflow/agent-end', {
      runId: info.id,
      seq: agent.seq,
      outcome: agent.outcome,
    })) activeSessions.delete(info.id)
  })
  ctx.on('workflow/phase', (info, title) => {
    const job = activeJobs.get(info.id)
    job?.updateProgress(title)
    job?.append(`▸ ${title}\n`, { channel: 'log' })
  })
  ctx.on('workflow/log', (info, message) => activeJobs.get(info.id)?.append(`${message}\n`, { channel: 'log' }))

  const startWorkflow = async (agent, command, input, toolCall) => {
    const workflowEngine = ctx.agentPresets.serviceFor(agent, 'workflowEngine')
    if (!workflowEngine) throw new Error(`/${command} requires an Agent preset with Workflow support.`)
    const script = await readFile(new URL(`../workflows/${scriptFile(command)}.js`, import.meta.url), 'utf8')
    let run
    const jobId = ctx.jobs.start({
      kind: 'workflow',
      label: command,
      owner: agent.id,
      ...toolCall === undefined ? {} : { toolCall },
      run: job => {
        run = workflowEngine.start({
          script,
          meta: metaFor(command),
          args: command === 'deep-research' ? { question: input } : { instruction: input },
          parent: agent,
        })
        activeJobs.set(run.id, job)
        if (append(agent.session, 'tool-workflow/run-start', { runId: run.id, name })) {
          activeSessions.set(run.id, agent.session)
        }
        return {
          cancel: reason => run.cancel(reason ?? 'DevFlow job stopped'),
          done: run.result.then(async result => {
            try {
              if (result.stopReason === 'cancelled') return { status: 'killed' }
              if (result.stopReason !== 'completed') return { status: 'failed', detail: `/${command} failed: ${result.error ?? result.stopReason}` }
              return { status: 'completed', result: typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2) }
            } finally {
              await run.dispose()
              const session = activeSessions.get(run.id)
              if (session !== undefined) append(session, 'tool-workflow/run-end', { runId: run.id, stopReason: result.stopReason })
              activeSessions.delete(run.id)
              activeJobs.delete(run.id)
            }
          }),
        }
      },
    })
    return { command, runId: run.id, jobId }
  }

  for (const [name, description] of Object.entries(descriptions)) {
    ctx.effect(() => ctx.commands.register({
      name,
      description,
      input: { hint: hints[name] },
      // The ordinary user message owns the input; avoid a second command-input row.
      recordInput: false,
      handler: ({ agent, rawInput }) => {
        if (!rawInput.trim() && name !== 'init') {
          return { kind: 'error', text: `/${name} requires input. ${hints[name]}` }
        }
        if (!ctx.agentPresets.serviceFor(agent, 'workflowEngine')) {
          return { kind: 'error', text: `/${name} requires an Agent preset with Workflow support.` }
        }
        agent.followup({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: `/${name}${rawInput ? ` ${rawInput.trimStart()}` : ''}` }],
          source: { kind: 'devflow' },
        })
        return { kind: 'success' }
      },
    }), `devflow: ${name}`)
  }

  ctx.effect(() => ctx.tools.register({
    name: 'devflow',
    description: 'Start the packaged research or development workflow requested by a DevFlow slash command in the user message: /deep-research, /batch, /init, /review, /simplify, /security-review, /debug, /run, or /verify. Returns a background job ID; completion is delivered to this conversation. Use job_output to collect results and job_kill to cancel. Do not restart a running job. Use only for an explicit DevFlow command.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: Object.keys(descriptions), description: 'Command name without the leading slash.' },
        input: { type: 'string', description: 'Original arguments after the command name; empty is allowed only for init.' },
      },
      required: ['command', 'input'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { command: { type: 'string' }, runId: { type: 'string' }, jobId: { type: 'string' } },
        required: ['command', 'runId', 'jobId'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: `/${value.command} 已启动，任务编号：${value.jobId}。完成结果会回到当前会话；用 job_output 查看结果，用 job_kill 停止任务。` }],
    },
    execute: async ({ command, input }, exec) => {
      if (!Object.hasOwn(descriptions, command)) throw new Error(`Unknown DevFlow command: ${command}`)
      if (!input.trim() && command !== 'init') throw new Error(`/${command} requires input. ${hints[command]}`)
      exec.signal.throwIfAborted()
      return startWorkflow(exec.agent, command, input, { callId: exec.callId, rootCallId: exec.rootCallId })
    },
  }), 'devflow: workflow tool')
}
