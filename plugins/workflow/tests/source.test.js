import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkflowSource } from '../lib/source.js'

test('workflow metadata accepts JSON literals without evaluating expressions', () => {
  const source = [
    'export const meta = {',
    "  name: 'literal',",
    '  description: `plain text`,',
    "  whenToUse: 'structured',",
    "  phases: [{ title: 'One', detail: null }, { title: 'Two' }],",
    "  input: { hint: '<input>', required: true },",
    '}',
    'return await agent(args.input)',
  ].join('\n')
  const parsed = parseWorkflowSource(source, 'literal.js')

  assert.equal(parsed.meta.name, 'literal')
  assert.equal(parsed.meta.description, 'plain text')
  assert.deepEqual(parsed.meta.phases, [{ title: 'One', detail: null }, { title: 'Two' }])
  assert.deepEqual(parsed.input, { hint: '<input>', required: true })
  assert.equal(parsed.script, '\nreturn await agent(args.input)')
})

test('workflow metadata rejects executable object expressions', async t => {
  const cases = {
    call: "description: (() => 'computed')()",
    getter: "description: { get value() { return 'computed' } }.value",
    toJSON: "description: { toJSON() { return 'computed' } }",
    spread: "description: 'x', ...{ whenToUse: 'spread' }",
    computed: "description: 'x', ['when' + 'ToUse']: 'computed'",
    identifier: 'description: someValue',
    interpolation: 'description: `computed ${1 + 1}`',
    nonFinite: 'description: Infinity',
    bigint: 'description: 1n',
  }
  for (const [name, declaration] of Object.entries(cases)) {
    await t.test(name, () => {
      const source = "export const meta = { name: 'bad', " + declaration + ' }'
      assert.throws(() => parseWorkflowSource(source, name + '.js'), /only JSON literals/)
    })
  }
})
