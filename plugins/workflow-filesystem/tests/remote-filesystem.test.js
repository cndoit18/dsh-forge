import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileSystemWorkflowProvider } from '../lib/index.js'
import { parseWorkflowSource } from '@dshforge/workflow/source'

const target = path => ({ targetKey: `remote:${path}`, displayPath: path })
const absent = () => Object.assign(new Error('remote path is absent'), { code: 'FS_NOT_FOUND' })
const workflow = name => `export const meta = { name: '${name}', description: '${name}' }\nreturn { input: args.input }`

class RemoteProjectFileSystem {
  constructor(files, directories) {
    this.files = new Map(Object.entries(files))
    this.directories = new Map(Object.entries(directories))
    this.resolved = []
    this.read = []
  }

  async resolve(path, options = {}) {
    options.signal?.throwIfAborted()
    this.resolved.push(path)
    return target(path)
  }

  processPath(value) {
    return value.displayPath
  }

  async stat(value, signal) {
    signal?.throwIfAborted()
    if (this.files.has(value.displayPath)) return { type: 'file', version: 'remote-1' }
    if (value.displayPath === '/remote/project/.git' || this.directories.has(value.displayPath)) {
      return { type: 'directory', version: 'remote-1' }
    }
    return undefined
  }

  async listDir(value, signal) {
    signal?.throwIfAborted()
    const entries = this.directories.get(value.displayPath)
    if (entries === undefined) throw absent()
    return entries.map(entry => ({ ...entry, target: target(entry.path) }))
  }

  async readText(value, signal) {
    signal?.throwIfAborted()
    this.read.push(value.displayPath)
    const source = this.files.get(value.displayPath)
    if (source === undefined) throw absent()
    return source
  }
}

const context = fs => ({
  get: name => name === 'fs' ? fs : undefined,
  workflows: { parse: parseWorkflowSource },
  logger: { warn() {} },
})

test('project discovery and loading stay in the remote filesystem while user roots keep Host semantics', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-workflow-remote-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const dshHome = join(home, 'dsh-home')
  const agentsHome = join(home, 'agents-home')
  await mkdir(join(dshHome, 'workflows'), { recursive: true })
  await mkdir(join(agentsHome, 'workflows'), { recursive: true })
  await writeFile(join(dshHome, 'workflows/user.js'), workflow('host-user'))
  await writeFile(join(agentsHome, 'workflows/personal.js'), workflow('host-personal'))

  const projectWorkflow = '/remote/project/.dsh/workflows/remote.js'
  const agentsWorkflow = '/remote/project/.agents/workflows/agent.js'
  const fs = new RemoteProjectFileSystem({
    [projectWorkflow]: workflow('remote-project'),
    [agentsWorkflow]: workflow('remote-agent'),
  }, {
    '/remote/project/.dsh/workflows': [
      { name: 'remote.js', type: 'file', path: projectWorkflow },
      { name: 'ignored.txt', type: 'file', path: '/remote/project/.dsh/workflows/ignored.txt' },
      { name: 'directory.js', type: 'directory', path: '/remote/project/.dsh/workflows/directory.js' },
    ],
    '/remote/project/.agents/workflows': [
      { name: 'agent.js', type: 'file', path: agentsWorkflow },
    ],
  })
  const provider = new FileSystemWorkflowProvider(context(fs), { dshHome, agentsHome })

  const candidates = await provider.list({ cwd: '/remote/project/packages/app' })
  assert.deepEqual(candidates.map(candidate => [candidate.name, candidate.source, candidate.rank]), [
    ['remote-project', 'project-dsh', 100],
    ['remote-agent', 'project-agents', 200],
    ['host-user', 'user-dsh', 400],
    ['host-personal', 'user-agents', 500],
  ])
  const remote = candidates.find(candidate => candidate.name === 'remote-project')
  const loaded = await provider.get(remote)
  assert.equal(loaded.description, 'remote-project')
  assert.match(loaded.script, /args\.input/)
  assert.deepEqual(fs.read.sort(), [agentsWorkflow, projectWorkflow, projectWorkflow].sort())
  assert.ok(fs.resolved.every(path => path.startsWith('/remote/')))
})

test('an available remote filesystem never falls back to same-path Host project files', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-workflow-no-host-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const project = join(home, 'project')
  await mkdir(join(project, '.dsh/workflows'), { recursive: true })
  await mkdir(join(project, '.git'), { recursive: true })
  await writeFile(join(project, '.dsh/workflows/host-only.js'), workflow('host-only'))

  const fs = new RemoteProjectFileSystem({}, {})
  const provider = new FileSystemWorkflowProvider(context(fs), {
    dshHome: join(home, 'empty-dsh'),
    agentsHome: join(home, 'empty-agents'),
  })
  assert.deepEqual(await provider.list({ cwd: project }), [])
  assert.deepEqual(fs.read, [])
})
