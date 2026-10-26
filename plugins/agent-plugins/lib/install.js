import { execa } from 'execa'
import { cp, mkdir, mkdtemp, readFile, rename, rm, rmdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { resolveExistingInside } from './paths.js'
import { errorMessage, invalidAgentPlugin, validateManifest } from './validation.js'

const GIT_OPERATION_TIMEOUT_MS = 15_000
const GIT_PROBE_TIMEOUT_MS = 5_000
const HTTP_GIT_URL = /^(?:git\+)?https:\/\//i
const SCP_GIT_URL = /^git@[^:\s]+:[^\s]+$/i
const SSH_GIT_URL = /^(?:git\+)?ssh:\/\//i
const FILE_GIT_URL = /^(?:git\+)?file:\/\//i
const PATH_PARAMETER = /&path(?:=|:)([^#]*)$/
const PATH_SEGMENT = /^[A-Za-z0-9._@+-]+$/
const REF_PATTERN = /^[A-Za-z0-9._~^/:@+-]+$/

/** Parse a DSH-compatible Git install spec with optional ref and path parameter. */
export function parseGitInstallSpec(raw) {
  const input = raw.trim()
  if (input === '' || input.length > 2048 || input.startsWith('-')) {
    throw installError('agent-plugins/invalid-spec', 'Git install spec must be a non-empty value of at most 2048 characters')
  }
  let base = input
  let path
  const pathMatch = PATH_PARAMETER.exec(base)
  if (pathMatch) {
    path = normalizePackagePath(pathMatch[1])
    base = base.slice(0, pathMatch.index)
  }
  const hashAt = base.indexOf('#')
  const ref = hashAt === -1 ? undefined : base.slice(hashAt + 1)
  const address = hashAt === -1 ? base : base.slice(0, hashAt)
  if (ref !== undefined && !REF_PATTERN.test(ref)) {
    throw installError('agent-plugins/invalid-spec', 'Git ref contains unsupported characters')
  }
  if (HTTP_GIT_URL.test(address)) {
    const url = new URL(address.replace(/^git\+/i, ''))
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hostname === '') {
      throw installError('agent-plugins/invalid-spec', 'HTTPS Git URL must not contain credentials or a query')
    }
    if (url.pathname.split('/').filter(Boolean).length < 2 || /\.(?:tgz|tar\.gz)$/i.test(url.pathname)) {
      throw installError('agent-plugins/invalid-spec', 'HTTPS Git URL must name a repository, not a tarball')
    }
    return { kind: 'https', url: `${url.href}${url.href.endsWith('.git') ? '' : '.git'}`, path, ref }
  }
  if (SCP_GIT_URL.test(address)) return { kind: 'scp', url: address, path, ref }
  if (SSH_GIT_URL.test(address)) {
    const url = new URL(address.replace(/^git\+/i, ''))
    if (url.hostname === '' || url.pathname === '' || url.password !== '' || url.search !== '') {
      throw installError('agent-plugins/invalid-spec', 'SSH Git URL must name a host and repository without credentials or a query')
    }
    return { kind: 'ssh', url: address.replace(/^git\+/i, ''), path, ref }
  }
  if (FILE_GIT_URL.test(address)) {
    const url = new URL(address.replace(/^git\+/i, ''))
    if (url.hostname !== '' || url.pathname === '' || url.search !== '') {
      throw installError('agent-plugins/invalid-spec', 'Local file Git URL must have no host or query')
    }
    return { kind: 'file', url: address.replace(/^git\+/i, ''), path, ref }
  }
  throw installError('agent-plugins/invalid-spec', 'Expected an HTTPS .git URL, an SCP-style git@host:path, or an SSH Git URL')
}

/** Install one Agent Plugin without requiring package.json or running install scripts. */
export async function installAgentPlugin({ pluginsDirectory, spec, signal }) {
  const parsed = parseGitInstallSpec(spec)
  const temporary = await mkdtemp(join(tmpdir(), 'agent-plugin-install-'))
  try {
    const repository = join(temporary, 'repo')
    const transport = await chooseGitTransport(parsed, temporary, signal)
    await runGit(temporary, ['init', '--quiet', repository], signal)
    await runGit(temporary, ['-C', repository, 'remote', 'add', 'origin', transport], signal)
    if (parsed.path !== undefined) {
      await runGit(temporary, ['-C', repository, 'sparse-checkout', 'set', parsed.path], signal)
    }
    await runGit(temporary, ['-C', repository, 'fetch', '--depth', '1', 'origin', parsed.ref ?? 'HEAD'], signal)
    await runGit(temporary, ['-C', repository, 'checkout', '--detach', 'FETCH_HEAD'], signal)
    await runGit(temporary, ['-C', repository, 'submodule', 'update', '--init', '--recursive', '--', parsed.path ?? '.'], signal)

    const root = await resolveExistingInside(repository, join(repository, parsed.path ?? ''))
    const manifestPath = join(root, 'plugin.json')
    let document
    try {
      document = JSON.parse(await readFile(manifestPath, 'utf8'))
    } catch (error) {
      throw invalidAgentPlugin(`invalid plugin.json: ${errorMessage(error)}`, manifestPath)
    }
    const { manifest } = validateManifest(document, manifestPath)
    await mkdir(pluginsDirectory, { recursive: true })
    const destination = join(pluginsDirectory, manifest.name)
    const staging = join(pluginsDirectory, `.${manifest.name}.install-${randomUUID()}`)
    await cp(root, staging, {
      recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true,
      filter: source => basename(source) !== '.git',
    })
    try {
      await mkdir(destination)
      await rmdir(destination)
      await rename(staging, destination)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') {
        throw installError('agent-plugins/already-installed', `Agent Plugin ${manifest.name} is already installed`)
      }
      throw error
    }
    return { name: manifest.name, root: destination, manifest }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

function normalizePackagePath(value) {
  const path = value.replace(/^\/+/, '')
  if (path === '' || path.includes('\\') || path.split('/').some(segment => segment === '' || segment === '.' || segment === '..' || !PATH_SEGMENT.test(segment))) {
    throw installError('agent-plugins/invalid-spec', 'Git path must be a relative directory without . or .. segments')
  }
  return path
}

export async function chooseGitTransport(spec, cwd, signal, probe = readable) {
  if (spec.kind === 'https') {
    if (await probe(spec.url, cwd, signal)) return spec.url
    const ssh = sshGitSpec(spec)
    if (signal?.aborted) throw installError('agent-plugins/cancelled', 'Git installation was cancelled')
    if (ssh !== undefined && await probe(ssh, cwd, signal)) return ssh
    if (signal?.aborted) throw installError('agent-plugins/cancelled', 'Git installation was cancelled')
    return spec.url
  }
  if (spec.kind === 'scp' || spec.kind === 'ssh') {
    if (await probe(spec.url, cwd, signal)) return spec.url
    const https = httpsGitSpec(spec)
    if (signal?.aborted) throw installError('agent-plugins/cancelled', 'Git installation was cancelled')
    if (https !== undefined && await probe(https, cwd, signal)) return https
    if (signal?.aborted) throw installError('agent-plugins/cancelled', 'Git installation was cancelled')
  }
  return spec.url
}

function httpsGitSpec(spec) {
  if (spec.kind === 'scp') {
    const match = /^git@([^:]+):(.+)$/.exec(spec.url)
    return match === null ? undefined : `https://${match[1]}/${match[2]}`
  }
  const url = new URL(spec.url)
  if (url.hostname === '' || url.pathname === '') return undefined
  return `https://${url.hostname}${url.pathname}`
}

function sshGitSpec(spec) {
  const url = new URL(spec.url)
  if (url.username !== '' || url.password !== '' || url.search !== '') return undefined
  return `git@${url.hostname}:${url.pathname.replace(/^\//, '')}`
}

async function readable(repository, cwd, signal) {
  try {
    await runGit(cwd, ['-c', 'core.askPass=', 'ls-remote', '--exit-code', '--', repository, 'HEAD'], signal, GIT_PROBE_TIMEOUT_MS)
    return true
  } catch {
    return false
  }
}

async function runGit(cwd, args, signal, timeoutMs = GIT_OPERATION_TIMEOUT_MS) {
  const result = await execa('git', args, {
    cwd,
    env: {
      ...process.env,
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GIT_ASKPASS: '',
      SSH_ASKPASS: '',
      SSH_ASKPASS_REQUIRE: 'never',
    },
    extendEnv: false,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    reject: false,
    timeout: timeoutMs,
    cancelSignal: signal,
    killDescendants: true,
    killSignal: 'SIGKILL',
  })
  if (result.failed) {
    const detail = (result.stderr || result.stdout || result.shortMessage || 'git command failed').trim().slice(-2000)
    throw installError('agent-plugins/git-failed', detail)
  }
  return result
}

function installError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}
