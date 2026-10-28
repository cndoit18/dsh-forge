window.__ModuleLoader__.load({ id: "@dshforge/worktrees", factory(require) {
const module = { exports: {} };
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/actions.js
var actions_exports = {};
__export(actions_exports, {
  createWorktreeActions: () => createWorktreeActions,
  initialState: () => initialState
});
function createWorktreeActions(ctx, state, forkRequest) {
  const set = (patch) => state.set({ ...state.getSnapshot(), ...patch });
  const reportError = (sessionId, error) => {
    const message = error instanceof Error ? error.message : String(error);
    set({ errors: { ...state.getSnapshot().errors, [sessionId]: message } });
  };
  const call = async (endpoint, payload) => {
    const result = await ctx.connection.rpc.call("/api", "worktrees/" + endpoint, {
      args: payload === void 0 ? {} : { request: payload }
    });
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const inspect = async (sessionId) => {
    if (!sessionId) return void 0;
    try {
      const repository = await call("inspect", { sessionId });
      set({ repositories: { ...state.getSnapshot().repositories, [sessionId]: repository } });
      return repository;
    } catch (error) {
      reportError(sessionId, error);
      return void 0;
    }
  };
  const select = async (sessionId, selection) => {
    try {
      await call("select", { sessionId, pending: selection === "new" });
      set({ errors: { ...state.getSnapshot().errors, [sessionId]: void 0 } });
      await inspect(sessionId);
    } catch (error) {
      reportError(sessionId, error);
      throw error;
    }
  };
  const loadSettings = async () => {
    try {
      set({ settings: await call("settingsRead"), error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  const loadItems = async () => {
    try {
      set({ items: await call("list", {}), error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  const openWorktree = (item) => {
    if (item.sessionIds[0]) ctx.uiWorkspace.openSession(item.sessionIds[0]);
    else set({ error: ctx.locale.bind("worktrees")("unlinked") });
  };
  return {
    inspect,
    select,
    reportError,
    openFork: (request) => forkRequest.set(request),
    closeFork: () => forkRequest.set(null),
    async forkShared(request) {
      const childId = await ctx.sessions.fork({ sessionId: request.sessionId, atSeq: request.atSeq, increaseTitle: true });
      await call("adopt", { sessionId: request.sessionId, childId });
      ctx.uiWorkspace.openSession(childId);
    },
    async forkIsolated(request) {
      const result = await call("fork", { ...request, isolate: true });
      await select(result.sessionId, "new");
      ctx.uiWorkspace.openSession(result.sessionId);
    },
    loadSettings,
    loadItems,
    changeSettings: (patch) => set({ settings: { ...state.getSnapshot().settings, ...patch } }),
    async saveSettings() {
      try {
        set({ settings: await call("settingsWrite", state.getSnapshot().settings), error: null });
        await loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },
    askDelete: (item) => set({ deleteCandidate: item }),
    cancelDelete: () => set({ deleteCandidate: null }),
    async remove(item) {
      try {
        await call("remove", { path: item.path, confirmed: true });
        set({ deleteCandidate: null });
        await loadItems();
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },
    openWorktree
  };
}
var initialState;
var init_actions = __esm({
  "src/client/actions.js"() {
    initialState = { repositories: {}, errors: {}, settings: null, items: [], error: null, deleteCandidate: null };
  }
});

// src/client/locale.js
var zh, en;
var init_locale = __esm({
  "src/client/locale.js"() {
    zh = {
      local: "\u672C\u5730",
      newTree: "\u65B0\u5EFA\u672C\u5730\u5DE5\u4F5C\u6811",
      pending: "\u65B0\u5DE5\u4F5C\u6811",
      position: "\u5DE5\u4F5C\u4F4D\u7F6E",
      createOnSend: "\u53D1\u9001\u9996\u6761\u6D88\u606F\u65F6\u521B\u5EFA",
      base: "\u57FA\u4E8E",
      notGit: "\u5F53\u524D\u76EE\u5F55\u4E0D\u662F Git \u4ED3\u5E93",
      settings: "Worktrees",
      creation: "\u521B\u5EFA\u4E0E\u6E05\u7406",
      root: "\u5DE5\u4F5C\u6811\u6839\u76EE\u5F55",
      defaultRoot: "\u5F53\u524D\u7248\u672C\u56FA\u5B9A\u4F7F\u7528\u4ED3\u5E93\u5185 .agents/worktrees",
      fetch: "\u521B\u5EFA\u5DE5\u4F5C\u6811\u524D\u59CB\u7EC8\u83B7\u53D6\u4E0A\u6E38\u66F4\u65B0",
      fetchDetail: "\u542F\u7528\u540E\uFF0C\u521B\u5EFA\u524D\u5148\u83B7\u53D6\u4E0A\u6E38\u66F4\u65B0",
      cleanup: "\u81EA\u52A8\u5220\u9664\u65E7\u5DE5\u4F5C\u6811",
      snapshot: "\u5220\u9664\u524D\u4FDD\u5B58\u6062\u590D\u5FEB\u7167",
      keep: "\u4FDD\u7559\u5DE5\u4F5C\u6811\u6570\u91CF",
      keepDetail: "\u8D85\u51FA\u6570\u91CF\u540E\u6E05\u7406\u6700\u65E7\u7684\u5DE5\u4F5C\u6811\uFF1B\u5F53\u524D\u6216\u7F6E\u9876\u804A\u5929\u7684\u5DE5\u4F5C\u6811\u59CB\u7EC8\u4FDD\u7559",
      confirm: "\u5220\u9664\u5DE5\u4F5C\u6811\u524D\u8BE2\u95EE",
      confirmDetail: "\u786E\u8BA4\u8DEF\u5F84\u548C\u672A\u63D0\u4EA4\u6539\u52A8\u540E\u624D\u4F1A\u6267\u884C",
      managed: "\u5DF2\u7BA1\u7406\u5DE5\u4F5C\u6811",
      empty: "\u5C1A\u65E0\u5DE5\u4F5C\u6811",
      refresh: "\u5237\u65B0\u5DE5\u4F5C\u6811\u5217\u8868",
      forkTitle: "\u4ECE\u8FD9\u91CC\u521B\u5EFA\u804A\u5929\u5206\u652F",
      forkDescription: "\u590D\u5236\u5F53\u524D\u6D88\u606F\u53CA\u4E4B\u524D\u7684\u5BF9\u8BDD\uFF0C\u4E0D\u5305\u542B\u4E4B\u540E\u7684\u6D88\u606F\u3002",
      branch: "\u5728\u65B0\u5BF9\u8BDD\u4E2D\u5206\u652F",
      branchUnavailable: "\u4EC5\u53EF\u4ECE\u5DF2\u5B8C\u6210\u8F6E\u6B21\u7684\u6700\u540E\u4E00\u6761\u6D88\u606F\u5206\u652F",
      copy: "\u590D\u5236",
      copied: "\u5DF2\u590D\u5236",
      original: "\u5728\u539F\u5DE5\u4F5C\u6811\u4E2D\u7EE7\u7EED",
      originalDetail: "\u4E24\u4E2A\u804A\u5929\u5171\u4EAB\u5F53\u524D\u5DE5\u4F5C\u6811\u3001\u6587\u4EF6\u53CA\u672A\u63D0\u4EA4\u6539\u52A8\u3002",
      independent: "\u5728\u65B0\u5DE5\u4F5C\u6811\u4E2D\u521B\u5EFA",
      independentDetail: "\u804A\u5929\u7ACB\u5373\u5206\u53C9\uFF1B\u9996\u6B21\u53D1\u9001\u6D88\u606F\u65F6\uFF0C\u518D\u521B\u5EFA\u72EC\u7ACB\u5DE5\u4F5C\u6811\u548C Git \u5206\u652F\u3002",
      shared: "\u4E24\u4E2A\u804A\u5929\u5BF9\u6587\u4EF6\u7684\u540E\u7EED\u4FEE\u6539\u4F1A\u76F8\u4E92\u53EF\u89C1\u3002",
      cleanBase: "\u57FA\u4E8E\u5F53\u524D\u5206\u652F HEAD \u521B\u5EFA\uFF0C\u4E0D\u590D\u5236\u672A\u63D0\u4EA4\u6539\u52A8\uFF0C\u4E5F\u4E0D\u6062\u590D\u5386\u53F2\u4EE3\u7801\u72B6\u6001\u3002",
      cancel: "\u53D6\u6D88",
      fork: "\u521B\u5EFA\u804A\u5929\u5206\u652F",
      save: "\u4FDD\u5B58",
      delete: "\u5220\u9664",
      open: "\u6253\u5F00\u804A\u5929",
      immediate: "\u7ACB\u5373\u5206\u53C9",
      onSend: "\u53D1\u9001\u65F6\u521B\u5EFA",
      settingsIntro: "\u4E3A\u72EC\u7ACB\u804A\u5929\u914D\u7F6E\u4EE3\u7801\u73AF\u5883\uFF0C\u4EE5\u53CA\u4E0D\u518D\u4F7F\u7528\u65F6\u7684\u6E05\u7406\u65B9\u5F0F\u3002",
      protected: "\u53D7\u4FDD\u62A4",
      pinned: "\u5DF2\u7F6E\u9876",
      ready: "\u5C31\u7EEA",
      missing: "\u76EE\u5F55\u7F3A\u5931",
      noRecovery: "\u4E0D\u4F1A\u5220\u9664\u975E\u63D2\u4EF6\u7BA1\u7406\u7684\u76EE\u5F55",
      recent: "\u6700\u8FD1\u4F7F\u7528",
      chatCount: "\u4E2A\u5173\u8054\u804A\u5929",
      unlinked: "\u6CA1\u6709\u5173\u8054\u7684\u804A\u5929\uFF0C\u65E0\u6CD5\u6253\u5F00\u8BE5\u5DE5\u4F5C\u6811",
      loading: "\u2026",
      worktreePrefix: "worktree \xB7 ",
      tokens: " tok",
      separator: " \xB7 "
    };
    en = {
      local: "Local",
      newTree: "New local worktree",
      pending: "New worktree",
      position: "Work location",
      createOnSend: "Create when the first message is sent",
      base: "Based on",
      notGit: "The current directory is not a Git repository",
      settings: "Worktrees",
      creation: "Creation and cleanup",
      root: "Worktree root",
      defaultRoot: "This version uses .agents/worktrees inside the repository",
      fetch: "Fetch upstream changes before creating a worktree",
      fetchDetail: "Fetch upstream changes before creation",
      cleanup: "Automatically delete old worktrees",
      snapshot: "Save a recovery snapshot before deletion",
      keep: "Worktrees to keep",
      keepDetail: "Delete the oldest worktrees above this count; current and pinned chats are always retained",
      confirm: "Ask before deleting a worktree",
      confirmDetail: "Confirm the path and uncommitted changes before deletion",
      managed: "Managed worktrees",
      empty: "No worktrees yet",
      refresh: "Refresh worktree list",
      forkTitle: "Create a chat branch here",
      forkDescription: "Copy this message and earlier messages, excluding later messages.",
      branch: "Branch in a new chat",
      branchUnavailable: "Branch only from the last message of a completed turn",
      copy: "Copy",
      copied: "Copied",
      original: "Continue in the original worktree",
      originalDetail: "Both chats share the current worktree, files, and uncommitted changes.",
      independent: "Create in a new worktree",
      independentDetail: "Fork the chat now; create its independent worktree and Git branch on first send.",
      shared: "Subsequent file changes are visible to both chats.",
      cleanBase: "Created from the current branch HEAD without copying uncommitted changes or restoring historical code.",
      cancel: "Cancel",
      fork: "Create chat branch",
      save: "Save",
      delete: "Delete",
      open: "Open chat",
      immediate: "Fork now",
      onSend: "Create on send",
      settingsIntro: "Configure code environments for independent chats and cleanup when they are no longer used.",
      protected: "Protected",
      pinned: "Pinned",
      ready: "Ready",
      missing: "Directory missing",
      noRecovery: "Directories not managed by the plugin are never deleted",
      recent: "Last used",
      chatCount: "linked chats",
      unlinked: "Open a linked chat before opening this worktree",
      loading: "\u2026",
      worktreePrefix: "worktree \xB7 ",
      tokens: " tok",
      separator: " \xB7 "
    };
  }
});

// src/client/shared.jsx
var shared_exports = {};
__export(shared_exports, {
  dictionaries: () => dictionaries,
  t: () => t2,
  useRepository: () => useRepository,
  worktreeLabel: () => worktreeLabel
});
function worktreeLabel(branch) {
  return /^worktree-([0-9a-f]{8})/.exec(branch)?.[0] ?? branch;
}
function useRepository(sessionId, actions, running, promptAttempted) {
  (0, import_react.useEffect)(() => {
    void actions.inspect(sessionId);
  }, [sessionId, actions]);
  (0, import_react.useEffect)(() => {
    if (sessionId && promptAttempted && !running) void actions.inspect(sessionId);
  }, [sessionId, promptAttempted, running, actions]);
}
var import_react, dictionaries, t2;
var init_shared = __esm({
  "src/client/shared.jsx"() {
    import_react = require("react");
    init_locale();
    dictionaries = { zh, en };
    t2 = (key, language = "zh") => dictionaries[language]?.[key] ?? zh[key] ?? key;
  }
});

// src/client/location.jsx
var location_exports = {};
__export(location_exports, {
  WorkLocation: () => WorkLocation,
  WorktreeDock: () => WorktreeDock
});
function WorkLocation({ sessionId, useSession, useWorktreeState, activeOnly = false, actions, t: t3 }) {
  const [open, setOpen] = (0, import_react2.useState)(false);
  const repository = useWorktreeState((value) => value.repositories[sessionId]);
  const blank = useSession((snapshot) => snapshot.blank);
  useRepository(sessionId, actions);
  if (activeOnly && blank) return null;
  if (!sessionId || !repository) return null;
  const pending = repository.pendingSelection;
  if (repository.managed && !pending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wt-location", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "wt-location-button wt-location-static wt-worktree", title: repository.managed.path, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconBranchOutlineRegular, { className: "wt-location-icon", size: 16 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-location-label", children: t3("worktreePrefix") + worktreeLabel(repository.managed.branch) })
  ] }) });
  const items = [
    { type: "label", id: "location-status", text: repository.git ? t3("position") : t3("notGit") },
    { id: "local", label: t3("local"), icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpenRegular, { size: 16 }) },
    ...repository.git ? [{
      id: "new",
      icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconBranchOutlineRegular, { size: 16 }),
      label: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "wt-menu-copy", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-menu-name", children: t3("newTree") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-menu-description", children: t3("createOnSend") })
      ] })
    }] : []
  ];
  const select = async (id) => {
    try {
      await actions.select(sessionId, id === "new" ? "new" : "local");
    } catch (error) {
      actions.reportError(sessionId, error);
    }
    setOpen(false);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "wt-location", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_dsh_client_ui_primitives.Menu,
      {
        open,
        items,
        selectedId: pending ? "new" : "local",
        onSelect: select,
        onClose: () => setOpen(false),
        align: "start",
        side: "bottom",
        portal: true,
        className: "wt-location-menu",
        anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "wt-location-button",
            "aria-label": t3("position"),
            "data-pending": pending,
            "aria-haspopup": "menu",
            "aria-expanded": open,
            onClick: () => setOpen((value) => !value),
            children: [
              repository.git ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconBranchOutlineRegular, { className: "wt-location-icon", size: 16 }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconFolderOpenRegular, { className: "wt-location-icon", size: 16 }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-location-label", children: pending ? t3("pending") : t3("local") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { className: "wt-location-chevron", size: 12 })
            ]
          }
        )
      }
    ),
    repository.branch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wt-context wt-base", title: repository.branch, children: pending ? t3("base") + " " + repository.branch : repository.branch })
  ] });
}
function WorktreeDock({ sessionId, useSession, useWorktreeState, actions }) {
  const error = useWorktreeState((value) => value.errors[sessionId]);
  const repository = useWorktreeState((value) => value.repositories[sessionId]);
  const running = useSession((snapshot) => snapshot.running);
  const promptAttempted = useSession((snapshot) => snapshot.promptAttempted);
  useRepository(sessionId, actions, running, promptAttempted);
  (0, import_react2.useEffect)(() => {
    if (!running || !repository?.pendingSelection) return;
    const timer = setInterval(() => {
      void actions.inspect(sessionId);
    }, 1e3);
    return () => clearInterval(timer);
  }, [sessionId, running, repository?.pendingSelection, actions]);
  if (error) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "wt-error", role: "alert", children: error });
  return null;
}
var import_react2, import_dsh_client_ui_primitives, import_jsx_runtime;
var init_location = __esm({
  "src/client/location.jsx"() {
    import_react2 = require("react");
    import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    init_shared();
    import_jsx_runtime = require("react/jsx-runtime");
  }
});

// src/client/conversation.jsx
var conversation_exports = {};
__export(conversation_exports, {
  ForkDialog: () => ForkDialog,
  TurnTail: () => TurnTail
});
function TurnTail({ node, sessionId, openFile, forkAt, renderSlot, useAccess, useChat, usePerformanceUsage, useWorktreeState, actions, t: t3 }) {
  const data = node.data;
  const repository = useWorktreeState((value) => value.repositories[sessionId]);
  const forkAllowed = useAccess("session/fork");
  const hasLaterChatNode = useChat((snapshot) => laterContent(snapshot, data));
  const detailed = usePerformanceUsage((mode) => mode) === "detailed";
  const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
  if (turn === void 0) return null;
  const owner = { turn, seq: data.closing?.finalNode.seq ?? data.seq, openFile };
  const tail = renderSlot("conversation.chat.turnTail", owner);
  if (!data.closing) return tail ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wt-turn-tail", "data-turn-tail": data.turn, children: tail }) : null;
  const unavailable = data.branchUnavailable || hasLaterChatNode;
  const onBranch = repository?.managed ? () => actions.openFork({ sessionId, atSeq: data.seq }) : () => forkAt(data.seq);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-turn-tail", "data-turn-tail": data.turn, children: [
    tail,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      MessageActions,
      {
        text: data.closing.blocks.flatMap((block) => block.kind === "text" ? [block.text] : []).join(""),
        time: data.closing.time,
        onBranch: forkAllowed ? onBranch : void 0,
        unavailable,
        extraActions: data.closing.finalNode.messageId === void 0 ? null : renderSlot("conversation.chat.assistant-actions", { messageId: data.closing.finalNode.messageId }),
        usage: detailed ? data.tokenUsage : void 0,
        t: t3
      }
    )
  ] });
}
function laterContent(snapshot, data) {
  for (const key of snapshot.locations.getTurn(data.turn) ?? []) {
    const later = snapshot.nodes.get(key);
    if (later?.kind !== "turn-tail" && later?.kind !== "turn-process" && later?.kind !== "turn-max-tokens" && (later?.anchorSeq ?? -1) > (data.closing?.finalNode.seq ?? data.seq)) return true;
  }
  return false;
}
function MessageActions({ text, time, onBranch, unavailable, extraActions, usage, t: t3 }) {
  const { copied, onCopy } = (0, import_dsh_client_ui_primitives2.useClipboardCopy)(text);
  const reasonId = (0, import_react3.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-message-actions", "data-clock": "end", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: copied ? t3("copied") : t3("copy"), side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "wt-action", "aria-label": copied ? t3("copied") : t3("copy"), onClick: onCopy, children: copied ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconCopyOutlineRegular, {}) }) }),
    extraActions,
    onBranch && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Tooltip, { label: unavailable ? t3("branchUnavailable") : t3("branch"), side: "bottom", openOnClick: unavailable, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        className: "wt-action",
        "aria-label": t3("branch"),
        "aria-disabled": unavailable || void 0,
        "aria-describedby": unavailable ? reasonId : void 0,
        "data-unavailable": unavailable || void 0,
        onClick: unavailable ? void 0 : onBranch,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.IconBranchOutlineRegular, {})
      }
    ) }),
    onBranch && unavailable && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { id: reasonId, className: "wt-visually-hidden", children: t3("branchUnavailable") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "wt-end-info", children: [
      usage && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-usage", children: usage.totalTokens + t3("tokens") }),
      time && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "wt-time", children: new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) })
    ] })
  ] });
}
function ForkDialog({ useForkRequest, actions, t: t3 }) {
  const request = useForkRequest((value) => value);
  const [isolate, setIsolate] = (0, import_react3.useState)(false);
  const [previousRequest, setPreviousRequest] = (0, import_react3.useState)(request);
  if (request !== previousRequest) {
    setPreviousRequest(request);
    setIsolate(false);
  }
  if (!request) return null;
  const confirm = async () => {
    try {
      if (isolate) await actions.forkIsolated(request);
      else await actions.forkShared(request);
      actions.closeFork();
    } catch (error) {
      actions.reportError(request.sessionId, error);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_dsh_client_ui_primitives2.Modal, { open: true, onClose: actions.closeFork, title: t3("forkTitle"), closeLabel: t3("cancel"), description: t3("forkDescription"), className: "wt-fork-modal", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-fork-options", role: "radiogroup", "aria-label": t3("position"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "wt-fork-option", role: "radio", "aria-checked": !isolate, onClick: () => setIsolate(false), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
          t3("original"),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: t3("immediate") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t3("originalDetail") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "wt-fork-option", role: "radio", "aria-checked": isolate, onClick: () => setIsolate(true), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("strong", { children: [
          t3("independent"),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: t3("onSend") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: t3("independentDetail") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "wt-help", children: isolate ? t3("cleanBase") : t3("shared") }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "wt-dialog-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { onClick: actions.closeFork, children: t3("cancel") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "primary", onClick: confirm, children: t3("fork") })
    ] })
  ] });
}
var import_react3, import_dsh_client_ui_primitives2, import_jsx_runtime2;
var init_conversation = __esm({
  "src/client/conversation.jsx"() {
    import_react3 = require("react");
    import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");
    import_jsx_runtime2 = require("react/jsx-runtime");
  }
});

// src/client/settings.jsx
var settings_exports = {};
__export(settings_exports, {
  SettingsPage: () => SettingsPage
});
function SettingsPage({ useWorktreeState, actions, t: t3 }) {
  const snapshot = useWorktreeState((value) => value);
  (0, import_react4.useEffect)(() => {
    void actions.loadSettings();
    void actions.loadItems();
  }, [actions]);
  const settings = snapshot.settings;
  if (!settings) return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: t3("loading") });
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h1", { children: t3("settings") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-help", children: t3("settingsIntro") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { children: t3("creation") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-settings-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "wt-setting", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: t3("root") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: t3("defaultRoot") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { value: ".agents/worktrees", readOnly: true, "aria-label": t3("root") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SettingSwitch, { label: t3("fetch"), detail: t3("fetchDetail"), checked: settings.fetchBeforeCreate, onChange: (value) => actions.changeSettings({ fetchBeforeCreate: value }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SettingSwitch, { label: t3("cleanup"), detail: t3("snapshot"), checked: settings.autoCleanup, onChange: (value) => actions.changeSettings({ autoCleanup: value }) }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("label", { className: "wt-setting", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: t3("keep") }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: t3("keepDetail") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "input",
            {
              type: "number",
              min: 1,
              max: 999,
              disabled: !settings.autoCleanup,
              value: settings.keepCount,
              onChange: (event) => actions.changeSettings({ keepCount: Number(event.currentTarget.value) })
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SettingSwitch, { label: t3("confirm"), detail: t3("confirmDetail"), checked: settings.confirmDelete, onChange: (value) => actions.changeSettings({ confirmDelete: value }) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("section", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-section-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { children: t3("managed") }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { "aria-label": t3("refresh"), onClick: actions.loadItems, children: "\u21BB" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-settings-card", children: snapshot.items.length ? snapshot.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ManagedRow, { item, actions }, item.path)) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-help", children: t3("empty") }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "wt-dialog-actions", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "primary", onClick: actions.saveSettings, children: t3("save") }) }),
    snapshot.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-error", role: "alert", children: snapshot.error }),
    snapshot.deleteCandidate && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(DeleteDialog, { item: snapshot.deleteCandidate, actions })
  ] });
}
function SettingSwitch({ label, detail, checked, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-setting", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: detail })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Switch, { label, checked, onChange })
  ] });
}
function ManagedRow({ item, actions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-managed-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("strong", { title: item.branch, children: worktreeLabel(item.branch) }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { title: item.path, children: item.path }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("small", { children: item.sessionIds.length + " " + t("chatCount") + t("separator") + t("recent") + " " + new Date(item.lastUsedAt).toLocaleDateString() })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-row-actions", children: [
      item.pinned && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-badge", children: t("pinned") }),
      item.protected && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-badge", children: t("protected") }),
      item.status === "missing" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wt-badge", children: t("missing") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: () => actions.openWorktree(item), children: t("open") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { disabled: item.protected, onClick: () => actions.askDelete(item), children: t("delete") })
    ] })
  ] });
}
function DeleteDialog({ item, actions }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_dsh_client_ui_primitives3.Modal, { open: true, title: t("delete"), closeLabel: t("cancel"), onClose: actions.cancelDelete, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: item.branch }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-help", children: item.path }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "wt-help", children: t("snapshot") + t("separator") + t("noRecovery") }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wt-dialog-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { onClick: actions.cancelDelete, children: t("cancel") }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "primary", onClick: () => actions.remove(item), children: t("delete") })
    ] })
  ] });
}
var import_react4, import_dsh_client_ui_primitives3, import_jsx_runtime3;
var init_settings = __esm({
  "src/client/settings.jsx"() {
    import_react4 = require("react");
    import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");
    init_shared();
    import_jsx_runtime3 = require("react/jsx-runtime");
  }
});

// src/client.css?inline
var client_exports = {};
__export(client_exports, {
  default: () => client_default
});
var client_default;
var init_client = __esm({
  "src/client.css?inline"() {
    client_default = ".wt-location { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; max-width: var(--dsh-composer-card-max-width); margin: 0 auto; }\n.wt-location-menu { min-width: 52px; max-width: 100%; }\n.wt-context { color: var(--dsw-alias-label-secondary); font-size: 12px; }\n.wt-base { min-width: 0; max-width: min(320px, 42vw); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.wt-location-button { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: min(100%, 240px); min-height: 28px; padding: 0 8px; border: none; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 13px; line-height: 20px; font-weight: 500; white-space: nowrap; cursor: pointer; }\n.wt-location-button[aria-expanded='true'] { background: var(--dsw-alias-interactive-bg-hover); }\n@media (hover: hover) { .wt-location-button:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover); } }\n.wt-location-button[data-pending='true'] { background: var(--dsw-alias-state-business-tertiary); color: var(--dsw-alias-state-business-primary); }\n.wt-location-button[data-pending='true'] .wt-location-icon { color: inherit; }\n.wt-location-static { max-width: min(100%, 280px); cursor: default; }\n.wt-location-icon { flex: none; color: var(--dsw-alias-label-primary); }\n.wt-location-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.wt-location-chevron { flex: none; color: var(--dsw-alias-label-caption); }\n.wt-menu-copy { display: flex; flex-direction: column; gap: 2px; max-width: 280px; }\n.wt-menu-name { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }\n.wt-menu-description { color: var(--dsw-alias-label-caption); font-size: 12px; line-height: 16px; white-space: normal; }\n.wt-turn-tail { display: flex; flex-direction: column; gap: 16px; }\n.wt-message-actions { display: flex; align-items: center; gap: 8px; height: calc(28px + var(--dsh-content-font-delta, 0px)); margin-top: 4px; margin-left: -6px; }\n.wt-action { display: inline-flex; align-items: center; justify-content: center; width: calc(28px + var(--dsh-content-font-delta, 0px)); height: calc(28px + var(--dsh-content-font-delta, 0px)); padding: 6px; border: none; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }\n.wt-action svg { width: calc(17px + var(--dsh-content-font-delta, 0px)); height: calc(17px + var(--dsh-content-font-delta, 0px)); }\n.wt-action[data-unavailable] { cursor: default; opacity: .4; }\n@media (hover: hover) { .wt-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); } .wt-action[data-unavailable]:hover { background: transparent; color: var(--dsw-alias-label-tertiary); } }\n.wt-end-info { display: inline-flex; align-items: center; gap: 8px; margin-left: 8px; color: var(--dsw-alias-label-tertiary); font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px); }\n.wt-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }\n.wt-fork-modal { width: min(560px, 100%); }\n.wt-fork-options { display: grid; gap: 12px; }\n.wt-fork-option { border: .5px solid var(--dsw-alias-border-l3); border-radius: 16px; background: transparent; color: var(--dsw-alias-label-primary); padding: 16px; text-align: left; cursor: pointer; }\n.wt-fork-option[aria-checked='true'] { border-color: var(--dsw-alias-state-business-primary); box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary); }\n.wt-fork-option strong { display: flex; gap: 8px; align-items: center; font-weight: 500; }\n.wt-fork-option small { padding: 3px 6px; border-radius: 4px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); font-size: 10px; }\n.wt-fork-option p { color: var(--dsw-alias-label-secondary); font-size: 12px; margin: 6px 0 0; }\n.wt-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }\n.wt-help { color: var(--dsw-alias-label-secondary); font-size: 12px; }\n.wt-settings { max-width: 960px; padding: 32px; }\n.wt-settings section { margin-top: 28px; }\n.wt-settings-card { border: .5px solid var(--dsw-alias-settings-card-stroke); background: var(--dsw-alias-settings-card-fill); border-radius: 20px; padding: 0 20px; }\n.wt-setting { display: flex; align-items: center; gap: 20px; justify-content: space-between; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l1); }\n.wt-setting:last-child { border-bottom: 0; }\n.wt-setting > span { display: grid; gap: 4px; }\n.wt-setting small { display: block; color: var(--dsw-alias-label-secondary); font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }\n.wt-managed-row > div:first-child { min-width: 0; }\n.wt-managed-row strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.wt-managed-row small { display: block; max-width: 100%; margin-top: 4px; overflow: hidden; color: var(--dsw-alias-label-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }\n.wt-row-actions { display: flex; flex: none; align-items: center; gap: 8px; }\n.wt-setting input { min-width: 160px; width: 40%; border: .5px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border-radius: 8px; padding: 8px 12px; }\n.wt-switch { width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; }\n.wt-switch:before { content: ''; display: block; width: 16px; height: 16px; background: var(--dsw-alias-switch-thumb); border-radius: 50%; transition: transform 120ms ease; }\n.wt-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }\n.wt-switch[aria-checked='true']:before { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }\n.wt-section-heading { display: flex; justify-content: space-between; align-items: center; }\n.wt-managed-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l1); }\n.wt-managed-row:last-child { border-bottom: 0; }\n.wt-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12px; line-height: 18px; }\n@media (max-width: 720px) {\n  .wt-base { max-width: 45vw; }\n  .wt-settings { padding: 20px; }\n  .wt-setting { align-items: flex-start; }\n  .wt-setting input { width: 45%; min-width: 96px; }\n  .wt-managed-row { align-items: flex-start; flex-direction: column; }\n  .wt-row-actions { align-self: flex-end; }\n  .wt-fork-modal { width: 100%; }\n}\n";
  }
});

// src/client.js
var client_exports2 = {};
__export(client_exports2, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports2);
var inject = ["slots", "locale", "connection", "sessions", "uiWorkspace"];
function apply(ctx) {
  const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
  const { createWorktreeActions: createWorktreeActions2, initialState: initialState2 } = (init_actions(), __toCommonJS(actions_exports));
  const { dictionaries: dictionaries2 } = (init_shared(), __toCommonJS(shared_exports));
  const { WorkLocation: WorkLocation2, WorktreeDock: WorktreeDock2 } = (init_location(), __toCommonJS(location_exports));
  const { ForkDialog: ForkDialog2, TurnTail: TurnTail2 } = (init_conversation(), __toCommonJS(conversation_exports));
  const { SettingsPage: SettingsPage2 } = (init_settings(), __toCommonJS(settings_exports));
  const stylesheetModule = (init_client(), __toCommonJS(client_exports));
  const stylesheet = stylesheetModule.default ?? stylesheetModule;
  const state = createSnapshotStore(structuredClone(initialState2));
  const forkRequest = createSnapshotStore(null);
  const actions = createWorktreeActions2(ctx, state, forkRequest);
  const hooks = () => ({ hooks: { worktreeState: state } });
  const contribute = (name, label, register) => ctx.effect(() => ctx.slots.inject(name, register), label);
  ctx.effect(() => ctx.locale.register("worktrees", dictionaries2), "worktrees: dictionaries");
  contribute("conversation.hero.options", "worktrees: hero location", () => ctx.slots.register({
    name: "conversation.hero.options",
    id: "worktree-location",
    inject: () => ({ ...hooks(), actions })
  }, WorkLocation2));
  contribute("conversation.input.dock", "worktrees: active location", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "worktree-location-active",
    order: 0,
    inject: () => ({ ...hooks(), actions, activeOnly: true })
  }, WorkLocation2));
  contribute("conversation.input.dock", "worktrees: pending note", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "worktree-pending",
    order: 10,
    inject: () => ({ ...hooks(), actions })
  }, WorktreeDock2));
  contribute("conversation.chat.node", "worktrees: single fork action", () => ctx.slots.register({
    name: "conversation.chat.node",
    key: "turn-tail",
    priority: -100,
    inject: () => ({ hooks: { performanceUsage: createSnapshotStore("detailed"), worktreeState: state }, actions }),
    children: {
      "conversation.chat.turnTail": { kind: "list", scope: "session" },
      "conversation.chat.assistant-actions": { kind: "list", scope: "session" }
    }
  }, TurnTail2));
  contribute("shell.overlay", "worktrees: dialog", () => ctx.slots.register({
    name: "shell.overlay",
    id: "worktree-fork-dialog",
    inject: () => ({ hooks: { forkRequest }, actions })
  }, ForkDialog2));
  contribute("settings.section", "worktrees: settings", () => ctx.slots.register({
    name: "settings.section",
    id: "worktrees",
    order: 90,
    label: () => "Worktrees",
    locale: "worktrees",
    inject: () => ({ ...hooks(), actions })
  }, SettingsPage2));
  ctx.effect(() => {
    if (typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.plugin = "worktrees";
    style.textContent = stylesheet;
    document.head.appendChild(style);
    return () => style.remove();
  }, "worktrees: stylesheet");
}

return module.exports;
} })
