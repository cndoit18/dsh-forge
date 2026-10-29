# DevFlow

DeepSeek Harness slash commands that submit conversation messages and run packaged research and development workflows through the Agent.

## Commands

- `/deep-research <question>` runs the packaged Scope, Search, Fetch/Extract, Verify, and Synthesize workflow.
- `/batch <change>` creates a plan without starting workers. After approval, `/batch continue <approved plan>` assigns independent units to worktree-backed workers.
- `/init`, `/review`, `/simplify`, `/security-review`, `/debug`, `/run`, and `/verify` run their packaged workflows in the current conversation.

Submitting a command first queues its original text as a normal user message. The Agent then calls the `devflow` tool, which loads the packaged workflow and starts a Session-owned background job. The tool returns its job ID immediately so long workflows outlive the PTC transport's execution deadline. Progress and completion arrive through Jobs; `job_output` collects the result and `job_kill` cancels the workflow. The command handler does not start workers while the message is still in the composer.

The tool resolves `workflowEngine` through `agentPresets.serviceFor(agent, 'workflowEngine')`. The bundle enables Workflow support in the `ptc` preset while retaining its tools and PTC presentation, and limits concurrent workflow agents to the shipped spawn provider's eight active children. The `standard` preset already supports Workflow. Existing sessions retain their original preset revision, so start a new session after installing this update.

## Verification

```sh
node --test plugins/devflow/tests/commands.test.js
```

Real-composition scenarios live in `.dagger/module/bdd/features/devflow.feature`.

## Limitations

- `/batch continue` requires `create_worktree` in the worker Agent's tool set; workers must not edit the source checkout concurrently.
- `/debug` cannot change Host logging flags through the command interface.
- `/review ultra` is local multi-agent review, not Claude's cloud ultrareview.
