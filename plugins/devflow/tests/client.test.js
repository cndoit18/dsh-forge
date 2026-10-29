import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

async function loadClient() {
  let module
  const style = { dataset: {} }
  const document = {
    body: {},
    head: { appendChild() {} },
    querySelector(selector) { return selector === '[data-trigger-menu]' ? null : style },
    createElement() { return style },
    querySelectorAll() { return [] },
  }
  const window = { __ModuleLoader__: { load(value) { module = value } } }
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    window,
    document,
    MutationObserver: class { observe() {} disconnect() {} },
  })
  return module.factory(() => ({ createElement: (...args) => args }))
}

async function loadDefinition() {
  const client = await loadClient()
  let definition
  const ctx = {
    locale: { register: () => () => {}, bind: () => value => value },
    slots: { inject() {}, register() {} },
    uiConversation: { events: { register(value) { definition = value } } },
    effect: contribute => contribute(),
    on() {},
  }
  client.apply(ctx)
  assert.deepEqual([...client.inject].sort(), ['locale', 'slots', 'uiConversation'])
  return definition
}

test('DevFlow projects its command as a Goal-style input without hiding the command result', async () => {
  const definition = await loadDefinition()
  const run = {
    type: 'command/run', seq: 4, time: 100,
    data: { commandId: 'command-devflow', name: 'deep-research', args: ' Compare DSH and Goal  ', source: { kind: 'user' } },
  }
  const match = definition.match(run)
  assert.equal(match.id, 'command-devflow')
  assert.equal(match.role, 'start')
  const state = definition.start({}, { event: run })
  assert.equal(state.text, '/deep-research Compare DSH and Goal')
  const node = definition.buildViewNode({
    key: 'devflow-input', id: 'command-devflow', state,
    start: { location: { kind: 'unresolved' } },
  })
  assert.equal(node.kind, 'devflow-command-input')
  assert.equal(node.anchorSeq, 3.9)
  assert.equal(node.data.text, state.text)
  assert.equal(definition.match({ type: 'command/run', data: { name: 'goal' } }), null)
})

test('DevFlow suppresses only its duplicate ordinary followup bubble', async () => {
  const definition = await loadDefinition()
  const followup = {
    type: 'user/message', seq: 5,
    data: { id: 'followup-devflow', source: { kind: 'devflow' }, content: [] },
  }
  const match = definition.match(followup)
  assert.equal(match.exclusive, true)
  assert.equal(definition.start({}, { event: followup }), null)
  assert.equal(definition.buildViewNode({ state: null }), null)
  assert.equal(definition.match({ ...followup, data: { ...followup.data, source: { kind: 'user' } } }), null)
})
