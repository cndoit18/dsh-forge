import { WorkflowRunner } from './runner.js'
import { parseWorkflowSource } from './source.js'

export const BUNDLED_WORKFLOW_RANK = 600

const WORKFLOW_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const RUNTIME_PROVIDER = 'runtime'

export function isWorkflowName(name) {
  return WORKFLOW_NAME.test(name)
}

function validateSummary(workflow) {
  if (typeof workflow !== 'object' || workflow === null) throw new TypeError('workflow definition must be an object')
  if (!isWorkflowName(workflow.name)) throw new TypeError(`invalid workflow name "${workflow.name}"`)
  if (typeof workflow.description !== 'string' || workflow.description.trim() === '') {
    throw new TypeError(`workflow "${workflow.name}" requires a description`)
  }
  if (workflow.whenToUse !== undefined && typeof workflow.whenToUse !== 'string') {
    throw new TypeError(`workflow "${workflow.name}" whenToUse must be a string`)
  }
  if (workflow.phases !== undefined && !Array.isArray(workflow.phases)) {
    throw new TypeError(`workflow "${workflow.name}" phases must be an array`)
  }
  if (workflow.input !== undefined) {
    if (typeof workflow.input !== 'object' || workflow.input === null
      || typeof workflow.input.hint !== 'string' || workflow.input.hint.trim() === '') {
      throw new TypeError(`workflow "${workflow.name}" input.hint must be a non-empty string`)
    }
    if (workflow.input.required !== undefined && typeof workflow.input.required !== 'boolean') {
      throw new TypeError(`workflow "${workflow.name}" input.required must be a boolean`)
    }
  }
  if (typeof workflow.source !== 'string' || workflow.source === '') {
    throw new TypeError(`workflow "${workflow.name}" requires a source`)
  }
  if (typeof workflow.provider !== 'string' || workflow.provider === '') {
    throw new TypeError(`workflow "${workflow.name}" requires a provider`)
  }
}

function summaryOf(candidate) {
  return {
    name: candidate.name,
    description: candidate.description,
    ...candidate.whenToUse === undefined ? {} : { whenToUse: candidate.whenToUse },
    ...candidate.phases === undefined ? {} : { phases: candidate.phases },
    ...candidate.input === undefined ? {} : { input: candidate.input },
    source: candidate.source,
    provider: candidate.provider,
    ...candidate.path === undefined ? {} : { path: candidate.path },
  }
}

/**
 * Merge workflow providers by name. Lower ranks win; registration order
 * breaks ties, matching the Skill registry's project-to-bundled precedence.
 */
function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error && reason.name === 'AbortError') return reason
  const error = new Error('Workflow provider operation aborted', { cause: reason })
  error.name = 'AbortError'
  return error
}

function abortPromise(signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => { reject(abortError(signal)) }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class WorkflowRegistry {
  constructor(ctx) {
    this.ctx = ctx
    this.providers = new Map()
    this.runtimeNames = new Set()
    this.nextProviderOrder = 0
    this.nextRuntimeProvider = 0
    this.providerLifecycles = new WeakMap()
    this.runner = new WorkflowRunner(ctx, this)
    this.parse = parseWorkflowSource
    ctx.provide('workflows', this)
  }

  registerProvider(create) {
    const lifecycle = new AbortController()
    let provider
    let order
    const control = {
      signal: lifecycle.signal,
      invalidate: () => {
        if (this.providers.get(provider?.name)?.provider === provider) this.ctx.emit('workflows/change')
      },
    }
    try {
      provider = create(control)
      if (typeof provider?.name !== 'string' || provider.name === '' || provider.name.startsWith('runtime:')) {
        throw new TypeError('workflow provider requires a non-reserved name')
      }
      if (this.providers.has(provider.name)) throw new Error(`workflow provider "${provider.name}" is already registered`)
      if (typeof provider.list !== 'function' || typeof provider.get !== 'function') {
        throw new TypeError(`workflow provider "${provider.name}" must implement list() and get()`)
      }
      order = this.nextProviderOrder++
      this.providers.set(provider.name, { provider, order })
      this.providerLifecycles.set(provider, lifecycle)
      this.ctx.emit('workflows/change')
    } catch (error) {
      lifecycle.abort(error)
      throw error
    }
    let active = true
    return () => {
      if (!active) return
      active = false
      this.providers.delete(provider.name)
      lifecycle.abort(new Error(`workflow provider "${provider.name}" disposed`))
      this.ctx.emit('workflows/change')
    }
  }

  register(workflow) {
    const definition = {
      ...workflow,
      source: workflow.source ?? 'runtime',
      provider: workflow.provider ?? RUNTIME_PROVIDER,
    }
    validateSummary(definition)
    if (typeof definition.script !== 'string') throw new TypeError(`workflow "${definition.name}" script must be a string`)
    if (this.runtimeNames.has(definition.name)) {
      this.ctx.logger.warn(`runtime workflow "${definition.name}" ignored because it is already registered`)
      return () => {}
    }
    this.runtimeNames.add(definition.name)
    const providerName = `@runtime/${this.nextRuntimeProvider++}`
    const dispose = this.registerProvider(() => ({
      name: providerName,
      async list() {
        return [{ ...summaryOf(definition), rank: definition.rank ?? BUNDLED_WORKFLOW_RANK, locator: null }]
      },
      async get() {
        return definition
      },
    }))
    let active = true
    return () => {
      if (!active) return
      active = false
      this.runtimeNames.delete(definition.name)
      dispose()
    }
  }

  async list(options = {}) {
    return [...(await this.collect({ ...options, strict: options.strict === true })).values()]
      .map(entry => summaryOf(entry.candidate))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  }

  async get(name, options = {}) {
    if (!isWorkflowName(name)) return undefined
    const match = (await this.collect(options)).get(name)
    if (match === undefined) return undefined
    const definition = await this.invoke(match.provider, 'get', options, match.candidate)
    if (definition === undefined) return undefined
    validateSummary(definition)
    if (definition.name !== name || typeof definition.script !== 'string') {
      throw new TypeError(`workflow provider "${match.provider.name}" returned an invalid definition for "${name}"`)
    }
    return definition
  }

  async start(request) {
    return this.runner.start(request)
  }

  async invoke(provider, method, options, argument) {
    const lifecycle = this.providerLifecycles.get(provider)
    if (lifecycle === undefined) throw new Error(`Workflow provider "${provider.name}" is no longer registered`)
    const signals = [lifecycle.signal, options.signal].filter(Boolean)
    const signal = AbortSignal.any(signals)
    signal.throwIfAborted()
    return Promise.race([
      Promise.resolve().then(() => provider[method](...argument === undefined ? [{ ...options, signal }] : [argument, { ...options, signal }])),
      abortPromise(signal),
    ])
  }

  async collect(options) {
    const winners = new Map()
    for (const { provider, order } of this.providers.values()) {
      options.signal?.throwIfAborted()
      let candidates
      try {
        candidates = await this.invoke(provider, 'list', options)
      } catch (error) {
        options.signal?.throwIfAborted()
        if (options.strict === true || !this.providerLifecycles.has(provider)
          || this.providerLifecycles.get(provider).signal.aborted) throw error
        this.ctx.logger.warn(`dsh-workflow: provider "${provider.name}" discovery failed: ${String(error)}`)
        continue
      }
      if (!Array.isArray(candidates)) throw new TypeError(`workflow provider "${provider.name}" list() must return an array`)
      for (const candidate of candidates) {
        options.signal?.throwIfAborted()
        const normalized = { ...candidate, provider: candidate.provider ?? provider.name }
        validateSummary(normalized)
        if (!Number.isFinite(normalized.rank)) throw new TypeError(`workflow "${normalized.name}" rank must be finite`)
        const existing = winners.get(normalized.name)
        if (existing === undefined || normalized.rank < existing.candidate.rank
          || (normalized.rank === existing.candidate.rank && order < existing.order)) {
          winners.set(normalized.name, { candidate: normalized, provider, order })
        }
      }
    }
    return winners
  }
}
