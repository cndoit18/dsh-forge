import assert from 'node:assert/strict'
import test from 'node:test'
import { inject } from '../lib/index.js'
import { registerAgentPluginsRpc } from '../lib/rpc.js'

test('Host injects the MCP manager without owning a webServer lifecycle', () => {
  assert.deepEqual([...inject].sort(), ['connection', 'mcpManager', 'skills'])
})

test('catalog RPC registers exact routes through the authenticated Connection channel', async () => {
  const calls = []
  const ctx = {
    connection: {
      fetch: {
        register(route) {
          calls.push(route)
          return async () => {}
        },
      },
    },
  }
  const catalog = { plugins: [], diagnostics: [] }
  const result = registerAgentPluginsRpc(ctx, catalog)
  assert.equal(calls.length, 4)
  assert.deepEqual(calls.map(route => route.path), [
    '/api/agent-plugins/catalog',
    '/api/agent-plugins/files',
    '/api/agent-plugins/install',
    '/api/agent-plugins/oauth',
  ])
  assert.ok(calls.every(route => route.methods.includes('POST') && route.requestBody === 'buffered'))

  const response = await calls[0].fetch(new Request('http://localhost/api/agent-plugins/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'rpc-test', method: 'agent-plugins/catalog', payload: null }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    type: 'server-response', rpcId: 'rpc-test', result: { ok: true, value: catalog },
  })
  await result()
})
