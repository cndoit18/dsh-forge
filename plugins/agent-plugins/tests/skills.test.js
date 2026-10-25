import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { createAgentSkillProvider } from '../lib/skills.js'

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-agent-skills-'))
  const pluginsDirectory = join(home, '.agents', 'plugins')
  t.after(() => rm(home, { recursive: true, force: true }))
  return pluginsDirectory
}

async function write(root, path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  return target
}

async function packageWithSkill(root, packageName, skillName, body = 'Follow the package instructions.') {
  await write(root, `${packageName}/plugin.json`, JSON.stringify({ $schema: SCHEMA, name: packageName }))
  await write(root, `${packageName}/skills/${skillName}/SKILL.md`,
    `---\nname: ${skillName}\ndescription: Use ${skillName} for this focused task.\n---\n\n${body}\n`)
}

test('provider lists strict candidates and loads current body content', async (t) => {
  const root = await fixture(t)
  await packageWithSkill(root, 'alpha', 'verify')
  const provider = createAgentSkillProvider({ pluginsDirectory: root })
  const candidates = await provider.list({})
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].provider, 'agent-plugins')
  assert.equal(candidates[0].rank, 600)
  assert.equal(candidates[0].resourceBase.kind, 'directory')

  const first = await provider.get(candidates[0], {})
  assert.equal(first.content, 'Follow the package instructions.')
  assert.equal(first.name, 'verify')

  await write(root, 'alpha/skills/verify/SKILL.md',
    '---\nname: verify\ndescription: Use verify for this focused task.\n---\n\nUpdated instructions.\n')
  const second = await provider.get(candidates[0], {})
  assert.equal(second.content, 'Updated instructions.')
})

test('a manifest that becomes invalid prevents an on-demand skill load', async (t) => {
  const root = await fixture(t)
  await packageWithSkill(root, 'alpha', 'verify')
  const provider = createAgentSkillProvider({ pluginsDirectory: root })
  const [candidate] = await provider.list({})
  await write(root, 'alpha/plugin.json', '{broken')
  assert.equal(await provider.get(candidate, {}), undefined)
})

test('real SkillRegistry resolves duplicate names by sorted package order and disposes the provider', async (t) => {
  const root = await fixture(t)
  await packageWithSkill(root, 'beta', 'shared', 'Beta instructions.')
  await packageWithSkill(root, 'alpha', 'shared', 'Alpha instructions.')
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(SkillRegistry)
  const dispose = ctx.skills.registerProvider(() => createAgentSkillProvider({ pluginsDirectory: root }))

  const list = await ctx.skills.list({ cwd: '/a/workspace/that/does/not/change/global/plugins' })
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'shared')
  assert.equal((await ctx.skills.get('shared')).content, 'Alpha instructions.')

  dispose()
  assert.deepEqual(await ctx.skills.list(), [])
})
