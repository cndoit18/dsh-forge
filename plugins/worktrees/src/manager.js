import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

export const WORKTREE_ROOT = '.agents/worktrees'
export const DEFAULT_SETTINGS = Object.freeze({
  root: '', fetchBeforeCreate: false, autoCleanup: true, keepCount: 15, confirmDelete: true,
})
const BOOLEAN_SETTINGS = ['fetchBeforeCreate', 'autoCleanup', 'confirmDelete']

export class WorktreeError extends RemoteError {
  constructor(code, message) { super(code, message, {}) }
}

export function validateSettings(input = {}) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorktreeError('worktrees/settings-invalid', '设置必须是对象')
  }
  const settings = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, fallback]) => [key, input[key] ?? fallback]))
  if (settings.root !== '' && settings.root !== WORKTREE_ROOT) {
    throw new WorktreeError('worktrees/root-unsupported', '当前版本使用仓库内 .agents/worktrees，暂不支持自定义根目录')
  }
  if (!Number.isSafeInteger(settings.keepCount) || settings.keepCount < 1 || settings.keepCount > 999) {
    throw new WorktreeError('worktrees/settings-invalid', '保留数量必须是 1–999 的整数')
  }
  for (const key of BOOLEAN_SETTINGS) {
    if (typeof settings[key] !== 'boolean') throw new WorktreeError('worktrees/settings-invalid', '开关设置必须是布尔值')
  }
  return settings
}

export async function readJson(path, fallback, kind, validate = value => value) {
  let value
  try { value = JSON.parse(await readFile(path, 'utf8')) }
  catch (error) {
    if (error?.code === 'ENOENT') return structuredClone(fallback)
    throw new WorktreeError('worktrees/' + kind + '-invalid', '无法读取' + subject(kind) + '：' + messageOf(error))
  }
  try { return validate(value) }
  catch (error) {
    if (error instanceof WorktreeError) throw error
    throw new WorktreeError('worktrees/' + kind + '-invalid', subject(kind) + '格式无效：' + messageOf(error))
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch(() => {})
  }
}

export async function inspectRepository(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) return { git: false }
  try {
    const [root, common, branch] = await Promise.all([
      git(cwd, ['rev-parse', '--show-toplevel']),
      git(cwd, ['rev-parse', '--git-common-dir']),
      git(cwd, ['branch', '--show-current']),
    ])
    return { git: true, root, commonGitDirectory: common, branch: branch || null, project: basename(root) }
  } catch (error) {
    if (error?.code === 'ENOENT') throw new WorktreeError('worktrees/git-unavailable', '未找到 Git 命令')
    return { git: false }
  }
}

export async function fetchUpstream(repositoryRoot, signal) {
  try {
    await git(repositoryRoot, ['fetch', '--all', '--prune'], {
      signal, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '', SSH_ASKPASS: '' },
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new WorktreeError('worktrees/fetch-failed', '获取上游更新失败，未创建工作树：' + messageOf(error))
  }
}

export async function removeWorktree({
  dataDirectory, path, sessionIds = [], protectedSessionIds = [], protectedPaths = [],
  confirmed = false, confirmDelete = true, signal, readRecords, writeRecords,
}) {
  const records = await readRecords()
  const record = records.find(item => item.path === path)
  if (!record) throw new WorktreeError('worktrees/not-managed', '只能删除由此插件管理的工作树')
  if (protectedPaths.includes(record.path) || sessionIds.some(id => protectedSessionIds.includes(id))) {
    throw new WorktreeError('worktrees/protected', '当前或置顶聊天的工作树受保护，不能删除')
  }
  if (confirmDelete && !confirmed) throw new WorktreeError('worktrees/confirmation-required', '删除工作树前需要确认')
  const recovery = join(dataDirectory, 'recovery', record.id + '.json')
  const [diff, untracked] = await Promise.all([
    git(record.path, ['diff', 'HEAD', '--binary', '--full-index', '--no-ext-diff']),
    git(record.path, ['ls-files', '--others', '--exclude-standard', '-z']),
  ])
  const contents = await snapshotFiles(record.path, untracked)
  await writeJson(recovery, {
    version: 1, branch: record.branch, baseCommit: record.baseCommit, sourceRoot: record.sourceRoot, diff, untracked: contents,
  })
  await git(record.sourceRoot, ['worktree', 'remove', '--force', record.path], { signal })
  await writeRecords(records.filter(item => item.path !== path))
  return { deleted: true, recovery }
}

async function snapshotFiles(root, untracked) {
  const contents = []
  for (const relative of untracked.split('\0').filter(Boolean)) {
    const absolute = join(root, relative)
    const info = await stat(absolute)
    if (!info.isFile()) throw new WorktreeError('worktrees/snapshot-failed', '存在无法自动备份的未跟踪目录，请先手动处理')
    contents.push({ path: relative, data: (await readFile(absolute)).toString('base64') })
  }
  return contents
}

function subject(kind) {
  return kind === 'settings' ? '设置' : '工作树记录'
}

function messageOf(error) {
  return [error?.stderr, error?.stdout, error instanceof Error ? error.message : String(error)]
    .find(value => typeof value === 'string' && value.trim() !== '')?.trim()
}

function git(cwd, args, { signal, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], {
      encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, signal, env,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
      } else resolve(stdout.trim())
    })
  })
}
