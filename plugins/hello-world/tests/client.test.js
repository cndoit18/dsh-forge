import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

async function loadClient() {
  let module
  const style = { dataset: {}, textContent: '' }
  const document = {
    head: { appendChild() {} },
    querySelector() { return null },
    createElement() { return style },
  }
  const window = { __ModuleLoader__: { load(value) { module = value } } }
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  runInNewContext(source, { window, document })
  const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) }
  const primitives = { StateDot: function StateDot() {} }
  const client = module.factory(specifier => {
    if (specifier === 'react') return react
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('Unexpected client dependency: ' + specifier)
  })
  return { client, primitives, style }
}

function applyClient(client) {
  let view
  const ctx = {
    slots: {
      inject(_key, contribute) { contribute() },
      register(_options, component) { view = component },
    },
  }
  client.apply(ctx)
  return view
}

test('hello-world declares the supported Node and DSH engine ranges', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.engines.node, '>=24.9.0')
  assert.equal(manifest.engines.dsh, '>=0.2.1-rc.3 <0.3.0')
})

test('hello-world styles use the exact loader package id and generated-style tag prefix', async () => {
  const { style } = await loadClient()
  assert.equal(style.dataset.plugin, '@dshforge/hello-world')
  assert.equal(style.dataset.pluginCss, '@dshforge/hello-world/banner.css')
})

test('hello-world uses the official done StateDot instead of a private status dot', async () => {
  const { client, primitives, style } = await loadClient()
  const view = applyClient(client)
  const rendered = view()
  const dot = rendered.children[0]
  assert.equal(dot.type, primitives.StateDot)
  assert.equal(dot.props.state, 'done')
  assert.equal(dot.props.size, 8)
  assert.equal(style.textContent.includes('__dot'), false)
})
