import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'

window.__ModuleLoader__.load({
  id: '@dshforge/agent-plugins',
  factory(require) {
    const React = require('react')
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store')
    const {
      FileTypeIcon,
      Button,
      Modal,
      IconWarningOutlineRegular,
      IconChevronDownOutlineRegular,
      IconChevronLeftOutlineRegular,
      IconSearchOutlineRegular,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const NS = 'agentPlugins'
    const en = {
      nav: 'Agent plugins', title: 'Agent plugins', intro: 'Inspect plugins and capabilities in ~/.agent/plugins/',
      search: 'Search plugins', emptySearch: 'No matching plugins.',
      loading: 'Loading Agent Plugins…', failed: 'Agent Plugins could not be loaded.', retry: 'Retry',
      back: 'Agent plugins', overview: 'Overview', skills: 'Skills', mcp: 'MCP', files: 'Files',
      version: 'Version', author: 'Author', license: 'License', spec: 'Specification', description: 'Description',
noSkills: 'This plugin provides no Skills.', noMcp: 'This plugin configures no MCP servers.',
      noFiles: 'This plugin has no previewable files.',
      limited: 'Only the first 200 entries are shown.', emptyDirectory: 'This directory is empty.',
      previewNoSession: 'Open a Session before using DSH Preview.',
      manifest: 'Manifest', installPath: 'Install path', invalid: 'Invalid', warning: 'Warning',
      install: 'Install from Git', installTitle: 'Install Agent Plugin from Git',
      installHint: 'Use an HTTPS .git or git@host:path address. Add #ref and &path:/subdirectory when needed.',
      installPlaceholder: 'https://github.com/org/repo.git&path:/plugins/demo',
      installing: 'Installing from Git…', cancel: 'Cancel', installFailed: 'Git installation failed.',
      close: 'Close', installDescription: 'Enter a GitHub repository URL, with an optional ref and package subdirectory.',
      installSafety: 'Only install plugins you trust. No install scripts run, but enabled plugin code can act with your permissions.',
      installExamples: 'Installation examples',
      installGuide: 'Installation guide', installGuideTitle: 'Git repository address',
      installGuideDescription: 'Use HTTPS .git or SCP-style git@host:path, with optional #ref and &path:/subdirectory. Example: https://github.com/agentplugins/agent-plugins-example.git',
      fillExample: 'Fill example',
    }
    const zh = {
      nav: 'Agent 插件', title: 'Agent 插件', intro: '查看 ~/.agent/plugins/ 中的插件及其能力',
      search: '搜索插件', emptySearch: '没有找到匹配的插件。',
      loading: '正在加载 Agent 插件…', failed: 'Agent 插件加载失败。', retry: '重试',
      back: 'Agent 插件', overview: '概览', skills: 'Skills', mcp: 'MCP', files: '文件',
      version: '版本', author: '作者', license: '许可证', spec: '规范', description: '描述',
noSkills: '此插件未提供 Skills。', noMcp: '此插件未配置 MCP 服务器。',
      noFiles: '此插件没有可预览的文件。',
      limited: '仅显示前 200 项。', emptyDirectory: '此目录为空。',
      previewNoSession: '请先打开一个会话，再使用 DSH 预览。',
      manifest: 'Manifest', installPath: '安装路径', invalid: '无效', warning: '警告',
      install: '从 Git 安装', installTitle: '从 Git 安装 Agent 插件',
      installHint: '支持 HTTPS .git 或 git@host:path，可附加 #ref 和 &path:/子目录。',
      installPlaceholder: 'https://github.com/org/repo.git&path:/plugins/demo',
      installing: '正在从 Git 安装…', cancel: '取消', installFailed: 'Git 安装失败。',
      close: '关闭', installDescription: '输入 GitHub 仓库地址，可指定 ref 和插件子目录。',
      installSafety: '请确认插件来源可信。安装不执行脚本，但启用后，插件代码可按你的权限运行并读取数据。',
      installExamples: '安装示例',
      installGuide: '安装引导', installGuideTitle: '填入 Git 仓库地址',
      installGuideDescription: '支持 HTTPS .git 或 SCP-style git@host:path；可用 #ref 指定分支、标签或提交，用 &path:/子目录选择插件。示例：https://github.com/agentplugins/agent-plugins-example.git',
      fillExample: '填入示例',
    }
    const css = `
      .dsh-forge-agent-plugins{container:agent-plugins/inline-size;display:flex;flex-direction:column;gap:12px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
      .dsh-forge-agent-plugins *{box-sizing:border-box}
      .dsh-forge-agent-plugins button,.dsh-forge-agent-plugins input{font:inherit}
      .dsh-forge-agent-plugins button:focus-visible,.dsh-forge-agent-plugins input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
      .ap-heading{margin:0;font-size:18px;line-height:26px;font-weight:600}
      .ap-intro{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px}
      .ap-catalog{display:flex;flex-direction:column;gap:12px;margin-top:2px}
      .ap-search{position:relative;display:flex;align-items:center;color:var(--dsw-alias-label-tertiary)}
      .ap-search>svg{position:absolute;left:12px;width:16px;height:16px;pointer-events:none}
      .ap-search input{width:100%;height:36px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:0 34px 0 36px;outline:none;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px}
      .ap-search input::placeholder{color:var(--dsw-alias-label-tertiary)}
      .ap-search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}
      .ap-toolbar{display:flex;align-items:center;gap:8px}
      .ap-toolbar .ap-search{flex:1;min-width:0}
      .ap-button{display:inline-flex;align-items:center;justify-content:center;flex:none;min-height:32px;padding:4px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
      .ap-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .ap-button:disabled{opacity:.5;cursor:default}
      .ap-install-dialog{width:min(560px,100%);max-height:min(800px,100%)}
      .ap-install-form{display:flex;flex-direction:column;gap:12px}
      .ap-install-examples{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .ap-install-examples summary{display:flex;align-items:center;gap:4px;cursor:pointer;list-style:none}
      .ap-install-examples summary::-webkit-details-marker{display:none}
      .ap-guide-chevron{transition:transform 120ms ease}
      .ap-install-examples[open] .ap-guide-chevron{transform:rotate(180deg)}
      .ap-guide-card{display:flex;align-items:center;gap:12px;margin-top:10px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
      .ap-guide-content{display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
      .ap-guide-content strong{font-size:13px;line-height:20px;font-weight:500}
      .ap-guide-content p{margin:0;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .ap-guide-fill{flex:none}
      .ap-install-input{width:100%;height:40px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);padding:0 14px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
      .ap-install-footer{display:flex;flex-direction:column;gap:16px}
      .ap-install-safety{display:flex;align-items:flex-start;gap:8px;margin:0;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .ap-install-safety>svg{flex:none;margin-top:2px;color:var(--dsw-alias-state-warn-primary)}
      .ap-install-submit{width:100%}
      .ap-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
      .ap-card{min-width:0;overflow:hidden;border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill)}
      .ap-card-button{display:flex;flex-direction:column;align-items:stretch;gap:2px;width:100%;min-height:52px;padding:12px 14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
      .ap-card-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .ap-card-button:active{background:var(--dsw-alias-interactive-bg-active)}
      .ap-card-button:focus-visible{outline-offset:-2px!important}
      .ap-card-main{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0}
      .ap-card-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code);font-size:13px;font-weight:500}
      .ap-trailing{display:inline-flex;flex:none;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary)}
      .ap-version{font-size:11px;line-height:16px}
      .ap-description{display:-webkit-box;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;-webkit-box-orient:vertical;-webkit-line-clamp:2}
      .ap-meta{display:flex;align-items:center;gap:6px;margin-top:auto;padding-top:6px}
      .ap-meta code{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:var(--dsw-radius-xs);padding:1px 6px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:11px;line-height:18px}
      .ap-warning-dot{width:6px;height:6px;flex:none;border-radius:999px;background:var(--dsw-alias-state-warning-primary,#f59e0b)}
      .ap-status{margin:0;padding:28px 12px;color:var(--dsw-alias-label-tertiary);text-align:center}
      .ap-back{display:inline-flex;align-items:center;align-self:flex-start;gap:4px;height:28px;margin:0 0 2px -6px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
      .ap-back:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
      .ap-back svg{width:12px;height:12px}
      .ap-detail-header{display:flex;flex-direction:column;gap:6px}
      .ap-detail-title{margin:0;font-family:var(--ds-font-family-code);font-size:18px;line-height:26px;font-weight:600}
      .ap-detail-description{margin:0;color:var(--dsw-alias-label-secondary);font-size:13px}
      .ap-detail-meta{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .ap-detail-path{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .ap-detail-path code{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);overflow-wrap:anywhere}
      .ap-tabs{display:flex;align-items:flex-end;gap:22px;margin-top:2px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .ap-tab{position:relative;flex:none;border:0;padding:7px 1px 9px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:13px;cursor:pointer}
      .ap-tab[data-active=true]{color:var(--dsw-alias-label-primary)}
      .ap-tab[data-active=true]::after{position:absolute;right:0;bottom:-1px;left:0;height:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-label-primary);content:''}
      .ap-tab-count{margin-left:3px;color:var(--dsw-alias-label-tertiary);font-size:11px}
      .ap-panel{display:flex;flex-direction:column;gap:12px;min-width:0;padding-top:2px}
      .ap-subheading{margin:0;font-size:14px;line-height:22px;font-weight:500}
      .ap-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .ap-summary-item{display:flex;flex-direction:column;gap:2px;padding:12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform)}
      .ap-summary-value{font-size:16px;line-height:24px;font-weight:500}
      .ap-summary-label{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .ap-manifest{overflow:hidden;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2)}
      .ap-manifest-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .ap-manifest-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px;margin:0;padding:14px}
      .ap-manifest-grid>div{min-width:0}
      .ap-manifest-wide{grid-column:1/-1}
      .ap-manifest-grid dt{margin-bottom:2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
      .ap-manifest-grid dd{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
      .ap-link{padding:0;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font-size:12px;cursor:pointer;text-align:left}
      .ap-link:hover{text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}
      .ap-components{display:flex;flex-direction:column;border-top:.5px solid var(--dsw-alias-border-l2)}
      .ap-component{display:flex;flex-direction:column;gap:5px;padding:12px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .ap-component-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .ap-component-name{min-width:0;font-family:var(--ds-font-family-code);font-size:13px;font-weight:500;overflow-wrap:anywhere}
      .ap-component-description{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
      .ap-component-path{color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:17px;overflow-wrap:anywhere}
      .ap-tag{display:inline-flex;flex:none;align-items:center;border-radius:999px;padding:1px 7px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:10px;line-height:16px}
      .ap-config{border-radius:var(--dsw-radius-sm);padding:8px 10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px;line-height:19px;overflow-wrap:anywhere;white-space:pre-wrap}
      .ap-mcp-card{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform)}
      .ap-mcp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:0}
      .ap-mcp-field{min-width:0}
      .ap-mcp-field dt{margin-bottom:2px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}
      .ap-mcp-field dd{margin:0;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;overflow-wrap:anywhere}
      .ap-tree,.ap-tree-level{margin:0;padding:0;list-style:none}
      .ap-tree{display:flex;flex-direction:column;gap:2px}
      .ap-tree-level{display:flex;flex-direction:column;gap:2px}
      .ap-tree-row{display:flex;align-items:center;gap:6px;width:100%;min-height:32px;border:0;border-radius:var(--dsw-radius-sm);padding:4px 6px;background:transparent;color:inherit;text-align:left;cursor:pointer}
      .ap-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .ap-tree-row.is-selected{background:var(--dsw-alias-state-business-tertiary)}
      .ap-tree-row:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}
      .ap-tree-chevron{display:inline-flex;flex:none;align-items:center;justify-content:center;width:12px;height:12px;color:var(--dsw-alias-label-tertiary);transition:transform 100ms ease}
      .ap-tree-chevron.is-open{transform:rotate(180deg)}
      .ap-tree-spacer{width:12px;flex:none}
      .ap-tree-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px}
      .ap-tree-open{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px;opacity:0}
      .ap-tree-row:hover .ap-tree-open,.ap-tree-row.is-selected .ap-tree-open{opacity:.7}
      .ap-tree-message{padding:6px 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .ap-empty,.ap-error{margin:0;padding:16px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:13px}
      .ap-error{color:var(--dsw-alias-state-error-primary)}
      .ap-files{display:flex;flex-direction:column;gap:8px}
      .ap-file-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;padding:12px 14px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);text-align:left;cursor:pointer}
      .ap-file-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .ap-file-identity{display:flex;flex-direction:column;gap:2px;min-width:0}
      .ap-file-identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-font-family-code);font-size:12px;font-weight:500}
      .ap-file-identity span{color:var(--dsw-alias-label-tertiary);font-size:11px}
      .ap-file-open{flex:none;color:var(--dsw-alias-state-business-primary);font-size:12px}
      @container agent-plugins (max-width:520px){.ap-cards{grid-template-columns:minmax(0,1fr)}.ap-manifest-grid{grid-template-columns:minmax(0,1fr)}.ap-summary{grid-template-columns:1fr}}
    `

    function AgentPluginsSection({ t, useCatalog, reload, openFile, listDirectory, install, close }) {
      const snapshot = useCatalog(snapshot => snapshot)
      const [selectedId, setSelectedId] = React.useState()
      const [tab, setTab] = React.useState('overview')
      const [previewError, setPreviewError] = React.useState()
      const [installOpen, setInstallOpen] = React.useState(false)
      const [installSpec, setInstallSpec] = React.useState('')
      const [installState, setInstallState] = React.useState({ status: 'idle', error: undefined })
      if (snapshot.status === 'loading') return h('p', { className: 'ap-status' }, t('loading'))
      if (snapshot.status === 'failed') {
        return h('div', { className: 'ap-error' }, h('p', null, snapshot.error || t('failed')),
          h('button', { type: 'button', className: 'ap-link', onClick: reload }, t('retry')))
      }
      const plugins = snapshot.value?.plugins ?? []
      const selected = plugins.find(plugin => plugin.directoryName === selectedId)
      const openPreview = (path) => {
        const result = openFile(path)
        if (result.ok) {
          setPreviewError(undefined)
          close()
        } else {
          setPreviewError(result.message)
        }
      }
      const onInstall = async (event) => {
        event.preventDefault()
        setInstallState({ status: 'installing', error: undefined })
        try {
          const result = await install(installSpec)
          if (result.ok) {
            setInstallSpec('')
            setInstallOpen(false)
            setInstallState({ status: 'idle', error: undefined })
            await reload()
          } else {
            setInstallState({ status: 'failed', error: result.error.message })
          }
        } catch (error) {
          setInstallState({ status: 'failed', error: error instanceof Error ? error.message : String(error) })
        }
      }
      return h('div', { className: 'dsh-forge-agent-plugins' },
        previewError ? h('p', { className: 'ap-error', role: 'alert' }, previewError) : null,
        h(InstallDialog, {
          open: installOpen,
          t, spec: installSpec, state: installState,
          onSpec: setInstallSpec, onSubmit: onInstall,
          onCancel: () => { setInstallOpen(false); setInstallState({ status: 'idle', error: undefined }) },
        }),
        selected
          ? h(PluginDetail, {
              plugin: selected, t, tab, onTab: setTab,
              onBack: () => { setSelectedId(undefined); setTab('overview') },
              onOpenFile: openPreview, listDirectory,
            })
          : h(PluginList, {
              plugins, t,
              onSelect: (plugin) => { setSelectedId(plugin.directoryName); setTab('overview') },
              onInstall: () => setInstallOpen(true),
            }))
    }

    function PluginList({ plugins, t, onSelect, onInstall }) {
      const [query, setQuery] = React.useState('')
      const normalized = query.trim().toLocaleLowerCase()
      const matches = plugins.filter(plugin => `${plugin.name} ${plugin.directoryName} ${plugin.manifest?.description ?? ''}`.toLocaleLowerCase().includes(normalized))
      return h(React.Fragment, null,
        h('h2', { className: 'ap-heading' }, t('title')),
        h('p', { className: 'ap-intro' }, t('intro')),
        h('div', { className: 'ap-catalog' },
          h('div', { className: 'ap-toolbar' },
            h('label', { className: 'ap-search' },
              h(IconSearchOutlineRegular, { size: 16 }),
              h('input', {
                type: 'search', value: query, placeholder: t('search'), 'aria-label': t('search'),
                onChange: event => setQuery(event.currentTarget.value),
              })),
            h('button', { type: 'button', className: 'ap-button', onClick: onInstall }, t('install'))),
          plugins.length === 0 ? null
            : matches.length === 0 ? h('p', { className: 'ap-status' }, t('emptySearch'))
              : h('ul', { className: 'ap-cards' }, matches.map(plugin => h(PluginCard, { key: plugin.directoryName, plugin, onSelect, t })))))
    }

    function InstallDialog({ open, t, spec, state, onSpec, onSubmit, onCancel }) {
      const busy = state.status === 'installing'
      return h(Modal, {
        open, onClose: () => { if (!busy) onCancel() }, title: t('installTitle'), closeLabel: t('close'),
        description: t('installDescription'), className: 'ap-install-dialog',
        footer: h('div', { className: 'ap-install-footer' },
          h('p', { className: 'ap-install-safety', role: 'note' },
            h(IconWarningOutlineRegular, { size: 14 }),
            h('span', null, t('installSafety'))),
          h(Button, {
            variant: 'primary', className: 'ap-install-submit',
            disabled: busy || !spec.trim(), 'aria-busy': busy, onClick: onSubmit,
          }, busy ? t('installing') : t('install'))),
      },
        h('form', { className: 'ap-install-form', onSubmit },
          h('input', {
            className: 'ap-install-input', type: 'text', value: spec,
            placeholder: t('installPlaceholder'), 'aria-label': t('installTitle'), disabled: busy,
            'data-modal-autofocus': true,
            onChange: event => onSpec(event.currentTarget.value),
          }),
          state.error ? h('p', { className: 'ap-error', role: 'alert' }, `${t('installFailed')} ${state.error}`) : null,
          h('details', { className: 'ap-install-examples' },
            h('summary', null,
              h(IconChevronDownOutlineRegular, { size: 12, className: 'ap-guide-chevron' }),
              h('span', null, t('installGuide'))),
            h('div', { className: 'ap-guide-card' },
              h('div', { className: 'ap-guide-content' },
                h('strong', null, t('installGuideTitle')),
                h('p', null, t('installGuideDescription'))),
              h('button', {
                type: 'button', className: 'ap-button ap-guide-fill', disabled: busy,
                onClick: () => onSpec('https://github.com/agentplugins/agent-plugins-example.git'),
              }, t('fillExample'))))))
    }

    function PluginCard({ plugin, onSelect, t }) {
      const manifest = plugin.manifest
      return h('li', { className: 'ap-card' },
        h('button', { type: 'button', className: 'ap-card-button', onClick: () => onSelect(plugin) },
          h('span', { className: 'ap-card-main' },
            h('strong', { className: 'ap-card-title' }, plugin.name),
            h('span', { className: 'ap-trailing' },
              plugin.status === 'invalid' ? h('span', { className: 'ap-tag' }, t('invalid'))
                : h('span', { className: 'ap-version' }, manifest?.version ? `v${manifest.version}` : ''))),
          h('span', { className: 'ap-description' }, manifest?.description ?? plugin.invalidReason ?? ''),
          h('span', { className: 'ap-meta' },
            h('code', null, `${plugin.skills.length} Skills · ${plugin.mcpServers.length} MCP`),
            (plugin.mcpError || plugin.status === 'invalid') ? h('span', { className: 'ap-warning-dot', title: plugin.mcpError ?? plugin.invalidReason }) : null)))
    }

    function PluginDetail({ plugin, t, tab, onTab, onBack, onOpenFile, listDirectory }) {
      const manifest = plugin.manifest
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'ap-back', onClick: onBack },
          h(IconChevronLeftOutlineRegular, { size: 12 }), t('back')),
        h('div', { className: 'ap-detail-header' },
          h('h2', { className: 'ap-detail-title' }, plugin.name),
          manifest?.description ? h('p', { className: 'ap-detail-description' }, manifest.description) : null,
          h('div', { className: 'ap-detail-meta' },
            h('span', null, manifest?.version ? `v${manifest.version}` : '—'),
            h('span', null, 'Agent Plugins 1.0.0'),
            manifest?.license ? h('span', null, manifest.license) : null),
          h('div', { className: 'ap-detail-path' }, h('span', null, t('installPath')), h('code', null, `${plugin.root}/`))),
        h('div', { className: 'ap-tabs', role: 'tablist', 'aria-label': t('overview') },
          h(Tab, { id: 'overview', label: t('overview'), tab, onTab }),
          h(Tab, { id: 'skills', label: 'Skills', count: plugin.skills.length, tab, onTab }),
          h(Tab, { id: 'mcp', label: 'MCP', count: plugin.mcpServers.length, tab, onTab }),
          h(Tab, { id: 'files', label: t('files'), tab, onTab })),
        tab === 'overview' ? h(ManifestOverview, { plugin, t })
          : tab === 'skills' ? h(SkillsView, { plugin, t })
            : tab === 'mcp' ? h(McpView, { plugin, t })
              : h(FilesView, { plugin, t, onOpenFile, listDirectory }))
    }

    function Tab({ id, label, count, tab, onTab }) {
      return h('button', {
        type: 'button', role: 'tab', className: 'ap-tab', 'data-active': tab === id ? 'true' : 'false',
        'aria-selected': tab === id ? 'true' : 'false', tabIndex: tab === id ? 0 : -1,
        onClick: () => onTab(id),
      }, label, count === undefined ? null : h('span', { className: 'ap-tab-count' }, count))
    }

    function ManifestOverview({ plugin, t }) {
      const manifest = plugin.manifest
      if (plugin.status === 'invalid') return h('p', { className: 'ap-error', role: 'alert' }, plugin.invalidReason)
      return h('div', { className: 'ap-panel' },
        h('div', { className: 'ap-summary' },
          h('div', { className: 'ap-summary-item' }, h('span', { className: 'ap-summary-value' }, plugin.skills.length), h('span', { className: 'ap-summary-label' }, 'Skills')),
          h('div', { className: 'ap-summary-item' }, h('span', { className: 'ap-summary-value' }, plugin.mcpServers.length), h('span', { className: 'ap-summary-label' }, 'MCP'))),
        plugin.mcpError ? h('p', { className: 'ap-error', role: 'alert' }, plugin.mcpError) : null,
        h('section', { className: 'ap-manifest', 'aria-label': t('manifest') },
          h('dl', { className: 'ap-manifest-grid' },
            h(ManifestField, { label: t('version'), value: manifest.version ? `v${manifest.version}` : '—' }),
            h(ManifestField, { label: t('author'), value: manifest.author?.name ?? '—' }),
            h(ManifestField, { label: t('license'), value: manifest.license ?? '—' }),
            h(ManifestField, { label: t('spec'), value: 'Agent Plugins 1.0.0' }),
            h(ManifestField, { label: t('description'), value: manifest.description ?? '—', wide: true }))))
    }

    function ManifestField({ label, value, wide }) {
      return h('div', { className: wide ? 'ap-manifest-wide' : undefined }, h('dt', null, label), h('dd', null, value))
    }

    function SkillsView({ plugin, t }) {
      if (plugin.skills.length === 0) return h('p', { className: 'ap-empty' }, t('noSkills'))
      return h('div', { className: 'ap-components' }, plugin.skills.map(skill =>
        h('div', { className: 'ap-component', key: skill.name },
          h('div', { className: 'ap-component-top' }, h('span', { className: 'ap-component-name' }, skill.name)),
          h('p', { className: 'ap-component-description' }, skill.description))))
    }

    function McpView({ plugin, t }) {
      if (plugin.mcpServers.length === 0) return h('p', { className: 'ap-empty' }, t('noMcp'))
      return h('div', { className: 'ap-components' }, plugin.mcpServers.map(server =>
        h('section', { className: 'ap-mcp-card', key: server.name },
          h('div', { className: 'ap-component-top' },
            h('span', { className: 'ap-component-name' }, server.name),
            h('span', { className: 'ap-tag' }, server.type === 'sse' ? `${server.type}（暂不支持）` : server.type)),
          h('dl', { className: 'ap-mcp-grid' },
            server.type === 'stdio' ? h(React.Fragment, null,
              h(McpField, { label: 'command', value: server.command }),
              server.args?.length ? h(McpField, { label: 'args', value: server.args.join(' ') }) : null,
              h(McpField, { label: 'cwd', value: server.cwd ?? '${PLUGIN_ROOT}' }))
              : h(React.Fragment, null,
                h(McpField, { label: 'url', value: server.url }),
                server.headerNames?.length ? h(McpField, { label: 'headers', value: server.headerNames.join(', ') }) : null)))))
    }

    function McpField({ label, value }) {
      return h('div', { className: 'ap-mcp-field' },
        h('dt', null, label),
        h('dd', null, value)
      )
    }

    function FilesView({ plugin, t, onOpenFile, listDirectory }) {
      const [directories, setDirectories] = React.useState({})
      const [expanded, setExpanded] = React.useState(() => new Set())
      const [selected, setSelected] = React.useState()
      const controllers = React.useRef(new Set())
      const loadDirectory = React.useCallback((path) => {
        const controller = new AbortController()
        controllers.current.add(controller)
        setDirectories(previous => ({
          ...previous,
          [path]: { status: 'loading', entries: previous[path]?.entries ?? [] },
        }))
        return listDirectory(plugin.directoryName, path, controller.signal).then(result => {
          if (controller.signal.aborted) return
          if (result.ok) {
            setDirectories(previous => ({
              ...previous,
              [path]: { status: 'ready', entries: result.value.entries, truncated: result.value.truncated },
            }))
          } else {
            setDirectories(previous => ({ ...previous, [path]: { status: 'error', error: result.error.message } }))
          }
        }).catch(error => {
          if (!controller.signal.aborted) {
            setDirectories(previous => ({ ...previous, [path]: { status: 'error', error: String(error) } }))
          }
        }).finally(() => { controllers.current.delete(controller) })
      }, [plugin.directoryName, listDirectory])
      React.useEffect(() => {
        setDirectories({})
        setExpanded(new Set())
        setSelected(undefined)
        loadDirectory('')
        return () => {
          for (const controller of controllers.current) controller.abort()
          controllers.current.clear()
        }
      }, [loadDirectory])
      const toggleDirectory = (path) => {
        const isOpen = expanded.has(path)
        setExpanded(previous => {
          const next = new Set(previous)
          if (isOpen) next.delete(path)
          else next.add(path)
          return next
        })
        if (!isOpen && (!directories[path] || directories[path].status === 'error')) loadDirectory(path)
      }
      const openFile = (path) => {
        setSelected(path)
        onOpenFile(joinPath(plugin.root, path))
      }
      return h('div', { className: 'ap-files' },
        h('ul', { className: 'ap-tree', role: 'tree' },
          h(DirectoryRows, {
            path: '', depth: 0, directories, expanded, toggleDirectory, openFile, loadDirectory, selected, t,
          })))
    }

    function DirectoryRows({ path, depth, directories, expanded, toggleDirectory, openFile, loadDirectory, selected, t }) {
      const directory = directories[path]
      if (!directory) return null
      if (directory.status === 'loading') return h('li', { className: 'ap-tree-message' }, t('loading'))
      if (directory.status === 'error') {
        return h('li', { className: 'ap-tree-message' },
          h('button', { type: 'button', className: 'ap-link', onClick: () => loadDirectory(path) }, t('retry')))
      }
      return h(React.Fragment, null,
        directory.entries.map(entry => {
          const isDirectory = entry.kind === 'directory'
          const isOpen = expanded.has(entry.path)
          return h('li', { key: entry.path, role: 'treeitem', 'aria-expanded': isDirectory ? isOpen : undefined },
            h('button', {
              type: 'button',
              className: `ap-tree-row${selected === entry.path ? ' is-selected' : ''}`,
              style: { paddingLeft: 6 + depth * 16 },
              onClick: () => isDirectory ? toggleDirectory(entry.path) : openFile(entry.path),
              'aria-label': `${isDirectory ? '目录' : '文件'} ${entry.path}`,
            },
              isDirectory
                ? h(IconChevronDownOutlineRegular, { size: 12, className: isOpen ? 'ap-tree-chevron is-open' : 'ap-tree-chevron' })
                : h('span', { className: 'ap-tree-spacer' }),
              isDirectory
                ? h(FileTypeIcon, { kind: 'folder', size: 16 })
                : h(FileTypeIcon, { path: entry.name, size: 16 }),
              h('span', { className: 'ap-tree-name' }, entry.name),
              !isDirectory ? h('span', { className: 'ap-tree-open', 'aria-hidden': 'true' }, '↗') : null),
            isDirectory && isOpen
              ? h('ul', { role: 'group', className: 'ap-tree-level' },
                  h(DirectoryRows, {
                    path: entry.path, depth: depth + 1, directories, expanded,
                    toggleDirectory, openFile, loadDirectory, selected, t,
                  }))
              : null)
        }),
        directory.truncated ? h('li', { className: 'ap-tree-message' }, t('limited')) : null,
        directory.entries.length === 0 ? h('li', { className: 'ap-tree-message' }, t('emptyDirectory')) : null)
    }

    function joinPath(root, relative) {
      return `${root.replace(/[\\/]+$/, '')}/${relative}`
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'agent-plugins: dictionaries')
      const tagId = '@dshforge/agent-plugins/settings.css'
      if (document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
        const tag = document.createElement('style')
        tag.dataset.plugin = '@dshforge/agent-plugins'
        tag.dataset.pluginCss = tagId
        tag.textContent = css
        document.head.appendChild(tag)
      }
      const catalog = createSnapshotStore({ status: 'loading', value: undefined, error: undefined })
      let request = 0
      let started = false
      const load = () => {
        const current = ++request
        catalog.set({ status: 'loading', value: undefined, error: undefined })
        return ctx.connection.rpc.call('/agent-plugins', 'catalog', null).then(result => {
          if (current !== request) return
          if (result.ok) catalog.set({ status: 'ready', value: result.value, error: undefined })
          else catalog.set({ status: 'failed', value: undefined, error: result.error.message })
        }).catch(error => {
          if (current === request) catalog.set({ status: 'failed', value: undefined, error: String(error) })
        })
      }
      ctx.effect(() => () => { request++ }, 'agent-plugins: discard stale catalog responses')
      const listDirectory = (root, path, signal) => ctx.connection.rpc.call('/agent-plugins', 'files', { root, path }, signal)
      const install = spec => ctx.connection.rpc.call('/agent-plugins', 'install', { spec })
      const openFile = (path) => {
        const sessionId = ctx.sidebarRight.mounted.getSnapshot()
        if (sessionId === undefined) return { ok: false, message: t('previewNoSession') }
        try {
          ctx.sidebarRight.openResource(sessionFileAddress(sessionId, path))
          return { ok: true }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : String(error) }
        }
      }
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'agent-plugins',
        order: 16,
        label: () => t('nav'),
        locale: NS,
        inject: () => {
          if (!started) {
            started = true
            void load()
          }
          return { hooks: { catalog }, reload: load, openFile, listDirectory, install }
        },
      }, AgentPluginsSection))
    }

    return { inject: ['slots', 'locale', 'connection', 'sidebarRight'], apply }
  },
})
