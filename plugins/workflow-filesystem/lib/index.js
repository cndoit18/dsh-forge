import { access, readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-workflow-filesystem'
export const inject = ['workflows']

export const Config = z.object({
  providerName: z.string().min(1).default('filesystem'),
  includeDefaultRoots: z.boolean().default(true),
  dshHome: z.string(),
  agentsHome: z.string(),
  customWorkflowDirs: z.array(z.string()).default([]),
})

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

function hasErrorCode(error, code) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function isAbsentPathError(error) {
  return hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')
    || hasErrorCode(error, 'FS_NOT_FOUND') || hasErrorCode(error, 'FS_NOT_DIRECTORY')
}

async function pathExists(path, fs, signal) {
  if (fs !== undefined) {
    try {
      const target = await fs.resolve(path, { signal })
      return await fs.stat(target, signal) !== undefined
    } catch (error) {
      signal?.throwIfAborted()
      // A backend may reject or hide this candidate; continue walking upward.
      return false
    }
  }
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findProjectRoot(cwd, fs, signal) {
  let current = resolve(cwd)
  while (true) {
    signal?.throwIfAborted()
    if (await pathExists(join(current, '.git'), fs, signal)) return current
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

async function workflowFiles(root, fs, signal) {
  if (fs !== undefined) return await workflowFilesFromFileSystem(root, fs, signal)
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
      .map(entry => join(root, entry.name))
      .sort()
  } catch (error) {
    if (isAbsentPathError(error)) return []
    throw error
  }
}

async function workflowFilesFromFileSystem(root, fs, signal) {
  try {
    const target = await fs.resolve(root, { signal })
    const entries = await fs.listDir(target, signal)
    return entries
      .filter(entry => entry.type === 'file' && entry.name.endsWith('.js'))
      .map(entry => entry.target.displayPath)
      .sort()
  } catch (error) {
    signal?.throwIfAborted()
    if (isAbsentPathError(error)) return []
    throw error
  }
}

async function readWorkflowText(path, fs, signal) {
  if (fs !== undefined) {
    const target = await fs.resolve(path, { signal })
    return { path: fs.processPath(target), content: await fs.readText(target, signal) }
  }
  return { path, content: await readFile(path, { encoding: 'utf8', signal }) }
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

  projectFileSystem(source) {
    return source.startsWith('project-') ? this.ctx.get?.('fs') : undefined
  }

  async roots(cwd, signal) {
    signal?.throwIfAborted()
    const roots = []
    if (this.includeDefaultRoots && cwd !== undefined) {
      const projectRoot = await findProjectRoot(cwd, this.ctx.get?.('fs'), signal)
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
      const fs = this.projectFileSystem(root.source)
      for (const path of await workflowFiles(root.path, fs, signal)) {
        signal?.throwIfAborted()
        try {
          const workflow = await readWorkflowText(path, fs, signal)
          const parsed = this.parse(workflow.content, workflow.path)
          candidates.push({
            ...parsed.meta,
            ...parsed.input === undefined ? {} : { input: parsed.input },
            path: workflow.path,
            source: root.source,
            provider: this.name,
            rank: root.rank,
            locator: { path: workflow.path },
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
    const workflow = await readWorkflowText(
      candidate.locator.path,
      this.projectFileSystem(candidate.source),
      this.signal(options),
    )
    const parsed = this.parse(workflow.content, workflow.path)
    return {
      ...parsed.meta,
      ...parsed.input === undefined ? {} : { input: parsed.input },
      source: candidate.source,
      provider: candidate.provider,
      path: workflow.path,
      script: parsed.script,
    }
  }
}

export function apply(ctx, config = {}) {
  const parseWorkflowSource = ctx.workflows.parse
  ctx.effect(() => ctx.workflows.registerProvider(control => new FileSystemWorkflowProvider(ctx, config, control)), 'dsh-workflow-filesystem: provider')
}


