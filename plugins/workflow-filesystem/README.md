# Filesystem Workflows

`@dshforge/workflow-filesystem` is a provider for `@dshforge/workflow`. It discovers direct `.js` files, parses metadata through the shared `ctx.workflows.parse` Acorn parser without executing the workflow body, and loads the selected script through the official engine. The same format is used by DevFlow's bundled workflows.

## Roots and precedence

| Rank | Source | Directory |
|---|---|---|
| 100 | `project-dsh` | `<git-root>/.dsh/workflows/` |
| 200 | `project-agents` | `<git-root>/.agents/workflows/` |
| 300 | `custom` | `customWorkflowDirs` in order |
| 400 | `user-dsh` | `$DSH_HOME/workflows/` or `~/.dsh/workflows/` |
| 500 | `user-agents` | `$DSH_AGENTS_HOME/workflows/` or `~/.agents/workflows/` |

The project root is the nearest ancestor containing `.git`; without one, the current working directory is used. Lower ranks win duplicate names. Symlink entries and non-`.js` files are ignored.

## File format

```js
export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler',
  whenToUse: 'When reviewing route coverage',
  phases: [{ title: 'Audit' }],
  input: { hint: '<路径>', required: true },
}

phase('Audit')
const files = args.input.split(',').map(file => file.trim()).filter(Boolean)
return await pipeline(files, file => agent(`Audit ${file}`))
```

`export const meta` must be the first statement: an `ExportNamedDeclaration` containing exactly one `const meta` binding initialized by an `ObjectExpression`. Acorn parses the complete module and supplies the declaration end offset used to separate the workflow body. Supported fields are `name`, `description`, `whenToUse`, `phases`, and the provider-owned `input` extension; `input` is removed before the official engine validates metadata. The body is plain JavaScript with top-level `await`, using the official `agent`, `pipeline`, `parallel`, `phase`, `log`, and `args` hooks.

Only the metadata object expression is evaluated during discovery, in an empty `node:vm` context with a timeout and dynamic code generation disabled. The body is not evaluated until execution. Acorn identifies the syntax; it does not execute code. VM metadata evaluation is for trusted local workflow directories, not remote or untrusted content.

## Refresh and verification

Run `/workflows reload` after adding, renaming, or deleting files. No filesystem watcher is installed. Filesystem reads use the combined caller and provider-lifecycle signal, so disposing the provider aborts stale reads.

```sh
cd plugins/workflow-filesystem && pnpm test
```
