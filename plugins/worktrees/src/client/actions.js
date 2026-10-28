const initialState = { repositories: {}, errors: {}, settings: null, items: [], error: null, deleteCandidate: null }

/** Browser-side RPC adapter; components receive only these narrow operations. */
export function createWorktreeActions(ctx, state, forkRequest) {
  const set = patch => state.set({ ...state.getSnapshot(), ...patch })
  const reportError = (sessionId, error) => {
    const message = error instanceof Error ? error.message : String(error)
    set({ errors: { ...state.getSnapshot().errors, [sessionId]: message } })
  }
  const call = async (endpoint, payload) => {
    const result = await ctx.connection.rpc.call('/api', 'worktrees/' + endpoint, {
      args: payload === undefined ? {} : { request: payload },
    })
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  const inspect = async sessionId => {
    if (!sessionId) return undefined
    try {
      const repository = await call('inspect', { sessionId })
      set({ repositories: { ...state.getSnapshot().repositories, [sessionId]: repository } })
      return repository
    } catch (error) {
      reportError(sessionId, error)
      return undefined
    }
  }
  const select = async (sessionId, selection) => {
    try {
      await call('select', { sessionId, pending: selection === 'new' })
      set({ errors: { ...state.getSnapshot().errors, [sessionId]: undefined } })
      await inspect(sessionId)
    } catch (error) {
      reportError(sessionId, error)
      throw error
    }
  }
  const loadSettings = async () => {
    try { set({ settings: await call('settingsRead'), error: null }) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  }
  const loadItems = async () => {
    try { set({ items: await call('list', {}), error: null }) }
    catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
  }
  const openWorktree = item => {
    if (item.sessionIds[0]) ctx.uiWorkspace.openSession(item.sessionIds[0])
    else set({ error: ctx.locale.bind('worktrees')('unlinked') })
  }
  return {
    inspect,
    select,
    reportError,
    openFork: request => forkRequest.set(request),
    closeFork: () => forkRequest.set(null),
    async forkShared(request) {
      const childId = await ctx.sessions.fork({ sessionId: request.sessionId, atSeq: request.atSeq, increaseTitle: true })
      await call('adopt', { sessionId: request.sessionId, childId })
      ctx.uiWorkspace.openSession(childId)
    },
    async forkIsolated(request) {
      const result = await call('fork', { ...request, isolate: true })
      await select(result.sessionId, 'new')
      ctx.uiWorkspace.openSession(result.sessionId)
    },
    loadSettings,
    loadItems,
    changeSettings: patch => set({ settings: { ...state.getSnapshot().settings, ...patch } }),
    async saveSettings() {
      try {
        set({ settings: await call('settingsWrite', state.getSnapshot().settings), error: null })
        await loadItems()
      } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
    },
    askDelete: item => set({ deleteCandidate: item }),
    cancelDelete: () => set({ deleteCandidate: null }),
    async remove(item) {
      try {
        await call('remove', { path: item.path, confirmed: true })
        set({ deleteCandidate: null })
        await loadItems()
      } catch (error) { set({ error: error instanceof Error ? error.message : String(error) }) }
    },
    openWorktree,
  }
}

export { initialState }
