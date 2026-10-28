import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { inspectRepository, fetchUpstream } from './manager.js'
import { WorktreeError, WorktreeStore } from './store.js'

export const name = 'worktrees'
export const inject = ['worktrees', 'agents', 'workingDirectory', 'workspaceRegistry', 'sessionController']

const remoteInitializers = []

/** Coordinates native worktree creation, chat forks, and managed cleanup. */
export class WorktreesHost extends TypertRemoteService {
  static inject = inject

  constructor(ctx, store) {
    super(ctx, 'worktreeManager', { namespace: 'worktrees' })
    for (const initialize of remoteInitializers) initialize.call(this)
    this.store = store ?? new WorktreeStore()

    this.ready = this.store.ready
    this.pendingSelections = new Set()
    this.operations = new Map()
    this.tasks = new Set()
    this.lifetime = new AbortController()
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      await this.ready
      if (!this.pendingSelections.has(agent.id) && !this.store.pendingFork(agent.id)) return next()
      const attachmentCount = messages.reduce((count, message) => count
        + message.content.filter(part => part.type === 'image' || part.type === 'file').length, 0)
      await this.prepareSession({ sessionId: agent.id, attachmentCount }, signal)
      return next()
    })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('worktrees plugin disposed'))
      await Promise.allSettled(this.tasks)
    })
  }

  execute(action, signal) {
    const operationSignal = signal === undefined
      ? this.lifetime.signal : AbortSignal.any([this.lifetime.signal, signal])
    const task = (async () => {
      operationSignal.throwIfAborted()
      return action(operationSignal)
    })()
    this.tasks.add(task)
    return task.finally(() => this.tasks.delete(task))
  }

  serial(key, action) {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const next = previous.then(action, action)
    const queued = next.catch(() => {})
    this.operations.set(key, queued)
    return next.finally(() => {
      if (this.operations.get(key) === queued) this.operations.delete(key)
    })
  }

  owner() {
    if (this.ctx.invocation.peer?.principal.kind !== 'owner') {
      throw new WorktreeError('worktrees/forbidden', '仅本地用户可使用工作树能力')
    }
  }

  async agentFor(sessionId) {
    const existing = this.ctx.agents.get(sessionId)
    if (existing) return existing
    const result = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in result) throw result.error
    return result.agent
  }

  async createAt(agent, signal) {
    const settings = await this.store.settingsRead()
    const repository = await inspectRepository(this.ctx.workingDirectory.get(agent.session))
    if (!repository.git) throw new WorktreeError('worktrees/not-git', '当前目录不是 Git 仓库，无法创建工作树')
    if (settings.fetchBeforeCreate) await fetchUpstream(repository.root, signal)
    const created = await this.ctx.worktrees.create(agent, {}, signal)
    return { ...created, sourceRoot: created.repositoryRoot }
  }

  async clearPending(sessionId) {
    this.pendingSelections.delete(sessionId)
    await this.store.clearPending(sessionId)
  }

  async inspect(request) {
    this.owner()
    await this.ready
    const sessionId = optionalSessionId(request)
    const pendingFork = this.store.pendingFork(sessionId)
    let cwd = request.cwd
    if (sessionId && !pendingFork) cwd = this.ctx.workingDirectory.get((await this.agentFor(sessionId)).session)
    const { source, record } = await this.store.findForSession(sessionId, cwd, pendingFork)
    if (source) cwd = source.path
    const repository = await inspectRepository(cwd)
    return {
      ...repository, managed: record ?? null, pendingFork: Boolean(pendingFork),
      pendingSelection: this.pendingSelections.has(sessionId) || Boolean(pendingFork),
    }
  }

  async select(request) {
    this.owner()
    await this.ready
    const sessionId = requireSessionId(request)
    if (request.pending) this.pendingSelections.add(sessionId)
    else await this.clearPending(sessionId)
    return { pending: this.pendingSelections.has(sessionId) || Boolean(this.store.pendingFork(sessionId)) }
  }

  async prepare(request) {
    this.owner()
    return this.prepareSession(request, this.ctx.invocation.signal)
  }

  async prepareSession(request, signal) {
    await this.ready
    const sessionId = requireSessionId(request)
    if ((request.attachmentCount ?? 0) > 0) {
      throw new WorktreeError('worktrees/attachments-unsupported', '首次创建工作树时请使用纯文本消息，附件不会迁移')
    }
    return this.serial(sessionId, () => this.execute(async operationSignal => {
      const { record } = await this.store.findForSession(sessionId)
      if (record?.status === 'ready') {
        await this.clearPending(sessionId)
        return { sessionId, created: record, reused: true }
      }
      const agent = await this.agentFor(sessionId)
      const pendingFork = this.store.pendingFork(sessionId)
      if (pendingFork) {
        const { source } = await this.store.findForSession(sessionId, undefined, pendingFork)
        if (!source) throw new WorktreeError('worktrees/not-managed', '独立分叉的源工作树不存在')
        await this.ctx.workingDirectory.set(agent, source.path, operationSignal)
      }
      const created = await this.createAt(agent, operationSignal)
      await this.store.record({
        id: created.branch, ...created, sessionIds: [sessionId], lastUsedAt: new Date().toISOString(),
      })
      await this.clearPending(sessionId)
      await this.store.cleanup(this.protection(sessionId, operationSignal))
      return { sessionId, created }
    }, signal))
  }

  async adopt(request) {
    this.owner()
    await this.ready
    return this.serial('adopt:' + request.sessionId, () => this.execute(async signal => {
      const source = await this.agentFor(request.sessionId)
      const cwd = this.ctx.workingDirectory.get(source.session)
      const { record } = await this.store.findForSession(request.sessionId, cwd)
      if (!record) throw new WorktreeError('worktrees/not-managed', '只能沿用插件管理的工作树')
      const child = await this.agentFor(request.childId)
      const path = await this.ctx.workingDirectory.set(child, record.path, signal)
      const sessionIds = [...new Set([...record.sessionIds, request.childId])]
      await this.store.record({ ...record, sessionIds, lastUsedAt: new Date().toISOString() })
      return { sessionId: request.childId, path, sessionIds }
    }, this.ctx.invocation.signal))
  }

  async fork(request) {
    this.owner()
    await this.ready
    const forkRequest = { sessionId: request.sessionId, ...(request.atSeq === undefined ? {} : { atSeq: request.atSeq }) }
    if (!request.isolate) return this.execute(() => this.ctx.sessionController.fork(forkRequest), this.ctx.invocation.signal)
    return this.serial('fork:' + request.sessionId, () => this.execute(async signal => {
      const result = await this.ctx.sessionController.fork(forkRequest)
      await this.store.selectPendingFork(result.sessionId, request.sessionId)
      return { ...result, pending: true }
    }, this.ctx.invocation.signal))
  }

  async settingsRead() {
    this.owner()
    return this.store.settingsRead()
  }

  async settingsWrite(request) {
    this.owner()
    const settings = await this.store.settingsWrite(request)
    await this.store.cleanup(this.protection(request.currentSessionId, this.ctx.invocation.signal))
    return settings
  }

  async list(request) {
    this.owner()
    const pinned = new Set(this.ctx.workspaceRegistry.pinnedSessionIds)
    const activePaths = new Set(this.protectedPaths())
    const items = await this.store.list()
    return items.map(item => ({
      ...item,
      pinned: item.sessionIds.some(id => pinned.has(id)),
      protected: activePaths.has(item.path) || item.sessionIds.some(id =>
        pinned.has(id) || id === request.currentSessionId || this.ctx.agents.get(id) !== undefined),
    }))
  }

  protection(currentSessionId, signal) {
    return {
      protectedSessionIds: this.protectedIds(currentSessionId), protectedPaths: this.protectedPaths(), signal,
    }
  }

  protectedIds(currentSessionId) {
    const ids = new Set(this.ctx.workspaceRegistry.pinnedSessionIds)
    if (currentSessionId) ids.add(currentSessionId)
    for (const id of Object.keys(this.store.pendingForks)) ids.add(id)
    for (const agent of this.ctx.agents.list()) ids.add(agent.id)
    return [...ids]
  }

  protectedPaths() {
    return this.ctx.agents.list().map(agent => this.ctx.workingDirectory.get(agent.session))
  }

  async remove(request) {
    this.owner()
    const record = (await this.store.list()).find(item => item.path === request.path)
    if (!record) throw new WorktreeError('worktrees/not-managed', '只能删除由此插件管理的工作树')
    const settings = await this.store.settingsRead()
    return this.store.remove({
      ...this.protection(request.currentSessionId, this.ctx.invocation.signal),
      path: request.path, sessionIds: record.sessionIds, confirmed: request.confirmed, confirmDelete: settings.confirmDelete,
    })
  }

  async cleanup() {
    this.owner()
    return this.store.cleanup(this.protection(undefined, this.ctx.invocation.signal))
  }
}

for (const method of ['inspect', 'select', 'prepare', 'fork', 'adopt', 'settingsRead', 'settingsWrite', 'list', 'remove', 'cleanup']) {
  Remote(method)(WorktreesHost.prototype[method], {
    kind: 'method', name: method, static: false, private: false,
    addInitializer(initializer) { remoteInitializers.push(initializer) },
  })
}

export function apply(ctx) { ctx.plugin(WorktreesHost) }

function optionalSessionId(request) {
  return request.sessionId === undefined ? undefined : requireSessionId(request)
}

function requireSessionId(request) {
  if (typeof request.sessionId !== 'string' || request.sessionId === '') {
    throw new WorktreeError('worktrees/invalid-request', '缺少会话 ID')
  }
  return request.sessionId
}
