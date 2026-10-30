# DevFlow

DeepSeek Harness slash commands that submit conversation messages and run packaged research and development workflows through the Agent.

## Commands

- `/deep-research <question>` runs the packaged Scope, Search, Fetch/Extract, Verify, and Synthesize workflow.
- `/skillopt <skill goal or path, with examples/tasks>` creates a new skill against a no-skill baseline or optimizes an existing skill against its old version. It combines [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)'s intent capture, realistic eval prompts, triggering frontmatter, and lean SKILL.md guidance with a bounded-edit, held-out [SkillOpt](https://github.com/microsoft/skillopt) gate. It writes the candidate only after a completely judged validation run shows a strictly higher primary-objective score and no protected-criterion regression; ties and incomplete evaluations leave the target unchanged.
- `/batch <change>` creates a plan without starting workers. After approval, `/batch continue <approved plan>` assigns independent units to worktree-backed workers.
- `/init`, `/review`, `/simplify`, `/security-review`, `/debug`, `/run`, and `/verify` run their packaged workflows in the current conversation.

Submitting a command first queues its original text as a normal user message. The Agent then calls the `devflow` tool, which loads the packaged workflow and starts a Session-owned background job. The tool returns its job ID immediately so long workflows outlive the PTC transport's execution deadline. Progress and completion arrive through Jobs; `job_output` collects the result and `job_kill` cancels the workflow. The command handler does not start workers while the message is still in the composer.

The tool resolves `workflowEngine` through `agentPresets.serviceFor(agent, 'workflowEngine')`. The bundle enables Workflow support in the `ptc` preset while retaining its tools and PTC presentation, and limits concurrent workflow agents to the shipped spawn provider's eight active children. The `standard` preset already supports Workflow. Existing sessions retain their original preset revision, so start a new session after installing this update.

## SkillOpt workflow

`/skillopt` optimizes a candidate in memory. It does not write each accepted intermediate candidate.

### Loop parameters

The loop is bounded by workflow constants rather than additional slash-command arguments:

- The outer epoch limit bounds complete optimization passes and defaults to four epochs.
- The per-epoch step limit bounds candidate attempts within one epoch.
- The edit budget allows one valid `append`, `replace`, or `delete` edit per candidate by default, so each gate measures one optimization direction. Empty or malformed edits are discarded before the budget is applied.

Preparation derives exactly one primary optimization objective from the request and separate protected criteria that must not regress. It also supplies disjoint training and held-out validation tasks. Training results drive reflection and edits; validation tasks and expected outcomes are not included in the reflection or update prompts.

### Parallel execution boundaries

Parallelism is limited to independent evaluation work:

- Rollout and judge pairs for separate tasks in the same evaluation run in parallel. Within each pair, judging waits for that task's rollout.
- The initial training evaluation and baseline validation evaluation run in parallel.
- Reflection, candidate generation, acceptance decisions, subsequent steps, and the final write remain sequential because they depend on earlier results.

Evaluation agents do not edit files or external state. A failed rollout or judge produces an incomplete result; it is not replaced with a successful score.

### Gate and rejected edits

Each candidate is compared with the **latest accepted objective scores**, not repeatedly with the original baseline. Acceptance requires complete baseline and candidate evaluations, a strictly higher primary-objective mean score, and no regression in any protected-criterion mean score. The overall rubric score remains available in results but does not override the primary objective. A tie, lower primary score, protected regression, missing metric, or incomplete evaluation cannot pass the gate. An accepted candidate and its objective scores become the baseline for the next step.

Each epoch has its own rejected-edit buffer. Edits from candidates rejected during that epoch are retained as negative feedback for later steps in the same epoch, helping reflection avoid repeating a failed proposal. The buffer is scoped to that epoch rather than carried into the next one.

### Step summaries and the final write

The loop records a summary for each attempted step, including its position in the loop, gate outcome, overall and objective scores, primary delta, protected-criterion deltas, concrete rejection reasons, selected edits, and candidate summary. These summaries describe intermediate decisions even though those candidates are not written to disk.

After the loop, the workflow makes at most one write: the latest accepted candidate is written to the target `SKILL.md`, then read back to confirm exact equality. If no candidate passed the gate, there is no write. A failed final write is reported separately from gate rejection.

### Deliberately unported SkillOpt features

This workflow ports bounded edits and held-out optimization, not the complete upstream SkillOpt system. It does not implement the upstream **Sleep** phase, a separate **slow/SLOW_UPDATE** update pathway, or **meta-skill/meta-optimization** behavior. Existing `SLOW_UPDATE` and `APPENDIX` blocks are preserved as protected skill text during candidate generation; that preservation does not add a slow-update mechanism.

## Verification

```sh
node --test plugins/devflow/tests/commands.test.js
```

Real-composition scenarios live in `.dagger/module/bdd/features/devflow.feature`.

## Limitations

- `/batch continue` requires `create_worktree` in the worker Agent's tool set; workers must not edit the source checkout concurrently.
- `/debug` cannot change Host logging flags through the command interface.
- `/review ultra` is local multi-agent review, not Claude's cloud ultrareview.
