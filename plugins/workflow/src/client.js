window.__ModuleLoader__.load({
  id: '@dshforge/workflow',
  factory(require) {
    const React = require('react')
    const css = [
      '.dshforge-workflow-command-input{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
      '.dshforge-workflow-command-input__stack{display:flex;flex-direction:column;align-items:flex-end;min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px)*0.702),82%);}',
      '.dshforge-workflow-command-input__bubble{max-width:100%;padding:10px 16px;overflow-wrap:anywhere;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-bubble);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;}',
    ].join('')
    const tagId = 'dshforge-workflow/command-input.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dshforge-workflow'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function WorkflowCommandInputView({ node, renderFactorySlot, t }) {
      const data = node.data
      return React.createElement('div', {
        className: 'dshforge-workflow-command-input',
        'data-workflow-command-input': '',
        role: 'group',
        'aria-label': t('commandInput.aria'),
      }, React.createElement('div', {
        className: 'dshforge-workflow-command-input__stack',
      }, React.createElement('div', {
        className: 'dshforge-workflow-command-input__bubble',
      }, renderFactorySlot('conversation.user.text', {
        text: data.text,
        facts: { commands: [{ start: 0, end: data.command.length + 1, name: data.command }] },
        interactive: false,
      }))))
    }

    const exports = {}
    exports.inject = ['locale', 'slots', 'uiConversation']
    exports.apply = (ctx) => {
      // Goal and Compact already own their command input presentation. Other
      // commands retain the generic card unless a workflow event claims their ID.
      const officialInputCommands = new Set(['goal', 'compact'])
      const commandIds = new Set()
      const workflowCommandDefinition = {
        kind: 'workflow-command-input',
        target: 'chat',
        match(event) {
          if (event.type === 'command/run' && !officialInputCommands.has(event.data.name)) {
            return { id: String(event.data.commandId), role: 'start', exclusive: true }
          }
          if (event.type === 'workflow/command' && commandIds.has(String(event.data.commandId))) {
            return { id: String(event.data.commandId), role: 'update' }
          }
          if (event.type === 'command/done' && commandIds.has(String(event.data.commandId))) {
            return { id: String(event.data.commandId), role: 'update', exclusive: true }
          }
          if (event.type === 'user/message' && event.data.source.kind === 'workflow'
            && commandIds.has(String(event.data.source.commandId))) {
            return { id: 'followup:' + String(event.data.id), role: 'start', exclusive: true }
          }
          return null
        },
        start(_context, match) {
          if (match.event.type === 'user/message') return null
          const event = match.event
          commandIds.add(String(event.data.commandId))
          return {
            commandId: event.data.commandId,
            command: event.data.name,
            args: event.data.args ?? null,
            seq: event.seq,
            time: event.time,
            text: '',
            workflow: false,
            outcome: null,
          }
        },
        update(context, match) {
          if (match.event.type === 'workflow/command') {
            return {
              ...context.state,
              text: `/${match.event.data.name}${match.event.data.args.trimEnd()}`,
              workflow: true,
            }
          }
          if (match.event.type !== 'command/done') return context.state
          return {
            ...context.state,
            outcome: {
              kind: match.event.data.kind,
              ...match.event.data.text === undefined ? {} : { text: match.event.data.text },
            },
          }
        },
        buildViewNode(context) {
          const state = context.state
          if (state == null) return null
          const base = {
            key: context.key,
            id: context.id,
            target: 'chat',
            location: context.start?.location ?? { kind: 'unresolved' },
            visibility: 'visible',
          }
          if (state.workflow && state.outcome?.kind !== 'error') {
            return {
              ...base,
              kind: 'workflow-command-input',
              anchorSeq: state.seq - 0.1,
              data: { command: state.command, text: state.text },
            }
          }
          return {
            ...base,
            kind: 'command',
            anchorSeq: state.seq,
            data: {
              kind: 'command',
              seq: state.seq,
              time: state.time,
              commandId: state.commandId,
              name: state.command,
              args: state.args,
              outcome: state.outcome,
            },
          }
        },
      }
      ctx.uiConversation.events.register(workflowCommandDefinition)
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'workflow-command-input',
        locale: 'dsh-workflow',
      }, WorkflowCommandInputView))
      ctx.effect(() => ctx.locale.register('dsh-workflow', {
        zh: { 'commandInput.aria': '指令输入' },
        en: { 'commandInput.aria': 'Command input' },
      }), 'dsh-workflow: dictionaries')
      ctx.effect(() => () => commandIds.clear(), 'dsh-workflow: command input cleanup')
    }
    return exports
  },
})
