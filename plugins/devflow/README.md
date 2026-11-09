# DevFlow

DevFlow is a bundled provider for `@dshforge/workflow`. It contributes nine packaged research and development workflows. Every script declares `export const meta = { … }`, parsed by the same shared Acorn parser as project and user workflows. DevFlow preserves its `question`/`instruction` argument mapping. The shared registry owns discovery, slash handlers, the `run_workflow` model tool, Session records, and Jobs.

## Composition

```sh
dagger --progress=plain call dsh web \
  --plugins ./plugins/workflow \
  --plugins ./plugins/workflow-filesystem \
  --plugins ./plugins/devflow \
  up --ports 3080:3080
```

The filesystem provider is optional when only the bundled commands are needed.

## Commands

- `/deep-research <question>` runs Scope, Search, Fetch/Extract, Verify, and Synthesize.
- `/batch <change>` creates a plan without starting workers. After approval, `/batch continue <approved plan>` assigns independent units to worktree-backed workers.
- `/init`, `/review`, `/simplify`, `/security-review`, `/debug`, `/run`, and `/verify` run their packaged workflows.

Submitting a slash command starts a Session-owned background Job without queuing a user message or requiring a model turn. The generic `run_workflow` model tool uses the same path for an explicitly requested workflow. Both return a Job ID immediately; `job_output` collects results and `job_kill` cancels the run.

Use `/workflows` to list bundled and filesystem workflows, and `/workflows reload` after changing workflow files.

## Verification

```sh
cd plugins/devflow && pnpm test
```

Real-composition scenarios live in `.dagger/module/bdd/features/devflow.feature`.

## Limitations

- `/batch continue` requires `create_worktree` in the worker Agent's tool set; workers must not edit the source checkout concurrently.
- `/debug` cannot change Host logging flags through the command interface.
- `/review ultra` is local multi-agent review, not Claude's cloud ultrareview.
