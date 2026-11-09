# ✗ features/web.feature.spec.js › Web BDD PoC › DSH agent answers through aimock

`host` · failed · 3.5s

**LOCATOR_NOT_FOUND**

```text
locator did not become visible: getByRole("button", name: "Continue")
```

Asked for: button "Continue"  
Waited: 1.0s  
Look at: `steps/web.ts:9`  

## Steps

1. ✓ `app.open` `/?token=<secret:web-launch-token>` (704ms, video 0:00) — `steps/web.ts:7`
2. ✗ `locator.waitFor` `getByRole("button", name: "Continue") → visible` (1.0s, video 0:00) — **LOCATOR_NOT_FOUND** — `steps/web.ts:9`
   - waitFor gave up after 8 reads in 1.0s: absent x8
3. ✗ `locator.waitFor` `getByRole("dialog", name: "Get started") >> getByRole("button", name: "Close") → visible` (1.0s, video 0:01) — **LOCATOR_NOT_FOUND** — `steps/web.ts:12`
   - waitFor gave up after 10 reads in 1.0s: absent x10
4. ✓ `browser.evaluate` (65ms, video 0:02) — `steps/web.ts:17`
5. ✓ `app.open` `/` (401ms, video 0:02) — `steps/web.ts:57`
6. ✓ `expect.toBeVisible` `getByText("aimock fixture loaded").first()` (291ms, video 0:03) — `steps/web.ts:61`
   - expect passed after 2 reads in 291ms: no node (0 matches) -&gt; at 291ms default states (1 match)

## Evidence

- [video](video/video.webm) `.e2e/results/host/host-features-web-feature-spec-js-web-eda882b6d772a576/video/video.webm`

<sub>e2e 0.21.3 · run `01a1bf4c-f7b7-7522-9fef-3c4cb1464738`</sub>
