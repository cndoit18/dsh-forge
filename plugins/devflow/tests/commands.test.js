import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { apply, inject, name } from '../lib/index.js'

const agent = { session: { id: 'session-test' } }

function createHarness() {
  const commands = new Map()
  const runs = []
  const workflowEngine = { start(spec) { runs.push(spec); return { id: 'run-test', result: Promise.resolve({ stopReason: 'completed', value: { ok: true } }), dispose: async () => {} } } }
  const ctx = {
    commands: { register(definition) { commands.set(definition.name, definition); return () => commands.delete(definition.name) } },
    agentPresets: { serviceFor(subject, service) { assert.equal(subject, agent); assert.equal(service, 'workflowEngine'); return workflowEngine } },
    effect(contribute) { return contribute() },
  }
  return { ctx, commands, runs }
}

test('host commands execute deep research and batch without model dispatch', async () => {
  const { ctx, commands, runs } = createHarness()
  apply(ctx)
  assert.equal(name, 'devflow')
  assert.ok(inject.includes('commands'))
  assert.ok(inject.includes('agentPresets'))
  assert.ok(!inject.includes('workflowEngine'))
  const result = await commands.get('deep-research').handler({ agent, rawInput: 'Compare DSH Skills and Workflows', signal: new AbortController().signal })
  assert.equal(result.kind, 'success')
  assert.equal(runs.length, 1)
  assert.equal(runs[0].parent, agent)
  assert.equal(runs[0].args.question, 'Compare DSH Skills and Workflows')
  assert.match(runs[0].script, /const VOTES_PER_CLAIM = 3/)
  assert.match(runs[0].script, /phase\(['"]Scope['"]\)/)
  const batchResult = await commands.get('batch').handler({ agent, rawInput: 'Migrate modules', signal: new AbortController().signal })
  assert.equal(batchResult.kind, 'success')
  assert.equal(runs.length, 2)
  assert.equal(runs[1].args.instruction, 'Migrate modules')
  assert.match(runs[1].script, /create_worktree|worktree/i)
})

test('command menu copy and input hints are Chinese', () => {
  const { ctx, commands } = createHarness()
  apply(ctx)
  for (const definition of commands.values()) {
    assert.match(definition.description, /[\u3400-\u9fff]/)
    assert.match(definition.input.hint, /[\u3400-\u9fff]/)
  }
})

test('workflow comments do not expose literal Unicode escape sequences', async () => {
  const source = await readFile(new URL('../workflows/deep-research.js', import.meta.url), 'utf8')
  const comments = source.split('\n').filter(line => line.trimStart().startsWith('//'))
  assert.ok(!comments.some(line => /\\u[0-9a-fA-F]{4}/.test(line)))
})

test('empty commands fail before starting a workflow', async () => {
  const { ctx, commands, runs } = createHarness()
  apply(ctx)
  const result = await commands.get('deep-research').handler({ agent, rawInput: ' ', signal: new AbortController().signal })
  assert.equal(result.kind, 'error')
  assert.equal(runs.length, 0)
})

test('workflow failures preserve their diagnostic message', async () => {
  const { ctx, commands } = createHarness()
  ctx.agentPresets = {
    serviceFor() {
      return {
        start() {
          return {
            result: Promise.resolve({ stopReason: 'error', error: 'scope exploded' }),
            dispose: async () => {},
          }
        },
      }
    },
  }
  apply(ctx)
  const result = await commands.get('deep-research').handler({ agent, rawInput: 'target', signal: new AbortController().signal })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /scope exploded/)
})

test('other commands expose deterministic workflow launchers', async () => {
  const { ctx, commands } = createHarness()
  apply(ctx)
  for (const name of ['init', 'review', 'simplify', 'security-review', 'debug', 'run', 'verify']) {
    const definition = commands.get(name)
    assert.ok(definition, name)
    const result = await definition.handler({ agent, rawInput: 'target', signal: new AbortController().signal })
    assert.equal(result.kind, 'success')
  }
})
