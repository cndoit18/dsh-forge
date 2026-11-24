const DEFAULT_MAX_ACTIVE_SUBAGENTS = 8

function resolveMaxActiveSubagents(ctx) {
  const configured = ctx.get?.('settings')?.describe()
    .find(descriptor => descriptor.ns === 'subagent')?.value?.maxActiveSubagents
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_ACTIVE_SUBAGENTS
}

// The PTC engine's CPU-based queue does not share the subagent activation pool.
// Shadow the script hook with a FIFO semaphore so nested parallel() calls share
// one run-wide ceiling and a settled agent transfers its slot to the next waiter.
function limitSubagentConcurrency(script, limit) {
  return `return (async agent => {
${script}
})((originalAgent => {
  const limit = ${JSON.stringify(limit)}
  let active = 0
  const waiting = []
  return async (...args) => {
    if (active >= limit || waiting.length > 0) {
      await new Promise(resolve => waiting.push(resolve))
    } else {
      active++
    }
    try {
      return await originalAgent(...args)
    } finally {
      const next = waiting.shift()
      if (next === undefined) active--
      else next()
    }
  }
})(agent))`
}

function workflowMeta(definition) {
  return {
    name: definition.name,
    description: definition.description,
    ...definition.whenToUse === undefined ? {} : { whenToUse: definition.whenToUse },
    ...definition.phases === undefined ? {} : { phases: definition.phases },
  }
}

/** Own the Job, Session recording, and engine-run lifetime for workflows. */
export class WorkflowRunner {
  constructor(ctx, workflows) {
    this.ctx = ctx
    this.workflows = workflows
    this.activeJobs = new Map()
    this.activeSessions = new Map()
    ctx.on('workflow/agent-start', (info, agent) => {
      const session = this.activeSessions.get(info.id)
      if (session !== undefined && !this.append(session, 'tool-workflow/agent-start', {
        runId: info.id,
        seq: agent.seq,
        label: agent.label,
        ...agent.phase === undefined ? {} : { phase: agent.phase },
        childId: agent.childId,
      })) this.activeSessions.delete(info.id)
    })
    ctx.on('workflow/agent-end', (info, agent) => {
      const session = this.activeSessions.get(info.id)
      if (session !== undefined && !this.append(session, 'tool-workflow/agent-end', {
        runId: info.id,
        seq: agent.seq,
        outcome: agent.outcome,
      })) this.activeSessions.delete(info.id)
    })
    ctx.on('workflow/phase', (info, title) => {
      const job = this.activeJobs.get(info.id)
      job?.updateProgress(title)
      job?.append(`▸ ${title}\n`, { channel: 'log' })
    })
    ctx.on('workflow/log', (info, message) => {
      this.activeJobs.get(info.id)?.append(`${message}\n`, { channel: 'log' })
    })
  }

  append(session, type, data) {
    try {
      session.append(type, data)
      return true
    } catch (error) {
      this.ctx.logger.warn(`dsh-workflow: disabled workflow record after ${type} append failed: ${String(error)}`)
      return false
    }
  }

  async start({ name, input = '', parent, toolCall, recordsRun = true, signal }) {
    if (parent === undefined) throw new Error('workflow requires a calling agent')
    const cwd = await this.ctx.workingDirectory.ensure(parent, signal)
    const definition = await this.workflows.get(name, { cwd, signal })
    if (definition === undefined) throw new Error(`Unknown workflow: ${name}`)
    const text = input.trimStart()
    if (definition.input?.required === true && text.trim() === '') {
      throw new Error(`/${name} requires input. ${definition.input.hint}`)
    }
    signal?.throwIfAborted()
    const args = definition.createArgs?.(text) ?? { input: text }
    let run
    const jobId = this.ctx.jobs.start({
      kind: 'workflow',
      label: name,
      owner: parent.id,
      ...toolCall === undefined ? {} : { toolCall },
      run: job => {
        run = this.ctx.workflowEngine.start({
          script: limitSubagentConcurrency(definition.script, resolveMaxActiveSubagents(this.ctx)),
          meta: workflowMeta(definition),
          args,
          parent,
        })
        this.activeJobs.set(run.id, job)
        if (recordsRun && this.append(parent.session, 'tool-workflow/run-start', { runId: run.id, name: run.meta.name })) {
          this.activeSessions.set(run.id, parent.session)
        }
        return {
          cancel: reason => run.cancel(reason ?? 'Workflow job stopped'),
          done: run.result.then(async result => {
            try {
              if (result.stopReason === 'cancelled') return { status: 'killed' }
              if (result.stopReason !== 'completed') {
                return { status: 'failed', detail: `/${name} failed: ${result.error ?? result.stopReason}` }
              }
              return {
                status: 'completed',
                result: typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2) ?? 'null',
              }
            } finally {
              try {
                await run.dispose()
              } catch (error) {
                this.ctx.logger.warn(`dsh-workflow: workflow ${run.id} dispose failed: ${String(error)}`)
              } finally {
                const session = this.activeSessions.get(run.id)
                if (session !== undefined) {
                  this.append(session, 'tool-workflow/run-end', { runId: run.id, stopReason: result.stopReason })
                }
                this.activeSessions.delete(run.id)
                this.activeJobs.delete(run.id)
              }
            }
          }),
        }
      },
    })
    return { name, runId: run.id, jobId }
  }
}
