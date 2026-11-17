import assert from 'node:assert/strict'
import test from 'node:test'

let importSequence = 0
const plugin = {
  name: 'demo', directoryName: 'demo', root: '/tmp/demo', status: 'ready',
  manifest: { version: '1.0.0' }, skills: [], mcpServers: [],
}

async function loadClient(t, selected = false) {
  let module
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  globalThis.window = { __ModuleLoader__: { load: value => { module = value } } }
  globalThis.document = { querySelector: () => ({}) }
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  })
  await import(`../src/client.js?contract=${++importSequence}`)

  const setters = []
  let stateIndex = 0
  const React = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) },
    }),
    useState(initial) {
      const index = stateIndex++
      const value = index === 0 && selected ? 'demo' : typeof initial === 'function' ? initial() : initial
      return [value, value => setters.push({ index, value })]
    },
    useEffect() {},
    cloneElement: (element, props) => ({ ...element, props: { ...element.props, ...props } }),
    useRef: initial => ({ current: initial }),
    useCallback: callback => callback,
  }
  const primitives = new Proxy({}, { get: (_target, name) => String(name) })
  const require = name => {
    if (name === 'react') return React
    if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: () => ({}) }
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`Unexpected client dependency ${name}`)
  }
  const client = module.factory(require)
  const injections = []
  const registrations = []
  const ctx = {
    locale: { bind: () => key => key, register() {} },
    effect() {},
    slots: {
      inject(key, callback) { injections.push({ key, callback }) },
      register(options, component) {
        const registration = { options, component }
        registrations.push(registration)
        return registration
      },
    },
    connection: { rpc: { call: async () => { throw new Error('unexpected RPC') } } },
    sidebarRight: { mounted: { getSnapshot: () => undefined } },
    get() {},
  }
  client.apply(ctx)
  for (const injection of injections) injection.callback()
  return { registrations, setters }
}

function findAll(node, predicate, matches = []) {
  if (node === null || node === undefined || typeof node !== 'object') return matches
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, matches)
    return matches
  }
  if (typeof node.type === 'function') return findAll(node.type(node.props), predicate, matches)
  if (predicate(node)) matches.push(node)
  findAll(node.props.children, predicate, matches)
  return matches
}

function renderSection(registrations) {
  const section = registrations.find(entry => entry.options.name === 'settings.section')
  assert.ok(section)
  return section.component({
    t: key => key,
    useCatalog: select => select({ status: 'ready', value: { plugins: [plugin] }, error: undefined }),
    reload() {}, openFile() {}, listDirectory() {}, install() {}, oauthStatus() {}, openAuthorization() {}, close() {},
  })
}

test('settings navigation uses its owned icon Slot and a React SVG', async (t) => {
  const { registrations } = await loadClient(t)
  const icon = registrations.find(entry => entry.options.name === 'settings.section.icon')
  assert.ok(icon)
  assert.equal(icon.options.id, 'agent-plugins')
  const logo = icon.component({ size: 16, active: false })
  assert.equal(logo.type, 'svg')
  assert.equal(logo.props.width, 16)
  assert.equal(logo.props.height, 16)
  assert.equal(logo.props['aria-hidden'], 'true')
})

test('ordinary inputs and actions render official Input and Button primitives', async (t) => {
  const { registrations } = await loadClient(t)
  const tree = renderSection(registrations)
  const search = findAll(tree, node => node.props.placeholder === 'search')
  const installInput = findAll(tree, node => node.props.placeholder === 'installPlaceholder')
  const actions = findAll(tree, node => typeof node.props.className === 'string' && node.props.className.split(' ').includes('ap-button'))
  assert.deepEqual(search.map(node => node.type), ['Input'])
  assert.deepEqual(installInput.map(node => node.type), ['Input'])
  assert.ok(actions.length > 0)
  assert.ok(actions.every(node => node.type === 'Button'))
})

test('detail tabs preserve their layout with complete keyboard and ARIA behavior', async (t) => {
  const { registrations, setters } = await loadClient(t, true)
  const tree = renderSection(registrations)
  const tablist = findAll(tree, node => node.props.role === 'tablist')
  const tabs = findAll(tree, node => node.props.role === 'tab')
  const panels = findAll(tree, node => node.props.role === 'tabpanel')
  assert.deepEqual(tablist.map(node => node.props['aria-label']), ['detailsTabs'])
  assert.equal(tabs.length, 4)
  assert.equal(panels.length, 1)
  for (const tab of tabs) {
    assert.ok(tab.props.id)
    assert.ok(tab.props['aria-controls'])
    assert.equal(typeof tab.props.onKeyDown, 'function')
  }
  assert.equal(panels[0].props.id, tabs[0].props['aria-controls'])
  assert.equal(panels[0].props['aria-labelledby'], tabs[0].props.id)

  for (const [key, index, next, selection] of [
    ['ArrowRight', 0, 1, 'skills'],
    ['ArrowLeft', 0, 3, 'files'],
    ['Home', 2, 0, 'overview'],
    ['End', 1, 3, 'files'],
  ]) {
    const focus = tabs.map(() => ({ calls: 0, focus() { this.calls++ } }))
    let prevented = false
    let stopped = false
    tabs[index].props.onKeyDown({
      key,
      currentTarget: { parentElement: { querySelectorAll: () => focus } },
      preventDefault() { prevented = true },
      stopPropagation() { stopped = true },
    })
    assert.equal(prevented, true, key)
    assert.equal(stopped, true, key)
    assert.equal(focus[next].calls, 1, key)
    assert.equal(setters.at(-1).value, selection, key)
  }
})
