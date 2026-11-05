import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'


export const name = 'dsh-workflow-filesystem'
export const inject = ['workflows']

const RANKS = {
  projectDsh: 100,
  projectAgents: 200,
  custom: 300,
  userDsh: 400,
  userAgents: 500,
}

function homeRoot(configured, environmentValue, fallback) {
  const selected = configured ?? (environmentValue?.trim() ? environmentValue : fallback)
  if (selected === '~') return homedir()
  if (selected.startsWith('~/') || selected.startsWith('~\\')) return join(homedir(), selected.slice(2))
  return resolve(selected)
}

async function findProjectRoot(cwd) {
  let current = resolve(cwd)
  while (true) {
    try {
      await access(join(current, '.git'))
      return current
    } catch {
      // A missing or unreadable marker only excludes this ancestor.
    }
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

async function workflowFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => join(root, entry.name))
      .sort()
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return []
    throw error
  }
}

export class FileSystemWorkflowProvider {
  constructor(ctx, config = {}, control) {
    this.ctx = ctx
    this.control = control
    this.parse = ctx.workflows.parse
    this.name = config.providerName ?? 'filesystem'
    this.includeDefaultRoots = config.includeDefaultRoots ?? true
    this.dshHome = homeRoot(config.dshHome, process.env.DSH_HOME, join(homedir(), '.dsh'))
    this.agentsHome = homeRoot(config.agentsHome, process.env.DSH_AGENTS_HOME, join(homedir(), '.agents'))
    this.customWorkflowDirs = (config.customWorkflowDirs ?? []).map(path => resolve(path))
  }

  async roots(cwd, signal) {
    signal?.throwIfAborted()
    const roots = []
    if (this.includeDefaultRoots && cwd !== undefined) {
      const projectRoot = await findProjectRoot(cwd)
      roots.push(
        { path: join(projectRoot, '.dsh/workflows'), source: 'project-dsh', rank: RANKS.projectDsh },
        { path: join(projectRoot, '.agents/workflows'), source: 'project-agents', rank: RANKS.projectAgents },
      )
    }
    roots.push(...this.customWorkflowDirs.map(path => ({ path, source: 'custom', rank: RANKS.custom })))
    if (this.includeDefaultRoots) {
      roots.push(
        { path: join(this.dshHome, 'workflows'), source: 'user-dsh', rank: RANKS.userDsh },
        { path: join(this.agentsHome, 'workflows'), source: 'user-agents', rank: RANKS.userAgents },
      )
    }
    return roots
  }

  signal(options) {
    const signals = [this.control?.signal, options.signal].filter(Boolean)
    return signals.length === 0 ? undefined : AbortSignal.any(signals)
  }

  async list(options = {}) {
    const signal = this.signal(options)
    const candidates = []
    for (const root of await this.roots(options.cwd, signal)) {
      for (const path of await workflowFiles(root.path)) {
        signal?.throwIfAborted()
        try {
          const source = await readFile(path, { encoding: 'utf8', signal })
          const parsed = this.parse(source, path)
          candidates.push({
            ...parsed.meta,
            ...parsed.input === undefined ? {} : { input: parsed.input },
            path,
            source: root.source,
            provider: this.name,
            rank: root.rank,
            locator: { path },
          })
        } catch (error) {
          if (signal?.aborted) throw error
          this.ctx.logger.warn(`dsh-workflow-filesystem: skipped ${path}: ${String(error)}`)
        }
      }
    }
    return candidates
  }

  async get(candidate, options = {}) {
    const path = candidate.locator.path
    const source = await readFile(path, { encoding: 'utf8', signal: this.signal(options) })
    const parsed = this.parse(source, path)
    return {
      ...parsed.meta,
      ...parsed.input === undefined ? {} : { input: parsed.input },
      source: candidate.source,
      provider: candidate.provider,
      path,
      script: parsed.script,
    }
  }
}

export function apply(ctx, config = {}) {
  const parseWorkflowSource = ctx.workflows.parse
  ctx.effect(() => ctx.workflows.registerProvider(control => new FileSystemWorkflowProvider(ctx, config, control)), 'dsh-workflow-filesystem: provider')
}


