import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import React from 'react'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
import { t } from '../src/client/shared.jsx'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'CustomEvent', 'Event', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] })
}
Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: callback => setTimeout(callback, 0) })
Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: clearTimeout })
window.__ModuleLoader__ = { load() {} }
const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react')
const { WorkLocation } = await import('../src/client/location.jsx')
const { ForkDialog } = await import('../src/client/conversation.jsx')

afterEach(() => {
  cleanup()
  document.querySelectorAll('style[data-plugin="worktrees"]').forEach(style => style.remove())
})

const repository = { git: true, branch: 'main', pendingSelection: false, managed: null }
const useSession = selector => selector({ blank: false })
const useWorktreeState = selector => selector({ repositories: { session: repository }, errors: {} })

test('work-location menu selects creation on first send', async () => {
  const selections = []
  const actions = { inspect: async () => repository, select: async (...args) => selections.push(args), reportError: () => {} }
  render(<WorkLocation sessionId="session" useSession={useSession} useWorktreeState={useWorktreeState} actions={actions} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: '工作位置' }))
  fireEvent.click(await screen.findByText('新建本地工作树'))
  await waitFor(() => assert.deepEqual(selections, [['session', 'new']]))
})

test('fork dialog requests an isolated chat without accessing Cordis', async () => {
  const forkRequest = { sessionId: 'parent', atSeq: 7 }
  const useForkRequest = selector => selector(forkRequest)
  let isolated
  const actions = {
    closeFork: () => {}, forkShared: async () => {}, forkIsolated: async request => { isolated = request }, reportError: () => {},
  }
  render(<ForkDialog useForkRequest={useForkRequest} actions={actions} t={t} />)
  fireEvent.click(screen.getByRole('radio', { name: /在新工作树中创建/ }))
  fireEvent.click(screen.getByRole('button', { name: '创建聊天分支' }))
  await waitFor(() => assert.deepEqual(isolated, forkRequest))
})

test('plugin-owned style and registrations follow fiber disposal and recovery', async () => {
  const { apply, inject } = await import('../src/client.js')
  const registrations = []
  const ctx = new Context()
  ctx.provide('locale', { register: () => () => {} })
  ctx.provide('connection', { rpc: { call: async () => ({ ok: true, value: null }) } })
  ctx.provide('sessions', { fork: async () => 'child' })
  ctx.provide('uiWorkspace', { openSession: () => {} })
  ctx.provide('slots', {
    inject: (name, register) => { registrations.push(name); return register() },
    register: () => () => {},
  })
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  assert.ok(document.querySelector('style[data-plugin="worktrees"]'))
  assert.equal(registrations.length, 6)
  await fiber.dispose()
  assert.equal(document.querySelector('style[data-plugin="worktrees"]'), null)
  const recovered = ctx.plugin({ inject, apply })
  await recovered.await()
  assert.ok(document.querySelector('style[data-plugin="worktrees"]'))
  await ctx.fiber.dispose()
})
