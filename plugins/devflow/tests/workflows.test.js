import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const parallel = async thunks => Promise.all(thunks.map(async thunk => {
  try { return await thunk() } catch { return null }
}))

const pipeline = async (items, ...stages) => Promise.all(items.map(async (item, index) => {
  let value = item
  for (const stage of stages) {
    if (value === null) return null
    try { value = await stage(value, item, index) } catch { return null }
  }
  return value
}))

async function runWorkflow(name, options) {
  const source = await readFile(new URL(`../workflows/${name}`, import.meta.url), 'utf8')
  const phases = []
  const result = await runInNewContext(`(async () => { ${source}
 })()`, {
    args: options.args ?? { instruction: 'target' },
    agent: options.agent,
    parallel,
    pipeline,
    phase: title => phases.push(title),
    log() {},
  })
  return { result, phases }
}

function agentReturning(values) {
  const calls = []
  const remaining = [...values]
  return {
    calls,
    agent: async (prompt, options) => {
      calls.push({ prompt, options })
      if (remaining.length === 0) throw new Error('Unexpected agent call')
      const value = remaining.shift()
      if (value instanceof Error) throw value
      return value
    },
  }
}

const scope = { angles: [{ label: 'angle', query: 'query' }] }
const source = { url: 'https://example.com/a', title: 'A', relevance: 'high' }
const search = { results: [source] }
const extraction = {
  sourceQuality: 'primary',
  claims: [{ claim: 'claim', quote: 'quote', importance: 'central' }],
}
const verdict = { refuted: false, evidence: 'evidence', confidence: 'high' }

test('batch initial planning failure stops before implementation', async () => {
  const { agent } = agentReturning([null])
  await assert.rejects(runWorkflow('batch-workflow.js', { agent }), /Batch planning agent failed/)
})

test('batch continuation skips planning and rejects empty plans and units', async () => {
  const empty = agentReturning([])
  await assert.rejects(
    runWorkflow('batch-workflow.js', { agent: empty.agent, args: { instruction: 'continue' } }),
    /Approved plan is required/,
  )
  assert.equal(empty.calls.length, 0)

  const noUnits = agentReturning([{ units: [], e2e: 'verify' }])
  await assert.rejects(
    runWorkflow('batch-workflow.js', { agent: noUnits.agent, args: { instruction: 'continue approved' } }),
    /no independent units/,
  )
  assert.equal(noUnits.calls.length, 1)

  const failedParser = agentReturning([null])
  await assert.rejects(
    runWorkflow('batch-workflow.js', { agent: failedParser.agent, args: { instruction: 'continue approved' } }),
    /Unit parser agent failed/,
  )

  const units = { units: [{ id: 'unit', files: ['a.js'], instruction: 'implement' }], e2e: 'verify' }
  const failedWorker = agentReturning([units, null])
  await assert.rejects(
    runWorkflow('batch-workflow.js', { agent: failedWorker.agent, args: { instruction: 'continue approved' } }),
    /implementation agents failed/,
  )

  const success = agentReturning([units, 'worker result'])
  const { result } = await runWorkflow('batch-workflow.js', {
    agent: success.agent,
    args: { instruction: 'continue approved' },
  })
  assert.equal(success.calls.length, 2)
  assert.match(success.calls[0].prompt, /approved implementation plan/)
  assert.equal(result.status, 'implemented')
  assert.equal(result.results[0], 'worker result')
})

const firstStageFailures = [
  ['debug.js', /Debug evidence agent failed/],
  ['init-workflow.js', /Repository inventory agent failed/],
  ['security-review.js', /Security analysis agent failed/],
  ['simplify.js', /Simplify review agents failed/],
]
for (const [name, error] of firstStageFailures) {
  test(`${name} stops after a failed required first stage`, async () => {
    const values = name === 'simplify.js' ? [null, null, null, null] : [null]
    const { agent, calls } = agentReturning(values)
    await assert.rejects(runWorkflow(name, { agent }), error)
    assert.equal(calls.length, values.length)
  })
}

const secondStageFailures = [
  ['debug.js', ['evidence', null], /Debug fix agent failed/],
  ['init-workflow.js', ['inventory', null], /Initialization agent failed/],
  ['security-review.js', ['candidates', null], /Security verification agent failed/],
  ['simplify.js', ['one', 'two', 'three', 'four', null], /Simplify apply agent failed/],
]
for (const [name, values, error] of secondStageFailures) {
  test(`${name} does not report success when its final stage fails`, async () => {
    const { agent } = agentReturning(values)
    await assert.rejects(runWorkflow(name, { agent }), error)
  })
}

for (const [name, error] of [['run.js', /Run agent failed/], ['verify.js', /Verification agent failed/], ['review.js', /Review agent failed/]]) {
  test(`${name} rejects a failed single agent`, async () => {
    const { agent } = agentReturning([null])
    await assert.rejects(runWorkflow(name, { agent }), error)
  })
}

test('deep research reports scope failure without starting search', async () => {
  const { agent, calls } = agentReturning([null])
  const { result } = await runWorkflow('deep-research.js', { agent, args: { question: 'question' } })
  assert.match(result.error, /Scope agent returned no result/)
  assert.equal(calls.length, 1)
})

test('deep research handles null search and fetch results without false claims', async () => {
  for (const values of [[scope, null], [scope, search, null]]) {
    const { agent } = agentReturning(values)
    const { result } = await runWorkflow('deep-research.js', { agent, args: { question: 'question' } })
    assert.match(result.summary, /No claims extracted/)
    assert.equal(result.findings.length, 0)
    assert.equal(result.sources.length, 0)
  }
})

test('deep research enforces the fetch budget', async () => {
  const results = Array.from({ length: 16 }, (_, index) => ({
    url: `https://example.com/${index}`, title: `Source ${index}`, relevance: 'high',
  }))
  const emptyExtraction = { sourceQuality: 'primary', claims: [] }
  const values = [scope, { results }, ...Array.from({ length: 15 }, () => emptyExtraction)]
  const { agent, calls } = agentReturning(values)
  const { result } = await runWorkflow('deep-research.js', { agent, args: { question: 'question' } })
  assert.equal(calls.length, 17)
  assert.equal(result.sources.length, 15)
  assert.match(result.summary, /1 budget-dropped/)
})

test('deep research marks an insufficient vote panel unverified', async () => {
  const { agent } = agentReturning([scope, search, extraction, null, null, null])
  const { result } = await runWorkflow('deep-research.js', { agent, args: { question: 'question' } })
  assert.match(result.summary, /infrastructure failure/)
  assert.equal(result.unverified.length, 1)
  assert.equal(result.unverified[0].erroredVotes, 3)
  assert.equal(result.findings.length, 0)
})

test('deep research returns verified claims when synthesis fails', async () => {
  const { agent } = agentReturning([scope, search, extraction, verdict, verdict, verdict, null])
  const { result } = await runWorkflow('deep-research.js', { agent, args: { question: 'question' } })
  assert.match(result.summary, /Synthesis step was skipped or failed/)
  assert.equal(result.confirmed.length, 1)
  assert.equal(result.stats.afterSynthesis, 0)
})
