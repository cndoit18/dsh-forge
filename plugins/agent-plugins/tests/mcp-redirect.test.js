import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { mountAgentPluginMcpServers } from '../lib/mcp.js'

test('cross-origin redirects never receive configured credentials implicitly', { timeout: 15_000 }, async (t) => {
  const seen = []
  const redirectSeen = []
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'redirect-target', version: '1.0.0' }, { capabilities: { tools: {} } })
    server.registerTool('ping', { description: 'Ping', inputSchema: z.object({}) }, async () => ({ content: [{ type: 'text', text: 'pong' }] }))
    return server
  })
  const handle = toNodeHandler(handler)
  const target = createServer((request, response) => {
    seen.push({ authorization: request.headers.authorization, custom: request.headers['x-custom-secret'] })
    handle(request, response).catch(error => response.writeHead(500).end(String(error)))
  })
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve))
  const targetAddress = target.address()
  assert.ok(targetAddress && typeof targetAddress !== 'string')
  const redirect = createServer((request, response) => {
    redirectSeen.push(request.url)
    if (request.url === '/start') {
      response.writeHead(302, { location: '/next' }).end()
    } else if (request.url === '/next') {
      response.writeHead(302, { location: `http://127.0.0.1:${targetAddress.port}/mcp` }).end()
    } else {
      response.writeHead(404).end()
    }
  })
  await new Promise(resolve => redirect.listen(0, '127.0.0.1', resolve))
  const redirectAddress = redirect.address()
  assert.ok(redirectAddress && typeof redirectAddress !== 'string')

  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  t.after(async () => {
    await ctx.fiber.dispose()
    await handler.close()
    await new Promise(resolve => redirect.close(resolve))
    await new Promise(resolve => target.close(resolve))
  })
  const plugin = {
    name: 'demo', directoryName: 'demo', root: '/tmp/demo',
    mcpServers: [{
      name: 'remote', type: 'streamable-http', url: `http://127.0.0.1:${redirectAddress.port}/start`,
      headers: { Authorization: 'Bearer secret', 'X-Custom-Secret': 'custom-secret' },
    }],
  }
  await mountAgentPluginMcpServers(ctx, [plugin], { dataDirectory: '/tmp/agent-plugin-data' })
  assert.equal(seen.some(headers => headers.authorization || headers.custom), false)
  assert.equal(redirectSeen.includes('/next'), false)
})

test('failed MCP mount closes the redirect guard created for that attempt', async (t) => {
  const calls = []
  const disposers = []
  const ctx = {
    effect: execute => { disposers.push(execute()) },
    plugin: endpoint => {
      calls.push(endpoint)
      throw new Error('mount failed')
    },
    logger: { warn: () => {} },
  }
  t.after(async () => {
    for (const dispose of disposers) await dispose()
  })
  const plugin = {
    name: 'demo', directoryName: 'demo', root: '/tmp/demo',
    mcpServers: [{
      name: 'remote', type: 'streamable-http', url: 'http://127.0.0.1:1/mcp',
      headers: { Authorization: 'Bearer secret' },
    }],
  }
  await mountAgentPluginMcpServers(ctx, [plugin], { dataDirectory: '/tmp/agent-plugin-data' })
  assert.equal(calls.length, 1)
  await assert.rejects(() => fetch(calls[0].url, { signal: AbortSignal.timeout(1000) }))
})
