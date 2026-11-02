---
name: dsh-plugin-development
description: Design, implement, review, or debug DeepSeek Harness plugins in this dsh-forge repository, including Cordis services, model tools, events, skills, Web Client slots, Host/Client RPC, and installable bundles. Use before implementing, modifying, reviewing, or debugging a plugin. Read the pinned official implementation, choose supported reuse paths, and verify behavior through the existing official runtime.
---

# DSH plugin development

Develop small, independently installable plugins that preserve DSH contracts and extend the official design rather than inventing a parallel one. Treat `third_party/deepseek-harness` as read-only and the installed/pinned upstream source as the API and implementation-design authority. Follow the repository AGENTS.md and DESIGN.md; use current official source for concrete components and styling, and DESIGN.md for repository visual constraints.

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

## Study the official design before implementation

Before writing plugin code, complete the relevant read-only checks below and show the reuse decision in a short progress update. This applies to new features, changes, and fixes. Search hits, README summaries, screenshots, and remembered APIs do not replace reading the implementation. Do not create a custom control or mechanism when DSH already supplies one that meets the requirement.

Paths beginning with `docs/` or `packages/` below are relative to `third_party/deepseek-harness/`. For a localized styling or copy change, inspect only the affected precedent and contract; reuse still-current evidence from this task.

1. Find the closest shipped implementation by capability and user-facing role under `third_party/deepseek-harness/packages/`. For Web UI, inspect the feature's component, accompanying CSS Module, Slot registration, and relevant tests; for Host features, inspect its package README, implementation, and tests. Repository plugins such as `plugins/agent-plugins` are packaging/build references, not substitutes for official design references.
2. For Web UI implementation or behavior changes, read `docs/subsystems/slots.md`, `docs/web-styling.md`, and `packages/client/ui-primitives/README.md#component-catalog`. Consult `packages/client/ui-theme/src/styles/` for current tokens. Verify the actual export and props in the pinned source rather than assuming a component name.
3. Before editing, show three facts: exact official source paths and symbols actually read, with relevant tests or their absence; the existing Service, Slot/Factory, primitive, or provider to reuse, with its verified API and owner lifetime; and any requirement it cannot satisfy, with the smallest plugin-owned addition. For UI, cover the affected props/state/RPC, styling, localization, and keyboard/focus/motion behavior. If a required source or API remains unverified, resolve that gap before editing dependent code.
4. Reuse official mechanisms rather than copying their private implementations. An official feature package is a reference, not a runtime component library: never runtime-import or re-export another feature plugin's values. Use shared `@deepseek-ai/dsh-client-ui-primitives` exports, compose through declared Slots or existing Factories, and keep cross-package declaration imports type-only. For live data, use framework hooks and existing resource providers; consult `docs/subsystems/client-resources.md` before adding a separate fetch/cache/polling path.
5. If no close analogue exists, list the locations and symbols searched, check the owning extension point and shared primitives, and identify the remaining requirement. Compose the smallest addition through those verified mechanisms. A missing full-feature analogue does not justify rebuilding controls, registries, subscriptions, transport, or loaders. Tie every deliberate departure from the official precedent to a requirement.

If a workaround causes another defect, or the same behavior needs a second corrective patch, stop adding compensating code. Reproduce the mismatch, compare the official owner implementation with the plugin call site, and fix the confirmed cause through the supported extension point. Remove only workarounds introduced by this task that the correction makes unnecessary; preserve pre-existing user changes. Continue once the smallest corrected path passes focused behavior verification.

When reviewing an existing plugin, compare its controls and composition with the selected official reference. Cite exact plugin locations and upstream reference paths, distinguish correct existing reuse from duplication, and recommend the smallest change that restores official behavior and appearance.

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
- Check the official primitives catalog before authoring any control. Reuse verified `@deepseek-ai/dsh-client-ui-primitives` exports when their contract matches. Do not build native-element lookalikes or duplicate those controls merely to obtain a different visual treatment.
- Render React components within DSH; do not substitute an iframe, standalone HTML page, or new application root for a mounted plugin. A genuinely feature-specific layout may be local, but compose it from official primitives rather than cloning a standard control.
- Pass only required props, callbacks, and observables to components. Use slot-provided selectors for shared Session/UI state rather than rescanning transcripts or modifying DOM outside the component.
- Follow DESIGN.md and the official styling implementation: component-scoped CSS Modules with `clsx`, semantic `--dsw-alias-*` tokens, theme-owned typography/radius/elevation/motion, and host-compatible density. Do not use literal colors, feature-level light/dark theme selectors, a new global theme, Tailwind, or another component library.
- Follow the reference's localization and interaction patterns. Supply localized labels and product copy through the supported locale/owner path, and preserve accessible names, keyboard navigation, focus-visible behavior, reduced motion, and official hover behavior.
- Register a custom Web tool card through `tool.call.toolview`; Host presentation methods alone do not create a specialized Web card.

For Host/Client communication, expose narrow RPC DTOs for actual UI operations. The Host validates arguments, resource ownership, paths, and authorization even though transport authentication exists. Never map an entire Service object into RPC or import Host implementation code into the browser bundle.

## Own configuration and lifetime

Put deployment-dependent values in the exported Config schema, with safe defaults and fail-fast validation. Patch overrides replace the complete `config` of a row; restate required fields when overriding.

Registrations created through the owning `ctx` follow Fiber disposal. Manage connections, processes, watchers, and timers with `ctx.effect()`. Put ordered cleanup in one disposer because independent asynchronous disposers do not provide sequential completion. If registering on another context such as an Agent context, retain and dispose that registration from the plugin's own effect too.

Stop plugin-owned work and remove only plugin-owned UI on unload. Preserve unrelated plugins, selected panels/tabs, and user data. Do not invent Session event types; derive Session state through supported projections/events or use plugin-owned storage.

Produce `lib/index.js` and, when used, `lib/client.js` before startup. The Client artifact must implement DSH's lazy-CJS loader contract, not merely be an arbitrary IIFE. Keep platform modules external and bundle private browser dependencies or declare supported module-graph externals. For maintainable implementations, adapt the repository's existing build rather than hand-writing a new loader protocol.

Use `engines.dsh` for compatibility. Keep shared DSH runtime packages as peers plus development dependencies where required; put independently owned third-party libraries in dependencies. Prefer prebuilt npm/tarball delivery. Git source installation does not run an ordinary build script automatically and may require an authorized self-contained `prepare` script.

## Build and verify in DSH

Each direct child of `plugins/` with a `package.json` is one independent Bundle. Reference `plugins/hello-world` for a minimal Client feature and `plugins/agent-plugins` for Host/Client composition. Do not manually edit global Cordis configuration to install one.

Verify one feature before moving to another:

1. Run the narrowest relevant build/tests. Run `node --check` on each changed JavaScript file.
2. Exercise the capability end to end through the existing official runtime: invoke a Tool through the Agent, perform the UI operation through RPC, or verify the Service consumer's observable result. Do not start a replacement Web server.
3. For Web UI, compare the rendered result with the official reference selected before implementation: control choice, layout, density, typography, interaction states, and light/dark themes. Verify the actual user workflow in the existing DSH Web runtime; installation or a screenshot alone is not behavioral proof.
4. Verify disable/unload cleanup, re-enable recovery, persistence expectations, keyboard/focus behavior, and light/dark UI where applicable. Restore user state changed during testing.
5. Review the final diff against the reuse decision: every new control or mechanism must cover a stated requirement the official path cannot satisfy. Remove redundant copies and task-created workarounds; preserve pre-existing changes. Include only the requested plugin and its evidence; do not modify upstream source or report installation alone as proof of behavior.

When verification passes and the requested behavior works, stop rather than adding speculative abstractions or optional features.
