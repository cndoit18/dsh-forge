import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readSettings, writeSettings, WorktreeError, cleanupOld, removeWorktree, listManaged, inspectRepository, fetchUpstream, recordWorktree, readPendingForks, writePendingForks } from './manager.js'

export const name = 'worktrees'
export const inject = ['worktrees', 'agents', 'workingDirectory', 'workspaceRegistry', 'sessionController']

const remoteInitializers = []

export class WorktreesHost extends TypertRemoteService {
  static inject = inject
  constructor(ctx) {
    super(ctx, 'worktreeManager', { namespace: 'worktrees' })
    for (const initialize of remoteInitializers) initialize.call(this)
    this.dataDirectory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'plugins', 'worktrees')
    this.operations = new Map()
    this.pendingForks = {}
    this.pendingSelections = new Set()
    this.ready = this.loadPending()
    ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
      await this.ready
      if (!this.pendingSelections.has(agent.id) && !this.pendingForks[agent.id]) return next()
      const attachmentCount = messages.reduce((count, message) => count + message.content.filter(part => part.type === 'image' || part.type === 'file').length, 0)
      await this.prepareSession({ sessionId: agent.id, attachmentCount }, signal)
      return next()
    })
  }
  async loadPending() { this.pendingForks = await readPendingForks(this.dataDirectory) }
  async serial(key, action) {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const next = previous.then(action, action)
    const queued = next.catch(() => {})
    this.operations.set(key, queued)
    try { return await next } finally { if (this.operations.get(key) === queued) this.operations.delete(key) }
  }
  async owner(peer) {
    if (peer.principal.kind !== 'owner') throw new WorktreeError('worktrees/forbidden', '仅本地用户可使用工作树能力')
  }
  async agentFor(sessionId) {
    const existing = this.ctx.agents.get(sessionId)
    if (existing) return existing
    const result = await this.ctx.sessionController.resolveAgent(sessionId)
    if ('error' in result) throw result.error
    return result.agent
  }
  async createAt(agent, signal) {
    const settings = await readSettings(this.dataDirectory)
    const cwd = this.ctx.workingDirectory.get(agent.session)
    const repository = await inspectRepository(cwd)
    if (!repository.git) throw new WorktreeError('worktrees/not-git', '当前目录不是 Git 仓库，无法创建工作树')
    if (settings.root !== '' && settings.root !== '.agents/worktrees') throw new WorktreeError('worktrees/root-unsupported', '当前版本使用仓库内 .agents/worktrees，暂不支持自定义根目录')
    if (settings.fetchBeforeCreate) await fetchUpstream(repository.root, signal)
    const created = await this.ctx.worktrees.create(agent, {}, signal)
    return { ...created, sourceRoot: created.repositoryRoot }
  }
  async clearPending(sessionId) {
    this.pendingSelections.delete(sessionId)
    if (!this.pendingForks[sessionId]) return
    delete this.pendingForks[sessionId]
    await writePendingForks(this.dataDirectory, this.pendingForks)
  }
  async inspect(request) {
    await this.owner(this.ctx.invocation.peer)
    await this.ready
    const pendingFork = this.pendingForks[request.sessionId]
    const records = await listManaged(this.dataDirectory)
    const sourceRecord = pendingFork ? records.find(item => item.sessionIds.includes(pendingFork.sourceSessionId)) : undefined
    let cwd = request.cwd
    if (sourceRecord) cwd = sourceRecord.path
    else if (request.sessionId) cwd = this.ctx.workingDirectory.get((await this.agentFor(request.sessionId)).session)
    const repository = await inspectRepository(cwd)
    const record = records.find(item => item.sessionIds.includes(request.sessionId) || (!pendingFork && item.path === cwd))
    return { ...repository, managed: record ?? null, pendingFork: Boolean(pendingFork), pendingSelection: this.pendingSelections.has(request.sessionId) || Boolean(pendingFork) }
  }
  async select(request) {
    await this.owner(this.ctx.invocation.peer)
    await this.ready
    if (typeof request.sessionId !== 'string') throw new WorktreeError('worktrees/invalid-request', '缺少会话 ID')
    if (request.pending) this.pendingSelections.add(request.sessionId)
    else await this.clearPending(request.sessionId)
    return { pending: this.pendingSelections.has(request.sessionId) || Boolean(this.pendingForks[request.sessionId]) }
  }
  async prepare(request) {
    await this.owner(this.ctx.invocation.peer)
    return this.prepareSession(request, this.ctx.invocation.signal)
  }
  async prepareSession(request, signal) {
    await this.ready
    if (typeof request.sessionId !== 'string') throw new WorktreeError('worktrees/invalid-request', '缺少会话 ID')
    if ((request.attachmentCount ?? 0) > 0) throw new WorktreeError('worktrees/attachments-unsupported', '首次创建工作树时请使用纯文本消息，附件不会迁移')
    return this.serial(request.sessionId, async () => {
      const existing = (await listManaged(this.dataDirectory)).find(item => item.sessionIds.includes(request.sessionId) && item.status === 'ready')
      if (existing) {
        await this.clearPending(request.sessionId)
        return { sessionId: request.sessionId, created: existing, reused: true }
      }
      const agent = await this.agentFor(request.sessionId)
      const pendingFork = this.pendingForks[request.sessionId]
      if (pendingFork) {
        const sourceRecord = (await listManaged(this.dataDirectory)).find(item => item.sessionIds.includes(pendingFork.sourceSessionId))
        if (!sourceRecord) throw new WorktreeError('worktrees/not-managed', '独立分叉的源工作树不存在')
        await this.ctx.workingDirectory.set(agent, sourceRecord.path, signal)
      }
      const created = await this.createAt(agent, signal)
      await recordWorktree(this.dataDirectory, { id: created.branch, ...created, sessionIds: [request.sessionId], lastUsedAt: new Date().toISOString() })
      await this.clearPending(request.sessionId)
      const settings = await readSettings(this.dataDirectory)
      if (settings.autoCleanup) await cleanupOld({ dataDirectory: this.dataDirectory, keepCount: settings.keepCount, protectedSessionIds: [...this.protectedIds(request.sessionId), request.sessionId], protectedPaths: this.protectedPaths(), signal })
      return { sessionId: request.sessionId, created }
    })
  }
  async adopt(request) {
    await this.owner(this.ctx.invocation.peer)
    await this.ready
    return this.serial('adopt:' + request.sessionId, async () => {
      const source = await this.agentFor(request.sessionId)
      const sourceCwd = this.ctx.workingDirectory.get(source.session)
      const record = (await listManaged(this.dataDirectory)).find(item => item.sessionIds.includes(request.sessionId) || item.path === sourceCwd)
      if (!record) throw new WorktreeError('worktrees/not-managed', '只能沿用插件管理的工作树')
      const child = await this.agentFor(request.childId)
      const path = await this.ctx.workingDirectory.set(child, record.path, this.ctx.invocation.signal)
      const sessionIds = [...new Set([...record.sessionIds, request.childId])]
      await recordWorktree(this.dataDirectory, { ...record, sessionIds, lastUsedAt: new Date().toISOString() })
      return { sessionId: request.childId, path, sessionIds }
    })
  }
  async fork(request) {
    await this.owner(this.ctx.invocation.peer)
    await this.ready
    if (!request.isolate) {
      return this.ctx.sessionController.fork({ sessionId: request.sessionId, ...(request.atSeq === undefined ? {} : { atSeq: request.atSeq }) })
    }
    return this.serial('fork:' + request.sessionId, async () => {
      const result = await this.ctx.sessionController.fork({ sessionId: request.sessionId, ...(request.atSeq === undefined ? {} : { atSeq: request.atSeq }) })
      this.pendingForks[result.sessionId] = { sourceSessionId: request.sessionId, createdAt: new Date().toISOString() }
      await writePendingForks(this.dataDirectory, this.pendingForks)
      return { ...result, pending: true }
    })
  }
  async settingsRead() {
    await this.owner(this.ctx.invocation.peer)
    return readSettings(this.dataDirectory)
  }
  async settingsWrite(request) {
    await this.owner(this.ctx.invocation.peer)
    const settings = await this.serial('settings', () => writeSettings(this.dataDirectory, request))
    if (settings.autoCleanup) await cleanupOld({ dataDirectory: this.dataDirectory, keepCount: settings.keepCount, protectedSessionIds: this.protectedIds(request.currentSessionId), protectedPaths: this.protectedPaths(), signal: this.ctx.invocation.signal })
    return settings
  }
  async list(request) {
    await this.owner(this.ctx.invocation.peer)
    const pinned = new Set(this.ctx.workspaceRegistry.pinnedSessionIds)
    const items = await listManaged(this.dataDirectory)
    const activePaths = new Set(this.protectedPaths())
    return items.map(item => ({ ...item, pinned: item.sessionIds.some(id => pinned.has(id)), protected: activePaths.has(item.path) || item.sessionIds.some(id => pinned.has(id) || id === request.currentSessionId || this.ctx.agents.get(id) !== undefined) }))
  }
  protectedIds(currentSessionId) {
    const ids = new Set(this.ctx.workspaceRegistry.pinnedSessionIds)
    if (currentSessionId) ids.add(currentSessionId)
    for (const id of Object.keys(this.pendingForks)) ids.add(id)
    for (const agent of this.ctx.agents.list()) ids.add(agent.id)
    return [...ids]
  }
  protectedPaths() {
    return this.ctx.agents.list().map(agent => this.ctx.workingDirectory.get(agent.session))
  }
  async remove(request) {
    await this.owner(this.ctx.invocation.peer)
    return this.serial('delete', async () => {
      const settings = await readSettings(this.dataDirectory)
      const record = (await listManaged(this.dataDirectory)).find(item => item.path === request.path)
      if (!record) throw new WorktreeError('worktrees/not-managed', '只能删除由此插件管理的工作树')
      return removeWorktree({ dataDirectory: this.dataDirectory, path: request.path, sessionIds: record.sessionIds, protectedSessionIds: this.protectedIds(request.currentSessionId), protectedPaths: this.protectedPaths(), confirmed: request.confirmed, confirmDelete: settings.confirmDelete, signal: this.ctx.invocation.signal })
    })
  }
  async cleanup() {
    await this.owner(this.ctx.invocation.peer)
    const settings = await readSettings(this.dataDirectory)
    if (!settings.autoCleanup) return { deleted: [] }
    return this.serial('delete', () => cleanupOld({ dataDirectory: this.dataDirectory, keepCount: settings.keepCount, protectedSessionIds: this.protectedIds(), protectedPaths: this.protectedPaths(), signal: this.ctx.invocation.signal }))
  }
}
for (const method of ['inspect', 'select', 'prepare', 'fork', 'adopt', 'settingsRead', 'settingsWrite', 'list', 'remove', 'cleanup']) {
  Remote(method)(WorktreesHost.prototype[method], {
    kind: 'method', name: method, static: false, private: false,
    addInitializer(initializer) { remoteInitializers.push(initializer) },
  })
}
export function apply(ctx) { ctx.plugin(WorktreesHost) }
