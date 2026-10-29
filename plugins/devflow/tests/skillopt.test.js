import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const setup = {
  mode: 'optimize',
  skillPath: 'skills/example/SKILL.md',
  skill: '# Example skill',
  rubric: 'Exact answer receives 1; otherwise 0.',
  trainingTasks: [{ id: 'train', instruction: 'TRAINING TASK', expected: 'training answer' }],
  validationTasks: [{ id: 'validation', instruction: 'VALIDATION TASK', expected: 'validation answer' }],
}

async function runWorkflow({ baselineScore = 0, candidateScore = 1, failedJudge = '', setupOverrides = {}, candidate = '---\nname: example\ndescription: Use for example tasks.\n---\n\nVerify before answering.' } = {}) {
  const source = await readFile(new URL('../workflows/skillopt.js', import.meta.url), 'utf8')
  const prompts = []
  const applied = []
  const phases = []
  const value = await runInNewContext(`(async () => { ${source}
})()`, {
    args: { instruction: 'Optimize skills/example/SKILL.md with the supplied tasks' },
    phase(title) { phases.push(title) },
    log() {},
    async parallel(thunks) { return Promise.all(thunks.map(thunk => thunk())) },
    async agent(prompt, options) {
      const label = options?.label ?? ''
      prompts.push({ label, prompt })
      if (label === 'prepare') return { ...setup, ...setupOverrides }
      if (label.startsWith('rollout:')) return { answer: `answer for ${label}`, trajectory: 'read and answer' }
      if (label.startsWith('judge:')) {
        if (label === failedJudge) return null
        const score = label.startsWith('judge:baseline:') ? baselineScore
          : label.startsWith('judge:candidate:') ? candidateScore : 0
        return { score, rationale: 'mock verdict' }
      }
      if (label === 'reflect') {
        return { edits: Array.from({ length: 6 }, (_, index) => ({
          op: 'append', target: '', content: `Rule ${index + 1}`, rationale: 'generalize failures',
        })) }
      }
      if (label === 'update') return { candidate, summary: 'Added verification.' }
      if (label === 'apply') { applied.push(prompt); return { written: true } }
      throw new Error(`Unexpected agent: ${label}`)
    },
  })
  return { value, prompts, applied, phases }
}

test('SkillOpt applies a candidate only after strict held-out improvement', async () => {
  const { value, prompts, applied, phases } = await runWorkflow()
  assert.equal(value.status, 'optimized')
  assert.equal(value.baselineScore, 0)
  assert.equal(value.candidateScore, 1)
  assert.equal(applied.length, 1)
  assert.deepEqual(phases, ['Prepare', 'Rollout', 'Reflect', 'Update', 'Gate', 'Apply'])
  assert.equal(value.edits.length, 4)
  for (const { label, prompt } of prompts.filter(entry => ['reflect', 'update'].includes(entry.label))) {
    assert.ok(!prompt.includes('VALIDATION TASK'), `${label} leaked held-out validation data`)
  }
})

test('SkillOpt creates a new skill against an empty baseline with triggering frontmatter guidance', async () => {
  const { value, prompts, applied } = await runWorkflow({ setupOverrides: {
    mode: 'create', skillPath: 'skills/new/SKILL.md', skill: '',
  } })
  assert.equal(value.status, 'created')
  assert.equal(value.mode, 'create')
  assert.equal(applied.length, 1)
  const update = prompts.find(entry => entry.label === 'update').prompt
  assert.match(update, /MODE:\ncreate/)
  assert.match(update, /name/)
  assert.match(update, /description/)
  assert.match(update, /when it should trigger/)
})

test('SkillOpt rejects overlapping training and validation task content before rollout', async () => {
  const sameTask = { instruction: 'SAME TASK', expected: 'same answer' }
  const { value, applied, phases } = await runWorkflow({ setupOverrides: {
    trainingTasks: [{ id: 'train', ...sameTask }],
    validationTasks: [{ id: 'validation', ...sameTask }],
  } })
  assert.equal(value.status, 'invalid-input')
  assert.equal(applied.length, 0)
  assert.deepEqual(phases, ['Prepare'])
})

test('SkillOpt rejects a candidate without required SKILL.md frontmatter before the gate', async () => {
  const { value, applied, phases } = await runWorkflow({ candidate: '# Not a standalone SKILL.md' })
  assert.equal(value.status, 'unverified')
  assert.equal(applied.length, 0)
  assert.deepEqual(phases, ['Prepare', 'Rollout', 'Reflect', 'Update'])
})

test('SkillOpt rejects a tied candidate and leaves the skill untouched', async () => {
  const { value, applied } = await runWorkflow({ baselineScore: 0.5, candidateScore: 0.5 })
  assert.equal(value.status, 'rejected')
  assert.equal(applied.length, 0)
})

test('SkillOpt does not accept a candidate when any gate judge fails', async () => {
  for (const failedJudge of ['judge:baseline:1', 'judge:candidate:1']) {
    const { value, applied } = await runWorkflow({ failedJudge })
    assert.equal(value.status, 'unverified')
    assert.equal(applied.length, 0)
  }
})
