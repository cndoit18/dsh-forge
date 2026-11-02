# DevFlow

DeepSeek Harness slash commands and a model-facing tool that run packaged research and development workflows through Session-owned jobs.

## Commands

- `/deep-research <question>` runs the packaged Scope, Search, Fetch/Extract, Verify, and Synthesize workflow.
- `/batch <change>` creates a plan without starting workers. After approval, `/batch continue <approved plan>` assigns independent units to worktree-backed workers.
- `/init`, `/review`, `/simplify`, `/security-review`, `/debug`, `/run`, and `/verify` run their packaged workflows in the current conversation.

Submitting a slash command directly loads its packaged workflow and starts a Session-owned background job without queuing a user message or requiring a model turn. The `devflow` model tool uses the same start path. Both return a job ID immediately so long workflows outlive the PTC transport's execution deadline. Progress and completion arrive through Jobs; `job_output` collects the result and `job_kill` cancels the workflow.

The bundle declares the shipped root Workflow provider as a component and injects its `workflowEngine`; it does not replace preset definitions or change the provider's default configuration. Existing sessions retain their original preset revision, so start a new session after installing this update.

## Verification

```sh
node --test plugins/devflow/tests/commands.test.js
```

Real-composition scenarios live in `.dagger/module/bdd/features/devflow.feature`.

## Limitations

- `/batch continue` requires `create_worktree` in the worker Agent's tool set; workers must not edit the source checkout concurrently.
- `/debug` cannot change Host logging flags through the command interface.
- `/review ultra` is local multi-agent review, not Claude's cloud ultrareview.
- Command icons and localized aliases are isolated in `src/client.js` and use the trigger menu's private DOM because `commandUi` does not expose icon or alias decoration for third-party Host commands; upstream DOM changes require updating that adapter.
