import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { runInNewContext } from 'node:vm'

const trainingTasks = Array.from({ length: 8 }, (_, index) => ({
  id: 'train-' + (index + 1),
  instruction: 'TRAINING TASK ' + (index + 1),
  expected: 'training answer ' + (index + 1),
}))
const validationTasks = Array.from({ length: 2 }, (_, index) => ({
  id: 'validation-' + (index + 1),
  instruction: 'HELD-OUT VALIDATION INSTRUCTION ' + (index + 1),
  expected: 'HELD-OUT VALIDATION EXPECTED ' + (index + 1),
}))
const candidate = [
  '---',
  'name: example',
  'description: Use for example tasks.',
  '---',
  '',
  'Verify before answering.',
  '',
].join('\n')

const isRollout = label => label.startsWith('rollout:')
const isJudge = label => label.startsWith('judge:')
const isReflection = label => /^reflect(?:ion)?(?::|$)/.test(label)
const isMerge = label => /^merge(?::|$)/.test(label)
const isFinalMerge = label => label === 'merge' || /^merge:(?:final|root)(?::|$)/.test(label)
const isIntermediateMerge = label => isMerge(label) && !isFinalMerge(label)
const isSelect = label => /^select(?::|$)/.test(label)
const isUpdate = label => /^update(?::|$)/.test(label)

function defaultResult(call, setup) {
  const { label } = call
  if (label === 'prepare') return setup
  if (isRollout(label)) return { answer: 'answer for ' + label, trajectory: 'read and answer' }
  if (isJudge(label)) {
    const score = label.startsWith('judge:candidate:') ? 1 : 0
    return { score, rationale: 'mock verdict' }
  }
  if (isReflection(label)) {
    return { edits: Array.from({ length: 8 }, (_, index) => ({
      op: 'append', target: '', content: `Rule ${index + 1} from ${label}`, rationale: 'test edit',
    })) }
  }
  if (isMerge(label) || isSelect(label)) {
    return { edits: [{ op: 'append', target: '', content: 'Rule from ' + label, rationale: 'test edit' }] }
  }
  if (isUpdate(label)) return { candidate, summary: 'Added verification.' }
  if (label === 'apply') return { written: true }
  throw new Error('Unexpected agent: ' + label)
}

function startWorkflow({ defer = () => false } = {}) {
  const setup = {
    mode: 'optimize',
    skillPath: 'skills/example/SKILL.md',
    skill: '# Example skill',
    rubric: 'Exact answer receives 1; otherwise 0.',
    trainingTasks,
    validationTasks,
  }
  const calls = []
  let failure
  const promise = (async () => {
    const source = await readFile(new URL('../workflows/skillopt.js', import.meta.url), 'utf8')
    return runInNewContext('(async () => { ' + source + '\n})()', {
      args: {
        instruction: 'Optimize skills/example/SKILL.md with the supplied tasks',
        epochBudget: 1,
        reflectionBatch: 4,
      },
      phase() {},
      log() {},
      async parallel(thunks) { return Promise.all(thunks.map(thunk => thunk())) },
      agent(prompt, options) {
        const label = options?.label ?? ''
        const call = { label, prompt, pending: defer(label) }
        calls.push(call)
        if (!call.pending) return defaultResult(call, setup)
        let resolve
        const pending = new Promise(resolvePromise => { resolve = resolvePromise })
        call.resolve = (value = defaultResult(call, setup)) => {
          assert.ok(call.pending, label + ' was already resolved')
          call.pending = false
          resolve(value)
        }
        return pending
      },
    })
  })()
  promise.catch(error => { failure = error })

  async function waitFor(predicate, message) {
    const deadline = Date.now() + 2000
    while (!predicate()) {
      if (failure) throw failure
      if (Date.now() >= deadline) {
        assert.fail(message + '. Calls: ' + calls.map(call => call.label).join(', '))
      }
      await delay(5)
    }
  }

  return { calls, promise, waitFor }
}

test('rollouts overlap, each judge waits for its rollout, and validation order is deterministic', async () => {
  const run = startWorkflow({ defer: label => /^rollout:(?:train|baseline):/.test(label) })
  const initialRolloutCount = trainingTasks.length + validationTasks.length
  await run.waitFor(
    () => run.calls.filter(call => isRollout(call.label)).length === initialRolloutCount,
    'All training and baseline rollouts should start before any completes',
  )

  const rollouts = run.calls.filter(call => isRollout(call.label))
  assert.equal(rollouts.length, initialRolloutCount)
  assert.equal(run.calls.filter(call => isJudge(call.label)).length, 0)

  const first = rollouts.find(call => call.label === 'rollout:train:1')
  first.resolve()
  await run.waitFor(
    () => run.calls.filter(call => isJudge(call.label)).length === 1,
    'Only the completed rollout should release its judge',
  )
  assert.equal(run.calls.find(call => isJudge(call.label)).label, 'judge:train:1')

  for (const call of rollouts.filter(call => call !== first).reverse()) call.resolve()
  const value = await run.promise

  assert.equal(value.status, 'optimized')
  assert.deepEqual(
    value.baselineValidation.map(result => result.id),
    validationTasks.map(task => task.id),
  )
  assert.deepEqual(
    value.candidateValidation.map(result => result.id),
    validationTasks.map(task => task.id),
  )
})

test('reflection and merge levels overlap with final merge, Select, Update, and Gate barriers', async () => {
  const run = startWorkflow({
    defer: label => isReflection(label) || isMerge(label) || isSelect(label) || isUpdate(label) ||
      label.startsWith('rollout:candidate:'),
  })

  await run.waitFor(
    () => run.calls.filter(call => isReflection(call.label) && call.pending).length >= 2,
    'At least two reflection minibatches should be in flight together',
  )
  const reflections = run.calls.filter(call => isReflection(call.label))
  assert.equal(run.calls.filter(call => isMerge(call.label)).length, 0)
  assert.equal(run.calls.filter(call => isSelect(call.label)).length, 0)
  assert.equal(run.calls.filter(call => isUpdate(call.label)).length, 0)

  for (const call of reflections.reverse()) call.resolve()
  await run.waitFor(
    () => run.calls.filter(call => isIntermediateMerge(call.label) && call.pending).length >= 2,
    'At least two merges from one level should be in flight together',
  )
  assert.equal(run.calls.filter(call => isFinalMerge(call.label)).length, 0)

  for (let level = 0; level < 10 && !run.calls.some(call => isFinalMerge(call.label)); level++) {
    const merges = run.calls.filter(call => isIntermediateMerge(call.label) && call.pending)
    assert.ok(merges.length > 0, 'Every merge level should leave work for the final merge')
    for (const call of merges.reverse()) call.resolve()
    await run.waitFor(
      () => run.calls.some(call => isFinalMerge(call.label)) ||
        run.calls.some(call => isIntermediateMerge(call.label) && call.pending),
      'The next merge level or final merge should start',
    )
  }

  const finalMerge = run.calls.find(call => isFinalMerge(call.label))
  assert.ok(finalMerge, 'The reduction should end with a final merge')
  assert.equal(run.calls.filter(call => isIntermediateMerge(call.label) && call.pending).length, 0)
  assert.equal(run.calls.filter(call => isSelect(call.label)).length, 0)
  assert.equal(run.calls.filter(call => isUpdate(call.label)).length, 0)

  finalMerge.resolve()
  await run.waitFor(
    () => run.calls.some(call => isSelect(call.label) && call.pending),
    'Select should wait for the final merge',
  )
  assert.equal(run.calls.filter(call => isUpdate(call.label)).length, 0)
  assert.equal(run.calls.filter(call => call.label.startsWith('rollout:candidate:')).length, 0)

  const select = run.calls.find(call => isSelect(call.label))
  select.resolve({ edits: [{ op: 'append', target: '', content: 'Selected rule', rationale: 'test edit' }] })
  await run.waitFor(
    () => run.calls.some(call => isUpdate(call.label) && call.pending),
    'Update should wait for Select',
  )
  assert.equal(run.calls.filter(call => call.label.startsWith('rollout:candidate:')).length, 0)

  const update = run.calls.find(call => isUpdate(call.label))
  update.resolve()
  await run.waitFor(
    () => run.calls.filter(call => call.label.startsWith('rollout:candidate:')).length === validationTasks.length,
    'Gate rollouts should wait for Update',
  )
  assert.equal(run.calls.filter(call => call.label.startsWith('judge:candidate:')).length, 0)

  const candidateRollouts = run.calls.filter(call => call.label.startsWith('rollout:candidate:'))
  for (const call of candidateRollouts.reverse()) call.resolve()
  const value = await run.promise
  assert.equal(value.status, 'optimized')

  const trainingSideCalls = run.calls.filter(call =>
    isReflection(call.label) || isMerge(call.label) || isSelect(call.label) || isUpdate(call.label)
  )
  for (const call of trainingSideCalls) {
    assert.ok(!call.prompt.includes('HELD-OUT VALIDATION INSTRUCTION'), call.label + ' leaked validation instructions')
    assert.ok(!call.prompt.includes('HELD-OUT VALIDATION EXPECTED'), call.label + ' leaked validation expectations')
  }
})
