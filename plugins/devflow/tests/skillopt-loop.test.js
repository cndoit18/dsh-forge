import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const EPOCHS = 2
const STEPS_PER_EPOCH = 3
const ATTEMPTS = EPOCHS * STEPS_PER_EPOCH

const setup = {
  mode: 'optimize',
  skillPath: 'skills/example/SKILL.md',
  skill: '# Original skill',
  rubric: 'Exact answer receives 1; otherwise 0.',
  objective: {
    primary: { id: 'accuracy', description: 'Answer the requested task accurately.' },
    protectedCriteria: [{ id: 'scope', description: 'Preserve the requested scope.' }],
  },
  trainingTasks: Array.from({ length: STEPS_PER_EPOCH }, (_, index) => ({
    id: `train-${index + 1}`, instruction: `TRAINING TASK ${index + 1}`, expected: `training answer ${index + 1}`,
  })),
  validationTasks: [{ id: 'validation', instruction: 'VALIDATION TASK', expected: 'validation answer' }],
}

function candidateSkill(step) {
  return `---
name: example
description: Use for example tasks.
---

Candidate ${step}`
}

async function runWorkflow({ baselineScore = 0.5, candidateScores = [], candidates = [], skippedReflections = [] } = {}) {
  const source = await readFile(new URL('../workflows/skillopt.js', import.meta.url), 'utf8')
  const calls = []
  const updatePrompts = []
  const applied = []
  let reflectionCount = 0
  let selectCount = 0
  let candidateCount = 0
  let gateCount = 0

  const value = await runInNewContext(`(async () => { ${source}
})()`, {
    args: {
      instruction: 'Optimize skills/example/SKILL.md with the supplied tasks',
      epochBudget: EPOCHS,
      trainingTaskBatch: 1,
    },
    phase() {},
    log() {},
    async parallel(thunks) { return Promise.all(thunks.map(thunk => thunk())) },
    async agent(prompt, options) {
      const label = options?.label ?? ''
      calls.push({ label, prompt })
      if (label === 'prepare') return setup
      if (label.startsWith('rollout:')) return { answer: 'answer', trajectory: 'read and answer' }
      if (label.startsWith('judge:baseline:')) return {
        score: baselineScore, primaryScore: baselineScore,
        protectedScores: [{ id: 'scope', score: 1 }], rationale: 'baseline verdict',
      }
      if (label.startsWith('judge:candidate:')) {
        const score = candidateScores[gateCount] ?? 0
        gateCount += 1
        return { score, primaryScore: score, protectedScores: [{ id: 'scope', score: 1 }], rationale: 'candidate verdict' }
      }
      if (label.startsWith('judge:')) return {
        score: 0, primaryScore: 0, protectedScores: [{ id: 'scope', score: 0 }], rationale: 'training verdict',
      }
      if (label.startsWith('reflect')) {
        reflectionCount += 1
        if (skippedReflections.includes(reflectionCount)) return { edits: [] }
        return { edits: [{ op: 'append', target: '', content: 'Verify the answer.', rationale: 'Generalize failures.' }] }
      }
      if (label.startsWith('select')) {
        selectCount += 1
        return { edits: [{ op: 'append', target: '', content: `Verify ${selectCount}`, rationale: 'Generalize failures.' }] }
      }
      if (label.startsWith('update')) {
        const candidate = candidates[candidateCount] ?? candidateSkill(candidateCount + 1)
        candidateCount += 1
        updatePrompts.push(prompt)
        return { candidate, summary: `Candidate ${candidateCount}` }
      }
      if (label === 'apply') {
        applied.push(prompt)
        return { written: true }
      }
      throw new Error(`Unexpected agent: ${label}`)
    },
  })

  return { value, calls, updatePrompts, applied, reflectionCount, candidateCount, gateCount }
}

test('SkillOpt bounds the loop to two epochs of three steps and does not apply when no candidate passes', async () => {
  const run = await runWorkflow({ candidateScores: Array(ATTEMPTS).fill(0.5) })

  assert.equal(run.reflectionCount, ATTEMPTS)
  assert.equal(run.candidateCount, ATTEMPTS)
  assert.equal(run.gateCount, ATTEMPTS)
  assert.equal(run.applied.length, 0)
})

test('SkillOpt carries accepted skills forward and strictly gates against the latest accepted score', async () => {
  const run = await runWorkflow({ candidateScores: [0.6, 0.6, 0.7, 0.65, 0.7, 0.8] })

  assert.equal(run.reflectionCount, ATTEMPTS)
  assert.equal(run.candidateCount, ATTEMPTS)
  assert.ok(run.updatePrompts[1].includes(candidateSkill(1)), 'a tied candidate must not replace the accepted skill')
  assert.ok(run.updatePrompts[2].includes(candidateSkill(1)))
  assert.ok(run.updatePrompts[3].includes(candidateSkill(3)), 'the improved candidate must become the next baseline')
  assert.ok(run.updatePrompts[4].includes(candidateSkill(3)), 'a score above the original baseline but below the latest accepted score must be rejected')
  assert.ok(run.updatePrompts[5].includes(candidateSkill(3)), 'a tie with the latest accepted score must be rejected')
  assert.equal(run.applied.length, 1)
  assert.ok(run.applied[0].includes(candidateSkill(6)), 'the final Apply must write the last accepted candidate')
  assert.equal(run.calls.at(-1).label, 'apply')
})

test('SkillOpt continues after rejected and skipped candidates and applies only the eventual accepted candidate', async () => {
  const run = await runWorkflow({
    candidateScores: [0.4, 0.8],
    candidates: [candidateSkill(1), setup.skill, candidateSkill(4)],
    skippedReflections: [2, 5, 6],
  })

  assert.equal(run.reflectionCount, ATTEMPTS)
  assert.equal(run.candidateCount, 3)
  assert.equal(run.gateCount, 2)
  assert.equal(run.applied.length, 1)
  assert.ok(run.applied[0].includes(candidateSkill(4)))
  assert.equal(run.calls.at(-1).label, 'apply')
})
