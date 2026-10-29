# DevFlow

Native DeepSeek Harness host commands for research and development workflows.

## Commands

- `/deep-research <question>` runs the packaged Scope, Search, Fetch/Extract, Verify, and Synthesize workflow.
- `/batch <change>` creates a plan without starting workers. After approval, `/batch continue <approved plan>` assigns independent units to worktree-backed workers.
- `/init`, `/review`, `/simplify`, `/security-review`, `/debug`, `/run`, and `/verify` launch their packaged workflows directly from the host command registry.

Commands resolve `workflowEngine` through `agentPresets.serviceFor(agent, 'workflowEngine')`; use an Agent preset with Workflow support. Model calls happen inside workflows, not during command discovery.

## Verification

```sh
node --test plugins/devflow/tests/commands.test.js
```

Real-composition scenarios live in `.dagger/module/bdd/features/devflow.feature`.

## Limitations

- `/batch continue` requires `create_worktree` in the worker Agent's tool set; workers must not edit the source checkout concurrently.
- `/debug` cannot change Host logging flags through the command interface.
- `/review ultra` is local multi-agent review, not Claude's cloud ultrareview.
