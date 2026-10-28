import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { DEFAULT_SETTINGS, WorktreeStore } from '../src/store.js'

function record(id) {
  const path = join(tmpdir(), 'missing-' + id)
  return { id, path, branch: 'worktree-' + id, sourceRoot: tmpdir(), baseCommit: 'abc', sessionIds: [], lastUsedAt: '2026-01-01T00:00:00.000Z' }
}

async function fixture(run) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'worktrees-store-'))
  try { await run(new WorktreeStore(dataDirectory), dataDirectory) }
  finally { await rm(dataDirectory, { recursive: true, force: true }) }
}

test('settings use defaults and publish writes after durable validation', () => fixture(async store => {
  await store.ready
  assert.deepEqual(await store.settingsRead(), DEFAULT_SETTINGS)
  const settings = await store.settingsWrite({ keepCount: 3, autoCleanup: false })
  assert.equal(settings.keepCount, 3)
  assert.equal(settings.autoCleanup, false)
  assert.equal(settings.fetchBeforeCreate, false)
  await assert.rejects(store.settingsWrite({ keepCount: 0 }), error => error.code === 'worktrees/settings-invalid')
  assert.deepEqual(await store.settingsRead(), settings)
}))

test('concurrent record updates retain every distinct worktree', () => fixture(async store => {
  await store.ready
  await Promise.all(['a', 'b', 'c', 'd'].map(id => store.record(record(id))))
  assert.deepEqual((await store.list()).map(item => item.id).sort(), ['a', 'b', 'c', 'd'])
  await store.record({ ...record('a'), sessionIds: ['session-a'] })
  const updated = (await store.list()).find(item => item.id === 'a')
  assert.deepEqual(updated.sessionIds, ['session-a'])
  assert.equal(updated.status, 'missing')
}))

test('pending forks are durable and malformed entries fail loudly', () => fixture(async (store, dataDirectory) => {
  await store.ready
  await store.selectPendingFork('child', 'parent')
  assert.deepEqual(store.pendingForks.child.sourceSessionId, 'parent')
  await store.clearPending('child')
  assert.equal(store.pendingForks.child, undefined)
  await writeFile(join(dataDirectory, 'pending-forks.json'), JSON.stringify({ child: { sourceSessionId: 42, createdAt: 'now' } }))
  const invalid = new WorktreeStore(dataDirectory)
  await assert.rejects(invalid.ready, error => error.code === 'worktrees/records-invalid')
}))

test('settings reject invalid fields and preserve defaults at boundaries', () => fixture(async store => {
  await store.ready
  for (const input of [null, [], 'invalid', { root: '/tmp/other' }, { keepCount: 1.5 }, { keepCount: 1000 }, { autoCleanup: 'yes' }, { confirmDelete: 1 }]) {
    await assert.rejects(store.settingsWrite(input), error => error.code.startsWith('worktrees/'))
  }
  assert.deepEqual(await store.settingsRead(), DEFAULT_SETTINGS)
  const settings = await store.settingsWrite({ keepCount: 999, fetchBeforeCreate: true, autoCleanup: true, confirmDelete: false })
  assert.equal(settings.keepCount, 999)
  assert.equal(settings.fetchBeforeCreate, true)
  assert.equal(settings.confirmDelete, false)
}))

test('invalid records and failed initialization do not affect valid pending forks', () => fixture(async (store, dataDirectory) => {
  await store.ready
  await store.selectPendingFork('child', 'parent')
  assert.equal(store.pendingFork('child').sourceSessionId, 'parent')
  assert.equal(store.pendingFork('other'), undefined)
  await store.clearPending('other')
  await writeFile(join(dataDirectory, 'worktrees.json'), JSON.stringify([{ path: 'relative' }]))
  await assert.rejects(store.list(), error => error.code === 'worktrees/records-invalid')
  await writeFile(join(dataDirectory, 'settings.json'), '{broken')
  await assert.rejects(new WorktreeStore(dataDirectory).ready, error => error.code === 'worktrees/settings-invalid')
}))

test('cleanup respects retention, active and pinned sessions, and disabled automatic cleanup', () => fixture(async store => {
  await store.ready
  await store.settingsWrite({ keepCount: 1, autoCleanup: true })
  await Promise.all(['a', 'b', 'c'].map(id => store.record({ ...record(id), sessionIds: [id] })))
  assert.deepEqual(await store.cleanup({ protectedSessionIds: ['a', 'b'] }), { deleted: [] })
  await store.settingsWrite({ ...DEFAULT_SETTINGS, autoCleanup: false })
  assert.deepEqual(await store.cleanup(), { deleted: [] })
  assert.equal((await store.list()).length, 3)
}))
