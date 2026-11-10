import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

async function loadClient() {
  let definition
  let component
  let module
  const document = {
    head: { appendChild() {} },
    querySelector() { return null },
    createElement() { return { dataset: {} } },
  }
  const window = { __ModuleLoader__: { load(value) { module = value } } }
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  runInNewContext(source, { window, document })
  const client = module.factory(() => ({ createElement: (...args) => args }))
  const ctx = {
    locale: { register: () => () => {} },
    slots: {
      inject(_name, callback) { callback() },
      register(descriptor, view) {
        if (descriptor.key === 'devflow-command-input') component = view
      },
    },
    uiConversation: { events: { register(value) { definition = value } } },
    effect(contribute) { contribute() },
  }
  client.apply(ctx)
  assert.deepEqual([...client.inject].sort(), ['locale', 'slots', 'uiConversation'])
  return { definition, component }
}

function runEvent(overrides = {}) {
  return {
    type: 'command/run', seq: 4, time: 100,
    data: {
      commandId: 'command-devflow', name: 'deep-research', args: ' Compare DSH and Goal  ',
      source: { kind: 'user' }, ...overrides,
    },
  }
}

function viewNode(definition, state) {
  return definition.buildViewNode({
    key: 'devflow-input', id: 'command-devflow', state,
    start: { location: { kind: 'unresolved' } },
  })
}

test('DevFlow renders pending and successful commands as one Goal-style input', async () => {
  const { definition, component } = await loadClient()
  const run = runEvent()
  const match = definition.match(run)
  assert.equal(match.exclusive, true)
  const state = definition.start({}, { event: run })
  assert.equal(state.text, '/deep-research Compare DSH and Goal')
  assert.equal(viewNode(definition, state).kind, 'devflow-command-input')

  const done = {
    type: 'command/done', seq: 5, time: 101,
    data: { commandId: 'command-devflow', kind: 'success', text: '工作流已提交，等待 Agent 启动。' },
  }
  assert.equal(definition.match(done).exclusive, true)
  const settled = definition.update({ state }, { event: done })
  const node = viewNode(definition, settled)
  assert.equal(node.kind, 'devflow-command-input')
  assert.equal(node.data.text, state.text)
  assert.equal(node.anchorSeq, 3.9)

  let factory
  component({
    node,
    t: key => key,
    renderFactorySlot(name, owner) { factory = { name, owner } },
  })
  assert.equal(factory.name, 'conversation.user.text')
  assert.deepEqual(JSON.parse(JSON.stringify(factory.owner.facts.commands)), [{ start: 0, end: 14, name: 'deep-research' }])
})

test('DevFlow leaves command failures on the official generic command card', async () => {
  const { definition } = await loadClient()
  const state = definition.start({}, { event: runEvent() })
  const done = {
    type: 'command/done', seq: 5, time: 101,
    data: { commandId: 'command-devflow', kind: 'error', text: 'missing input' },
  }
  const settled = definition.update({ state }, { event: done })
  const node = viewNode(definition, settled)
  assert.equal(node.kind, 'command')
  assert.equal(node.data.name, 'deep-research')
  assert.deepEqual(JSON.parse(JSON.stringify(node.data.outcome)), { kind: 'error', text: 'missing input' })
})

test('DevFlow suppresses only its own duplicate workflow followup', async () => {
  const { definition } = await loadClient()
  definition.start({}, { event: runEvent() })
  const followup = {
    type: 'user/message', seq: 6,
    data: {
      id: 'followup-devflow',
      source: { kind: 'workflow', name: 'deep-research', commandId: 'command-devflow' },
      content: [],
    },
  }
  assert.equal(definition.match(followup).exclusive, true)
  assert.equal(definition.start({}, { event: followup }), null)
  assert.equal(definition.match({
    ...followup,
    data: { ...followup.data, source: { kind: 'user' } },
  }), null)
  assert.equal(definition.match({
    ...followup,
    data: { ...followup.data, source: { kind: 'workflow', name: 'bdd-echo', commandId: 'other-command' } },
  }), null)
})

test('DevFlow ignores unrelated commands and legacy runs without recorded input', async () => {
  const { definition } = await loadClient()
  assert.equal(definition.match(runEvent({ commandId: 'other', name: 'goal' })), null)
  assert.equal(definition.match(runEvent({ args: undefined })), null)
  assert.equal(definition.match({
    type: 'command/done',
    data: { commandId: 'unknown', kind: 'success' },
  }), null)
})
