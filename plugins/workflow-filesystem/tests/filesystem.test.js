import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileSystemWorkflowProvider } from '../lib/index.js'
import { parseWorkflowSource } from '@dshforge/workflow/source'

const validSource = `// comment before metadata
export const meta = {
  name: 'audit-routes',
  description: 'Audit route handlers',
  whenToUse: 'When auditing routes',
  phases: [{ title: 'Audit' }],
  input: { hint: '<路径>', required: true },
}
phase('Audit')
return await agent('Audit routes', { schema: { type: 'object' } })
`

test('VM reads only metadata and preserves the script body', () => {
  const parsed = parseWorkflowSource(validSource)
  assert.equal(parsed.meta.name, 'audit-routes')
  assert.equal(parsed.meta.phases[0].title, 'Audit')
  assert.deepEqual(parsed.input, { hint: '<路径>', required: true })
  assert.equal(parsed.meta.input, undefined)
  assert.match(parsed.script, /^\s*phase\('Audit'\)/)
  assert.doesNotThrow(() => parseWorkflowSource(`export const meta = { name: 'safe', description: 'Safe' }
throw new Error('body must not run during discovery')`))
})

test('metadata evaluation has no Host globals and rejects invalid file shapes', () => {
  assert.throws(() => parseWorkflowSource(`export const meta = { name: process.env.NAME, description: 'Bad' }`), /process is not defined/)
  assert.throws(() => parseWorkflowSource('return 1'), /must be the first statement/)
  assert.throws(() => parseWorkflowSource(`export const meta = { name: ` + "'demo'" + `, description: 'Bad', extra: true }`), /unsupported workflow meta field/)
  const template = parseWorkflowSource(`export const meta = { name: 'demo', description: ` + '`Static template description`' + ` }`)
  assert.equal(template.meta.description, 'Static template description')
})



test('AST identifies workflow metadata without confusing braces or comments in strings', () => {
  const source = `/* leading comment */
export const meta = {
  name: 'brace-demo',
  description: 'a string with } and /* not a comment */ and // text',
  phases: [{ title: 'nested { value }' }],
}
// body comment
return { input: args.input }
`
  const parsed = parseWorkflowSource(source)
  assert.equal(parsed.meta.name, 'brace-demo')
  assert.match(parsed.meta.description, /not a comment/)
  assert.equal(parsed.meta.phases[0].title, 'nested { value }')
  assert.match(parsed.script, /^\s*\/\/ body comment/)
  assert.match(parsed.script, /return \{ input: args\.input \}/)
})

test('AST rejects declarations that are not the workflow meta contract', () => {
  for (const [source, expected] of [
    [`const meta = { name: 'not-exported', description: 'No' }`, /export const meta must be the first statement/],
    [`export const other = { name: 'wrong-name', description: 'No' }`, /export const meta must be the first statement/],
    [`export let meta = { name: 'not-const', description: 'No' }`, /must declare one constant/],
    [`export const meta = makeMeta()`, /must be an object literal/],
    [`export const meta = { name: 'broken', description: 'No' `, /invalid workflow JavaScript/],
  ]) {
    assert.throws(() => parseWorkflowSource(source), expected)
  }
})

test('filesystem provider discovers project, custom, and user roots with Skill-style ranks', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-workflow-fs-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const project = join(home, 'project')
  const nested = join(project, 'packages/app')
  const dshHome = join(home, 'dsh-home')
  const agentsHome = join(home, 'agents-home')
  const custom = join(home, 'custom')
  await mkdir(join(project, '.git'), { recursive: true })
  await mkdir(nested, { recursive: true })
  await mkdir(join(project, '.dsh/workflows'), { recursive: true })
  await mkdir(join(project, '.agents/workflows'), { recursive: true })
  await mkdir(join(dshHome, 'workflows'), { recursive: true })
  await mkdir(join(agentsHome, 'workflows'), { recursive: true })
  await mkdir(custom, { recursive: true })
  const workflow = (name, description = name) => `export const meta = { name: '${name}', description: '${description}' }
return { input: args.input }
`
  await writeFile(join(project, '.dsh/workflows/shared.js'), workflow('shared', 'project'))
  await writeFile(join(project, '.agents/workflows/agent.js'), workflow('agent'))
  await writeFile(join(dshHome, 'workflows/shared.js'), workflow('shared', 'user'))
  await writeFile(join(agentsHome, 'workflows/personal.js'), workflow('personal'))
  await writeFile(join(custom, 'custom.js'), workflow('custom'))
  await writeFile(join(project, '.dsh/workflows/invalid.js'), 'return 1')
  await writeFile(join(project, '.dsh/workflows/ignored.txt'), workflow('ignored'))
  const warnings = []
  const provider = new FileSystemWorkflowProvider({ workflows: { parse: parseWorkflowSource }, logger: { warn: message => warnings.push(message) } }, {
    dshHome,
    agentsHome,
    customWorkflowDirs: [custom],
  })

  const candidates = await provider.list({ cwd: nested })
  assert.deepEqual(candidates.map(candidate => [candidate.name, candidate.source, candidate.rank]), [
    ['shared', 'project-dsh', 100],
    ['agent', 'project-agents', 200],
    ['custom', 'custom', 300],
    ['shared', 'user-dsh', 400],
    ['personal', 'user-agents', 500],
  ])
  assert.ok(!candidates.some(candidate => candidate.name === 'ignored'))
  assert.ok(warnings.some(message => message.includes('invalid.js')))
  const shared = candidates.find(candidate => candidate.source === 'project-dsh')
  const loaded = await provider.get(shared, {})
  assert.equal(loaded.description, 'project')
  assert.equal(loaded.provider, 'filesystem')
  assert.equal(loaded.source, 'project-dsh')
  assert.doesNotMatch(loaded.script, /export const meta/)
  assert.match(loaded.script, /args\.input/)
})

test('default roots can be isolated to explicit custom directories', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-workflow-custom-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(home, { recursive: true })
  await writeFile(join(home, 'one.js'), `export const meta = { name: 'one', description: 'One' }
return 1`)
  const provider = new FileSystemWorkflowProvider({ workflows: { parse: parseWorkflowSource }, logger: { warn() {} } }, {
    includeDefaultRoots: false,
    customWorkflowDirs: [home],
  })
  const candidates = await provider.list({ cwd: '/not/used' })
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].source, 'custom')
})
