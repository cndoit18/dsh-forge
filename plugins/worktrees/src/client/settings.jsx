import { useEffect } from 'react'
import { Button, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { worktreeLabel } from './shared.jsx'

export function SettingsPage({ useWorktreeState, actions, t }) {
  const snapshot = useWorktreeState(value => value)
  useEffect(() => { void actions.loadSettings(); void actions.loadItems() }, [actions])
  const settings = snapshot.settings
  if (!settings) return <p>{t('loading')}</p>
  return (
    <div className="wt-settings">
      <h1>{t('settings')}</h1><p className="wt-help">{t('settingsIntro')}</p>
      <section><h2>{t('creation')}</h2><div className="wt-settings-card">
        <label className="wt-setting"><span><strong>{t('root')}</strong><small>{t('defaultRoot')}</small></span>
          <input value=".agents/worktrees" readOnly aria-label={t('root')} /></label>
        <SettingSwitch label={t('fetch')} detail={t('fetchDetail')} checked={settings.fetchBeforeCreate} onChange={value => actions.changeSettings({ fetchBeforeCreate: value })} />
        <SettingSwitch label={t('cleanup')} detail={t('snapshot')} checked={settings.autoCleanup} onChange={value => actions.changeSettings({ autoCleanup: value })} />
        <label className="wt-setting"><span><strong>{t('keep')}</strong><small>{t('keepDetail')}</small></span>
          <input type="number" min={1} max={999} disabled={!settings.autoCleanup} value={settings.keepCount}
            onChange={event => actions.changeSettings({ keepCount: Number(event.currentTarget.value) })} /></label>
        <SettingSwitch label={t('confirm')} detail={t('confirmDetail')} checked={settings.confirmDelete} onChange={value => actions.changeSettings({ confirmDelete: value })} />
      </div></section>
      <section>
        <div className="wt-section-heading"><h2>{t('managed')}</h2><Button aria-label={t('refresh')} onClick={actions.loadItems}>↻</Button></div>
        <div className="wt-settings-card">{snapshot.items.length
          ? snapshot.items.map(item => <ManagedRow key={item.path} item={item} actions={actions} />)
          : <p className="wt-help">{t('empty')}</p>}</div>
      </section>
      <div className="wt-dialog-actions"><Button variant="primary" onClick={actions.saveSettings}>{t('save')}</Button></div>
      {snapshot.error && <p className="wt-error" role="alert">{snapshot.error}</p>}
      {snapshot.deleteCandidate && <DeleteDialog item={snapshot.deleteCandidate} actions={actions} />}
    </div>
  )
}

function SettingSwitch({ label, detail, checked, onChange }) {
  return <div className="wt-setting"><span><strong>{label}</strong><small>{detail}</small></span><Switch label={label} checked={checked} onChange={onChange} /></div>
}

function ManagedRow({ item, actions }) {
  return (
    <div className="wt-managed-row">
      <div><strong title={item.branch}>{worktreeLabel(item.branch)}</strong><small title={item.path}>{item.path}</small>
        <small>{item.sessionIds.length + ' ' + t('chatCount') + t('separator') + t('recent') + ' ' + new Date(item.lastUsedAt).toLocaleDateString()}</small></div>
      <div className="wt-row-actions">
        {item.pinned && <span className="wt-badge">{t('pinned')}</span>}
        {item.protected && <span className="wt-badge">{t('protected')}</span>}
        {item.status === 'missing' && <span className="wt-badge">{t('missing')}</span>}
        <Button onClick={() => actions.openWorktree(item)}>{t('open')}</Button>
        <Button disabled={item.protected} onClick={() => actions.askDelete(item)}>{t('delete')}</Button>
      </div>
    </div>
  )
}

function DeleteDialog({ item, actions }) {
  return (
    <Modal open title={t('delete')} closeLabel={t('cancel')} onClose={actions.cancelDelete}>
      <p>{item.branch}</p><p className="wt-help">{item.path}</p><p className="wt-help">{t('snapshot') + t('separator') + t('noRecovery')}</p>
      <div className="wt-dialog-actions"><Button onClick={actions.cancelDelete}>{t('cancel')}</Button><Button variant="primary" onClick={() => actions.remove(item)}>{t('delete')}</Button></div>
    </Modal>
  )
}
