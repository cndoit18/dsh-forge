import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('the aggregate installs and mounts every workflow package exactly once', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    '@dshforge/devflow',
    '@dshforge/workflow',
    '@dshforge/workflow-filesystem',
  ])
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const rows = [...patch.matchAll(/- id: ([\w-]+)\n\s+name: ['"]?([^'"\n]+)['"]?/g)].map(([, id, name]) => ({ id, name }))
  assert.deepEqual(rows, [
    { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc' },
    { id: 'workflows', name: '@dshforge/workflow' },
    { id: 'workflow-filesystem', name: '@dshforge/workflow-filesystem' },
    { id: 'devflow', name: '@dshforge/devflow' },
  ])
  assert.ok(!patch.includes('/client'))
})
