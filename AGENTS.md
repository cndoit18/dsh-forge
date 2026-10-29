# AGENTS.md — dsh-forge

## 项目定位

dsh-forge 是 DeepSeek Harness（DSH）的**容器化构建、运行与 Web 插件开发工程**，不是 DSH 的分叉或重新实现。

根目录的 Dagger 模块从 `third_party/deepseek-harness` 构建 DSH，将 `plugins/` 中选定的插件构建并安装到 Web profile，再启动 Web UI。[DESIGN.md](DESIGN.md) 定义插件 UI 的设计约束。

## 项目规则

1. **上游只读**：不得修改 `third_party/deepseek-harness`。需要理解 DSH 行为时，阅读其中的文档和源码，以其契约为准。
2. **统一构建入口**：通过根目录的 Dagger 模块构建和运行。每个 `--plugins` 接收一个插件目录，可重复使用；省略时不安装插件。

   ```sh
   dagger --debug --progress=plain call dsh web \
     --plugins ./plugins/hello-world \
     up --ports 3080:3080
   ```

3. **遵循插件契约**：`plugins/` 下每个包含 `package.json` 的直接子目录是一个独立插件。新增或修改插件时，遵循 `plugins/hello-world/README.md` 的包结构与加载契约，不为安装插件手改全局 Cordis 配置。
4. **遵守设计系统**：插件 UI 必须遵循 `DESIGN.md`，使用语义化 token 并兼容明暗主题；不引入装饰性颜色或动效。
5. **保留基础检查**：Go 改动须格式化，并用 `gofmt -l .dagger/module/dsh` 确认无输出；插件 JS 改动须逐文件运行 `node --check`。
6. **始终完整验证**：任何改动在完成前都必须执行完整 Dagger 构建并实际启动 Web。默认使用上述命令检查页面可访问及 `hello-world` 状态栏；涉及其他插件时，加入对应 `--plugins` 并验证其行为。静态检查或构建成功不能替代 Web 验证。
7. **保护启动凭据**：启动日志中的认证 URL 携带进程令牌，不得提交、公开或复用到其他进程。

## 源码与构建布局

| 位置 | 职责 |
|---|---|
| `dagger.json` | Dagger `v0.21.11`；注册 `dsh`、`bdd`、`npm` 工具链 |
| `.dagger/module/dsh/main.go` | 在 Node 24 容器中构建上游 DSH 和所选插件，安装到 Web profile 并暴露 3080 |
| `.dagger/module/bdd/src/index.ts` | 组合 DSH、aimock 与 Playwright-BDD/e2e |
| `.dagger/module/aimock/main.go` | 固定 `ghcr.io/copilotkit/aimock:1.46.0` 模型 fixture 服务 |
| `.dagger/module/npm/main.go` | 插件构建、dry-run、npm/OIDC 发布 |
| `plugins/hello-world` | 无构建步骤的最小 Client 插件，手写 Host 与浏览器产物 |
| `plugins/agent-plugins` | Host/Client 插件；esbuild 生成被 gitignore 的 `lib/client.js` |
| `plugins/devflow` | 九个 slash commands 与打包 workflows，无构建脚本 |
| `scripts/`、`prek.toml` | 插件版本、许可证维护与 submodule 初始化钩子 |

## 测试与验证

根目录没有 `package.json` 或统一测试脚本，不要发明根级 `pnpm test`。按受影响插件运行测试：

```sh
cd plugins/agent-plugins
pnpm install
pnpm run build
pnpm test
```

```sh
cd plugins/devflow && pnpm test
# 或从仓库根目录运行单文件测试
node --test plugins/devflow/tests/commands.test.js
```

单元测试使用 `node:test`。BDD 使用 Gherkin 和 Playwright-BDD，单 worker、零 retry、120 秒场景超时；AI 场景仅在 `--ai=true` 时执行：

```sh
dagger --progress=plain call bdd run \
  --plugins ./plugins/agent-plugins \
  --plugins ./plugins/devflow \
  --mock-data .dagger/module/bdd/testdata/mock-data
```

需要 AI 场景时添加 `--ai=true`；完整参数见 [.dagger/module/bdd/README.md](.dagger/module/bdd/README.md)。分插件测试和 BDD 不替代项目规则第 6 条的 Web 实际行为验证。

## 插件与发布约定

- 插件均为 ESM，要求 Node `>=24.9.0`，当前 DSH 兼容范围为 `>=0.2.1-rc.3 <0.3.0`。
- 包通过 `dsh.bundle.patch` 和自身 `cordis.patch.yml` 加载；Client 声明 `dsh.client.platform: "web"` 并导出 `./client`。
- 使用命名 `apply`/`inject` 导出。Host 与 Client 分属不同 Cordis 树；浏览器需要 Host 功能时使用窄 RPC，不直接访问 Host service。
- 共享 DSH runtime 包放在 `peerDependencies`，需要时同时列入 `devDependencies`；私有第三方库放在 `dependencies`。
- 插件扩展点、Host/Client 生命周期、RPC、安全与验证遵循 [dsh-plugin-development skill](.agents/skills/dsh-plugin-development/SKILL.md)，不在此复制其规范。
- `prek.toml` 的 pre-commit 钩子会为有实质改动的插件自动 patch-bump 版本，并同步 Apache-2.0 许可证。
- `.github/workflows/publish-plugins.yml` 在 main/master 检测到插件 manifest 版本变化时，通过 Dagger 和 GitHub OIDC 发布。
