# ✓ features/devflow.feature.spec.js › DevFlow commands and workflows › Deep research works with the ptc Agent preset

`host` · passed · 6.7s

## Steps

1. ✓ `app.open` `/?token=<secret:web-launch-token>` (1.0s, video 0:00) — `steps/web.ts:7`
2. ✓ `browser.evaluate` (78ms, video 0:03) — `steps/devflow.ts:38`
3. ✓ `app.open` `/` (593ms, video 0:03) — `steps/devflow.ts:57`
4. ✓ `browser.evaluate` (133ms, video 0:03) — `steps/devflow.ts:283`
5. ✓ `locator.tap` `getByRole("textbox").last()` (309ms, video 0:03) — `steps/devflow.ts:60`
   - tap textbox "Choose workspace" (309ms)
6. ✓ `locator.fill` `getByRole("textbox").last()` (50ms, video 0:04) — `steps/devflow.ts:61`
   - fill textbox "Describe what you want to build, / comm…" (50ms)
7. ✓ `expect.toBeEnabled` `getByRole("button", name: /^(Send message\|发送消息)$/).last()` (11ms, video 0:04) — `steps/devflow.ts:63`
8. ✓ `locator.tap` `getByRole("button", name: /^(Send message\|发送消息)$/).last()` (48ms, video 0:04) — `steps/devflow.ts:64`
   - tap button "Send message" (48ms)
9. ✓ `expect.toBeVisible` `getByText("/deep-research BDD scoped workflow").last()` (14ms, video 0:04) — `steps/devflow.ts:65`
10. ✓ `browser.evaluate` (186ms, video 0:04) — `steps/devflow.ts:235`
11. ✓ `browser.evaluate` (57ms, video 0:04) — `steps/devflow.ts:235`
12. ✓ `browser.evaluate` (238ms, video 0:04) — `steps/devflow.ts:235`
13. ✓ `browser.evaluate` (29ms, video 0:05) — `steps/devflow.ts:235`
14. ✓ `browser.evaluate` (339ms, video 0:05) — `steps/devflow.ts:235`
15. ✓ `browser.evaluate` (49ms, video 0:05) — `steps/devflow.ts:235`
16. ✓ `browser.evaluate` (602ms, video 0:05) — `steps/devflow.ts:235`
17. ✓ `browser.evaluate` (13ms, video 0:06) — `steps/devflow.ts:235`
18. ✓ `browser.evaluate` (11ms, video 0:06) — `steps/devflow.ts:235`
19. ✓ `browser.evaluate` (2ms, video 0:06) — `steps/devflow.ts:73`
20. ✓ `browser.evaluate` (2ms, video 0:06) — `steps/devflow.ts:77`
21. ✓ `browser.evaluate` (12ms, video 0:06) — `steps/devflow.ts:81`
22. ✓ `browser.evaluate` (12ms, video 0:06) — `steps/devflow.ts:81`
23. ✓ `browser.evaluate` (10ms, video 0:06) — `steps/devflow.ts:81`
24. ✓ `browser.evaluate` (11ms, video 0:06) — `steps/devflow.ts:81`
25. ✓ `browser.evaluate` (11ms, video 0:06) — `steps/devflow.ts:81`
26. ✓ `browser.evaluate` (10ms, video 0:06) — `steps/devflow.ts:81`

## Evidence

- [video](video/video.webm) `.e2e/results/host/host-features-devflow-feature-spec-js-26f23e2ab2a029ca/video/video.webm`

<sub>e2e 0.21.3 · run `01a1c07c-b387-7d4a-89ac-efb37d356c46`</sub>
