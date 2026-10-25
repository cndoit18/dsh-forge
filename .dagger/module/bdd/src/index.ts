import { argument, dag, Directory, func, object, Secret } from "@dagger.io/dagger"

@object()
export class Bdd {
  /**
   * Run BDD scenarios against DSH and e2e with an OpenAI-compatible endpoint.
   * AI scenarios are skipped by default; ai=true enables OpenAI-compatible execution.
   */
  @func()
  async run(
    @argument({
      defaultPath: "/",
      ignore: [
        ".dagger",
        "DESIGN.md",
        "**/node_modules",
        "**/lib",
        "**/*.tsbuildinfo",
        "**/apps/web/dist",
        "**/.artifacts",
        "**/.dsh-build",
        "**/.dsh-report",
        ".env",
        "**/.env",
      ],
    })
    source: Directory,
    plugins: Directory[] = [],
    mockData?: Directory,
    ai = false,
    modelId = "gpt-4o-mini",
    modelBaseUrl?: string,
    modelApiKey?: Secret,
    video = false,
  ): Promise<Directory> {
    const useAimock = modelBaseUrl === undefined
    const modelUrl = modelBaseUrl ?? "http://aimock:4010/v1"

    const web = dag.web().web({ source, plugins })
    const webArgs = await web.defaultArgs()
    const [shell, flag, command, ...rest] = webArgs
    if (shell !== "sh" || flag !== "-c" || command === undefined || rest.length > 0) {
      throw new Error("the web dependency returned an unsupported launch command")
    }
    // e2e permits plain HTTP only on loopback; both processes share this container.
    const hostLookup = `$(hostname -I | awk '{print $1}')`
    const loopbackCommand = command.replace(hostLookup, "127.0.0.1")
    if (loopbackCommand === command) throw new Error("could not select the Web loopback address")
    const launchCommand = loopbackCommand.replace(
      "--patch /tmp/dsh-workspace.cordis.yml",
      "--patch /tmp/dsh-workspace.cordis.yml --patch /bdd/dsh-aimock.cordis.yml",
    )
    if (launchCommand === loopbackCommand) throw new Error("could not add the aimock provider config")
    const launchArgs = [shell, flag, launchCommand]

    let runner = web
      .withDirectory("/bdd", dag.currentModule().source())
      .withWorkdir("/bdd")
      .withMountedCache("/root/.cache/yarn", dag.cacheVolume("bdd-yarn-cache"))
      .withMountedCache("/root/.cache/ms-playwright", dag.cacheVolume("bdd-playwright-browsers"))
      .withEnvVariable("YARN_CACHE_FOLDER", "/root/.cache/yarn")
      .withEnvVariable("E2E_MODEL_BASE_URL", modelUrl)
      .withEnvVariable("E2E_MODEL_ID", modelId)
      .withEnvVariable("DSH_MODEL_BASE_URL", modelUrl)
      .withEnvVariable("DSH_MODEL_ID", modelId)
      .withEnvVariable("E2E_AI", ai ? "1" : "0")
      .withEnvVariable("E2E_VIDEO", video ? "1" : "0")
      .withEnvVariable("BDD_WAIT_AIMOCK", useAimock ? "1" : "0")
      .withExec(["corepack", "yarn", "install", "--frozen-lockfile"])
      .withExec(["npx", "@e2e-dev/web", "install", "chromium", "--with-deps"])
    if (useAimock) {
      runner = runner.withServiceBinding("aimock", dag.aimock().aimock(mockData ?? dag.directory()))
    }
    runner = modelApiKey === undefined
      ? runner.withEnvVariable("DSH_MODEL_API_KEY", "mock")
      : runner.withSecretVariable("DSH_MODEL_API_KEY", modelApiKey)

    const completed = runner
      .withExec(["mkdir", "-p", "/bdd/.e2e"])
      .withExec(["sh", "/bdd/scripts/run-poc.sh", ...launchArgs])
    const output = await completed.stdout()
    return completed
      .directory("/bdd/.e2e")
      .withNewFile("run-output.txt", output)
  }
}
