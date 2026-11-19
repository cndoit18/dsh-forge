import * as McpClient from '@deepseek-ai/dsh-mcp-client'

/** Exercise the Manager registration contract with the pinned local MCP client. */
export function provideMcpManager(ctx) {
  ctx.provide('mcpManager', {
    register(name, config) {
      const child = ctx.plugin(McpClient, { ...config, serverName: name, failOnStartupError: false })
      return () => { void child.dispose() }
    },
  })
}
