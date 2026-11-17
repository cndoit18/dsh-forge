import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

async function loadClient() {
  let module
  const style = { dataset: {}, textContent: '' }
  const document = {
    body: {},
    head: { appendChild() {} },
    querySelector() { return null },
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
  const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) }
  const primitives = { UserMessageBubble: function UserMessageBubble() {} }
  const client = module.factory(specifier => {
    if (specifier === 'react') return react
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('Unexpected client dependency: ' + specifier)
  })
  return { client, primitives, style }
}

function applyClient(client) {
  let definition
  let view
  const ctx = {
    locale: { register: () => () => {}, bind: () => value => value },
    slots: {
      inject(_key, contribute) { contribute() },
      register(_options, component) { view = component },
    },
    uiConversation: { events: { register(value) { definition = value } } },
    effect: contribute => contribute(),
    on() {},
  }
  client.apply(ctx)
  return { definition, view }
}

async function loadDefinition() {
  const { client } = await loadClient()
  const { definition } = applyClient(client)
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
  assert.equal(definition.match({ type: 'command/run', data: { name: 'skillopt' } }), null)
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

test('DevFlow styles use the exact loader package id and generated-style tag prefix', async () => {
  const { client, style } = await loadClient()
  applyClient(client)
  assert.equal(style.dataset.plugin, '@dshforge/devflow')
  assert.equal(style.dataset.pluginCss, '@dshforge/devflow/commands.css')
})

test('DevFlow command input composes the official bubble around its text Factory', async () => {
  const { client, primitives } = await loadClient()
  const { view } = applyClient(client)
  const factoryCalls = []
  const rendered = view({
    node: { data: { command: 'run', text: '/run target' } },
    renderFactorySlot(...args) { factoryCalls.push(args); return 'factory-text' },
    t: value => value,
  })
  assert.equal(rendered.props.style.justifyContent, 'flex-end')
  const bubble = rendered.children[0]
  assert.equal(bubble.type, primitives.UserMessageBubble)
  assert.equal(bubble.props.style.maxWidth, 'min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%)')
  assert.equal(bubble.props.style.overflowWrap, 'anywhere')
  assert.equal(bubble.children[0], 'factory-text')
  assert.equal(factoryCalls.length, 1)
  assert.equal(factoryCalls[0][0], 'conversation.user.text')
  assert.equal(factoryCalls[0][1].text, '/run target')
  assert.equal(factoryCalls[0][1].interactive, false)
  assert.equal(factoryCalls[0][1].facts.commands[0].name, 'run')
})
