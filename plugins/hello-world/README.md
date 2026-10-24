# dsh-forge-plugin-hello-world

A hello-world client plugin for the DeepSeek Harness Web GUI, built and
installed by the `dsh-forge` Dagger module. It fills the root-scoped
`shell.bottom` slot with a quiet, full-width status bar, so every screen —
including the empty state — shows that the plugin loaded. Because it installs
as a profile bundle, it also appears as an independent plugin in the Web
Plugins page (enable/disable), not just as an anonymous loader row.

Styling follows `DESIGN.md`: system font stack, 13px/12px type, 8px rhythm,
a 0.5px hairline top edge, semantic `--dsw-alias-*` tokens for theme parity,
and green reserved for status.

## Package layout

- `package.json` — the bundle and client declarations:
  `dsh.bundle.patch` names this package's patch file, and `dsh.client`
  declares the browser half. `lib/` holds the package's built artifacts,
  following the layout of DSH's own packages.
- `cordis.patch.yml` — the bundle patch: inserts the loader row. The bare
  package name resolves through the web profile's `node_modules`, where
  `dsh plugin add link:...` links this package.
- `lib/index.js` — host half. Empty `apply`; the row exists so the host's
  client-modules scan discovers this package and serves the browser bundle at
  `/plugins/dsh-forge-plugin-hello-world/client.js`.
- `lib/client.js` — browser half, a hand-written lazy-CJS bundle registered
  through `window.__ModuleLoader__.load({ id, factory })`. No build step: the
  factory receives the module-table `require`, pulls `react` from the platform
  seed, injects one `data-plugin`-tagged stylesheet, and returns the client
  plugin (`inject: ['slots']`, `apply` registering into `shell.bottom`).

Plugins that need compilation declare a `scripts.build`; the Dagger module
runs `pnpm install && pnpm run build` for those in a per-plugin container.

## Build and install

`dsh-forge`'s Dagger `Web` function takes the plugins to install as an
explicit list — one `--plugins` flag per plugin package directory, built and
installed in parallel. Omitting the flag serves a clean web with no plugins.

```sh
dagger call dsh web \
  --plugins ./plugins/hello-world \
  --plugins ./plugins/a-second-plugin \
  up --ports 3080:3080
```

Adding another plugin is passing one more `--plugins` flag — no patch file
edits. Each install lands as a linked bundle in the web profile, so the
Plugins page lists it independently.

## Run

```sh
# 隧道方式：浏览器访问 http://127.0.0.1:3080/，--debug --progress=plain 可见构建/安装日志
dagger --progress=plain call dsh web --debug --plugins ./plugins/hello-world up --ports 3080:3080
```

The web process logs to standard output (including the authenticated
`dsh web: ...` URL line) — no log files or helper functions. The URL carries
the process launch token: treat it as this web process's credential.
