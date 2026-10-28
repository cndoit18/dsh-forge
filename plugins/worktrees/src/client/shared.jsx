import { useEffect } from 'react'
import { zh, en } from './locale.js'

export const dictionaries = { zh, en }
export const t = (key, language = 'zh') => dictionaries[language]?.[key] ?? zh[key] ?? key

export function worktreeLabel(branch) {
  return /^worktree-([0-9a-f]{8})/.exec(branch)?.[0] ?? branch
}

export function useRepository(sessionId, actions, running, promptAttempted) {
  useEffect(() => { void actions.inspect(sessionId) }, [sessionId, actions])
  useEffect(() => {
    if (sessionId && promptAttempted && !running) void actions.inspect(sessionId)
  }, [sessionId, promptAttempted, running, actions])
}
