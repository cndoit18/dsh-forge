import { useEffect, useState } from 'react'
import {
  IconBranchOutlineRegular, IconChevronDownOutlineRegular, IconFolderOpenRegular, Menu,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useRepository, worktreeLabel } from './shared.jsx'

export function WorkLocation({ sessionId, useSession, useWorktreeState, activeOnly = false, actions, t }) {
  const [open, setOpen] = useState(false)
  const repository = useWorktreeState(value => value.repositories[sessionId])
  const blank = useSession(snapshot => snapshot.blank)
  useRepository(sessionId, actions)
  if (activeOnly && blank) return null
  if (!sessionId || !repository) return null
  const pending = repository.pendingSelection
  if (repository.managed && !pending) return (
    <div className="wt-location">
      <span className="wt-location-button wt-location-static wt-worktree" title={repository.managed.path}>
        <IconBranchOutlineRegular className="wt-location-icon" size={16} />
        <span className="wt-location-label">{t('worktreePrefix') + worktreeLabel(repository.managed.branch)}</span>
      </span>
    </div>
  )
  const items = [
    { type: 'label', id: 'location-status', text: repository.git ? t('position') : t('notGit') },
    { id: 'local', label: t('local'), icon: <IconFolderOpenRegular size={16} /> },
    ...repository.git ? [{
      id: 'new', icon: <IconBranchOutlineRegular size={16} />,
      label: <span className="wt-menu-copy"><span className="wt-menu-name">{t('newTree')}</span><span className="wt-menu-description">{t('createOnSend')}</span></span>,
    }] : [],
  ]
  const select = async id => {
    try { await actions.select(sessionId, id === 'new' ? 'new' : 'local') }
    catch (error) { actions.reportError(sessionId, error) }
    setOpen(false)
  }
  return (
    <div className="wt-location">
      <Menu
        open={open} items={items} selectedId={pending ? 'new' : 'local'} onSelect={select}
        onClose={() => setOpen(false)} align="start" side="bottom" portal className="wt-location-menu"
        anchor={(
          <button type="button" className="wt-location-button" aria-label={t('position')} data-pending={pending}
            aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            {repository.git ? <IconBranchOutlineRegular className="wt-location-icon" size={16} /> : <IconFolderOpenRegular className="wt-location-icon" size={16} />}
            <span className="wt-location-label">{pending ? t('pending') : t('local')}</span>
            <IconChevronDownOutlineRegular className="wt-location-chevron" size={12} />
          </button>
        )}
      />
      {repository.branch && <span className="wt-context wt-base" title={repository.branch}>{pending ? t('base') + ' ' + repository.branch : repository.branch}</span>}
    </div>
  )
}

export function WorktreeDock({ sessionId, useSession, useWorktreeState, actions }) {
  const error = useWorktreeState(value => value.errors[sessionId])
  const repository = useWorktreeState(value => value.repositories[sessionId])
  const running = useSession(snapshot => snapshot.running)
  const promptAttempted = useSession(snapshot => snapshot.promptAttempted)
  useRepository(sessionId, actions, running, promptAttempted)
  useEffect(() => {
    if (!running || !repository?.pendingSelection) return
    const timer = setInterval(() => { void actions.inspect(sessionId) }, 1000)
    return () => clearInterval(timer)
  }, [sessionId, running, repository?.pendingSelection, actions])
  if (error) return <p className="wt-error" role="alert">{error}</p>
  return null
}
