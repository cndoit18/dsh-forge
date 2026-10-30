import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'

const workflowUrl = new URL('../workflows/skillopt.js', import.meta.url)
const defaultCandidate = `---
name: example
description: Use for example tasks.
---

Verify before answering.`

const defaultSetup = {
  mode: 'optimize',
  skillPath: 'skills/example/SKILL.md',
  skill: '# Example skill',
  rubric: 'Exact answer receives 1; otherwise 0.',
  objective: {
    primary: { id: 'accuracy', description: 'Answer the requested task accurately.' },
    protectedCriteria: [{ id: 'scope', description: 'Preserve the requested scope.' }],
  },
  trainingTasks: [{ id: 'train', instruction: 'TRAINING TASK', expected: 'training answer' }],
  validationTasks: [{ id: 'validation', instruction: 'VALIDATION TASK', expected: 'validation answer' }],
}

export async function compileWorkflow() {
  const source = await readFile(workflowUrl, 'utf8')
  return new Script(`(async () => { ${source}
})()`, { filename: workflowUrl.pathname })
}

function labelOption(config, call) {
  return typeof config === 'function' ? config(call) : config?.[call.label]
}

export async function runWorkflow({
  baselineScore = 0,
  candidateScore = 1,
  baselinePrimaryScore,
  candidatePrimaryScore,
  baselineProtectedScore,
  candidateProtectedScore,
  failedJudge = '',
  setupOverrides = {},
  candidate = defaultCandidate,
  args: argumentOverrides = {},
  loop = {},
  delays = {},
  failures = {},
} = {}) {
  const prompts = []
  const applied = []
  const applyRecords = []
  const phases = []
  const logs = []
  const sequenceIndexes = { baseline: 0, candidate: 0, update: 0 }
  const maxActiveByKind = {}
  const activeByKind = {}
  let active = 0
  let maxActive = 0

  function score(scoreConfig, call, kind) {
    if (Array.isArray(scoreConfig)) return scoreConfig[sequenceIndexes[kind]++]
    return typeof scoreConfig === 'function' ? scoreConfig(call) : scoreConfig
  }

  const preparedSetup = { ...defaultSetup, ...setupOverrides }
  const script = await compileWorkflow()
  const workflowArgs = {
    instruction: 'Optimize skills/example/SKILL.md with the supplied tasks',
    ...loop,
    ...argumentOverrides,
  }
  const value = await script.runInNewContext({
    args: workflowArgs,
    phase(title) { phases.push(title) },
    log(message) { logs.push(message) },
    async parallel(thunks) { return Promise.all(thunks.map(thunk => thunk())) },
    async agent(prompt, options) {
      const label = options?.label ?? ''
      const kind = label.split(':')[0]
      const call = { label, prompt, options, activeAtStart: active }
      prompts.push({ label, prompt })
      active += 1
      activeByKind[kind] = (activeByKind[kind] ?? 0) + 1
      maxActive = Math.max(maxActive, active)
      maxActiveByKind[kind] = Math.max(maxActiveByKind[kind] ?? 0, activeByKind[kind])
      let response
      try {
        const delay = await labelOption(delays, call)
        if (delay) await new Promise(resolve => setTimeout(resolve, delay))
        const failure = label === failedJudge || await labelOption(failures, call)
        if (failure) {
          if (failure instanceof Error) throw failure
          return null
        }
        if (label === 'prepare') return preparedSetup
        if (label.startsWith('rollout:')) return { answer: `answer for ${label}`, trajectory: 'read and answer' }
        if (label.startsWith('judge:')) {
          const scoreKind = label.startsWith('judge:baseline:') ? 'baseline'
            : label.startsWith('judge:candidate:') ? 'candidate' : ''
          if (!scoreKind) return {
            score: 0,
            primaryScore: 0,
            protectedScores: preparedSetup.objective.protectedCriteria.map(criterion => ({ id: criterion.id, score: 0 })),
            rationale: 'mock verdict',
          }
          const overallScore = await score(scoreKind === 'baseline' ? baselineScore : candidateScore, call, scoreKind)
          const primaryScore = scoreKind === 'baseline'
            ? baselinePrimaryScore ?? overallScore
            : candidatePrimaryScore ?? overallScore
          const protectedScore = scoreKind === 'baseline'
            ? baselineProtectedScore ?? overallScore
            : candidateProtectedScore ?? overallScore
          return {
            score: overallScore,
            primaryScore,
            protectedScores: preparedSetup.objective.protectedCriteria.map(criterion => ({ id: criterion.id, score: protectedScore })),
            rationale: 'mock verdict',
          }
        }
        if (kind === 'reflect' || kind === 'select') {
          return { edits: Array.from({ length: 6 }, (_, index) => ({
            op: 'append', target: '', content: `Rule ${index + 1}`, rationale: 'generalize failures',
          })) }
        }
        if (kind === 'update') {
          const nextCandidate = Array.isArray(candidate) ? candidate[sequenceIndexes.update++]
            : typeof candidate === 'function' ? await candidate(call) : candidate
          return { candidate: nextCandidate, summary: 'Added verification.' }
        }
        if (kind === 'apply') {
          applied.push(prompt)
          response = { written: true }
          return response
        }
        throw new Error(`Unexpected agent: ${label}`)
      } finally {
        if (kind === 'apply') applyRecords.push({ ...call, response })
        activeByKind[kind] -= 1
        active -= 1
      }
    },
  })
  return {
    value, args: workflowArgs, prompts, labels: prompts.map(call => call.label),
    applied, applyRecords, phases, logs, active, maxActive, maxActiveByKind,
  }
}
