import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

export const DEFAULT_SETTINGS = Object.freeze({ root: '', fetchBeforeCreate: false, autoCleanup: true, keepCount: 15, confirmDelete: true })
export class WorktreeError extends RemoteError { constructor(code, message) { super(code, message, {}) } }

export function validateSettings(input = {}) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new WorktreeError('worktrees/settings-invalid', '设置必须是对象')
  const root = input.root ?? ''
  const keepCount = input.keepCount ?? DEFAULT_SETTINGS.keepCount
  if (root !== '' && root !== '.agents/worktrees') throw new WorktreeError('worktrees/root-unsupported', '当前版本使用仓库内 .agents/worktrees，暂不支持自定义根目录')
  if (!Number.isSafeInteger(keepCount) || keepCount < 1 || keepCount > 999) throw new WorktreeError('worktrees/settings-invalid', '保留数量必须是 1–999 的整数')
  for (const key of ['fetchBeforeCreate', 'autoCleanup', 'confirmDelete']) {
    if (typeof (input[key] ?? DEFAULT_SETTINGS[key]) !== 'boolean') throw new WorktreeError('worktrees/settings-invalid', '开关设置必须是布尔值')
  }
  return { root, fetchBeforeCreate: input.fetchBeforeCreate ?? false, autoCleanup: input.autoCleanup ?? true, keepCount, confirmDelete: input.confirmDelete ?? true }
}
export async function readSettings(dataDirectory) {
  try { return validateSettings(JSON.parse(await readFile(join(dataDirectory, 'settings.json'), 'utf8'))) }
  catch (error) {
    if (error?.code === 'ENOENT') return { ...DEFAULT_SETTINGS }
    throw new WorktreeError('worktrees/settings-invalid', '无法读取设置：' + messageOf(error))
  }
}
export async function writeSettings(dataDirectory, input) {
  const settings = validateSettings(input)
  await atomicWrite(join(dataDirectory, 'settings.json'), JSON.stringify(settings, null, 2) + '\n')
  return settings
}
export async function inspectRepository(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return { git: false }
  try {
    const [root, common, branch] = await Promise.all([
      git(cwd, ['rev-parse', '--show-toplevel']), git(cwd, ['rev-parse', '--git-common-dir']), git(cwd, ['branch', '--show-current']),
    ])
    return { git: true, root, commonGitDirectory: common, branch: branch || null, project: root.split('/').at(-1) }
  } catch { return { git: false } }
}
export async function fetchUpstream(repositoryRoot, signal) {
  try { await git(repositoryRoot, ['fetch', '--all', '--prune'], { signal, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' } }) }
  catch (error) { throw new WorktreeError('worktrees/fetch-failed', '获取上游更新失败，未创建工作树：' + messageOf(error)) }
}
export async function listManaged(dataDirectory) {
  const items = []
  for (const record of await readRecords(dataDirectory)) {
    const repository = await inspectRepository(record.path)
    items.push({ ...record, status: repository.git ? 'ready' : 'missing', branch: repository.branch ?? record.branch })
  }
  return items.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
}
export async function recordWorktree(dataDirectory, record) {
  const records = await readRecords(dataDirectory)
  await writeRecords(dataDirectory, [...records.filter(item => item.path !== record.path), record])
  return record
}
export async function removeWorktree({ dataDirectory, path, sessionIds = [], protectedSessionIds = [], protectedPaths = [], confirmed = false, confirmDelete = true, signal }) {
  const records = await readRecords(dataDirectory)
  const record = records.find(item => item.path === path)
  if (record === undefined) throw new WorktreeError('worktrees/not-managed', '只能删除由此插件管理的工作树')
  if (protectedPaths.includes(record.path) || sessionIds.some(id => protectedSessionIds.includes(id))) throw new WorktreeError('worktrees/protected', '当前或置顶聊天的工作树受保护，不能删除')
  if (confirmDelete && !confirmed) throw new WorktreeError('worktrees/confirmation-required', '删除工作树前需要确认')
  const recovery = join(dataDirectory, 'recovery', record.id + '.json')
  await mkdir(dirname(recovery), { recursive: true })
  const diff = await git(record.path, ['diff', 'HEAD', '--binary', '--full-index', '--no-ext-diff'])
  const untracked = await git(record.path, ['ls-files', '--others', '--exclude-standard', '-z'])
  const contents = []
  for (const relative of untracked.split('\0').filter(Boolean)) {
    const absolute = join(record.path, relative)
    const info = await stat(absolute)
    if (!info.isFile()) throw new WorktreeError('worktrees/snapshot-failed', '存在无法自动备份的未跟踪目录，请先手动处理')
    contents.push({ path: relative, data: (await readFile(absolute)).toString('base64') })
  }
  await writeFile(recovery, JSON.stringify({ version: 1, branch: record.branch, baseCommit: record.baseCommit, sourceRoot: record.sourceRoot, diff, untracked: contents }), { mode: 0o600 })
  await git(record.sourceRoot, ['worktree', 'remove', '--force', record.path], { signal })
  await writeRecords(dataDirectory, records.filter(item => item.path !== path))
  return { deleted: true, recovery }
}
export async function cleanupOld({ dataDirectory, keepCount, protectedSessionIds = [], protectedPaths = [], signal }) {
  const items = await listManaged(dataDirectory)
  const eligible = items.filter(item => !protectedPaths.includes(item.path) && !item.sessionIds.some(id => protectedSessionIds.includes(id)))
  const excess = Math.max(0, eligible.length - Math.max(0, keepCount - (items.length - eligible.length)))
  const deleted = []
  if (excess === 0) return { deleted }
  for (const item of eligible.slice(-excess)) {
    await removeWorktree({ dataDirectory, path: item.path, sessionIds: item.sessionIds, protectedSessionIds, protectedPaths, confirmed: true, signal })
    deleted.push(item.path)
  }
  return { deleted }
}
export async function readPendingForks(dataDirectory) {
  try {
    const pending = JSON.parse(await readFile(join(dataDirectory, 'pending-forks.json'), 'utf8'))
    if (!pending || typeof pending !== 'object' || Array.isArray(pending)) return {}
    return pending
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new WorktreeError('worktrees/records-invalid', '无法读取待创建工作树记录：' + messageOf(error))
  }
}
export async function writePendingForks(dataDirectory, pending) {
  await atomicWrite(join(dataDirectory, 'pending-forks.json'), JSON.stringify(pending, null, 2) + '\n')
}
async function readRecords(dataDirectory) {
  try {
    const records = JSON.parse(await readFile(join(dataDirectory, 'worktrees.json'), 'utf8'))
    if (!Array.isArray(records)) throw new Error('expected an array')
    return records.filter(item => typeof item?.path === 'string' && isAbsolute(item.path)
      && typeof item.id === 'string' && typeof item.branch === 'string' && typeof item.sourceRoot === 'string'
      && typeof item.baseCommit === 'string' && typeof item.lastUsedAt === 'string'
      && Array.isArray(item.sessionIds) && item.sessionIds.every(id => typeof id === 'string'))
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw new WorktreeError('worktrees/records-invalid', '无法读取工作树记录：' + messageOf(error))
  }
}
async function writeRecords(dataDirectory, records) {
  await atomicWrite(join(dataDirectory, 'worktrees.json'), JSON.stringify(records, null, 2) + '\n')
}
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, content, { mode: 0o600 })
  await rename(temporary, path)
}
function messageOf(error) {
  return [error?.stderr, error?.stdout, error instanceof Error ? error.message : String(error)].find(value => typeof value === 'string' && value.trim() !== '')?.trim()
}
function git(cwd, args, { signal, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, signal, env }, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error) }
      else resolve(stdout.trim())
    })
  })
}
