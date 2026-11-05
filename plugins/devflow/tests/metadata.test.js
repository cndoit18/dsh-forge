import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseWorkflowSource } from '@dshforge/workflow/source'

test('all bundled workflows declare parser-compatible metadata', async () => {
  for (const name of ['deep-research', 'batch', 'init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']) {
    const file = name === 'batch' ? 'batch-workflow.js' : name === 'init' ? 'init-workflow.js' : name + '.js'
    const source = await readFile(new URL(`../workflows/${file}`, import.meta.url), 'utf8')
    const { meta, input, script } = parseWorkflowSource(source, file)
    assert.equal(meta.name, name)
    assert.ok(meta.description.length > 0)
    assert.ok(input)
    assert.ok(!script.includes('export const meta'))
  }
})
