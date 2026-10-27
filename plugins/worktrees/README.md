---
description: "Create isolated Git worktrees on first send, fork worktree chats, and manage cleanup in DeepSeek Harness Web."
kind: "package-bundle"
---

# @dshforge/worktrees

## Use this package

Mount this Web plugin from the dsh-forge repository root. Dagger installs the official experimental `worktree` package as a dependency and composes only its loader entry. The `tool-worktree` bundle and model tool are not composed:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/worktrees \
  up --ports 3080:3080
```

In a Git-backed chat, open the work-location control beside the composer and choose **新建本地工作树**. This records a pending choice only. On the first text message, the native Agent pre-step creates a branch and checkout through DSH's upstream WorktreeService before model and tool execution. The resident composer and its Enter/send behavior stay unchanged. Non-Git directories show only local status and never show the worktree creation entry.

A managed worktree chat replaces the native assistant-message fork action with the work-location choice; no second fork button is added. **在原工作树中继续** forks the conversation immediately and shares files with the original chat. **在新工作树中创建** forks the conversation immediately but delays its independent Git branch and checkout until the child chat's first send. Non-worktree chats retain the native fork behavior.

The Worktrees settings section configures fetch-before-create, automatic cleanup, retention count, and delete confirmation. Its managed list opens associated chats and deletes eligible worktrees. Current, pinned, materialized, and pending-fork sessions are protected. Deletion writes a recovery snapshot containing the tracked binary diff and untracked files before removing the checkout.

## Data and development

Settings, managed records, pending forks, and recovery snapshots live under `DSH_HOME/plugins/worktrees/`. The Host exposes the `worktrees` Remote namespace while keeping its own Cordis service key distinct from the upstream `worktrees` provider.

```sh
npm test
npm run build
```

The tests use the vendored upstream Git fixtures and require `third_party/deepseek-harness/node_modules` to be installed. The build copies the Host files and emits the direct browser module with inline semantic-token CSS.

## Model Experience

The plugin adds no model tool, prompt, or context event. The Dagger composition installs and enables DSH's original `@deepseek-ai/dsh-experimental-worktree` package, retaining its original component identity. The official `tool-worktree` model tool is not composed or required. After creation, subsequent model and tool operations use the Agent's upstream-managed worktree working directory.

#### KV Cache effect

No direct effect on request prefixes or reusable model context.

## Known Limitations and Deferred Work

- First-send creation accepts text only; attachments must be removed before creation.
- The checkout pool is fixed to the repository-relative `.agents/worktrees` directory used by the upstream runtime. Arbitrary absolute roots are not supported.
- Creation starts from the current local HEAD. Uncommitted changes and historical working-tree states are not copied into an isolated fork.
- Worktree chats use a single native-position fork action; non-worktree chats keep DSH's native conversation fork behavior.
- Recovery snapshots are preserved for manual recovery; the first version has no one-click restore action.
