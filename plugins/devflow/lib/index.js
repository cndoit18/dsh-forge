import { readFile } from 'node:fs/promises'

export const name = 'devflow'
export const inject = ['workflows']

const workflowFiles = [
  'deep-research.js',
  'batch-workflow.js',
  'init-workflow.js',
  'review.js',
  'simplify.js',
  'security-review.js',
  'debug.js',
  'run.js',
  'verify.js',
]

export function apply(ctx) {
  const parseWorkflowSource = ctx.workflows.parse
  ctx.effect(() => ctx.workflows.registerProvider(control => ({
    name: 'devflow',
    async list() {
      return Promise.all(workflowFiles.map(async file => {
        const path = new URL(`../workflows/${file}`, import.meta.url)
        const { meta, input } = parseWorkflowSource(await readFile(path, 'utf8'), file)
        return {
          ...meta,
          ...input === undefined ? {} : { input },
          source: 'bundled',
          provider: 'devflow',
          rank: 600,
          locator: { file },
        }
      }))
    },
    async get(candidate, options = {}) {
      const file = candidate.locator.file
      if (!workflowFiles.includes(file)) return undefined
      const path = new URL(`../workflows/${file}`, import.meta.url)
      const signals = [control.signal, options.signal].filter(Boolean)
      const source = await readFile(path, {
        encoding: 'utf8',
        ...signals.length === 0 ? {} : { signal: AbortSignal.any(signals) },
      })
      const { meta, input, script } = parseWorkflowSource(source, file)
      return {
        ...meta,
        ...input === undefined ? {} : { input },
        source: 'bundled',
        provider: 'devflow',
        script,
        createArgs: inputText => candidate.name === 'deep-research'
          ? { question: inputText }
          : { instruction: inputText },
      }
    },
  })), 'devflow: bundled workflows')
}
