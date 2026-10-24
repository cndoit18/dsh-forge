# AGENTS.md — dsh-forge

## 项目定位

dsh-forge 是 DeepSeek Harness（DSH）的**容器化构建、运行与 Web 插件开发工程**，不是 DSH 的分叉或重新实现。

根目录的 Dagger 模块从 `third_party/deepseek-harness` 构建 DSH，将 `plugins/` 中选定的插件构建并安装到 Web profile，再启动 Web UI。`DESIGN.md` 定义插件 UI 的设计约束。

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
