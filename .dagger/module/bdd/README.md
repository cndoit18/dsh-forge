# bdd

TypeScript Dagger PoC for Playwright-BDD with tester-army/e2e. It imports the
existing `dsh` module as `web` and the aimock module as `aimock`. When
`modelBaseUrl` is omitted, DSH and e2e use the built-in aimock endpoint.
`plugins` is optional and defaults to an empty array; repeat `--plugins` to add
plugin directories when needed. `mockData` is also optional: without it, aimock
starts with an empty fixture set and scenarios that need model output fail
naturally.

The `ai` fixture skips any scenario when it first reaches an AI step and
`E2E_AI` is not `1`. Earlier deterministic steps may already have run; this PoC
does not implement generation-time scenario skipping. This switch only controls
e2e's own Agent steps, not DSH's use of aimock.

```sh
# Default aimock with no fixtures: model-backed scenarios fail naturally.
dagger --progress=plain call bdd run

# With fixtures, DSH agent responds; e2e's AI scenario is skipped.
dagger --progress=plain call bdd run \
  --mock-data .dagger/module/bdd/testdata/mock-data

# All scenarios pass, including the OpenAI-compatible complete_step call.
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
