import base from '../../../third_party/deepseek-harness/vitest.config.ts'
import { resolve } from 'node:path'

const { projects: _upstreamProjects, ...test } = base.test

export default {
  ...base,
  root: resolve(import.meta.dirname, '../../../third_party/deepseek-harness'),
  test: {
    ...test,
    setupFiles: [],
    exclude: ['**/node_modules/**', '**/.test-dist/**', '**/test-support/**'],
    fileParallelism: false,
    coverage: { ...test.coverage, allowExternal: true, include: ['**/plugins/worktrees/src/**/*.js'] },
    include: [resolve(import.meta.dirname, '**/*.test.js')],
  },
}
