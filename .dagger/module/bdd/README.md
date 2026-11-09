# bdd

TypeScript Dagger module for Playwright-BDD with tester-army/e2e. It imports the
existing `dsh` module as `web` and the aimock module as `aimock`. When
`modelBaseUrl` is omitted, DSH and e2e use the built-in aimock endpoint.
`plugins` is optional and defaults to an empty array; repeat `--plugins` to add
plugin directories when needed. `mockData` is also optional: without it, aimock
starts with an empty fixture set and scenarios that need model output fail
naturally.

The `ai` fixture remains available for scenarios that genuinely require
model-based actions. It skips such a scenario when `E2E_AI` is not `1`;
deterministic scenarios never request it. The current suite uses executable HTTP,
DOM, event, and filesystem assertions instead of AI judgments. This switch only
controls e2e's own Agent steps, not DSH's use of aimock.

```sh
# Default aimock with no fixtures: model-backed scenarios fail naturally.
dagger --progress=plain call bdd run

# With fixtures, DSH agent responds without e2e AI steps.
dagger --progress=plain call bdd run \
  --mock-data .dagger/module/bdd/testdata/mock-data

# Also enable any scenario that explicitly requires e2e AI steps.
dagger --progress=plain call bdd run \
  --mock-data .dagger/module/bdd/testdata/mock-data \
  --ai=true

# Record and export e2e artifacts, including videos on every attempt.
dagger --progress=plain call bdd run \
  --mock-data .dagger/module/bdd/testdata/mock-data \
  --ai=true \
  --video
```

`modelBaseUrl` overrides the default aimock endpoint. `modelId` defaults to
`gpt-4o-mini` and can be overridden for another fixture. A self-hosted endpoint
that requires authentication can receive a key through a Dagger Secret such as
`--model-api-key=env:LLM_API_KEY`; without a Secret, a placeholder `mock` value
is used. The key is injected as `DSH_MODEL_API_KEY`, never written to the
repository or a plain-text Dagger argument. The per-process Web launch token
stays inside the test container, is registered as an e2e secret, and is redacted
from readiness diagnostics.

`run` leaves e2e artifacts in `/bdd/.e2e` in the test container and returns the
output directory on success, including `run-output.txt`. To copy artifacts to
the host, use `export --path .artifacts/bdd`, the CLI `--output .artifacts/bdd`
option, or mount your own host directory at `/bdd/.e2e` with
`withMountedDirectory`. Video is disabled by default. With `--video`, e2e
records every attempt. Videos can contain page content, so enable them only with
fixtures that contain no real user data or credentials.

The Playwright HTML report is written to `playwright-report/index.html` inside
the exported directory. Each scenario includes its e2e trace and, with `--video`,
its recorded video attachments. `--allow-failure` keeps the export available when
scenarios fail; CI must then read `test-status.txt` after exporting the report
and fail the job on a nonzero status. Without this flag, `run` keeps its normal
nonzero-on-failure behavior.

To generate the same report locally, use the dedicated `report` command. It
always records video and returns the report, traces, and `test-status.txt`:

```sh
dagger --progress=plain call bdd report \
  --plugins ./plugins/agent-plugins \
  --plugins ./plugins/workflow \
  --plugins ./plugins/workflow-filesystem \
  --plugins ./plugins/devflow \
  --mock-data .dagger/module/bdd/testdata/mock-data \
  --ai=true \
  --output .artifacts/bdd

corepack yarn --cwd .dagger/module/bdd playwright show-report \
  ../../../.artifacts/bdd/playwright-report
```

Add `--allow-failure` to `report` when a failing suite must still export its
report, then check `.artifacts/bdd/test-status.txt` for the test verdict.

## GitHub PR previews

`.github/workflows/bdd.yml` runs the full suite with videos on pull requests and
publishes the HTML report through `rossjrw/pr-preview-action`. The preview is
linked from a sticky PR comment and removed when the PR closes. Fork pull
requests run the tests but skip preview deployment because the action does not
support them.

Before the first preview, configure **Settings > Pages** to deploy from the
`gh-pages` branch at the repository root. The workflow requests `contents: write`
and `pull-requests: write`; repository or organization policy must allow those
permissions for same-repository pull requests. Reports and videos use debug
fixtures and can include the expired per-process Web launch token.
