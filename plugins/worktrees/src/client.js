export const inject = ['slots', 'locale', 'connection', 'sessions', 'uiWorkspace']

export function apply(ctx) {
  const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
  const { createWorktreeActions, initialState } = require('./client/actions.js')
  const { dictionaries } = require('./client/shared.jsx')
  const { WorkLocation, WorktreeDock } = require('./client/location.jsx')
  const { ForkDialog, TurnTail } = require('./client/conversation.jsx')
  const { SettingsPage } = require('./client/settings.jsx')
  const stylesheetModule = require('./client.css?inline')
  const stylesheet = stylesheetModule.default ?? stylesheetModule

  const state = createSnapshotStore(structuredClone(initialState))
  const forkRequest = createSnapshotStore(null)
  const actions = createWorktreeActions(ctx, state, forkRequest)
  const hooks = () => ({ hooks: { worktreeState: state } })
  const contribute = (name, label, register) => ctx.effect(() => ctx.slots.inject(name, register), label)

  ctx.effect(() => ctx.locale.register('worktrees', dictionaries), 'worktrees: dictionaries')
  contribute('conversation.hero.options', 'worktrees: hero location', () => ctx.slots.register({
    name: 'conversation.hero.options', id: 'worktree-location', inject: () => ({ ...hooks(), actions }),
  }, WorkLocation))
  contribute('conversation.input.dock', 'worktrees: active location', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'worktree-location-active', order: 0,
    inject: () => ({ ...hooks(), actions, activeOnly: true }),
  }, WorkLocation))
  contribute('conversation.input.dock', 'worktrees: pending note', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'worktree-pending', order: 10, inject: () => ({ ...hooks(), actions }),
  }, WorktreeDock))
  contribute('conversation.chat.node', 'worktrees: single fork action', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'turn-tail', priority: -100,
    inject: () => ({ hooks: { performanceUsage: createSnapshotStore('detailed'), worktreeState: state }, actions }),
    children: {
      'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
      'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
    },
  }, TurnTail))
  contribute('shell.overlay', 'worktrees: dialog', () => ctx.slots.register({
    name: 'shell.overlay', id: 'worktree-fork-dialog', inject: () => ({ hooks: { forkRequest }, actions }),
  }, ForkDialog))
  contribute('settings.section', 'worktrees: settings', () => ctx.slots.register({
    name: 'settings.section', id: 'worktrees', order: 90, label: () => 'Worktrees', locale: 'worktrees',
    inject: () => ({ ...hooks(), actions }),
  }, SettingsPage))
  ctx.effect(() => {
    if (typeof document === 'undefined') return
    const style = document.createElement('style')
    style.dataset.plugin = 'worktrees'
    style.textContent = stylesheet
    document.head.appendChild(style)
    return () => style.remove()
  }, 'worktrees: stylesheet')
}
