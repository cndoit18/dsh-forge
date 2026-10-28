import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  DEFAULT_SETTINGS, WorktreeError, inspectRepository, readJson, removeWorktree, validateSettings, writeJson,
} from './manager.js'

export { DEFAULT_SETTINGS, WorktreeError }

/** Owns settings, pending forks, and managed records under one data directory. */
export class WorktreeStore {
  constructor(dataDirectory = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'plugins', 'worktrees')) {
    this.dataDirectory = dataDirectory
    this.pendingForks = {}
    this.settings = { ...DEFAULT_SETTINGS }
    this.operations = new Map()
    this.ready = this.load()
  }

  async load() {
    const [settings, pendingForks] = await Promise.all([
      readJson(join(this.dataDirectory, 'settings.json'), DEFAULT_SETTINGS, 'settings', validateSettings),
      readJson(join(this.dataDirectory, 'pending-forks.json'), {}, 'records', validPendingForks),
    ])
    this.settings = settings
    this.pendingForks = pendingForks
  }

  exclusive(key, action) {
    const previous = this.operations.get(key) ?? Promise.resolve()
    const next = previous.then(action, action)
    const queued = next.catch(() => {})
    this.operations.set(key, queued)
    return next.finally(() => {
      if (this.operations.get(key) === queued) this.operations.delete(key)
    })
  }

  async settingsRead() {
    await this.ready
    return this.settings
  }

  async settingsWrite(request) {
    await this.ready
    return this.exclusive('settings', async () => {
      const settings = validateSettings(request)
      await writeJson(join(this.dataDirectory, 'settings.json'), settings)
      this.settings = settings
      return settings
    })
  }

  pendingFork(sessionId) {
    return this.pendingForks[sessionId]
  }

  async selectPendingFork(sessionId, sourceSessionId) {
    await this.ready
    return this.exclusive('pending-forks', async () => {
      const pendingForks = {
        ...this.pendingForks,
        [sessionId]: { sourceSessionId, createdAt: new Date().toISOString() },
      }
      await writeJson(join(this.dataDirectory, 'pending-forks.json'), pendingForks)
      this.pendingForks = pendingForks
    })
  }

  async clearPending(sessionId) {
    await this.ready
    if (!this.pendingForks[sessionId]) return
    return this.exclusive('pending-forks', async () => {
      const pendingForks = { ...this.pendingForks }
      delete pendingForks[sessionId]
      await writeJson(join(this.dataDirectory, 'pending-forks.json'), pendingForks)
      this.pendingForks = pendingForks
    })
  }

  async list() {
    await this.ready
    const records = await this.readRecords()
    const items = await Promise.all(records.map(async record => {
      const repository = await inspectRepository(record.path)
      return { ...record, status: repository.git ? 'ready' : 'missing', branch: repository.branch ?? record.branch }
    }))
    return items.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
  }

  async findForSession(sessionId, cwd, pendingFork = this.pendingFork(sessionId)) {
    const records = await this.list()
    const source = pendingFork ? records.find(item => item.sessionIds.includes(pendingFork.sourceSessionId)) : undefined
    const record = records.find(item => item.sessionIds.includes(sessionId) || (!pendingFork && item.path === cwd))
    return { records, source, record }
  }

  async record(record) {
    await this.ready
    return this.exclusive('records', async () => {
      const records = await this.readRecords()
      await this.writeRecords([...records.filter(item => item.path !== record.path), record])
      return record
    })
  }

  async remove({ path, sessionIds, protectedSessionIds, protectedPaths, confirmed, confirmDelete, signal }) {
    await this.ready
    return this.exclusive('records', () => removeWorktree({
      dataDirectory: this.dataDirectory, path, sessionIds, protectedSessionIds, protectedPaths,
      confirmed, confirmDelete, signal, readRecords: () => this.readRecords(),
      writeRecords: records => this.writeRecords(records),
    }))
  }

  async cleanup({ protectedSessionIds = [], protectedPaths = [], signal } = {}) {
    await this.ready
    return this.exclusive('records', async () => {
      const settings = await this.settingsRead()
      if (!settings.autoCleanup) return { deleted: [] }
      const items = await this.list()
      const eligible = items.filter(item => item.status === 'ready' && !protectedPaths.includes(item.path)
        && !item.sessionIds.some(id => protectedSessionIds.includes(id)))
      const excess = Math.max(0, eligible.length - Math.max(0, settings.keepCount - (items.length - eligible.length)))
      const deleted = []
      for (const item of eligible.slice(-excess)) {
        await removeWorktree({
          dataDirectory: this.dataDirectory, path: item.path, sessionIds: item.sessionIds, protectedSessionIds,
          protectedPaths, confirmed: true, signal, readRecords: () => this.readRecords(),
          writeRecords: records => this.writeRecords(records),
        })
        deleted.push(item.path)
      }
      return { deleted }
    })
  }

  async readRecords() {
    return readJson(join(this.dataDirectory, 'worktrees.json'), [], 'records', validRecords)
  }

  async writeRecords(records) {
    await writeJson(join(this.dataDirectory, 'worktrees.json'), records)
  }
}

function validRecords(value) {
  if (!Array.isArray(value) || !value.every(validRecord)) throw new Error('工作树记录格式无效')
  return value
}

function validRecord(item) {
  return typeof item?.path === 'string' && isAbsolute(item.path) && typeof item.id === 'string'
    && typeof item.branch === 'string' && typeof item.sourceRoot === 'string'
    && typeof item.baseCommit === 'string' && typeof item.lastUsedAt === 'string'
    && Array.isArray(item.sessionIds) && item.sessionIds.every(id => typeof id === 'string')
}

function validPendingForks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('待创建记录必须是对象')
  for (const [sessionId, pending] of Object.entries(value)) {
    if (typeof sessionId !== 'string' || typeof pending?.sourceSessionId !== 'string' || typeof pending.createdAt !== 'string') {
      throw new Error('待创建记录格式无效')
    }
  }
  return value
}
