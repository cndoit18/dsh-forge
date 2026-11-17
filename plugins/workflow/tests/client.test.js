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
        if (descriptor.key === 'workflow-command-input') component = view
      },
    },
    uiConversation: { events: { register(value) { definition = value } } },
    effect(contribute) { contribute() },
  }
  client.apply(ctx)
  assert.deepEqual([...client.inject].sort(), ['locale', 'slots', 'uiConversation'])
  return { definition, component }
}

function runEvent(name = 'bdd-echo', args = ' BDD workflow', commandId = 'command-workflow') {
  return {
    type: 'command/run', seq: 4, time: 100,
    data: { commandId, name, args, source: { kind: 'user' } },
  }
}

function markerEvent() {
  return {
    type: 'workflow/command', seq: 5, time: 101,
    data: { commandId: 'command-workflow', name: 'bdd-echo', args: ' BDD workflow' },
  }
}

function doneEvent(kind = 'success', text = '工作流已提交，等待 Agent 启动。') {
  return {
    type: 'command/done', seq: 6, time: 102,
    data: { commandId: 'command-workflow', kind, text },
  }
}

function viewNode(definition, state) {
  return definition.buildViewNode({
    key: 'workflow-input', id: 'command-workflow', state,
    start: { location: { kind: 'unresolved' } },
  })
}

test('any workflow becomes one blue command input without a success receipt', async () => {
  const { definition, component } = await loadClient()
  const run = runEvent()
  assert.equal(definition.match(run).exclusive, true)
  let state = definition.start({}, { event: run })
  assert.equal(definition.match(markerEvent()).role, 'update')
  state = definition.update({ state }, { event: markerEvent() })
  assert.equal(definition.match(doneEvent()).exclusive, true)
  state = definition.update({ state }, { event: doneEvent() })

  const node = viewNode(definition, state)
  assert.equal(node.kind, 'workflow-command-input')
  assert.equal(node.data.text, '/bdd-echo BDD workflow')
  let factory
  component({
    node,
    t: key => key,
    renderFactorySlot(name, owner) { factory = { name, owner } },
  })
  assert.equal(factory.name, 'conversation.user.text')
  assert.deepEqual(JSON.parse(JSON.stringify(factory.owner.facts.commands)), [{ start: 0, end: 9, name: 'bdd-echo' }])
})

test('workflow failures and unrelated commands retain the generic command card', async () => {
  const { definition } = await loadClient()
  let workflow = definition.start({}, { event: runEvent() })
  workflow = definition.update({ state: workflow }, { event: markerEvent() })
  workflow = definition.update({ state: workflow }, { event: doneEvent('error', 'missing input') })
  const failure = viewNode(definition, workflow)
  assert.equal(failure.kind, 'command')
  assert.equal(failure.data.name, 'bdd-echo')
  assert.equal(failure.data.outcome.kind, 'error')

  const ordinary = runEvent('permission', ' danger-full-access', 'command-permission')
  assert.equal(definition.match(ordinary).exclusive, true)
  let fallback = definition.start({}, { event: ordinary })
  fallback = definition.update({ state: fallback }, {
    event: {
      ...doneEvent('success', 'preset read-only'),
      data: { ...doneEvent('success', 'preset read-only').data, commandId: 'command-permission' },
    },
  })
  const node = viewNode(definition, fallback)
  assert.equal(node.kind, 'command')
  assert.equal(node.data.name, 'permission')
  assert.equal(node.data.outcome.text, 'preset read-only')
})

test('only the matching workflow followup is hidden', async () => {
  const { definition } = await loadClient()
  definition.start({}, { event: runEvent() })
  const followup = {
    type: 'user/message', seq: 7,
    data: {
      id: 'followup-workflow',
      source: { kind: 'workflow', name: 'bdd-echo', commandId: 'command-workflow' },
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
    data: { ...followup.data, source: { kind: 'workflow', name: 'other', commandId: 'other-command' } },
  }), null)
})

test('Goal and Compact keep their official projections', async () => {
  const { definition } = await loadClient()
  for (const name of ['goal', 'compact']) {
    assert.equal(definition.match(runEvent(name, ' input')), null)
    assert.equal(definition.match({
      ...doneEvent(),
      data: { ...doneEvent().data, commandId: name },
    }), null)
  }
})
