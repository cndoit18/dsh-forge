import { auth, extractWWWAuthenticateParams } from '@modelcontextprotocol/client'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

async function readStoredState(stateFile) {
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'))
    if (typeof state !== 'object' || state === null || Array.isArray(state)) return {}
    if (typeof state.tokens?.access_token !== 'string') delete state.tokens
    return state
  } catch {
    return {}
  }
}

async function writeStoredState(stateFile, state) {
  await mkdir(dirname(stateFile), { recursive: true, mode: 0o700 })
  const temporary = `${stateFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 })
  await rename(temporary, stateFile)
}

/** Own OAuth credentials and interactive state for one remote MCP server. */
export async function createMcpOAuthSession({ serverUrl, stateFile }) {
  let stored = await readStoredState(stateFile)
  let activeRedirectUrl
  let pendingState
  let authorizationAttempt
  let currentStatus = stored.tokens ? { state: 'authorized' } : { state: 'idle' }
  let writes = Promise.resolve()

  const persist = () => {
    const snapshot = { ...stored, redirectUrl: activeRedirectUrl ?? stored.redirectUrl }
    const write = writes.catch(() => {}).then(() => writeStoredState(stateFile, snapshot))
    writes = write
    return write
  }
  const fail = (error) => {
    currentStatus = {
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
      ...currentStatus.authorizationUrl ? { authorizationUrl: currentStatus.authorizationUrl } : {},
    }
  }
  const provider = {
    get redirectUrl() { return activeRedirectUrl },
    get clientMetadata() {
      if (!activeRedirectUrl) throw new Error('OAuth callback URL has not been initialized')
      return {
        client_name: 'DeepSeek Harness Agent Plugins',
        redirect_uris: [activeRedirectUrl],
        token_endpoint_auth_method: 'none',
      }
    },
    async clientInformation() { return stored.clientInformation },
    async saveClientInformation(value) {
      stored.clientInformation = value
      await persist()
    },
    async tokens() { return stored.tokens },
    async saveTokens(value) {
      stored.tokens = value
      await persist()
    },
    async codeVerifier() { return stored.codeVerifier },
    async saveCodeVerifier(value) {
      stored.codeVerifier = value
      await persist()
    },
    async discoveryState() { return stored.discoveryState },
    async saveDiscoveryState(value) {
      stored.discoveryState = value
      await persist()
    },
    async state() {
      pendingState = randomBytes(32).toString('base64url')
      return pendingState
    },
    async redirectToAuthorization(url) {
      currentStatus = { state: 'pending', authorizationUrl: url.toString() }
    },
    async invalidateCredentials(kind) {
      if (kind === 'client' || kind === 'all') delete stored.clientInformation
      if (kind === 'tokens' || kind === 'all') delete stored.tokens
      await persist()
    },
  }

  const authorize = (options) => {
    if (pendingState && options.authorizationCode === undefined) return 'REDIRECT'
    authorizationAttempt ??= auth(provider, { serverUrl, ...options }).then(async result => {
      if (result === 'AUTHORIZED') {
        pendingState = undefined
        delete stored.codeVerifier
        await persist()
        currentStatus = { state: 'authorized' }
      }
      return result
    }, error => {
      fail(error)
      throw error
    }).finally(() => { authorizationAttempt = undefined })
    return authorizationAttempt
  }

  return {
    get preferredRedirectUrl() { return stored.redirectUrl },
    async useRedirectUrl(url) {
      if (activeRedirectUrl && activeRedirectUrl !== url) throw new Error('OAuth callback URL cannot change during a session')
      activeRedirectUrl = url
      if (stored.redirectUrl !== url) {
        stored = { redirectUrl: url }
        currentStatus = { state: 'idle' }
        await persist()
      }
    },
    status() { return { ...currentStatus } },
    async complete(query) {
      if (!pendingState || query.state !== pendingState) throw new Error('OAuth callback state does not match the pending authorization')
      if (query.error) {
        const error = new Error(`OAuth authorization failed: ${query.error}`)
        fail(error)
        throw error
      }
      if (typeof query.code !== 'string' || !query.code) throw new Error('OAuth callback is missing an authorization code')
      const result = await authorize({ authorizationCode: query.code, iss: query.iss })
      if (result !== 'AUTHORIZED') throw new Error('OAuth authorization did not complete')
    },
    async fetch(input, init = {}) {
      const send = async () => {
        const headers = new Headers(init.headers)
        if (stored.tokens) headers.set('Authorization', `Bearer ${stored.tokens.access_token}`)
        return fetch(input, { ...init, headers })
      }
      const response = await send()
      const challenge = response.headers.get('www-authenticate') ?? ''
      if (response.status !== 401 || !/^Bearer(?:\s|$)/i.test(challenge)) return response
      if (!pendingState) currentStatus = { state: 'authorizing' }
      const { resourceMetadataUrl, scope } = extractWWWAuthenticateParams(response)
      try {
        const result = await authorize({ resourceMetadataUrl, scope })
        if (result !== 'AUTHORIZED') return response
      } catch {
        return response
      }
      await response.body?.cancel().catch(() => {})
      return send()
    },
  }
}
