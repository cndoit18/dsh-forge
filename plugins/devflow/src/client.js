window.__ModuleLoader__.load({
  id: '@dshforge/devflow',
  factory(require) {
    const React = require('react')
    const css = "button[data-devflow-command='batch']::before,button[data-devflow-command='debug']::before,button[data-devflow-command='deep-research']::before,button[data-devflow-command='init']::before,button[data-devflow-command='review']::before,button[data-devflow-command='run']::before,button[data-devflow-command='security-review']::before,button[data-devflow-command='simplify']::before,button[data-devflow-command='verify']::before{content:\"\";display:inline-block;width:14px;height:14px;flex:0 0 14px;background:var(--dsw-alias-menu-icon);-webkit-mask:var(--devflow-icon) center/contain no-repeat;mask:var(--devflow-icon) center/contain no-repeat;}button[data-devflow-command='batch']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M6%203v12%22%2F%3E%3Ccircle%20cx%3D%226%22%20cy%3D%2218%22%20r%3D%223%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%226%22%20r%3D%223%22%2F%3E%3Cpath%20d%3D%22M18%209a9%209%200%200%201-9%209%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='debug']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M12%2020v-8%22%2F%3E%3Cpath%20d%3D%22M12%2012V8%22%2F%3E%3Cpath%20d%3D%22M12%2020a2%202%200%200%201-2-2v-4a2%202%200%200%201%202-2%202%202%200%200%201%202%202v4a2%202%200%200%201-2%202Z%22%2F%3E%3Cpath%20d%3D%22M10%206%209%204%22%2F%3E%3Cpath%20d%3D%22m14%206%201-2%22%2F%3E%3Cpath%20d%3D%22M4%2013H2%22%2F%3E%3Cpath%20d%3D%22m4%207-2-1%22%2F%3E%3Cpath%20d%3D%22m4%2019-2%201%22%2F%3E%3Cpath%20d%3D%22M20%2013h2%22%2F%3E%3Cpath%20d%3D%22m20%207%202-1%22%2F%3E%3Cpath%20d%3D%22m20%2019%202%201%22%2F%3E%3Cpath%20d%3D%22m15%2015%205%203-5%203Z%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='deep-research']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m17%2017-2.5%202.5%22%2F%3E%3Cpath%20d%3D%22m22%2022-4-4%22%2F%3E%3Ccircle%20cx%3D%229%22%20cy%3D%229%22%20r%3D%227%22%2F%3E%3Cpath%20d%3D%22m9%207-2%202%202%202%22%2F%3E%3Cpath%20d%3D%22m13%207%202%202-2%202%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='init']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M2%204.5A2.5%202.5%200%200%201%204.5%202H11v20H4.5A2.5%202.5%200%200%200%202%2019.5Z%22%2F%3E%3Cpath%20d%3D%22M22%204.5A2.5%202.5%200%200%200%2019.5%202H13v20h6.5a2.5%202.5%200%200%201%202.5-2.5Z%22%2F%3E%3Cpath%20d%3D%22m8%2012%202%202%204-4%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='review']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M14%202H6a2%202%200%200%200-2%202v16a2%202%200%200%200%202%202h12a2%202%200%200%200%202-2V8Z%22%2F%3E%3Cpath%20d%3D%22M14%202v6h6%22%2F%3E%3Ccircle%20cx%3D%2211.5%22%20cy%3D%2214.5%22%20r%3D%222.5%22%2F%3E%3Cpath%20d%3D%22m13.3%2016.3%202.2%202.2%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='run']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4.5%2016.5c-1.5%201.5-1.5%204.5-1.5%204.5s3%200%204.5-1.5%22%2F%3E%3Cpath%20d%3D%22M9%2015%204%2020%22%2F%3E%3Cpath%20d%3D%22M14%204c3-3%207-2%207-2s1%204-2%207l-5%205-5-5Z%22%2F%3E%3Cpath%20d%3D%22m9%209-4-1-2%202%204%204%204%204%202-2-1-4%22%2F%3E%3Ccircle%20cx%3D%2215%22%20cy%3D%226%22%20r%3D%221%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='security-review']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%2013c0%205-3.5%207.5-8%209-4.5-1.5-8-4-8-9V5l8-3%208%203Z%22%2F%3E%3Cpath%20d%3D%22m9%2012%202%202%204-4%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='simplify']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m15%204%201%202%202%201-2%201-1%202-1-2-2-1%202-1Z%22%2F%3E%3Cpath%20d%3D%22m5%2015%201%202%202%201-2%201-1%202-1-2-2-1%202-1Z%22%2F%3E%3Cpath%20d%3D%22m3%203%2018%2018%22%2F%3E%3Cpath%20d%3D%22M9%203%203%209%22%2F%3E%3C%2Fsvg%3E\");}button[data-devflow-command='verify']{--devflow-icon:url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M10%206h11%22%2F%3E%3Cpath%20d%3D%22M10%2012h11%22%2F%3E%3Cpath%20d%3D%22M10%2018h11%22%2F%3E%3Cpath%20d%3D%22m3%206%201%201%202-2%22%2F%3E%3Cpath%20d%3D%22m3%2012%201%201%202-2%22%2F%3E%3Cpath%20d%3D%22m3%2018%201%201%202-2%22%2F%3E%3C%2Fsvg%3E\");}"
    const commands = ['batch', 'debug', 'deep-research', 'init', 'review', 'run', 'security-review', 'simplify', 'verify']
    const dictionaries = {
      zh: { batch: '批量', debug: '调试', 'deep-research': '深度研究', init: '初始化', review: '审查', run: '运行', 'security-review': '安全审查', simplify: '简化', verify: '验证', 'commandInput.aria': '指令输入' },
      en: { batch: 'Batch', debug: 'Debug', 'deep-research': 'Deep research', init: 'Init', review: 'Review', run: 'Run', 'security-review': 'Security review', simplify: 'Simplify', verify: 'Verify', 'commandInput.aria': 'Command input' },
    }
    const aliasSelectors = commands.map(command => `button[data-devflow-command='${command}'] > span:first-child`).join(',')
    const aliasBeforeSelectors = commands.map(command => `button[data-devflow-command='${command}'] > span:first-child::before`).join(',')
    const aliasStyles = `${aliasSelectors}{flex:none;max-width:20%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;}${aliasBeforeSelectors}{color:var(--dsw-alias-label-primary);font-size:inherit;line-height:inherit;}`
    const updateCommandRows = () => {
      const menu = document.querySelector('[data-trigger-menu]')
      if (menu === null) return
      // Official option ids use filtered row indexes; the visible command name keeps its identity.
      for (const button of menu.querySelectorAll('button[id^="dsh-slash-option-command-"]')) {
        const command = button.querySelector(':scope > span:first-child')?.textContent ?? ''
        if (commands.includes(command)) button.dataset.devflowCommand = command
        else delete button.dataset.devflowCommand
      }
    }
    const commandInputDefinition = {
      kind: 'devflow-command-input',
      target: 'chat',
      match(event) {
        if (event.type === 'command/run' && commands.includes(event.data.name)) {
          return { id: String(event.data.commandId), role: 'start' }
        }
        if (event.type === 'user/message' && event.data.source.kind === 'devflow') {
          return { id: String(event.data.id), role: 'start', exclusive: true }
        }
        return null
      },
      start(_context, match) {
        if (match.event.type === 'user/message') return null
        const event = match.event
        return {
          seq: event.seq,
          time: event.time,
          command: event.data.name,
          text: `/${event.data.name}${(event.data.args ?? '').trimEnd()}`,
        }
      },
      update: context => context.state,
      buildViewNode(context) {
        if (context.state == null) return null
        return {
          key: context.key,
          kind: 'devflow-command-input',
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.seq - 0.1,
          location: context.start?.location ?? { kind: 'unresolved' },
          visibility: 'visible',
          data: { command: context.state.command, text: context.state.text },
        }
      },
    }
    function CommandInputView({ node, renderFactorySlot, t }) {
      const data = node.data
      return React.createElement('div', {
        'data-devflow-command-input': '',
        role: 'group',
        'aria-label': t('commandInput.aria'),
        style: { display: 'flex', justifyContent: 'flex-end' },
      }, React.createElement('div', {
        style: {
          maxWidth: 'min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%)',
          padding: '10px 16px',
          overflowWrap: 'anywhere',
          borderRadius: 'var(--dsw-radius-xl)',
          background: 'var(--dsw-specific-bubble)',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: 'var(--dsh-content-font-size, 14px)',
          lineHeight: 'calc(22px + var(--dsh-content-font-delta, 0px))',
          whiteSpace: 'pre-wrap',
        },
      }, renderFactorySlot('conversation.user.text', {
        text: data.text,
        facts: { commands: [{ start: 0, end: data.command.length + 1, name: data.command }] },
        interactive: false,
      })))
    }
    const exports = {}
    exports.inject = ['locale', 'slots', 'uiConversation']
    exports.apply = (ctx) => {
      ctx.uiConversation.events.register(commandInputDefinition)
      ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'devflow-command-input',
        locale: 'devflow',
      }, CommandInputView))
      ctx.effect(() => ctx.locale.register('devflow', dictionaries), 'devflow: dictionaries')
      const t = ctx.locale.bind('devflow')
      const update = () => {
        const localizedLabels = commands.map(command =>
          `button[data-devflow-command='${command}'] > span:first-child::before{content:${JSON.stringify(`${t(command)} `)};}`
        ).join('')
        let tag = document.querySelector('style[data-devflow-command-icons]')
        if (tag === null) {
          tag = document.createElement('style')
          tag.dataset.devflowCommandIcons = 'true'
          tag.dataset.plugin = 'dshforge-devflow'
          tag.dataset.pluginCss = 'commands.css'
          document.head.appendChild(tag)
        }
        tag.textContent = css + localizedLabels + aliasStyles
      }
      ctx.on('locale/change', update)
      update()
      ctx.effect(() => {
        const observer = new MutationObserver(updateCommandRows)
        updateCommandRows()
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        return () => {
          observer.disconnect()
          for (const button of document.querySelectorAll('[data-devflow-command]')) delete button.dataset.devflowCommand
        }
      }, 'devflow: command rows')
    }
    return exports
  },
})
