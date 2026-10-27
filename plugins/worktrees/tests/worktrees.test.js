import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { agentEvents } from '../../../third_party/deepseek-harness/packages/core/agent/src/index.ts'
import { WorktreesHost } from '../src/index.js'
import { recordWorktree } from '../src/manager.js'
import { harness, repository, testAgent } from '../../../third_party/deepseek-harness/packages/experimental/worktree/tests/harness.ts'

const owner = { principal: { kind: 'owner' } }

test('Remote methods are registered', () => {
  const host = new WorktreesHost(new Context())
  assert.deepEqual(remoteMethods(host).map(method => method.exportName ?? method.method), [
    'inspect', 'select', 'prepare', 'fork', 'adopt', 'settingsRead', 'settingsWrite', 'list', 'remove', 'cleanup',
  ])
})

test('native pre-step creates through upstream runtime, reuses records, and delays isolated fork creation', async () => {
  const root = await repository()
  const dataDirectory = await mkdtemp(join(tmpdir(), 'worktrees-host-'))
  const ctx = await harness(root)
  const agent = testAgent(ctx, root)
  ctx.invocation = { peer: owner, signal: undefined }
  const forkedAgent = testAgent(ctx, root, 'forked-session')
  ctx.sessionController = {
    resolveAgent: async sessionId => ({ agent: sessionId === 'forked-session' ? forkedAgent : sessionId === 'shared-session' ? shared : agent }),
    fork: async () => ({ sessionId: 'forked-session' }),
  }
  ctx.workspaceRegistry = { pinnedSessionIds: [] }
  process.env.DSH_HOME = dataDirectory
  try {
    const host = new WorktreesHost(ctx)
    await host.ready
    await host.select({ sessionId: agent.id, pending: true })
    assert.equal((await host.inspect({ sessionId: agent.id })).pendingSelection, true)
    assert.equal((await host.list({})).length, 0)
    const preStep = messages => agentEvents(ctx, agent).waterfall('agent/pre-step', {
      messages, turn: 1, step: 1, signal: new AbortController().signal, modelSelection: { provider: 'mock', model: 'mock' },
    }, async () => ({ kind: 'enter', messages: [] }))
    await assert.rejects(preStep([{ content: [{ type: 'file' }] }]), error => {
      assert.equal(error.code, 'worktrees/attachments-unsupported')
      return true
    })
    assert.equal((await host.list({})).length, 0)
    assert.equal((await preStep([])).kind, 'enter')
    const first = { created: (await host.inspect({ sessionId: agent.id })).managed }
    assert.equal((await host.inspect({ sessionId: agent.id })).pendingSelection, false)
    assert.ok(first.created.path)
    assert.ok(first.created.branch)
    const second = await host.prepare({ sessionId: agent.id })
    assert.equal(second.reused, true)
    const shared = testAgent(ctx, root, 'shared-session')
    const adopted = await host.adopt({ sessionId: agent.id, childId: shared.id })
    assert.equal(adopted.path, first.created.path)
    assert.equal(ctx.workingDirectory.get(shared.session), first.created.path)
    assert.deepEqual((await host.inspect({ sessionId: shared.id })).managed.sessionIds, [agent.id, shared.id])
    const forked = await host.fork({ sessionId: agent.id, atSeq: 1, isolate: true })
    assert.equal(forked.pending, true)
    const pending = await host.inspect({ sessionId: 'forked-session' })
    assert.equal(pending.pendingFork, true)
    assert.equal(pending.branch, first.created.branch)
    assert.equal(pending.managed, null)
    const preparedFork = await host.prepare({ sessionId: 'forked-session' })
    assert.notEqual(preparedFork.created.path, first.created.path)
    assert.equal(preparedFork.created.sourceRoot, first.created.path)
    assert.equal(ctx.workingDirectory.get(forkedAgent.session), preparedFork.created.path)
    await assert.rejects(host.remove({ path: first.created.path, confirmed: true }), error => {
      assert.equal(error.code, 'worktrees/protected')
      return true
    })
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(dataDirectory, { recursive: true, force: true })
    delete process.env.DSH_HOME
  }
})

test('deletion writes a recovery snapshot before removing a managed worktree', async () => {
  const root = await repository()
  const dataDirectory = await mkdtemp(join(tmpdir(), 'worktrees-host-'))
  const ctx = await harness(root)
  let unregister
  const register = ctx.agents.register.bind(ctx.agents)
  ctx.agents.register = agent => (unregister = register(agent))
  const agent = testAgent(ctx, root)
  ctx.invocation = { peer: owner, signal: undefined }
  ctx.sessionController = { resolveAgent: async () => ({ agent }), fork: async () => ({ sessionId: 'forked-session' }) }
  ctx.workspaceRegistry = { pinnedSessionIds: [] }
  process.env.DSH_HOME = dataDirectory
  try {
    const host = new WorktreesHost(ctx)
    await host.ready
    const prepared = await host.prepare({ sessionId: agent.id })
    const worktreePath = prepared.created.path
    assert.equal(typeof worktreePath, 'string')
    await writeFile(join(worktreePath, 'untracked.txt'), 'recovery')
    const [record] = await host.list({})
    await recordWorktree(host.dataDirectory, { ...record, sessionIds: [] })
    await assert.rejects(host.remove({ path: worktreePath, confirmed: true }), error => {
      assert.equal(error.code, 'worktrees/protected')
      return true
    })
    await unregister()
    const result = await host.remove({ path: worktreePath, confirmed: true })
    const recovery = JSON.parse(await readFile(result.recovery, 'utf8'))
    assert.equal(recovery.untracked[0].path, 'untracked.txt')
    assert.equal(Buffer.from(recovery.untracked[0].data, 'base64').toString(), 'recovery')
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
    await rm(dataDirectory, { recursive: true, force: true })
    delete process.env.DSH_HOME
  }
})
