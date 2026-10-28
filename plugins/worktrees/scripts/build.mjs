import { build } from 'esbuild'
import { copyFile, readFile, writeFile } from 'node:fs/promises'

for (const file of ['index.js', 'manager.js', 'store.js']) {
  await copyFile('src/' + file, 'lib/' + file)
}

const result = await build({
  entryPoints: ['src/client.js'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  write: false,
  outdir: 'lib',
  external: ['react', 'react-dom', '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'],
  plugins: [{
    name: 'inline-worktree-css',
    setup(build) {
      build.onLoad({ filter: /client\.css$/ }, async args => ({
        contents: 'export default ' + JSON.stringify(await readFile(args.path.split('?')[0], 'utf8')),
        loader: 'js',
      }))
    },
  }],
  logLevel: 'silent',
})
const body = result.outputFiles[0].text
const loader = 'window.__ModuleLoader__.load({ id: ' + JSON.stringify('@dshforge/worktrees') + ', factory(require) {\nconst module = { exports: {} };\n' + body + '\nreturn module.exports;\n} })\n'
await writeFile('lib/client.js', loader)
