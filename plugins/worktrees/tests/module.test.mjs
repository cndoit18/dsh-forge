import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

test('built client registers a lazy-CJS module using injected require', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let registration
  const context = vm.createContext({
    window: { __ModuleLoader__: { load: value => { registration = value } } },
    structuredClone: globalThis.structuredClone,
    document: { createElement: () => ({ dataset: {}, remove: () => {} }), head: { appendChild: style => { globalThis.lastStyle = style } } },
  })
  new vm.Script(source).runInContext(context)
  assert.equal(registration.id, '@dshforge/worktrees')
  const requested = []
  const module = registration.factory(name => {
    requested.push(name)
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: () => ({}) }
    if (name === 'react') return { useEffect: () => {}, useId: () => '', useState: () => [false, () => {}] }
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({}, { get: () => () => null })
    if (name.endsWith('.css?inline')) return { default: '.wt-location{}' }
    throw new Error('unexpected platform require: ' + name)
  })
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual([...module.inject], ['slots', 'locale', 'connection', 'sessions', 'uiWorkspace'])
  const registrations = []
  const ctx = {
    effect: (setup, label) => { registrations.push(label); return setup() },
    locale: { register: () => () => {} },
    slots: { inject: (name, register) => register(), register: () => () => {} },
  }
  module.apply(ctx)
  assert.equal(registrations.length, 8)
  assert.equal(typeof globalThis.lastStyle.textContent, 'string')
  assert.ok(requested.includes('@deepseek-ai/dsh-client-store'))
  assert.ok(requested.includes('react'))
  assert.ok(requested.includes('react/jsx-runtime'))
  assert.ok(requested.includes('@deepseek-ai/dsh-client-ui-primitives'))
})
