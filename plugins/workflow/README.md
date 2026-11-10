# Workflows

`@dshforge/workflow` adds a Skill-style registry for reusable JavaScript workflows. It owns provider merging, per-Agent slash commands, the generic `run_workflow` model tool, Session records, and background Jobs. Script execution remains owned by the official `@deepseek-ai/dsh-workflow-ptc` engine.

## Composition

Install `@dshforge/workflows-bundle` to activate the registry and all providers in one layer. For a custom composition, install the registry before any providers. Add the filesystem provider for project/user workflows and DevFlow for its nine bundled workflows:

```sh
dagger --progress=plain call dsh web \
  --plugins ./plugins/workflows-bundle \
  up --ports 3080:3080
```

Each package is an independent Bundle; do not add its Loader rows to global Cordis configuration manually.

## Use

- `/<name> <input>` queues the original command as a followup user message. The Web client presents every workflow with the official blue command Chip and hides successful submission receipts; failures retain the generic command error card. That first turn calls `run_workflow` to start the winning workflow, clearing the Session's provisional blank state before background work begins.
- `/workflows` lists the current Agent's catalog. `/workflows reload` rescans providers and refreshes scoped commands after files change.
- `run_workflow` exposes the same named workflow to the model only for an explicit user request. Ad-hoc JavaScript continues to use the official `workflow` tool.
- Runs return a `workflow-*` Job ID when the model tool starts them. Existing Jobs controls collect output and cancel work; existing workflow-run conversation nodes show phases and Agents.

Project entries outrank user entries, which outrank bundled entries. A workflow never replaces an unrelated existing command such as `/permission`.

## Provider API

Runtime bundles can register a complete definition:

```js
const dispose = ctx.workflows.register({
  name: 'audit-routes',
  description: 'Audit route handlers',
  input: { hint: '<路径>', required: true },
  source: 'bundled',
  provider: 'my-bundle',
  script: 'return await agent(args.input)',
})
```

Providers with lazy loading implement `list()` and `get(candidate, options)` and register through `ctx.workflows.registerProvider(control => provider)`. Candidates carry `rank` and an opaque `locator`; lower ranks win. Wrap registration in `ctx.effect` so unload removes the provider and its generated commands. Provider failures are skipped during automatic discovery so healthy bundled commands remain available; explicit `/workflows reload` reports discovery failures. Disposing a provider aborts its in-flight list/get calls, and later reads resolve the remaining providers. Initial Agent creation waits until its scoped commands are registered, and failed automatic refreshes withdraw stale commands rather than presenting them as executable.

Definitions support `name`, `description`, optional `whenToUse`, `phases`, `input`, `source`, `provider`, `path`, `script`, and an optional `createArgs(input)` mapper. Without a mapper, scripts receive `args.input`. `ctx.workflows.parse` exposes the shared Acorn parser to bundled and filesystem providers through Cordis, so independently installed bundles do not import each other's files. Script files declare `export const meta = { … }` before the body; the parser validates that declaration and returns the body without evaluating it.

## Limits

- The registry does not watch files. Use `/workflows reload` after editing discovery directories.
- Jobs and the official engine provide cancellation and progress; pause/resume, checkpoint replay, and process-restart recovery are not added here.
- Scoped command discovery requires a live Agent. Model invocation resolves the catalog afresh using that Agent's working directory.

## Verification

```sh
cd plugins/workflow && pnpm test
```
