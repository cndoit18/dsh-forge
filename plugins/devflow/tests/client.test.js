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
  return module.factory()
}

test('DevFlow commands replace only their generic command cards with empty views', async () => {
  const client = await loadClient()
  const activations = []
  const registrations = []
  const ctx = {
    locale: { register: () => () => {}, bind: () => value => value },
    slots: {
      inject(name, activate) {
        assert.equal(name, 'conversation.chat.commandview')
        activations.push(activate)
      },
      register(definition, view) {
        registrations.push({ definition, view })
        return () => {}
      },
    },
    effect: contribute => contribute(),
    on() {},
  }
  client.apply(ctx)
  assert.deepEqual([...client.inject].sort(), ['locale', 'slots'])
  assert.equal(activations.length, 9)
  for (const activate of activations) activate()
  assert.deepEqual(registrations.map(({ definition }) => definition.key).sort(), [
    'batch', 'debug', 'deep-research', 'init', 'review', 'run', 'security-review', 'simplify', 'verify',
  ])
  for (const { definition, view } of registrations) {
    assert.equal(definition.name, 'conversation.chat.commandview')
    assert.equal(view(), null)
  }
})
