import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { mountAgentPluginMcpServers } from '../lib/mcp.js'

async function proxyUrlFor(t, handler) {
  const upstream = createServer(handler)
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  assert.ok(address && typeof address !== 'string')
  const disposers = []
  const configs = []
  const ctx = {
    plugin: async (_client, config) => {
      configs.push(config)
      return { config }
    },
    logger: { warn: () => {} },
    effect: callback => {
      const dispose = callback()
      disposers.push(dispose)
      return dispose
    },
  }
  const plugin = {
    name: 'demo', directoryName: 'demo', root: '/tmp/demo',
    mcpServers: [{
      name: 'remote', type: 'streamable-http',
      url: `http://127.0.0.1:${address.port}/mcp`,
      headers: { 'X-Test': 'secret' },
    }],
  }
  await mountAgentPluginMcpServers(ctx, [plugin], { dataDirectory: '/tmp/data' })
  t.after(async () => {
    for (const dispose of disposers) await dispose()
    upstream.close()
    upstream.closeAllConnections()
    upstream.closeIdleConnections()
    upstream.unref()
  })
  assert.equal(configs.length, 1)
  return { config: configs[0], upstream }
}

test('streaming responses preserve complete SSE content', async (t) => {
  const { config } = await proxyUrlFor(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: one\n\n')
    setTimeout(() => {
      response.write('data: two\n\n')
      response.end()
    }, 10)
  })
  const response = await fetch(config.url, { headers: { connection: 'close' }, keepalive: false })
  assert.equal(await response.text(), 'data: one\n\ndata: two\n\n')
})

test('an upstream mid-stream failure closes the downstream response without an uncaught error', async (t) => {
  const { config } = await proxyUrlFor(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: partial\n\n')
    setTimeout(() => response.destroy(), 10)
  })
  const response = await fetch(config.url, { headers: { connection: 'close' }, keepalive: false })
  try {
    // A clean close or a transport error is valid; the response must not stay open.
    assert.equal(await response.text(), 'data: partial\n\n')
  } catch (error) {
    assert.match(String(error), /terminated|aborted|fetch failed/i)
  }
})

test('client cancellation closes the proxy stream without an uncaught AbortError', async (t) => {
  let timer
  const { config } = await proxyUrlFor(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.write('data: first\n\n')
    timer = setInterval(() => response.write('data: next\n\n'), 10)
    response.on('close', () => clearInterval(timer))
  })
  const controller = new AbortController()
  const response = await fetch(config.url, { signal: controller.signal, headers: { connection: 'close' }, keepalive: false })
  const reader = response.body.getReader()
  await reader.read()
  controller.abort()
  await assert.rejects(reader.read(), /abort/i)
  await reader.cancel().catch(() => {})
  clearInterval(timer)
})
