import { build } from 'esbuild'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const upstream = resolve(root, '../../third_party/deepseek-harness')
await build({
  absWorkingDir: root,
  entryPoints: ['tests/client.test.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  jsx: 'automatic',
  outfile: '.test-dist/client.test.mjs',
  nodePaths: [upstream + '/node_modules'],
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
  plugins: [{
    name: 'upstream-browser-sources',
    setup(build) {
      build.onLoad({ filter: /client\.css\?inline$/ }, async args => ({
        contents: 'export default ' + JSON.stringify(await (await import('node:fs/promises')).readFile(args.path.split('?')[0], 'utf8')),
        loader: 'js',
      }))
      build.onResolve({ filter: /^@deepseek-ai\/dsh-client-(store|ui-primitives)$/ }, args => {
        const name = args.path === '@deepseek-ai/dsh-client-store' ? 'store' : 'ui-primitives'
        return { path: upstream + '/packages/client/' + name + '/src/index.ts' }
      })
    },
  }],
  external: ['react', 'react-dom', 'react-dom/*', '@testing-library/react', 'jsdom', '@deepseek-ai/cordis'],
  logLevel: 'silent',
})
