import { copyFile, readFile, writeFile } from 'node:fs/promises'

await copyFile('src/index.js', 'lib/index.js')
await copyFile('src/manager.js', 'lib/manager.js')
const source = await readFile('src/client.js', 'utf8')
const css = await readFile('src/client.css', 'utf8')
const styled = source.replace("const WORKTREE_CSS = /* WORKTREE_CSS */ ''", 'const WORKTREE_CSS = ' + JSON.stringify(css))
await writeFile('lib/client.js', styled)
