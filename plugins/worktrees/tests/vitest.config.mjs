import base from '../../../third_party/deepseek-harness/vitest.config.ts'
import { resolve } from 'node:path'

const { projects: _upstreamProjects, ...test } = base.test

export default {
  ...base,
  root: resolve(import.meta.dirname, '../../../third_party/deepseek-harness'),
  test: {
    ...test,
    include: [resolve(import.meta.dirname, 'worktrees.test.js')],
  },
}
