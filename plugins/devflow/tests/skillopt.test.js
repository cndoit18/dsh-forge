import assert from 'node:assert/strict'
import test from 'node:test'
import { runWorkflow } from './skillopt-harness.js'

test('SkillOpt applies a candidate only after strict held-out improvement', async () => {
  const { value, prompts, applied, phases } = await runWorkflow({ loop: { epochBudget: 1 } })
  assert.equal(value.status, 'optimized')
  assert.equal(value.baselineScore, 0)
  assert.equal(value.candidateScore, 1)
  assert.equal(applied.length, 1)
  assert.deepEqual(phases, ['Prepare', 'Rollout', 'Rollout', 'Reflect', 'Select', 'Update', 'Gate', 'Apply'])
  assert.equal(value.edits.length, 4)
  for (const { label, prompt } of prompts.filter(entry => ['reflect', 'update'].includes(entry.label.split(':')[0]))) {
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
  const update = prompts.find(entry => entry.label.split(':')[0] === 'update').prompt
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
  const { value, applied, phases } = await runWorkflow({ candidate: '# Not a standalone SKILL.md', loop: { epochBudget: 1 } })
  assert.equal(value.status, 'unverified')
  assert.equal(applied.length, 0)
  assert.deepEqual(phases, ['Prepare', 'Rollout', 'Rollout', 'Reflect', 'Select', 'Update'])
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

test('SkillOpt harness supports loop settings, label delays, and concurrency telemetry', async () => {
  const result = await runWorkflow({
    loop: { maxIterations: 3, minImprovement: 0.1 },
    baselineScore: 0,
    candidateScore: 1,
    setupOverrides: {
      trainingTasks: [
        { id: 'train-1', instruction: 'TRAINING TASK 1', expected: 'training answer 1' },
        { id: 'train-2', instruction: 'TRAINING TASK 2', expected: 'training answer 2' },
      ],
      validationTasks: [
        { id: 'validation-1', instruction: 'VALIDATION TASK 1', expected: 'validation answer 1' },
        { id: 'validation-2', instruction: 'VALIDATION TASK 2', expected: 'validation answer 2' },
      ],
    },
    delays: ({ label }) => label.startsWith('rollout:') ? 5 : 0,
  })
  assert.equal(result.value.status, 'optimized')
  assert.equal(result.args.maxIterations, 3)
  assert.equal(result.args.minImprovement, 0.1)
  assert.ok(result.labels.includes('rollout:train:1'))
  assert.ok(result.maxActive >= 2)
  assert.ok(result.maxActiveByKind.rollout >= 2)
  assert.equal(result.active, 0)
  assert.equal(result.applyRecords.length, 1)
  assert.equal(result.applyRecords[0].activeAtStart, 0)
  assert.deepEqual(result.applyRecords[0].response, { written: true })
})

test('SkillOpt harness supports label failures and records Apply attempts', async () => {
  const { value, applied, applyRecords } = await runWorkflow({
    failures: ({ label }) => label === 'apply',
  })
  assert.equal(value.status, 'accepted-write-failed')
  assert.equal(applied.length, 0)
  assert.equal(applyRecords.length, 1)
  assert.equal(applyRecords[0].label, 'apply')
  assert.equal(applyRecords[0].response, undefined)
})
