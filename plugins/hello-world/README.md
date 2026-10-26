---
description: "A minimal DeepSeek Harness Web client plugin that adds a status bar to the root shell.bottom slot."
kind: "package-bundle"
---

# @dshforge/hello-world

## Summary

Install this Profile Bundle through dsh-forge to verify that an external Web client plugin builds, loads, and appears in the Plugins page. The plugin fills the root-scoped `shell.bottom` slot with a full-width status bar on every screen, including the empty state. Its fixed content and semantic styling make it a small starting point for other client plugins.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run the Dagger module from the dsh-forge repository root and pass this package directory through `--plugins`:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/hello-world \
  up --ports 3080:3080
```

Open `http://127.0.0.1:3080/`. A 40-pixel status bar below the main columns shows **Hello, World**, a green status dot, and the mounted-slot message. The bundle also appears independently in the Web Plugins page, where it can be enabled or disabled.

The `--plugins` flag is repeatable and selects every plugin to build and install. Omitting it starts Web without external plugins; adding another plugin requires another flag rather than a manual Cordis configuration edit. Startup output includes an authenticated `dsh web:` URL whose process token is a credential: do not publish, commit, or reuse it for another process.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| Path | Responsibility |
|---|---|
| `package.json` | Declares the Host and Client exports, the bundle patch through `dsh.bundle.patch`, and the Web client through `dsh.client`. |
| `cordis.patch.yml` | Inserts the `hello-world` Loader row using the bare `@dshforge/hello-world` package name. |
| `lib/index.js` | Provides an intentionally empty Host `apply` so client-module discovery can find the package and serve its browser half. |
| `lib/client.js` | Registers the browser module, injects the plugin-owned stylesheet, and registers the status component into `shell.bottom`. |

The browser artifact is a hand-written lazy-CJS bundle registered through `window.__ModuleLoader__.load`. Its factory receives the module-table `require` and resolves React from the platform baseline. The package has no build script, so this artifact is edited directly and must not acquire private runtime dependencies.

The client calls `ctx.slots.inject('shell.bottom', ...)` so registration follows the declaring slot's lifetime. Styling follows [DESIGN.md](../../DESIGN.md): the system font stack, an 8-pixel spacing rhythm, a hairline top edge, and semantic `--dsw-alias-*` tokens with fallbacks for light and dark themes.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Design constraints](../../DESIGN.md) — dsh-forge's semantic tokens, typography, layout, and theme requirements.
- [Client modules](../../third_party/deepseek-harness/docs/subsystems/client-modules.md) — DSH's `dsh.client` declarations, module graph, and browser artifact loading.
- [Slots reference](../../third_party/deepseek-harness/docs/subsystems/slots.md) — slot ownership, declaration, and registration lifetimes.
- [Agent Plugins](../agent-plugins/README.md) — the project's Host-and-Client plugin example.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package adds browser presentation only and contributes no model-visible context, tools, or skills.

#### KV Cache effect

No direct effect; enabling or disabling the status bar does not change model requests or their reusable prefixes.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Fixed demonstration behavior** — the status text, 40-pixel height, and `shell.bottom` placement are not configurable, and the bar exposes no interactive actions.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package deliberately keeps its built artifacts under `lib/` and declares no `scripts.build`. For another plugin that does declare a build script, the dsh-forge Dagger module runs `pnpm install && pnpm run build` in a per-plugin container before installation.

</details>
