window.__ModuleLoader__.load({
  id: '@dshforge/devflow',
  factory(require) {
    const React = require('react')
    const commands = ['batch', 'debug', 'deep-research', 'init', 'review', 'run', 'security-review', 'simplify', 'verify']
    const css = [
      '.dshforge-devflow-command-input{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}',
      '.dshforge-devflow-command-input__stack{display:flex;flex-direction:column;align-items:flex-end;min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px)*0.702),82%);}',
      '.dshforge-devflow-command-input__bubble{max-width:100%;padding:10px 16px;overflow-wrap:anywhere;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-bubble);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));white-space:pre-wrap;}',
    ].join('')
    const tagId = 'dshforge-devflow/command-input.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dshforge-devflow'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function CommandInputView({ node, renderFactorySlot, t }) {
      const data = node.data
      return React.createElement('div', {
        className: 'dshforge-devflow-command-input',
        'data-devflow-command-input': '',
        role: 'group',
        'aria-label': t('commandInput.aria'),
      }, React.createElement('div', {
        className: 'dshforge-devflow-command-input__stack',
      }, React.createElement('div', {
        className: 'dshforge-devflow-command-input__bubble',
      }, renderFactorySlot('conversation.user.text', {
        text: data.text,
        facts: { commands: [{ start: 0, end: data.command.length + 1, name: data.command }] },
        interactive: false,
      }))))
    }

    const exports = {}
    exports.inject = ['locale', 'slots', 'uiConversation']
    exports.apply = (ctx) => {
      // command/done has no name. Keep the IDs accepted at command/run so only
      // DevFlow settlements are claimed; unrelated commands retain the official renderer.
      const commandIds = new Set()
      const commandInputDefinition = {
        kind: 'devflow-command-input',
        target: 'chat',
        match(event) {
          if (event.type === 'command/run' && commands.includes(event.data.name)
            && typeof event.data.args === 'string') {
            return { id: String(event.data.commandId), role: 'start', exclusive: true }
          }
          if (event.type === 'command/done' && commandIds.has(String(event.data.commandId))) {
            return { id: String(event.data.commandId), role: 'update', exclusive: true }
          }
          if (event.type === 'user/message' && event.data.source.kind === 'workflow'
            && commands.includes(event.data.source.name)
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
            args: event.data.args,
            seq: event.seq,
            time: event.time,
            text: `/${event.data.name}${event.data.args.trimEnd()}`,
            outcome: null,
          }
        },
        update(context, match) {
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
            anchorSeq: state.seq - 0.1,
            location: context.start?.location ?? { kind: 'unresolved' },
            visibility: 'visible',
          }
          if (state.outcome?.kind === 'error') {
            return {
              ...base,
              kind: 'command',
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
          }
          return {
            ...base,
            kind: 'devflow-command-input',
            data: { command: state.command, text: state.text },
          }
        },
      }
      ctx.uiConversation.events.register(commandInputDefinition)
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'devflow-command-input',
        locale: 'devflow',
      }, CommandInputView))
      ctx.effect(() => ctx.locale.register('devflow', {
        zh: { 'commandInput.aria': '指令输入' },
        en: { 'commandInput.aria': 'Command input' },
      }), 'devflow: dictionaries')
      ctx.effect(() => () => commandIds.clear(), 'devflow: command input cleanup')
    }
    return exports
  },
})
