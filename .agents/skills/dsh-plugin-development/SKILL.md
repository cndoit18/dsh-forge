---
name: dsh-plugin-development
description: Design, implement, review, or debug DeepSeek Harness plugins in this dsh-forge repository, including Cordis services, model tools, events, skills, Web Client slots, Host/Client RPC, and installable bundles. Use when choosing plugin extension points, defining service/tool contracts, managing lifecycle, packaging a plugin, or verifying it through the repository Dagger Web workflow.
---

# DSH plugin development

Develop small, independently installable plugins that preserve DSH contracts. Treat `third_party/deepseek-harness` as read-only and the installed/pinned upstream source as the API authority. Follow the repository AGENTS.md and DESIGN.md.

For design or review without an implementation request, stay read-only: inspect the relevant contracts and report findings without changing packages or profiles.

## Start with the capability

Choose the weakest mechanism that completes the request:

| Need | Mechanism |
|---|---|
| A model-callable action | Host Tool registered through `ctx.tools` |
| A capability shared by plugins or replaceable providers | Cordis Service |
| A notification that something happened | Cordis Event |
| Guidance for choosing and combining capabilities | Skill |
| A user-facing view or interaction | Client Slot, plus narrow Host RPC when needed |
| Only composition or configuration | Bundle and patch, without new plugin code |

A Service is not model-visible by itself. A Tool does not provide a user interface by itself. Host and Client use different Cordis trees: do not access Host services directly from a browser component.

State the smallest user-visible result before writing code. Do not introduce Services, packages, global state, RPC, or persistence merely for anticipated future requirements.

## Establish current contracts

1. Locate the relevant upstream guide, package README, TypeScript declarations, and one small reference implementation. Useful starting points are `docs/user/develop/`, `docs/cookbook/adding-a-tool.md`, `docs/subsystems/slots.md`, and the target service package under `third_party/deepseek-harness/packages/`.
2. Verify exact Service methods, Event dispatch modes, Config schema, Tool output types, and Slot names against the pinned DSH version. Never invent a service, event, slot, or API from another plugin name.
3. Distinguish `dsh.client.inject` (package-name dependencies in the browser module graph) from a module exported `inject` (required Cordis services). Declare required services so activation waits for them and unload/reload follows their lifetime. Use `ctx.get()` at the use site for genuinely optional service lookups, with an explicit missing-service policy.
4. Prefer existing extension points and registry lifecycles over DOM manipulation, parallel registries, or replacing the application root.

## Design Services and Tools

A Service owns a stable domain contract; a Tool is a thin model-facing adapter. An Event publishes a fact; it is not a replacement for a traceable synchronous call.

Introduce a Service only when there are multiple consumers, a real alternative provider, or shared resources requiring a clear owner. Split Definition, Provider, and Consumer into separate packages only when they must evolve independently. Provider and Consumer depend on the Definition, not on each other. A single Tool with private logic does not need this structure.

For Tools:

- Expose only necessary arguments. Express constraints in the parameter schema and check remaining semantic rules such as nonempty strings or cross-field invariants in `execute`.
- Return a canonical typed value declared by `output.schema`, including stable IDs and fields suitable for PTC callers. Do not require parsing natural language or JSON strings to recover structured results.
- Use `output.render` for model-visible content. Keep UI-only formatting, React props, and presentation state out of that content; use supported presentation metadata and the Web tool-view slot when needed.
- Treat arguments and registered definitions as read-only. Throw for infrastructure failure; represent valid domain outcomes, including unsuccessful ones, in the canonical result.
- Honor `exec.signal` for foreground work. Use the Jobs service for long-running work and the job cancellation/lifecycle after publication.
- Put deployment policy in supported tool policy extension points rather than duplicating it in every Tool. Keep secrets, environment values, and internal traces out of results.

Use Events for loosely coupled notifications, with namespaced names and typed, minimal payloads. A Waterfall listener must call `next()` unless it intentionally short-circuits. Session-record event types and Cordis events are different namespaces; inspect the correct one.

Keep operational instructions in Skills and concise invocation constraints in Tool descriptions rather than duplicating long guidance into fixed model context.

## Compose Host and Client safely

Every distributable plugin package declares `dsh.bundle.patch`. Its patch inserts Loader entries by installed package name; a Bundle may compose several Host and Client modules. A Client package declares `dsh.client` with `platform: "web"` and exports `./client`.

A browser-only feature still needs a Loader entry so Client Modules discovers it. Its Host `apply` may be empty, following `plugins/hello-world`. Use named `apply` and `inject` exports in authored entries.

For Web UI:

- Choose an existing Slot before writing the component. Register through `ctx.slots.inject(ownerKey, ...)` so the contribution follows the declaring Slot lifetime.
- Render React components within DSH; do not substitute an iframe, standalone HTML page, or new application root for a mounted plugin.
- Pass only required props, callbacks, and observables to components. Use slot-provided selectors for shared Session/UI state rather than rescanning transcripts or modifying DOM outside the component.
- Follow DESIGN.md: semantic theme tokens, host-compatible typography/layout, light and dark themes, accessible controls, and no decorative additions outside the request.
- Register a custom Web tool card through `tool.call.toolview`; Host presentation methods alone do not create a specialized Web card.

For Host/Client communication, expose narrow RPC DTOs for actual UI operations. The Host validates arguments, resource ownership, paths, and authorization even though transport authentication exists. Never map an entire Service object into RPC or import Host implementation code into the browser bundle.

## Own configuration and lifetime

Put deployment-dependent values in the exported Config schema, with safe defaults and fail-fast validation. Patch overrides replace the complete `config` of a row; restate required fields when overriding.

Registrations created through the owning `ctx` follow Fiber disposal. Manage connections, processes, watchers, and timers with `ctx.effect()`. Put ordered cleanup in one disposer because independent asynchronous disposers do not provide sequential completion. If registering on another context such as an Agent context, retain and dispose that registration from the plugin's own effect too.

Stop plugin-owned work and remove only plugin-owned UI on unload. Preserve unrelated plugins, selected panels/tabs, and user data. Do not invent Session event types; derive Session state through supported projections/events or use plugin-owned storage.

Produce `lib/index.js` and, when used, `lib/client.js` before startup. The Client artifact must implement DSH's lazy-CJS loader contract, not merely be an arbitrary IIFE. Keep platform modules external and bundle private browser dependencies or declare supported module-graph externals. For maintainable implementations, adapt the repository's existing build rather than hand-writing a new loader protocol.

Use `engines.dsh` for compatibility. Keep shared DSH runtime packages as peers plus development dependencies where required; put independently owned third-party libraries in dependencies. Prefer prebuilt npm/tarball delivery. Git source installation does not run an ordinary build script automatically and may require an authorized self-contained `prepare` script.

## Build and verify in dsh-forge

Each direct child of `plugins/` with a `package.json` is one independent Bundle. Reference `plugins/hello-world` for a minimal Client feature and `plugins/agent-plugins` for Host/Client composition. Do not manually edit global Cordis configuration to install one.

The Dagger workflow runs a package's build script when declared; otherwise it uses the shipped artifacts. Install each selected package explicitly:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/<name> \
  up --ports 3080:3080
```

Verify one feature before moving to another:

1. Run the narrowest relevant build/tests. Run `node --check` on each changed JavaScript file and `gofmt -l .dagger/module/dsh` after Go changes.
2. Complete the full Dagger build and actually start Web. Static checks and compilation alone are insufficient.
3. Open the process's own authenticated startup URL; never publish, commit, or reuse its token. Confirm the Bundle appears independently and activates without errors.
4. Exercise the capability end to end: invoke a Tool through the Agent, perform the UI operation through RPC, or verify the Service consumer's observable result.
5. Verify disable/unload cleanup, re-enable recovery, persistence expectations, and light/dark UI where applicable. Restore user state changed during testing.
6. Review the final diff. Include only the requested plugin and its evidence; do not modify upstream source or report installation alone as proof of behavior.

When verification passes and the requested behavior works, stop rather than adding speculative abstractions or optional features.
