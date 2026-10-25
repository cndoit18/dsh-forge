# aimock Dagger module

Run the pinned [CopilotKit aimock](https://github.com/CopilotKit/aimock) release image as a Dagger `Service`, with a local mock data directory passed to aimock's `--fixtures` option.

## Mock data directory

The directory can contain aimock JSON fixture files directly or in nested directories. Each file uses aimock's normal [fixture format](https://aimock.copilotkit.dev/fixtures):

```text
mock-data/
└── openai.json
```

```json
{
  "fixtures": [
    {
      "match": { "userMessage": "hello" },
      "response": { "content": "Hi there!" }
    }
  ]
}
```

## Start the service

From the repository root:

```bash
dagger -m .dagger/module/aimock call aimock \
  --mock-data ./mock-data \
  up --ports 4010:4010
```

To try the included smoke-test fixture:

```bash
dagger -m .dagger/module/aimock call aimock \
  --mock-data .dagger/module/aimock/testdata/mock-data \
  up --ports 4010:4010
```

Then verify health and the fixture-backed OpenAI response:

```bash
curl http://localhost:4010/health
curl http://localhost:4010/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hello dagger"}]}'
```

The response should contain `aimock fixture loaded`.

## Use from another pipeline

`aimock` returns a `dagger.Service`. Bind it to a client container with the hostname `aimock`; provider APIs are then available at `http://aimock:4010/v1`.

The module uses `ghcr.io/copilotkit/aimock:1.46.0` and exposes container port `4010`. Host port mapping is controlled by Dagger's `up --ports` option.

Mock data is a read-only Dagger `Directory` snapshot, not a live-reload mount. Restart the service after changing fixture files.
