import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { provideMcpManager } from './mcp-manager-double.js'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { createMcpClientConfig, mcpServerName } from '../lib/mcp.js'

async function execute(ctx, name, args) {
  const tool = ctx.tools.get(name)
  assert.ok(tool, `missing registered tool ${name}`)
  const value = await tool.execute(args, { signal: new AbortController().signal })
  return tool.output.render(args, value)
}


async function waitFor(check, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('condition did not become true before timeout')
}

test('real Streamable HTTP MCP discovery, execution, and literal headers', { timeout: 30_000 }, async (t) => {
  const seenHeaders = []
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'http-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
    server.registerTool('ping', {
      description: 'Replies pong.',
      inputSchema: z.object({}),
    }, async () => ({ content: [{ type: 'text', text: 'pong' }] }))
    return server
  })
  const handle = toNodeHandler(handler)
  const httpServer = createServer((request, response) => {
    seenHeaders.push(request.headers['x-agent-plugin-test'])
    handle(request, response).catch(error => response.writeHead(500).end(String(error)))
  })
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address()
  assert.ok(address && typeof address !== 'string')

  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  provideMcpManager(ctx)
  t.after(async () => {
    await ctx.fiber.dispose()
    await handler.close()
    await new Promise(resolve => httpServer.close(resolve))
  })

  const plugin = { name: 'demo', directoryName: 'demo', root: '/tmp/demo' }
  const config = await createMcpClientConfig({
    plugin,
    server: {
      name: 'remote', type: 'streamable-http',
      url: `http://127.0.0.1:${address.port}/mcp`,
      headers: { 'X-Agent-Plugin-Test': 'literal-value' },
    },
    dataDirectory: '/tmp/agent-plugin-data',
  })
  const namespace = mcpServerName('demo', 'remote')
  ctx.mcpManager.register(namespace, config)
  await waitFor(() => ctx.tools.get(`mcp__${namespace}__ping`))
  const result = await execute(ctx, `mcp__${namespace}__ping`, {})
  assert.deepEqual(result[0], { type: 'text', text: 'pong' })
  const configuredRequests = seenHeaders.filter(value => value !== undefined)
  assert.ok(configuredRequests.length > 0)
  assert.ok(configuredRequests.every(value => value === 'literal-value'))
})
