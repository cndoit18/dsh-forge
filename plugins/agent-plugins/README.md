# dsh-forge Agent Plugins

Adds Agent Plugins v1 discovery to DeepSeek Harness Web. The bundle scans only direct package directories under `~/.agents/plugins/`; workspace `.agents/plugins/` directories are not scanned or merged.

## Supported components

- **Skills** — immediate `<package>/skills/<name>/SKILL.md` entries, validated against the Agent Skills contract and exposed through the existing DSH skill registry. Skill bodies are revalidated and read on demand.
- **MCP** — root `mcp.json` with independent `stdio` and `streamable-http` server mounting through `dsh-mcp-client`. Legacy `sse` entries are reported as unsupported and skipped.

`plugin.json` is validated before any component loads. Fatal manifest errors reject the package; invalid skills, MCP documents, and individual servers fail independently. Unknown manifest top-level fields and non-object `extensions` are reported and ignored.

The Settings → Agent 插件 section provides Git installation and shows the startup catalog, structured Manifest metadata, Skills and MCP details, and an embedded directory resource manager. Directories load on demand with realpath containment, symlink filtering, and a 200-entry cap per directory. Selecting a file opens the existing DSH Document Preview; no synthetic workspace Session or inline file editor is created.

## Git installation

Settings → Agent 插件 → 从 Git 安装 accepts repository specs and installs the selected package into `~/.agents/plugins/<manifest.name>`:

```text
https://github.com/org/repo.git
git@github.com:org/repo.git
git+https://github.com/org/repo.git#v1.0.0&path:/plugins/demo
git@github.com:org/repo.git&path:/plugins/demo
git+ssh://git@github.com/org/repo.git#<commit-sha>&path:/plugins/demo
```

`#ref` is optional and names a branch, tag, or commit. `&path:/subdirectory` selects a package inside a monorepo. The installer uses Git directly rather than pnpm because Agent Plugins requires only `plugin.json`, not `package.json`. It performs a shallow fetch, uses sparse checkout for a subdirectory, rejects path traversal and existing destinations, and does not copy root `.git` metadata or run package install scripts. An explicit install refreshes the catalog, registers Skills, and mounts the new MCP servers. Installation executes trusted Git credentials and transport configuration but no package code; later stdio MCP execution remains a separate trust decision.

## Runtime behavior

- Discovery runs at activation. An explicit Git install refreshes its catalog and mounts the new components immediately; package additions and configuration edits made outside that flow take effect on the next outer-plugin reload or DSH restart. This bundle does not claim live package watching.
- Skills are registered globally in the current DSH profile. A preset-local skill with the same name can still shadow the global contribution.
- Each MCP server gets a stable, package-qualified DSH `serverName`. stdio commands default to the package root and receive `PLUGIN_ROOT` and a dedicated writable `PLUGIN_DATA` directory. Data is preserved in-place across package updates under `$DSH_HOME/agent-plugins/data/`.
- stdio servers execute trusted local package code outside the Agent sandbox. Installing a package in this directory is a trust decision.
- HTTP header values and stdio environment values are not sent to the browser catalog. The UI displays URLs, commands, arguments, working directories, and header names only.
- Document Preview requires a mounted Session surface. The settings section stays open with an explanatory message when none exists.

## Build and test

```sh
pnpm install
pnpm run build
pnpm test
```

The build uses esbuild for the browser half and retains DSH baseline modules as externals. `@deepseek-ai/dsh-util-workspace-path` is bundled because it is not a baseline browser module.

For the complete dsh-forge verification, install both bundles and inject an Agent Plugin fixture into the container's actual home:

```sh
dagger --debug --progress=plain call dsh web \
  --plugins ./plugins/hello-world \
  --plugins ./plugins/agent-plugins \
  with-directory --path /root/.agents/plugins/demo \
    --source ./plugins/agent-plugins/tests/fixtures/agent-plugin \
  up --ports 3080:3080
```

Keep the authenticated startup URL private. The container sees `/root/.agents/plugins/`, not the macOS host's `~/.agents/plugins/`.

## Known limitations

- Hooks and other client extension types are not implemented.
- `PLUGIN_DATA` persistence across container recreation requires a durable volume for `$DSH_HOME/agent-plugins/data/`; the default Dagger home is ephemeral.
- Configured-header HTTP endpoints use a redirect-denying loopback proxy for every request. Any 301, 302, 303, 307, or 308 response is rejected, regardless of origin; configured headers are not a portable secret mechanism or authorization to forward them to another origin.
