import assert from 'node:assert/strict'
import test from 'node:test'

test('Config supplies safe defaults and validates every workflow filesystem setting', async () => {
  const { Config } = await import('../lib/index.js')
  assert.deepEqual(Config({}), {
    providerName: 'filesystem',
    includeDefaultRoots: true,
    customWorkflowDirs: [],
  })
  assert.deepEqual(Config({
    providerName: 'project-files',
    includeDefaultRoots: false,
    dshHome: '/config/dsh',
    agentsHome: '~/.config/agents',
    customWorkflowDirs: ['./workflows', '/shared/workflows'],
  }), {
    providerName: 'project-files',
    includeDefaultRoots: false,
    dshHome: '/config/dsh',
    agentsHome: '~/.config/agents',
    customWorkflowDirs: ['./workflows', '/shared/workflows'],
  })
  for (const value of [
    { providerName: '' },
    { providerName: 1 },
    { includeDefaultRoots: 'true' },
    { dshHome: 1 },
    { agentsHome: false },
    { customWorkflowDirs: './workflows' },
    { customWorkflowDirs: [1] },
  ]) {
    assert.throws(() => Config(value))
  }
})
