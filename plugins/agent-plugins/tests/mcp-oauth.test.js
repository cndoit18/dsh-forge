import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { mountAgentPluginMcpServers, mcpServerName } from '../lib/mcp.js'
import { createMcpOAuthSession } from '../lib/mcp-oauth.js'
import { createAgentPluginsRpcHandler } from '../lib/rpc.js'

async function temporaryDirectory(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-agent-oauth-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function oauthFixture(t, { mcp = false } = {}) {
  const acceptedTokens = new Set()
  const seenTokens = []
  let tokenCounter = 0
  let refreshCounter = 0
  let currentToken
  let mcpHandler
  let handleMcp
  if (mcp) {
    mcpHandler = createMcpHandler(() => {
      const server = new McpServer({ name: 'oauth-fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
      server.registerTool('ping', { description: 'Ping', inputSchema: z.object({}) }, async () => ({
        content: [{ type: 'text', text: 'pong' }],
      }))
      return server
    })
    handleMcp = toNodeHandler(mcpHandler)
  }
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const origin = `http://127.0.0.1:${server.address().port}`
    const sendJson = (status, value) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(value))
    }
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
      sendJson(200, { resource: `${origin}/mcp`, authorization_servers: [origin] })
      return
    }
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server') || url.pathname.startsWith('/.well-known/openid-configuration')) {
      sendJson(200, {
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        registration_endpoint: `${origin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      })
      return
    }
    if (url.pathname === '/register' && request.method === 'POST') {
      const metadata = JSON.parse(await readBody(request))
      sendJson(201, { ...metadata, client_id: 'agent-plugins-test' })
      return
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const body = new URLSearchParams(await readBody(request))
      assert.equal(body.get('client_id'), 'agent-plugins-test')
      if (body.get('grant_type') === 'authorization_code') {
        assert.equal(body.get('code'), 'test-code')
        assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), fixture.challenge)
      } else {
        assert.equal(body.get('grant_type'), 'refresh_token')
        assert.equal(body.get('refresh_token'), fixture.refreshToken)
        refreshCounter++
      }
      currentToken = `access-${++tokenCounter}`
      fixture.refreshToken = `refresh-${tokenCounter}`
      acceptedTokens.add(currentToken)
      seenTokens.push(currentToken)
      sendJson(200, {
        access_token: currentToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: fixture.refreshToken,
      })
      return
    }
    if (url.pathname === '/mcp') {
      const authorization = request.headers.authorization
      if (authorization !== `Bearer ${currentToken}` || !acceptedTokens.has(currentToken)) {
        response.writeHead(401, {
          'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
        })
        response.end('authorization required')
        return
      }
      if (handleMcp) await handleMcp(request, response)
      else {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('ok')
      }
      return
    }
    response.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  const fixture = {
    mcpUrl: `${origin}/mcp`,
    challenge: undefined,
    refreshToken: undefined,
    get refreshCount() { return refreshCounter },
    get tokens() { return [...seenTokens] },
    revokeCurrent() { acceptedTokens.delete(currentToken) },
    authorizationParams(session) {
      const authorization = new URL(session.status().authorizationUrl)
      assert.equal(authorization.origin, origin)
      assert.equal(authorization.pathname, '/authorize')
      const params = Object.fromEntries(authorization.searchParams)
      fixture.challenge = params.code_challenge
      assert.equal(params.code_challenge_method, 'S256')
      return params
    },
  }
  t.after(async () => {
    if (mcpHandler) await mcpHandler.close()
    server.closeAllConnections()
    server.closeIdleConnections()
    await new Promise(resolve => server.close(resolve))
  })
  return fixture
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

async function execute(ctx, name) {
  const tool = ctx.tools.get(name)
  assert.ok(tool, `missing registered tool ${name}`)
  const value = await tool.execute({}, { signal: new AbortController().signal })
  return tool.output.render({}, value)
}

test('OAuth authorization, callback, refresh, and real MCP execution work end to end', { timeout: 30_000 }, async (t) => {
  const fixture = await oauthFixture(t, { mcp: true })
  const dataDirectory = await temporaryDirectory(t)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  t.after(() => ctx.fiber.dispose())
  const oauthSessions = new Map()
  await mountAgentPluginMcpServers(ctx, [{
    name: 'demo', directoryName: 'demo', root: '/tmp/demo',
    mcpServers: [{ name: 'remote', type: 'streamable-http', url: fixture.mcpUrl }],
  }], { dataDirectory, oauthSessions })
  const session = oauthSessions.get('demo/remote')
  assert.ok(session)
  await waitFor(() => session.status().state === 'pending')
  const params = fixture.authorizationParams(session)
  const callback = new URL(params.redirect_uri)
  callback.searchParams.set('code', 'test-code')
  callback.searchParams.set('state', 'wrong-state')
  const rejectedCallback = await fetch(callback)
  assert.equal(rejectedCallback.status, 400)
  const rejectedPage = await rejectedCallback.text()
  assert.doesNotMatch(rejectedPage, /window\.close\(\)/)
  assert.match(rejectedPage, /Authorization failed/)
  assert.match(rejectedPage, /prefers-color-scheme:dark/)
  const providerErrorCallback = new URL(callback)
  providerErrorCallback.searchParams.set('state', params.state)
  providerErrorCallback.searchParams.set('error', '<script>alert(1)</script>')
  const providerError = await fetch(providerErrorCallback)
  const providerErrorPage = await providerError.text()
  assert.equal(providerErrorPage.includes('<script>alert(1)</script>'), false)
  assert.match(providerErrorPage, /&lt;script&gt;/)
  callback.searchParams.set('state', params.state)
  callback.searchParams.set('iss', new URL(fixture.mcpUrl).origin)
  const acceptedCallback = await fetch(callback)
  assert.equal(acceptedCallback.status, 200)
  const successPage = await acceptedCallback.text()
  assert.match(successPage, /window\.close\(\)/)
  assert.match(successPage, /prefers-color-scheme:dark/)
  const toolName = `mcp__${mcpServerName('demo', 'remote')}__ping`
  await waitFor(() => ctx.tools.get(toolName))
  assert.deepEqual((await execute(ctx, toolName))[0], { type: 'text', text: 'pong' })
  const firstToken = fixture.tokens.at(-1)
  assert.equal(successPage.includes(firstToken), false)
  fixture.revokeCurrent()
  assert.deepEqual((await execute(ctx, toolName))[0], { type: 'text', text: 'pong' })
  assert.equal(fixture.refreshCount, 1)
  assert.notEqual(fixture.tokens.at(-1), firstToken)
  const stateFile = join(dataDirectory, 'demo', `${mcpServerName('demo', 'remote')}.oauth.json`)
  const saved = JSON.parse(await readFile(stateFile, 'utf8'))
  assert.equal(saved.tokens.access_token, fixture.tokens.at(-1))
  assert.equal(saved.tokens.refresh_token, fixture.refreshToken)
})

test('saved OAuth credentials survive a new session and retain the callback URL', async (t) => {
  const fixture = await oauthFixture(t)
  const root = await temporaryDirectory(t)
  const stateFile = join(root, 'oauth.json')
  const redirectUrl = 'http://127.0.0.1:41234/oauth/callback'
  const session = await createMcpOAuthSession({ serverUrl: fixture.mcpUrl, stateFile })
  await session.useRedirectUrl(redirectUrl)
  assert.equal((await session.fetch(fixture.mcpUrl)).status, 401)
  const params = fixture.authorizationParams(session)
  await session.complete({ code: 'test-code', state: params.state, iss: new URL(fixture.mcpUrl).origin })
  assert.equal((await session.fetch(fixture.mcpUrl)).status, 200)
  const restored = await createMcpOAuthSession({ serverUrl: fixture.mcpUrl, stateFile })
  assert.equal(restored.preferredRedirectUrl, redirectUrl)
  await restored.useRedirectUrl(redirectUrl)
  fixture.revokeCurrent()
  assert.equal((await restored.fetch(fixture.mcpUrl, { method: 'POST', body: Buffer.from('retry') })).status, 200)
  assert.equal(fixture.refreshCount, 1)
})

test('OAuth status RPC is owner-only and returns no static configuration', async () => {
  const catalog = {
    diagnostics: [],
    plugins: [{
      name: 'demo', directoryName: 'demo', root: '/tmp/demo', status: 'ready', skills: [],
      mcpServers: [{ name: 'remote', type: 'streamable-http', url: 'https://example.com/mcp' }],
    }],
  }
  const oauthSessions = new Map([['demo/remote', {
    status: () => ({ state: 'pending', authorizationUrl: 'https://example.com/authorize' }),
  }]])
  const handler = createAgentPluginsRpcHandler(catalog, { oauthSessions })
  const result = await handler('oauth', { root: 'demo', server: 'remote' }, new AbortController().signal, { principal: { kind: 'owner' } })
  assert.deepEqual(result, { ok: true, value: { state: 'pending', authorizationUrl: 'https://example.com/authorize' } })
  const denied = await handler('oauth', { root: 'demo', server: 'remote' }, new AbortController().signal, { principal: { kind: 'guest' } })
  assert.equal(denied.ok, false)
  assert.equal(denied.error.code, 'agent-plugins/forbidden')
})
