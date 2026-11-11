# ✓ features/devflow.feature.spec.js › DevFlow commands and workflows › Project filesystem workflow runs as a scoped slash …

`host` · passed · 4.5s

## Steps

1. ✓ `app.open` `/?token=<secret:web-launch-token>` (847ms, video 0:00) — `steps/web.ts:7`
2. ✓ `browser.evaluate` (291ms, video 0:02) — `steps/devflow.ts:38`
3. ✓ `app.open` `/` (423ms, video 0:03) — `steps/devflow.ts:57`
4. ✓ `browser.evaluate` (116ms, video 0:03) — `steps/devflow.ts:306`
5. ✓ `locator.tap` `getByRole("textbox").last()` (282ms, video 0:03) — `steps/devflow.ts:60`
   - tap textbox "Choose workspace" (282ms)
6. ✓ `locator.fill` `getByRole("textbox").last()` (29ms, video 0:03) — `steps/devflow.ts:61`
   - fill textbox "Describe what you want to build, / comm…" (29ms)
7. ✓ `expect.toBeEnabled` `getByRole("button", name: /^(Send message\|发送消息)$/).last()` (13ms, video 0:04) — `steps/devflow.ts:63`
8. ✓ `locator.tap` `getByRole("button", name: /^(Send message\|发送消息)$/).last()` (57ms, video 0:04) — `steps/devflow.ts:64`
   - tap button "Send message" (57ms)
9. ✓ `expect.toBeVisible` `getByText("/bdd-echo BDD workflow").last()` (11ms, video 0:04) — `steps/devflow.ts:65`
10. ✓ `browser.evaluate` (278ms, video 0:04) — `steps/devflow.ts:270`
11. ✓ `browser.evaluate` (14ms, video 0:04) — `steps/devflow.ts:270`
12. ✓ `browser.evaluate` (2ms, video 0:04) — `steps/devflow.ts:73`
13. ✓ `browser.evaluate` (1ms, video 0:04) — `steps/devflow.ts:77`
14. ✓ `browser.evaluate` (8ms, video 0:04) — `steps/devflow.ts:81`
15. ✓ `browser.evaluate` (7ms, video 0:04) — `steps/devflow.ts:81`
16. ✓ `browser.evaluate` (7ms, video 0:04) — `steps/devflow.ts:81`
17. ✓ `browser.evaluate` (7ms, video 0:04) — `steps/devflow.ts:81`
18. ✓ `browser.evaluate` (6ms, video 0:04) — `steps/devflow.ts:81`
19. ✓ `browser.evaluate` (1ms, video 0:04) — `steps/devflow.ts:190`
20. ✓ `expect.toBeVisible` `getByRole("group", name: /^(Command input\|指令输入)$/)` (4ms, video 0:04) — `steps/devflow.ts:192`
21. ✓ `browser.evaluate` (1ms, video 0:04) — `steps/devflow.ts:193`
22. ✓ `expect.toHaveCount` `getByText("/bdd-echo BDD workflow")` (7ms, video 0:04) — `steps/devflow.ts:194`
23. ✓ `expect.toHaveCount` `getByText("工作流已提交，等待 Agent 启动。")` (3ms, video 0:04) — `steps/devflow.ts:195`
24. ✓ `browser.evaluate` (2ms, video 0:04) — `steps/devflow.ts:196`
25. ✓ `browser.evaluate` (1ms, video 0:04) — `steps/devflow.ts:197`

## Evidence

- [video](video/video.webm) `.e2e/results/host/host-features-devflow-feature-spec-js-1f4ae7a9d43cff42/video/video.webm`

<sub>e2e 0.21.3 · run `01a1c89e-f4aa-7bd7-913c-d39da7551885`</sub>
