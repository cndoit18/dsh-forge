import { useId, useState } from 'react'
import {
  Button, IconBranchOutlineRegular, IconCheckOutlineRegular, IconCopyOutlineRegular, Modal, Tooltip, useClipboardCopy,
} from '@deepseek-ai/dsh-client-ui-primitives'


export function TurnTail({ node, sessionId, openFile, forkAt, renderSlot, useAccess, useChat, usePerformanceUsage, useWorktreeState, actions, t }) {
  const data = node.data
  const repository = useWorktreeState(value => value.repositories[sessionId])
  const forkAllowed = useAccess('session/fork')
  const hasLaterChatNode = useChat(snapshot => laterContent(snapshot, data))
  const detailed = usePerformanceUsage(mode => mode) === 'detailed'
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined
  if (turn === undefined) return null
  const owner = { turn, seq: data.closing?.finalNode.seq ?? data.seq, openFile }
  const tail = renderSlot('conversation.chat.turnTail', owner)
  if (!data.closing) return tail ? <div className="wt-turn-tail" data-turn-tail={data.turn}>{tail}</div> : null
  const unavailable = data.branchUnavailable || hasLaterChatNode
  const onBranch = repository?.managed ? () => actions.openFork({ sessionId, atSeq: data.seq }) : () => forkAt(data.seq)
  return (
    <div className="wt-turn-tail" data-turn-tail={data.turn}>
      {tail}
      <MessageActions
        text={data.closing.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('')}
        time={data.closing.time} onBranch={forkAllowed ? onBranch : undefined} unavailable={unavailable}
        extraActions={data.closing.finalNode.messageId === undefined ? null : renderSlot('conversation.chat.assistant-actions', { messageId: data.closing.finalNode.messageId })}
        usage={detailed ? data.tokenUsage : undefined} t={t}
      />
    </div>
  )
}

function laterContent(snapshot, data) {
  for (const key of snapshot.locations.getTurn(data.turn) ?? []) {
    const later = snapshot.nodes.get(key)
    if (later?.kind !== 'turn-tail' && later?.kind !== 'turn-process' && later?.kind !== 'turn-max-tokens'
      && (later?.anchorSeq ?? -1) > (data.closing?.finalNode.seq ?? data.seq)) return true
  }
  return false
}

function MessageActions({ text, time, onBranch, unavailable, extraActions, usage, t }) {
  const { copied, onCopy } = useClipboardCopy(text)
  const reasonId = useId()
  return (
    <div className="wt-message-actions" data-clock="end">
      <Tooltip label={copied ? t('copied') : t('copy')} side="bottom">
        <button type="button" className="wt-action" aria-label={copied ? t('copied') : t('copy')} onClick={onCopy}>
          {copied ? <IconCheckOutlineRegular /> : <IconCopyOutlineRegular />}
        </button>
      </Tooltip>
      {extraActions}
      {onBranch && <Tooltip label={unavailable ? t('branchUnavailable') : t('branch')} side="bottom" openOnClick={unavailable}>
        <button type="button" className="wt-action" aria-label={t('branch')} aria-disabled={unavailable || undefined}
          aria-describedby={unavailable ? reasonId : undefined} data-unavailable={unavailable || undefined} onClick={unavailable ? undefined : onBranch}>
          <IconBranchOutlineRegular />
        </button>
      </Tooltip>}
      {onBranch && unavailable && <span id={reasonId} className="wt-visually-hidden">{t('branchUnavailable')}</span>}
      <span className="wt-end-info">
        {usage && <span className="wt-usage">{usage.totalTokens + t('tokens')}</span>}
        {time && <span className="wt-time">{new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>}
      </span>
    </div>
  )
}

export function ForkDialog({ useForkRequest, actions, t }) {
  const request = useForkRequest(value => value)
  const [isolate, setIsolate] = useState(false)
  const [previousRequest, setPreviousRequest] = useState(request)
  if (request !== previousRequest) {
    setPreviousRequest(request)
    setIsolate(false)
  }
  if (!request) return null
  const confirm = async () => {
    try {
      if (isolate) await actions.forkIsolated(request)
      else await actions.forkShared(request)
      actions.closeFork()
    } catch (error) { actions.reportError(request.sessionId, error) }
  }
  return (
    <Modal open onClose={actions.closeFork} title={t('forkTitle')} closeLabel={t('cancel')} description={t('forkDescription')} className="wt-fork-modal">
      <div className="wt-fork-options" role="radiogroup" aria-label={t('position')}>
        <button className="wt-fork-option" role="radio" aria-checked={!isolate} onClick={() => setIsolate(false)}>
          <strong>{t('original')}<small>{t('immediate')}</small></strong><p>{t('originalDetail')}</p>
        </button>
        <button className="wt-fork-option" role="radio" aria-checked={isolate} onClick={() => setIsolate(true)}>
          <strong>{t('independent')}<small>{t('onSend')}</small></strong><p>{t('independentDetail')}</p>
        </button>
      </div>
      <p className="wt-help">{isolate ? t('cleanBase') : t('shared')}</p>
      <div className="wt-dialog-actions"><Button onClick={actions.closeFork}>{t('cancel')}</Button><Button variant="primary" onClick={confirm}>{t('fork')}</Button></div>
    </Modal>
  )
}
