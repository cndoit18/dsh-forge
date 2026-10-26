import assert from 'node:assert/strict'
import { execa } from 'execa'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { installAgentPlugin, parseGitInstallSpec, chooseGitTransport } from '../lib/install.js'
import { discoverAgentPlugins } from '../lib/discovery.js'
import { createAgentPluginsRpcHandler } from '../lib/rpc.js'

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'

async function git(cwd, ...args) {
  return execa('git', ['-C', cwd, ...args], { reject: true })
}

async function createRepository(t) {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-agent-install-test-'))
  t.after(() => rm(temporary, { recursive: true, force: true }))
  const repository = join(temporary, 'repo')
  const plugin = join(repository, 'plugins', 'demo')
  await mkdir(join(plugin, 'skills', 'verify'), { recursive: true })
  await writeFile(join(repository, 'plugin.json'), JSON.stringify({ $schema: SCHEMA, name: 'root-demo', version: '1.0.0' }))
  await writeFile(join(plugin, 'plugin.json'), JSON.stringify({ $schema: SCHEMA, name: 'demo', version: '1.0.0', description: 'first ref' }))
  await writeFile(join(plugin, 'skills', 'verify', 'SKILL.md'), '---\nname: verify\ndescription: Verify Git installation.\n---\n\nGit-loaded instructions.\n')
  await writeFile(join(repository, 'unrelated.txt'), 'not part of the plugin')
  await git(repository, 'init', '-b', 'main')
  await git(repository, 'add', '.')
  await git(repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'first')
  const first = (await git(repository, 'rev-parse', 'HEAD')).stdout.trim()
  await writeFile(join(plugin, 'plugin.json'), JSON.stringify({ $schema: SCHEMA, name: 'demo', version: '2.0.0', description: 'latest ref' }))
  await git(repository, 'add', '.')
  await git(repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'second')
  const latest = (await git(repository, 'rev-parse', 'HEAD')).stdout.trim()
  return { temporary, repository, first, latest }
}

test('parses HTTPS, SCP and SSH specs with ref and subdirectory', () => {
  assert.deepEqual(parseGitInstallSpec('https://github.com/org/repo.git#v1.2.0&path:/plugins/demo'), {
    kind: 'https', url: 'https://github.com/org/repo.git', path: 'plugins/demo', ref: 'v1.2.0',
  })
  assert.deepEqual(parseGitInstallSpec('git+https://github.com/org/repo'), {
    kind: 'https', url: 'https://github.com/org/repo.git', path: undefined, ref: undefined,
  })
  assert.deepEqual(parseGitInstallSpec('git@github.com:org/repo.git&path:/plugins/demo'), {
    kind: 'scp', url: 'git@github.com:org/repo.git', path: 'plugins/demo', ref: undefined,
  })
  assert.deepEqual(parseGitInstallSpec('git+ssh://git@github.com/org/repo.git'), {
    kind: 'ssh', url: 'ssh://git@github.com/org/repo.git', path: undefined, ref: undefined,
  })
  assert.throws(() => parseGitInstallSpec('https://github.com/org/repo.git&path:/../outside'), /relative directory/)
  assert.throws(() => parseGitInstallSpec('https://user:secret@github.com/org/repo.git'), /must not contain credentials/)
  assert.throws(() => parseGitInstallSpec('git://github.com/org/repo.git'), /Expected an HTTPS/)
})

test('falls back between SCP/SSH and HTTPS transports like DSH', async () => {
  const scp = parseGitInstallSpec('git@github.com:org/repo.git')
  assert.equal(await chooseGitTransport(scp, '/tmp', new AbortController().signal,
    async repository => repository === 'https://github.com/org/repo.git'), 'https://github.com/org/repo.git')
  const https = parseGitInstallSpec('https://github.com/org/repo.git')
  assert.equal(await chooseGitTransport(https, '/tmp', new AbortController().signal,
    async repository => repository === 'git@github.com:org/repo.git'), 'git@github.com:org/repo.git')
})

test('installs a subdirectory at an exact ref without package.json and mounts no unrelated files', async (t) => {
  const { temporary, repository, first, latest } = await createRepository(t)
  const pluginsDirectory = join(temporary, 'home', 'plugins')
  const result = await installAgentPlugin({
    pluginsDirectory,
    spec: `file://${repository}#${first}&path:/plugins/demo`,
    signal: new AbortController().signal,
  })
  assert.equal(result.name, 'demo')
  const manifest = JSON.parse(await readFile(join(result.root, 'plugin.json'), 'utf8'))
  assert.equal(manifest.version, '1.0.0')
  assert.equal(manifest.description, 'first ref')
  assert.notEqual(first, latest)
  await assert.rejects(stat(join(result.root, 'unrelated.txt')), { code: 'ENOENT' })
  const catalog = await discoverAgentPlugins({ pluginsDirectory })
  assert.equal(catalog.plugins[0].status, 'ready')
  assert.equal(catalog.plugins[0].skills[0].name, 'verify')
  assert.equal(catalog.plugins[0].skills[0].description, 'Verify Git installation.')
  await assert.rejects(installAgentPlugin({
    pluginsDirectory,
    spec: `file://${repository}#${latest}&path:/plugins/demo`,
    signal: new AbortController().signal,
  }), error => error.code === 'agent-plugins/already-installed')
  assert.equal(JSON.parse(await readFile(join(result.root, 'plugin.json'), 'utf8')).version, '1.0.0')
})

test('installs a repository root without copying Git metadata', async (t) => {
  const { temporary, repository } = await createRepository(t)
  const pluginsDirectory = join(temporary, 'home', 'plugins')
  const result = await installAgentPlugin({
    pluginsDirectory,
    spec: `git+file://${repository}`,
    signal: new AbortController().signal,
  })
  assert.equal(result.name, 'root-demo')
  await assert.rejects(stat(join(result.root, '.git')), { code: 'ENOENT' })
  assert.equal(JSON.parse(await readFile(join(result.root, 'plugin.json'), 'utf8')).name, 'root-demo')
})

test('initializes nested submodules inside the selected plugin without copying Git metadata', async (t) => {
  const { temporary, repository } = await createRepository(t)
  const nested = join(temporary, 'nested')
  const child = join(temporary, 'child')
  for (const [path, filename] of [[nested, 'nested.txt'], [child, 'child.txt']]) {
    await mkdir(path)
    await writeFile(join(path, filename), `${filename}\n`)
    await git(path, 'init', '-b', 'main')
    await git(path, 'add', '.')
    await git(path, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'initial')
  }
  await git(child, '-c', 'protocol.file.allow=always', 'submodule', 'add', `file://${nested}`, 'nested')
  await git(child, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'add nested')
  await git(repository, '-c', 'protocol.file.allow=always', 'submodule', 'add', `file://${child}`, 'plugins/demo/vendor/child')
  await git(repository, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'add child')

  // Git blocks local submodule transports by default; allow them only in this test process.
  const gitConfig = join(temporary, 'gitconfig')
  await writeFile(gitConfig, '[protocol "file"]\n\tallow = always\n')
  const previousGitConfig = process.env.GIT_CONFIG_GLOBAL
  process.env.GIT_CONFIG_GLOBAL = gitConfig
  t.after(() => {
    if (previousGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = previousGitConfig
  })

  const result = await installAgentPlugin({
    pluginsDirectory: join(temporary, 'home', 'plugins'),
    spec: `file://${repository}&path:/plugins/demo`,
    signal: new AbortController().signal,
  })
  assert.equal(await readFile(join(result.root, 'vendor', 'child', 'child.txt'), 'utf8'), 'child.txt\n')
  assert.equal(await readFile(join(result.root, 'vendor', 'child', 'nested', 'nested.txt'), 'utf8'), 'nested.txt\n')
  await assert.rejects(stat(join(result.root, 'vendor', 'child', '.git')), { code: 'ENOENT' })
  await assert.rejects(stat(join(result.root, 'vendor', 'child', 'nested', '.git')), { code: 'ENOENT' })
})

test('install RPC is owner-only and reads the refreshed catalog after installation', async () => {
  let catalog = { plugins: [], diagnostics: [] }
  const installed = { name: 'demo', root: '/home/user/.agents/plugins/demo', manifest: { name: 'demo' } }
  const handler = createAgentPluginsRpcHandler(() => catalog, {
    install: async spec => {
      assert.equal(spec, 'git@github.com:org/repo.git&path:/plugins/demo')
      catalog = { plugins: [{ directoryName: 'demo', status: 'ready', skills: [], mcpServers: [] }], diagnostics: [] }
      return installed
    },
  })
  const forbidden = await handler('install', { spec: 'x' }, new AbortController().signal, { principal: { kind: 'guest' } })
  assert.equal(forbidden.error.code, 'agent-plugins/forbidden')
  const result = await handler('install', { spec: 'git@github.com:org/repo.git&path:/plugins/demo' }, new AbortController().signal, { principal: { kind: 'owner' } })
  assert.deepEqual(result.value, installed)
  const refreshed = await handler('catalog', null, new AbortController().signal, { principal: { kind: 'owner' } })
  assert.equal(refreshed.value.plugins[0].directoryName, 'demo')
})
