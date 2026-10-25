import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { createMcpClientConfig, mcpServerName } from '../lib/mcp.js'

const fixtureServer = fileURLToPath(new URL('./fixtures/agent-plugin/bin/mcp-server.js', import.meta.url))

async function execute(ctx, name, args) {
  const tool = ctx.tools.get(name)
  assert.ok(tool, `missing registered tool ${name}`)
  try {
    const value = await tool.execute(args, { signal: new AbortController().signal })
    return { isError: false, value, content: tool.output.render(args, value) }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: String(error) }] }
  }
}

test('real stdio MCP discovery and execution uses translated plugin paths', { timeout: 30_000 }, async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-agent-mcp-integration-')))
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  t.after(async () => {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })

  const plugin = { name: 'demo', directoryName: 'demo', root }
  const config = await createMcpClientConfig({
    plugin,
    server: {
      name: 'local', type: 'stdio', command: process.execPath,
      args: [fixtureServer], env: { TEST_MARKER: '${PLUGIN_ROOT}/marker' },
    },
    dataDirectory: join(root, 'data'),
  })
  await ctx.plugin(McpClient, { ...config, failOnStartupError: true })

  const namespace = mcpServerName('demo', 'local')
  const names = ctx.tools.schemas().map(schema => schema.name)
  assert.ok(names.includes(`mcp__${namespace}__add`))
  assert.ok(names.includes(`mcp__${namespace}__environment`))

  const sum = await execute(ctx, `mcp__${namespace}__add`, { a: 2, b: 3 })
  assert.equal(sum.isError, false)
  assert.deepEqual(sum.content[0], { type: 'text', text: '5' })

  const environment = await execute(ctx, `mcp__${namespace}__environment`, {})
  const value = JSON.parse(environment.content[0].text)
  assert.equal(value.cwd, root)
  assert.equal(value.pluginRoot, root)
  assert.equal(value.pluginData, join(root, 'data', 'demo'))
  assert.equal(value.marker, join(root, 'marker'))

  const registry = ctx.tools
  await ctx.fiber.dispose()
  assert.equal(registry.schemas().some(schema => schema.name.startsWith('mcp__')), false)
})
