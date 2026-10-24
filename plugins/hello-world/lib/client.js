/**
 * dsh-forge hello-world plugin, browser bundle.
 *
 * Hand-written lazy-CJS client bundle (the same artifact tsdown's client
 * preset emits): the script registers a closure factory with the shell's
 * module loader, externals resolve through the injected module-table require
 * against the platform seed, and the returned exports are the client plugin
 * (named `inject`/`apply` only — a default export would be discarded).
 * The bundle must stay dependency-free: no build step runs for this package.
 */
window.__ModuleLoader__.load({
  id: 'dsh-forge-plugin-hello-world',
  factory(require) {
    const React = require('react')

    // One plugin-owned stylesheet, tagged exactly like the tsdown client
    // preset tags emitted styles so entry teardown removes it by data-plugin.
    const css = [
      '.dsh-forge-hello-world{',
      'display:flex;',
      'align-items:center;',
      'gap:8px;',
      'box-sizing:border-box;',
      'width:100%;',
      'height:40px;',
      'padding:0 16px;',
      'flex-shrink:0;',
      'user-select:none;',
      'background:var(--dsw-specific-tip,#f5f6f7);',
      'box-shadow:0 -0.5px 0 0 var(--dsw-alias-border-l2,rgba(0,0,0,0.1));',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif;',
      'font-size:13px;',
      'line-height:20px;',
      'color:var(--dsw-alias-label-primary,#0f1115);',
      '}',
      '.dsh-forge-hello-world__dot{',
      'width:8px;',
      'height:8px;',
      'border-radius:999px;',
      'flex-shrink:0;',
      'background:var(--dsw-alias-state-success-primary,#22c55e);',
      '}',
      '.dsh-forge-hello-world__title{',
      'font-weight:500;',
      'white-space:nowrap;',
      '}',
      '.dsh-forge-hello-world__meta{',
      'overflow:hidden;',
      'text-overflow:ellipsis;',
      'white-space:nowrap;',
      'font-size:12px;',
      'color:var(--dsw-alias-label-secondary,#61666b);',
      '}',
    ].join('')
    const tagId = 'dsh-forge-plugin-hello-world/banner.css'
    if (typeof document !== 'undefined'
      && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-forge-plugin-hello-world'
      tag.dataset.pluginCss = tagId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    /** One quiet status row: a green live dot, a title, and one metadata line. */
    function HelloWorldBar() {
      return React.createElement('div', { className: 'dsh-forge-hello-world', role: 'status' },
        React.createElement('span', { className: 'dsh-forge-hello-world__dot' }),
        React.createElement('span', { className: 'dsh-forge-hello-world__title' }, 'Hello, World'),
        React.createElement('span', { className: 'dsh-forge-hello-world__meta' },
          'dsh-forge 插件已挂载 · 占据 shell.bottom 席位'))
    }

    const exports = {}
    exports.inject = ['slots']
    exports.apply = (ctx) => {
      // shell.bottom is a root-scoped single slot: full-width content below
      // all three columns, mounted across main-panel navigation, so the bar
      // is visible on every screen including the empty state.
      ctx.slots.inject('shell.bottom', () => ctx.slots.register(
        { name: 'shell.bottom' },
        HelloWorldBar,
      ))
    }
    return exports
  },
})
