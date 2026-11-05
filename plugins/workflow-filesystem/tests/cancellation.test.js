import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FileSystemWorkflowProvider } from '../lib/index.js'
import { parseWorkflowSource } from '@dshforge/workflow/source'

test('provider lifecycle aborts an in-flight filesystem read', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-workflow-abort-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(home, { recursive: true })
  const lifecycle = new AbortController()
  const provider = new FileSystemWorkflowProvider({ workflows: { parse: parseWorkflowSource }, logger: { warn() {} } }, {
    includeDefaultRoots: false,
    customWorkflowDirs: [home],
  }, { signal: lifecycle.signal })
  await writeFile(join(home, 'one.js'), `export const meta = { name: 'one', description: 'One' }
return 1`)
  const read = provider.list({})
  lifecycle.abort()
  await assert.rejects(read, { name: 'AbortError' })
})
