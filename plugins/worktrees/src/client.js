window.__ModuleLoader__.load({
  id: '@dshforge/worktrees',
  factory(require) {
    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const { Button, IconBranchOutlineRegular, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconCopyOutlineRegular, IconFolderOpenRegular, Menu, Modal, Tooltip, useClipboardCopy } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const NS = 'worktrees'
    const WORKTREE_CSS = /* WORKTREE_CSS */ ''
    const labels = {
      local: '本地', newTree: '新建本地工作树', pending: '新工作树', position: '工作位置',
      createOnSend: '发送首条消息时创建', base: '基于',
      notGit: '当前目录不是 Git 仓库',
      settings: 'Worktrees', creation: '创建与清理', root: '工作树根目录', defaultRoot: '当前版本固定使用仓库内 .agents/worktrees',
      fetch: '创建工作树前始终获取上游更新', fetchDetail: '启用后，创建前先获取上游更新',
      cleanup: '自动删除旧工作树', snapshot: '删除前保存恢复快照',
      keep: '保留工作树数量', keepDetail: '超出数量后清理最旧的工作树；当前或置顶聊天的工作树始终保留',
      confirm: '删除工作树前询问', confirmDetail: '确认路径和未提交改动后才会执行',
      managed: '已管理工作树', empty: '尚无工作树', refresh: '刷新工作树列表',
      forkTitle: '从这里创建聊天分支', forkDescription: '复制当前消息及之前的对话，不包含之后的消息。',
      branch: '在新对话中分支', branchUnavailable: '仅可从已完成轮次的最后一条消息分支', copy: '复制', copied: '已复制',
      original: '在原工作树中继续', originalDetail: '两个聊天共享当前工作树、文件及未提交改动。',
      independent: '在新工作树中创建', independentDetail: '聊天立即分叉；首次发送消息时，再创建独立工作树和 Git 分支。',
      shared: '两个聊天对文件的后续修改会相互可见。', cleanBase: '基于当前分支 HEAD 创建，不复制未提交改动，也不恢复历史代码状态。',
      cancel: '取消', fork: '创建聊天分支', save: '保存', delete: '删除', open: '打开聊天', immediate: '立即分叉', onSend: '发送时创建',

      settingsIntro: '为独立聊天配置代码环境，以及不再使用时的清理方式。',
      protected: '受保护', pinned: '已置顶', ready: '就绪', missing: '目录缺失', noRecovery: '不会删除非插件管理的目录', recent: '最近使用', chatCount: '个关联聊天',
    }
    const inject = ['slots', 'locale', 'connection', 'sessions', 'workspaces', 'uiWorkspace']
    const t = key => labels[key] ?? key
    const worktreeLabel = branch => /^worktree-([0-9a-f]{8})/.exec(branch)?.[0] ?? branch
    const recentLabel = value => new Date(value).toLocaleDateString()
    const emptyState = { repositories: {}, errors: {}, forkRequest: null, settings: null, items: [], deleteCandidate: null }
    const forkRequest = createSnapshotStore(null)

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: labels, en: labels }), 'worktrees: dictionaries')
      const state = createSnapshotStore(structuredClone(emptyState))
      const set = patch => state.set({ ...state.getSnapshot(), ...patch })
      const hooks = () => ({ hooks: { worktreeState: state } })
      const call = (endpoint, payload) => ctx.connection.rpc.call('/api', 'worktrees/' + endpoint, { args: payload === undefined ? {} : { request: payload } })
      const errorMessage = error => error instanceof Error ? error.message : String(error)
      const setError = (sessionId, message) => set({ errors: { ...state.getSnapshot().errors, [sessionId]: message } })
      async function select(sessionId, selection) {
        const result = await call('select', { sessionId, pending: selection === 'new' })
        if (!result.ok) throw new Error(result.error.message)
        await inspect(sessionId)
      }

      async function inspect(sessionId) {
        const result = await call('inspect', { sessionId })
        if (!result.ok) throw new Error(result.error.message)
        set({ repositories: { ...state.getSnapshot().repositories, [sessionId]: result.value } })
        return result.value
      }

      function WorkLocation({ sessionId, useSession, useWorktreeState, activeOnly = false }) {
        const [open, setOpen] = React.useState(false)
        const repository = useWorktreeState(value => value.repositories[sessionId])
        const selection = repository?.pendingSelection ? 'new' : 'local'
        const blank = useSession(snapshot => snapshot.blank)
        React.useEffect(() => { if (sessionId) void inspect(sessionId).catch(error => setError(sessionId, errorMessage(error))) }, [sessionId])
        if (activeOnly && blank) return null
        if (!sessionId || !repository) return null
        if (repository.managed && selection !== 'new') return h('div', { className: 'wt-location' },
          h('span', { className: 'wt-location-button wt-location-static wt-worktree', title: repository.managed.path },
            h(IconBranchOutlineRegular, { className: 'wt-location-icon', size: 16 }),
            h('span', { className: 'wt-location-label' }, 'worktree · ' + worktreeLabel(repository.managed.branch))))
        const pending = selection === 'new'
        const items = [
          { type: 'label', id: 'location-status', text: repository.git ? t('position') : t('notGit') },
          { id: 'local', label: t('local'), icon: h(IconFolderOpenRegular, { size: 16 }) },
          ...repository.git ? [{ id: 'new', label: h('span', { className: 'wt-menu-copy' },
            h('span', { className: 'wt-menu-name' }, t('newTree')),
            h('span', { className: 'wt-menu-description' }, t('createOnSend'))), icon: h(IconBranchOutlineRegular, { size: 16 }) }] : [],
        ]
        return h('div', { className: 'wt-location' },
          h(Menu, {
            open,
            items,
            selectedId: pending ? 'new' : 'local',
            onSelect: id => {
              if (repository.git) void select(sessionId, id === 'new' ? 'new' : 'local').catch(error => setError(sessionId, errorMessage(error)))
              setOpen(false)
            },
            onClose: () => setOpen(false),
            align: 'start', side: 'bottom', portal: true, className: 'wt-location-menu',
            anchor: h('button', {
              type: 'button', className: 'wt-location-button', 'aria-label': t('position'), 'data-pending': pending,
              'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => setOpen(value => !value),
            },
              h(repository.git ? IconBranchOutlineRegular : IconFolderOpenRegular, { className: 'wt-location-icon', size: 16 }),
              h('span', { className: 'wt-location-label' }, pending ? t('pending') : t('local')),
              h(IconChevronDownOutlineRegular, { className: 'wt-location-chevron', size: 12 })),
          }),
          repository.branch && h('span', { className: 'wt-context wt-base', title: repository.branch }, pending ? t('base') + ' ' + repository.branch : repository.branch))
      }

      function WorktreeDock({ sessionId, useSession, useWorktreeState }) {
        const repository = useWorktreeState(value => value.repositories[sessionId])
        const error = useWorktreeState(value => value.errors[sessionId])
        const running = useSession(snapshot => snapshot.running)
        const promptAttempted = useSession(snapshot => snapshot.promptAttempted)
        React.useEffect(() => { if (sessionId) void inspect(sessionId).catch(error => setError(sessionId, errorMessage(error))) }, [sessionId])
        React.useEffect(() => {
          if (sessionId && promptAttempted && !running) void inspect(sessionId).catch(error => setError(sessionId, errorMessage(error)))
        }, [sessionId, promptAttempted, running])
        React.useEffect(() => {
          if (!running || !repository?.pendingSelection) return
          const timer = setInterval(() => { void inspect(sessionId).catch(error => setError(sessionId, errorMessage(error))) }, 1000)
          return () => clearInterval(timer)
        }, [sessionId, running, repository?.pendingSelection])
        if (error) return h('p', { className: 'wt-error', role: 'alert' }, error)
        return null
      }

      function TurnTail({ node, sessionId, openFile, forkAt, renderSlot, useAccess, useChat, usePerformanceUsage, useWorktreeState }) {
        const data = node.data
        const repository = useWorktreeState(value => value.repositories[sessionId])
        const forkAllowed = useAccess('session/fork')
        const hasLaterChatNode = useChat(snapshot => {
          for (const key of snapshot.locations.getTurn(data.turn) ?? []) {
            const later = snapshot.nodes.get(key)
            if (later?.kind !== 'turn-tail' && later?.kind !== 'turn-process' && later?.kind !== 'turn-max-tokens'
              && (later?.anchorSeq ?? -1) > (data.closing?.finalNode.seq ?? data.seq)) return true
          }
          return false
        })
        const detailed = usePerformanceUsage(mode => mode) === 'detailed'
        const owner = { turn: node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined, seq: data.closing?.finalNode.seq ?? data.seq, openFile }
        const tail = renderSlot('conversation.chat.turnTail', owner)
        if (!data.closing) return tail
        const unavailable = data.branchUnavailable || hasLaterChatNode
        const onBranch = repository?.managed
          ? () => forkRequest.set({ sessionId, atSeq: data.seq })
          : () => forkAt(data.seq)
        return h('div', { className: 'wt-turn-tail', 'data-turn-tail': data.turn },
          tail,
          h(MessageActions, {
            text: data.closing.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join(''),
            time: data.closing.time,
            onBranch: forkAllowed ? onBranch : undefined,
            unavailable,
            extraActions: data.closing.finalNode.messageId === undefined ? null : renderSlot('conversation.chat.assistant-actions', { messageId: data.closing.finalNode.messageId }),
            usage: detailed ? data.tokenUsage : undefined,
          }))
      }

      function MessageActions({ text, time, onBranch, unavailable, extraActions, usage }) {
        const { copied, onCopy } = useClipboardCopy(text)
        const reasonId = React.useId()
        return h('div', { className: 'wt-message-actions', 'data-clock': 'end' },
          h(Tooltip, { label: copied ? t('copied') : t('copy'), side: 'bottom' },
            h('button', { type: 'button', className: 'wt-action', 'aria-label': copied ? t('copied') : t('copy'), onClick: onCopy },
              copied ? h(IconCheckOutlineRegular) : h(IconCopyOutlineRegular))),
          extraActions,
          onBranch && h(Tooltip, { label: unavailable ? t('branchUnavailable') : t('branch'), side: 'bottom', openOnClick: unavailable },
            h('button', { type: 'button', className: 'wt-action', 'aria-label': t('branch'), 'aria-disabled': unavailable || undefined, 'aria-describedby': unavailable ? reasonId : undefined, 'data-unavailable': unavailable || undefined, onClick: unavailable ? undefined : onBranch },
              h(IconBranchOutlineRegular))),
          onBranch && unavailable && h('span', { id: reasonId, className: 'wt-visually-hidden' }, t('branchUnavailable')),
          h('span', { className: 'wt-end-info' }, usage && h('span', { className: 'wt-usage' }, usage.totalTokens + ' tok'), time && h('span', { className: 'wt-time' }, new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))))
      }

      function ForkDialog({ useForkRequest }) {
        const request = useForkRequest(value => value)
        const [isolate, setIsolate] = React.useState(false)
        if (!request) return null
        const close = () => forkRequest.set(null)
        const confirm = async () => {
          try {
            if (!isolate) {
              const childId = await ctx.sessions.fork({ sessionId: request.sessionId, atSeq: request.atSeq, increaseTitle: true })
              const adopted = await call('adopt', { sessionId: request.sessionId, childId })
              if (!adopted.ok) throw new Error(adopted.error.message)
              ctx.uiWorkspace.openSession(childId)
            } else {
              const result = await call('fork', { ...request, isolate: true })
              if (!result.ok) throw new Error(result.error.message)
              await select(result.value.sessionId, 'new')
              ctx.uiWorkspace.openSession(result.value.sessionId)
            }
            close()
          } catch (error) { setError(request.sessionId, errorMessage(error)) }
        }
        return h(Modal, { open: true, onClose: close, title: t('forkTitle'), closeLabel: t('cancel'), description: t('forkDescription'), className: 'wt-fork-modal' },
          h('div', { className: 'wt-fork-options', role: 'radiogroup', 'aria-label': t('position') },
            h('button', { className: 'wt-fork-option', role: 'radio', 'aria-checked': !isolate, onClick: () => setIsolate(false) },
              h('strong', null, t('original'), h('small', null, t('immediate'))), h('p', null, t('originalDetail'))),
            h('button', { className: 'wt-fork-option', role: 'radio', 'aria-checked': isolate, onClick: () => setIsolate(true) },
              h('strong', null, t('independent'), h('small', null, t('onSend'))), h('p', null, t('independentDetail')))),
          h('p', { className: 'wt-help' }, isolate ? t('cleanBase') : t('shared')),
          h('div', { className: 'wt-dialog-actions' },
            h(Button, { onClick: close }, t('cancel')),
            h(Button, { variant: 'primary', onClick: () => { void confirm() } }, t('fork'))))
      }

      function Toggle({ label, detail, checked, onChange }) {
        return h('div', { className: 'wt-setting' }, h('span', null, h('strong', null, label), h('small', null, detail)),
          h('button', { className: 'wt-switch', role: 'switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) }))
      }

      function SettingsPage({ useWorktreeState }) {
        const snapshot = useWorktreeState(value => value)
        React.useEffect(() => { void loadSettings(); void loadItems() }, [])
        const settings = snapshot.settings
        if (!settings) return h('p', null, '…')
        const change = (key, value) => set({ settings: { ...settings, [key]: value } })
        const creationRows = [
          h('label', { className: 'wt-setting', key: 'root' },
            h('span', null, h('strong', null, t('root')), h('small', null, t('defaultRoot'))),
            h('input', { value: '.agents/worktrees', readOnly: true, 'aria-label': t('root') })),
          h(Toggle, { key: 'fetch', label: t('fetch'), detail: t('fetchDetail'), checked: settings.fetchBeforeCreate, onChange: value => change('fetchBeforeCreate', value) }),
          h(Toggle, { key: 'cleanup', label: t('cleanup'), detail: t('snapshot'), checked: settings.autoCleanup, onChange: value => change('autoCleanup', value) }),
          h('label', { className: 'wt-setting', key: 'keep' },
            h('span', null, h('strong', null, t('keep')), h('small', null, t('keepDetail'))),
            h('input', { type: 'number', min: 1, max: 999, disabled: !settings.autoCleanup, value: settings.keepCount, onChange: event => { change('keepCount', Number(event.currentTarget.value)) } })),
          h(Toggle, { key: 'confirm', label: t('confirm'), detail: t('confirmDetail'), checked: settings.confirmDelete, onChange: value => change('confirmDelete', value) }),
        ]
        const managedRows = snapshot.items.map(item => h('div', { className: 'wt-managed-row', key: item.path },
          h('div', null,
            h('strong', { title: item.branch }, worktreeLabel(item.branch)),
            h('small', { title: item.path }, item.path),
            h('small', null, item.sessionIds.length + ' ' + t('chatCount') + ' · ' + t('recent') + ' ' + recentLabel(item.lastUsedAt))),
          h('div', { className: 'wt-row-actions' },
            item.pinned && h('span', { className: 'wt-badge' }, t('pinned')),
            item.protected && h('span', { className: 'wt-badge' }, t('protected')),
            item.status === 'missing' && h('span', { className: 'wt-badge' }, t('missing')),
            h(Button, { onClick: () => openWorktree(item) }, t('open')),
            h(Button, { disabled: item.protected, onClick: () => set({ deleteCandidate: item }) }, t('delete')))))
        return h('div', { className: 'wt-settings' },
          h('h1', null, t('settings')),
          h('p', { className: 'wt-help' }, t('settingsIntro')),
          h('section', null,
            h('h2', null, t('creation')),
            h('div', { className: 'wt-settings-card' }, creationRows)),
          h('section', null,
            h('div', { className: 'wt-section-heading' },
              h('h2', null, t('managed')),
              h(Button, { 'aria-label': t('refresh'), onClick: () => { void loadItems() } }, '↻')),
            h('div', { className: 'wt-settings-card' }, managedRows.length ? managedRows : h('p', { className: 'wt-help' }, t('empty')))),
          h('div', { className: 'wt-dialog-actions' },
            h(Button, { variant: 'primary', onClick: () => { void saveSettings() } }, t('save'))),
          snapshot.error && h('p', { className: 'wt-error', role: 'alert' }, snapshot.error),
          snapshot.deleteCandidate && h(Modal, { open: true, title: t('delete'), closeLabel: t('cancel'), onClose: () => set({ deleteCandidate: null }) },
            h('p', null, snapshot.deleteCandidate.branch),
            h('p', { className: 'wt-help' }, snapshot.deleteCandidate.path),
            h('p', { className: 'wt-help' }, t('snapshot') + ' · ' + t('noRecovery')),
            h('div', { className: 'wt-dialog-actions' },
              h(Button, { onClick: () => set({ deleteCandidate: null }) }, t('cancel')),
              h(Button, { variant: 'primary', onClick: () => { void remove(snapshot.deleteCandidate) } }, t('delete')))))
      }

      async function loadSettings() {
        const result = await call('settingsRead')
        if (result.ok) set({ settings: result.value })
        else set({ error: result.error.message })
      }
      async function saveSettings() {
        const result = await call('settingsWrite', state.getSnapshot().settings)
        if (result.ok) { set({ settings: result.value, error: null }); await loadItems() }
        else set({ error: result.error.message })
      }
      async function loadItems() {
        const result = await call('list', {})
        if (result.ok) set({ items: result.value })
        else set({ error: result.error.message })
      }
      async function remove(item) {
        const result = await call('remove', { path: item.path, confirmed: true })
        if (result.ok) { set({ deleteCandidate: null }); await loadItems() }
        else set({ error: result.error.message })
      }
      function openWorktree(item) {
        if (item.sessionIds[0]) ctx.uiWorkspace.openSession(item.sessionIds[0])
        else set({ error: '没有关联的聊天，无法打开该工作树' })
      }

      ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'worktree-location', inject: hooks }, WorkLocation)), 'worktrees: hero location')
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'worktree-location-active', order: 0, inject: () => ({ ...hooks(), activeOnly: true }) }, WorkLocation)), 'worktrees: active location')
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'worktree-pending', order: 10, inject: hooks }, WorktreeDock)), 'worktrees: pending note')
      ctx.effect(() => ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node', key: 'turn-tail', priority: -100, inject: () => ({ hooks: { performanceUsage: createSnapshotStore('detailed'), worktreeState: state } }),
        children: {
          'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
          'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
        },
      }, TurnTail)), 'worktrees: single fork action')
      ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'worktree-fork-dialog', inject: () => ({ hooks: { forkRequest } }) }, ForkDialog)), 'worktrees: dialog')
      ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: NS, order: 90, label: () => t('settings'), locale: NS, inject: hooks }, SettingsPage)), 'worktrees: settings')
      if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin="worktrees"]')) {
        const style = document.createElement('style')
        style.dataset.plugin = 'worktrees'
        style.textContent = WORKTREE_CSS
        document.head.appendChild(style)
      }
    }
    return { inject, apply }
  },
})