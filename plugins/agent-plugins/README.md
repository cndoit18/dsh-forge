---
description: "Agent Plugins v1 discovery, Git installation, Skills, MCP, and package-resource browsing for DeepSeek Harness Web."
kind: "package-bundle"
---

# @dshforge/agent-plugins

## Summary

Install this Profile Bundle through dsh-forge to use Agent Plugins v1 packages in DeepSeek Harness Web. The bundle discovers direct package directories under `~/.agents/plugins/`, validates `plugin.json`, registers Skills with DSH, and mounts stdio and Streamable HTTP MCP servers. Its Settings section adds Git installation, a startup catalog with diagnostics, and package-resource browsing. Workspace `.agents/plugins/` directories are not scanned or merged.

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

### Build and run

Run the Dagger module from the dsh-forge repository root:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/agent-plugins \
  up --ports 3080:3080
```

Open `http://127.0.0.1:3080/` and select **Settings → Agent plugins** (**Agent 插件** in Chinese). The bundle is linked into the Web profile as an independent plugin; no manual global Cordis configuration edit is required. Startup output includes an authenticated `dsh web:` URL whose process token must remain private.

In this containerized setup, `~/.agents/plugins/` resolves inside the container, normally to `/root/.agents/plugins/`. The container does not automatically read the macOS host's `~/.agents/plugins/` directory.

### Package layout

Each direct child of `~/.agents/plugins/` is one Agent Plugin package. A package requires `plugin.json` and can contribute either or both supported component types:

```text
~/.agents/plugins/
└── <package>/
    ├── plugin.json
    ├── skills/
    │   └── <name>/
    │       └── SKILL.md
    └── mcp.json
```

- **Skills** — immediate `skills/<name>/SKILL.md` entries are validated against the Agent Skills contract and exposed through the existing DSH skill registry. Skill bodies are revalidated and read on demand.
- **MCP** — the root `mcp.json` supports independent `stdio` and `streamable-http` server mounting through `dsh-mcp-client`. Legacy `sse` entries are reported as unsupported and skipped.

The bundle validates `plugin.json` before loading any component. Fatal manifest errors reject that package; invalid Skills, MCP documents, and individual servers fail independently with diagnostics. Unknown manifest top-level fields and non-object `extensions` values are reported and ignored.

### Installing from Git

Select **Settings → Agent plugins → Install from Git** (**Agent 插件 → 从 Git 安装** in Chinese) and enter a repository spec. The installer places the selected package at `~/.agents/plugins/<manifest.name>`.

```text
https://github.com/org/repo.git
git@github.com:org/repo.git
git+https://github.com/org/repo.git#v1.0.0&path:/plugins/demo
git@github.com:org/repo.git&path:/plugins/demo
git+ssh://git@github.com/org/repo.git#<commit-sha>&path:/plugins/demo
```

An optional `#ref` names a branch, tag, or commit. `&path:/subdirectory` selects a package inside a monorepo. The installer uses Git rather than pnpm because an Agent Plugin requires `plugin.json`, not `package.json`. It performs a shallow fetch, uses sparse checkout for a subdirectory, recursively initializes submodules within the selected package, rejects path traversal and existing destinations, and copies no `.git` metadata.

Installation runs no package install scripts. It does execute Git with the user's trusted credentials and transport configuration; later stdio MCP execution is a separate trust decision because that server runs local package code outside the Agent sandbox. A successful explicit install refreshes the catalog, invalidates the Skill registry, and mounts the new MCP servers immediately.

### Runtime behavior

- Discovery for the settings catalog and MCP mounting runs at activation. An explicit Git install performs the immediate refresh described above; external edits follow the reload constraint in the limitations section.
- Skills are registered globally in the current DSH profile. A preset-local Skill with the same name can still shadow the global contribution. Duplicate global names are diagnosed, with the first package in sorted directory order taking precedence.
- Each MCP server receives a stable, package-qualified DSH `serverName`. stdio commands default to the package root and receive `PLUGIN_ROOT` plus a dedicated writable `PLUGIN_DATA` directory. Data remains under `$DSH_HOME/agent-plugins/data/` across in-place package updates.
- HTTP header values and stdio environment values are never sent to the browser catalog. The UI displays URLs, commands, arguments, working directories, and header names only.

### Browsing package resources

The Settings section shows the startup catalog, structured Manifest metadata, Skills, MCP details, and an embedded directory browser. Directories load on demand with realpath containment and symbolic-link filtering, capped at 200 entries per directory.

Selecting a file opens the existing DSH Document Preview; the bundle creates neither a synthetic workspace Session nor an inline file editor. Document Preview requires a mounted Session surface, so open a Session first. Without one, the Settings section remains available and explains why preview cannot open.

### OAuth for Streamable HTTP MCP

For an HTTP server with no configured headers, activation probes the endpoint with a five-second GET. A Bearer 401 response enables a loopback OAuth forwarder; other servers keep the direct connection, and configured-header behavior is unchanged.

The forwarder uses the MCP SDK for protected-resource and authorization-server discovery, Dynamic Client Registration, PKCE, authorization-code exchange, and refresh-token rotation. Credentials and the preferred loopback callback URL are stored in a per-server 0600 JSON file under `$DSH_HOME/agent-plugins/data/`. If the previous callback port is unavailable, a new callback URL is registered and the previous OAuth credentials are discarded.

**Settings → Agent plugins → MCP** shows the authorization state. The authorization button follows `ui-chat.linkOpening`: it uses the Sidebar Browser when selected and available, otherwise the default browser. No browser window opens without a user action. Successful callback pages attempt `window.close()` and retain a fallback message if the browser blocks it; error pages remain visible. Callback responses carry no credentials, and OAuth authorization URLs are available only to owner peers.

The forwarder listens on `127.0.0.1` by default. For isolated container port-forwarding tests, `AGENT_PLUGINS_OAUTH_BIND_HOST=0.0.0.0` explicitly allows binding to the container address. Do not use that override on an untrusted network.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host entry registers the Skill provider, owner-only catalog RPC, Git installer, and MCP mounts. The Client entry registers the `settings.section` contribution and uses the authenticated Connection bridge for catalog, installation, directory, and OAuth operations.

| Path | Responsibility |
|---|---|
| `package.json` | Declares the bundle, browser dependencies, compatibility ranges, and build/test scripts. |
| `cordis.patch.yml` | Inserts the single global `agent-plugins` Loader row. |
| `lib/index.js` | Composes discovery, Skills, MCP, installation, and RPC lifecycle. |
| `lib/discovery.js` and `lib/validation.js` | Validate manifests and components independently and collect diagnostics. |
| `lib/skills.js` | Provides global Skills and reloads their bodies on demand. |
| `lib/mcp.js` and `lib/mcp-oauth.js` | Mount MCP servers, guard credentialed redirects, and own OAuth state. |
| `lib/install.js` | Parses Git specs and installs validated packages without package install scripts. |
| `lib/rpc.js` | Exposes owner-only catalog, file, install, and OAuth operations. |
| `src/client.js` | Implements the bilingual Settings interface and Document Preview integration. |
| `schemas/` | Carries the Agent Plugins v1 manifest and MCP JSON Schemas. |

The browser build uses esbuild and emits `lib/client.js` as an IIFE bundle. DSH baseline modules remain external; `@deepseek-ai/dsh-util-workspace-path` is bundled because it is not a baseline browser module.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Skill registry](../../third_party/deepseek-harness/packages/skill/skill/README.md) — the DSH Skill provider and loading contract used by this bundle.
- [MCP client](../../third_party/deepseek-harness/packages/mcp/mcp-client/README.md) — the MCP mounting and tool-integration layer.
- [Client modules](../../third_party/deepseek-harness/docs/subsystems/client-modules.md) — DSH's Host-and-Client package loading model.
- [Slots reference](../../third_party/deepseek-harness/docs/subsystems/slots.md) — the Settings contribution's registration lifetime.
- [Hello World](../hello-world/README.md) — the project's minimal browser-only plugin example.

-----

<a id="model-experience"></a>
## Model Experience

### Agent Plugin Skills

#### What the model sees

Each valid Skill contributes its package-defined name and description to DSH's existing Skill catalog. When the model or user invokes that Skill, the existing `skill` tool loads the package-defined body on demand. This bundle adds no fixed Skill text of its own; invalid or shadowed entries do not contribute content.

#### Token effect

There is no fixed direct token cost. Installed Skills add their catalog entries, and an invoked Skill adds its body and any resource content through the existing Skill mechanisms; package contents determine those sizes.

#### KV Cache effect

Installing, removing, or changing valid Skills can change later Skill-catalog prefixes. Loaded Skill content appends through the existing transcript flow; this bundle starts no independent model request.

### Agent Plugin MCP servers

#### What the model sees

Mounted MCP servers contribute their own tool declarations and call results through `dsh-mcp-client` under stable, package-qualified server names. This bundle defines no fixed MCP tool schema itself.

#### Token effect

There is no fixed direct token cost without mounted servers. Each connected server's tool schemas and results determine its conditional context use through the existing MCP integration.

#### KV Cache effect

Mounting, removing, or changing MCP servers can change later tool declarations and reusable prefixes. Tool calls and results append to the owning Session transcript; OAuth authorization and package-resource previews create no model request.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **Unsupported extension types** — Hooks and other client extension types are not implemented.
- **No live package watching** — external package additions and configuration edits are not guaranteed to refresh until the outer plugin reloads or DSH restarts.
- **Container persistence requires a volume** — `PLUGIN_DATA` survives container recreation only when `$DSH_HOME/agent-plugins/data/` is backed by a durable volume; the default Dagger home is ephemeral.
- **Credentialed HTTP redirects are rejected** — configured-header HTTP endpoints use a redirect-denying loopback proxy for every request. Any 301, 302, 303, 307, or 308 response is rejected, regardless of origin; configured headers are not a portable secret mechanism or authorization to forward them to another origin.
- **OAuth detection is probe-dependent** — discovery requires the unauthenticated GET probe to return a Bearer 401; servers that challenge only a specific non-GET MCP request are not detected. OAuth forwarding buffers request bodies up to 16 MiB so an authorized retry can replay them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Development requires Node.js 24.9.0 or later and a DSH version satisfying `>=0.2.1-rc.3 <0.3.0`. From this package directory, run:

```sh
pnpm install
pnpm run build
pnpm test
```

For the complete dsh-forge verification, install both bundles and inject the included Agent Plugin fixture into the container's actual home:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/hello-world \
  --plugins ./plugins/agent-plugins \
  with-directory --path /root/.agents/plugins/demo \
    --source ./plugins/agent-plugins/tests/fixtures/agent-plugin \
  up --ports 3080:3080
```

The fixture demonstrates one Skill and one stdio MCP server; use it to verify catalog rendering, Skill registration, and MCP mounting end to end.

</details>
