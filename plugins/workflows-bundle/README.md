# workflows-bundle

Installs the complete workflow stack through one bundle: the official PTC engine, `@dshforge/workflow`, `@dshforge/workflow-filesystem`, and the nine built-in workflows from `@dshforge/devflow`. It contains no Web Client.

## Install

```sh
dsh plugin --profile web add @dshforge/workflows-bundle
```

The three DSH Forge packages remain independently installable when a smaller composition is needed.

For a local source build, pass only the aggregate package:

```sh
dagger --progress=plain call dsh web \
  --plugins ./plugins/workflows-bundle \
  up --ports 3080:3080
```

## Verification

```sh
cd plugins/workflows-bundle && pnpm test
```
