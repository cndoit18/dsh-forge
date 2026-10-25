let buffer = ''

process.stdin.on('data', chunk => {
  buffer += chunk
  while (true) {
    const newline = buffer.indexOf('\n')
    if (newline < 0) return
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    if (line.trim()) handle(line)
  }
})
process.stdin.on('end', () => process.exit(0))

function handle(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.method === 'notifications/initialized') return
  if (message.id === undefined) return
  switch (message.method) {
    case 'initialize':
      return respond(message.id, {
        protocolVersion: '2025-11-25',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'agent-plugin-fixture', version: '1.0.0' },
      })
    case 'ping':
      return respond(message.id, {})
    case 'tools/list':
      return respond(message.id, {
        tools: [
          {
            name: 'add',
            description: 'Adds two numbers.',
            inputSchema: {
              type: 'object',
              properties: { a: { type: 'number' }, b: { type: 'number' } },
              required: ['a', 'b'],
            },
          },
          {
            name: 'environment',
            description: 'Reports the launch environment for adapter verification.',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      })
    case 'tools/call':
      return callTool(message)
    default:
      return respondError(message.id, -32601, `Method not found: ${message.method}`)
  }
}

function callTool(message) {
  const { name, arguments: args = {} } = message.params ?? {}
  if (name === 'add') {
    if (typeof args.a !== 'number' || typeof args.b !== 'number') {
      return respond(message.id, { content: [{ type: 'text', text: 'a and b must be numbers' }], isError: true })
    }
    return respond(message.id, { content: [{ type: 'text', text: String(args.a + args.b) }] })
  }
  if (name === 'environment') {
    return respond(message.id, {
      content: [{
        type: 'text',
        text: JSON.stringify({
          cwd: process.cwd(),
          pluginRoot: process.env.PLUGIN_ROOT,
          pluginData: process.env.PLUGIN_DATA,
          marker: process.env.TEST_MARKER,
        }),
      }],
    })
  }
  return respondError(message.id, -32602, `Unknown tool: ${name}`)
}

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function respondError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}
