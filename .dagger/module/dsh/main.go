// Build and run DeepSeek Harness from the local source checkout.
package main

import (
	"context"
	"strings"
	"sync"

	"dagger/dsh/internal/dagger"
)

// Dsh provides local DeepSeek Harness workflows.
type Dsh struct{}

// Web builds DSH and serves its Web UI on port 3080. Each `plugins` element
// is one plugin package directory: it builds in its own container (in
// parallel with the other plugins), then installs into the web profile as a
// linked bundle, so it appears as an independent plugin in the Web Plugins
// page. Omitting `plugins` serves a clean web; adding a plugin is passing
// one more --plugins flag — no patch file edits.
//
// The web process logs to standard output: run Web in the foreground to see
// the authenticated URL line, or `up --ports 3080:3080` to tunnel the port.
func (m *Dsh) Web(ctx context.Context,
	// Repository root containing the DSH source.
	// +defaultPath="/"
	// +ignore=[".dagger", "DESIGN.md", "**/node_modules", "**/lib", "**/*.tsbuildinfo", "**/apps/web/dist", "**/.artifacts", "**/.dsh-build", "**/.dsh-report", ".env", "**/.env"]
	source *dagger.Directory,
	// Plugin package directories to build and install; repeat the flag per
	// plugin. Absent installs nothing.
	// +optional
	plugins []*dagger.Directory,
) (*dagger.Container, error) {
	container, err := m.webContainer(ctx, source, plugins)
	if err != nil {
		return nil, err
	}

	// Dagger maps the container hostname to loopback; -I enumerates the service address instead.
	return container.
		WithExposedPort(3080).
		WithDefaultArgs([]string{"sh", "-c", `
exec pnpm dsh web \
  --patch /tmp/dsh-workspace.cordis.yml \
  --host "$(hostname -I | awk '{print $1}')" \
  --port 3080 \
  --public-url http://127.0.0.1:3080 \
  --trusted-host 127.0.0.1:3080 localhost:3080 \
  --no-open
`,
		}), nil
}

// pluginsRoot is where built plugin packages land in the DSH container.
const pluginsRoot = "/opt/dsh-plugins"

// dshProfilesDir is the web profile tree the installer exports and the main
// container imports.
const dshProfilesDir = "/root/.dsh/profiles"

// webContainer builds DSH from source and installs every requested plugin
// into the web profile. The plugin installs run in an installer container
// parallel to the DSH build; the main container imports the resulting
// profile files instead of running the installs itself.
func (m *Dsh) webContainer(ctx context.Context, source *dagger.Directory, plugins []*dagger.Directory) (*dagger.Container, error) {
	built, err := m.buildPlugins(ctx, plugins, source)
	if err != nil {
		return nil, err
	}

	// Preserve package downloads across source rebuilds while keeping DSH Home ephemeral.
	base := dag.Container().
		From("node:24-bookworm").
		WithMountedCache("/root/.local/share/pnpm/store", dag.CacheVolume("dsh-pnpm-store")).
		WithMountedCache("/root/.cache/node/corepack", dag.CacheVolume("dsh-corepack")).
		WithDirectory("/workspace", source).
		WithDirectory("/opt/dsh-sandbox", dag.CurrentModule().Source().Directory("sandbox")).
		WithWorkdir("/workspace/third_party/deepseek-harness").
		WithExec([]string{"corepack", "enable"}).
		WithExec([]string{"sh", "-c", "mkdir -p /opt/dsh-sandbox-deps && cd /opt/dsh-sandbox-deps && npm init -y >/dev/null 2>&1 && npm install --ignore-scripts --no-audit --no-fund @deepseek-ai/node-addon-system@0.1.2"}).
		WithEnvVariable("NODE_PATH", "/opt/dsh-sandbox-deps/node_modules").
		WithEnvVariable("CI", "true").
		WithExec([]string{"pnpm", "install", "--frozen-lockfile"}).
		WithoutEnvVariable("CI").
		WithEnvVariable("DSH_CLIENT_COMMIT_HASH", "0000000000000000000000000000000000000000")
	container := base.WithExec([]string{"pnpm", "run", "build"})

	if len(built) > 0 {
		// Install the official service as a dependency, not a bundle.
		installer := base.WithExec([]string{"pnpm", "dsh", "plugin", "--profile", "web", "add", "link:./packages/experimental/worktree"})
		container = container.WithDirectory(dshProfilesDir, installer.Directory(dshProfilesDir))
	}

	if len(built) > 0 {
		// One linked bundle per plugin: the bundle patch inside each package
		// mounts its loader row, and installation selects it by default.
		// The link symlinks in the profile point at pluginsRoot, so the built
		// artifacts are mounted there in both containers.
		installer := base
		installs := make([]string, 0, len(built))
		for _, plugin := range built {
			installer = installer.WithDirectory(pluginsRoot+"/"+plugin.dirName, plugin.artifacts)
			installs = append(installs, "pnpm dsh plugin --profile web add link:"+pluginsRoot+"/"+plugin.dirName)
			container = container.WithDirectory(pluginsRoot+"/"+plugin.dirName, plugin.artifacts)
		}
		installer = installer.WithExec([]string{"sh", "-c", strings.Join(installs, " && ")})
		installer = installer.WithExec([]string{"node", "--import", "tsx/esm", "/opt/dsh-sandbox/enable-official.mjs"})
		// The main container consumes the installed profile; it does not run
		// the installs.
		container = container.WithDirectory(dshProfilesDir, installer.Directory(dshProfilesDir))
	}

	return container.
		WithDirectory("third_party/deepseek-harness/packages/experimental/worktree", source.Directory("third_party/deepseek-harness/packages/experimental/worktree")).
		WithDirectory("/opt/dsh-sandbox", dag.CurrentModule().Source().Directory("sandbox")).
		WithMountedFile("/tmp/dsh-workspace.cordis.yml", dag.CurrentModule().Source().File("workspace.cordis.yml")), nil
}

// builtPlugin is one built plugin package ready to install.
type builtPlugin struct {
	// Path-safe form of the package name under pluginsRoot.
	dirName string
	// Built package contents.
	artifacts *dagger.Directory
}

// buildPlugins builds every requested plugin in its own container, all in
// parallel, and drops duplicate package names — the first occurrence of a
// name wins. Each plugin's name is the stdout of its build container, so name
// reads and artifact directories share one pipeline per plugin.
func (m *Dsh) buildPlugins(ctx context.Context, plugins []*dagger.Directory, source *dagger.Directory) ([]builtPlugin, error) {
	containers := []*dagger.Container{}
	for _, plugin := range plugins {
		if plugin == nil {
			continue
		}
		containers = append(containers, m.buildPluginContainer(plugin, source))
	}

	names := make([]string, len(containers))
	var wait sync.WaitGroup
	errs := make([]error, len(containers))
	for i, container := range containers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			out, err := container.Stdout(ctx)
			if err == nil {
				names[i] = strings.TrimSpace(out)
			}
			errs[i] = err
		}()
	}
	wait.Wait()
	for _, err := range errs {
		if err != nil {
			return nil, err
		}
	}

	seen := map[string]bool{}
	built := []builtPlugin{}
	for i, name := range names {
		if seen[name] {
			continue
		}
		seen[name] = true
		built = append(built, builtPlugin{
			dirName:   sanitizePackageDir(name),
			artifacts: containers[i].Directory("/plugin"),
		})
	}
	return built, nil
}

// sanitizePackageDir maps a package name onto one path segment: scoped names
// lose their @ and slash.
func sanitizePackageDir(name string) string {
	return strings.NewReplacer("@", "", "/", "__").Replace(name)
}

// buildPluginContainer builds one plugin package when its manifest declares a
// build script (packages shipping plain artifacts pass through unchanged) and
// prints the package name; the same pipeline yields the artifacts directory.
// Build output goes to stderr so stdout carries only the name; set -e fails
// the container on a broken build instead of falling through to the name
// print (the if condition stays exempt).
func (m *Dsh) buildPluginContainer(plugin *dagger.Directory, source *dagger.Directory) *dagger.Container {
	return dag.Container().
		From("node:24-bookworm").
		WithMountedCache("/root/.local/share/pnpm/store", dag.CacheVolume("dsh-pnpm-store")).
		WithMountedCache("/root/.cache/node/corepack", dag.CacheVolume("dsh-corepack")).
		WithMountedDirectory("/plugin", plugin).
		WithDirectory("/third_party/deepseek-harness", source.Directory("third_party/deepseek-harness")).
		WithWorkdir("/plugin").
		WithExec([]string{"sh", "-c", `
set -e
if node -e "const s = require('./package.json').scripts; process.exit(s && s.build ? 0 : 1)"; then
  corepack enable
  pnpm install
  pnpm run build
fi >&2
node -p "require('./package.json').name"
`})
}
