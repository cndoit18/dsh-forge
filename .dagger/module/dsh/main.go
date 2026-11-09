// Build and run DeepSeek Harness from the local source checkout.
package main

import (
	"context"
	"encoding/json"
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
	// +ignore=[".dagger", "DESIGN.md", "**/node_modules", "**/lib", "!plugins/**/lib", "**/*.tsbuildinfo", "**/apps/web/dist", "**/.artifacts", "**/.dsh-build", "**/.dsh-report", ".env", "**/.env"]
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

const workflowsBundleName = "@dshforge/workflows-bundle"

var workflowsBundleDependencies = []string{
	"@dshforge/workflow",
	"@dshforge/workflow-filesystem",
	"@dshforge/devflow",
}

func isWorkflowBundleDependency(name string) bool {
	for _, dependency := range workflowsBundleDependencies {
		if name == dependency {
			return true
		}
	}
	return false
}

// dshProfilesDir is the web profile tree the installer exports and the main
// container imports.
const dshProfilesDir = "/root/.dsh/profiles"

// webContainer builds DSH from source and installs every requested plugin
// into the web profile. The plugin installs run in an installer container
// parallel to the DSH build; the main container imports the resulting
// profile files instead of running the installs itself.
func (m *Dsh) webContainer(ctx context.Context, source *dagger.Directory, plugins []*dagger.Directory) (*dagger.Container, error) {
	built, err := m.buildPlugins(ctx, source, plugins)
	if err != nil {
		return nil, err
	}

	// Preserve package downloads across source rebuilds while keeping DSH Home ephemeral.
	base := dag.Container().
		From("node:24-bookworm").
		WithMountedCache("/root/.local/share/pnpm/store", dag.CacheVolume("dsh-pnpm-store")).
		WithMountedCache("/root/.cache/node/corepack", dag.CacheVolume("dsh-corepack")).
		WithDirectory("/workspace", source).
		WithWorkdir("/workspace/third_party/deepseek-harness").
		WithExec([]string{"corepack", "enable"}).
		WithEnvVariable("CI", "true").
		WithExec([]string{"pnpm", "install", "--frozen-lockfile"}).
		WithoutEnvVariable("CI").
		WithEnvVariable("DSH_CLIENT_COMMIT_HASH", "0000000000000000000000000000000000000000")
	container := base.WithExec([]string{"pnpm", "run", "build"})

	if len(built) > 0 {
		// One linked bundle per plugin: the bundle patch inside each package
		// mounts its loader row, and installation selects it by default.
		// The link symlinks in the profile point at pluginsRoot, so the built
		// artifacts are mounted there in both containers.
		installer := base
		installs := make([]string, 0, len(built))
		aggregate := false
		for _, plugin := range built {
			if plugin.name == workflowsBundleName {
				aggregate = true
				break
			}
		}
		for _, plugin := range built {
			installer = installer.WithDirectory(pluginsRoot+"/"+plugin.dirName, plugin.artifacts)
			container = container.WithDirectory(pluginsRoot+"/"+plugin.dirName, plugin.artifacts)
			if aggregate && isWorkflowBundleDependency(plugin.name) {
				continue
			}
			spec := "link:"
			if plugin.name == workflowsBundleName {
				spec = "file:"
			}
			installs = append(installs, "pnpm dsh plugin --profile web add "+spec+pluginsRoot+"/"+plugin.dirName)
		}
		installer = installer.WithExec([]string{"sh", "-c", strings.Join(installs, " && ")})
		// The main container consumes the installed profile; it does not run
		// the installs.
		container = container.WithDirectory(dshProfilesDir, installer.Directory(dshProfilesDir))
	}

	return container.
		WithMountedFile("/tmp/dsh-workspace.cordis.yml", dag.CurrentModule().Source().File("workspace.cordis.yml")), nil
}

// builtPlugin is one built plugin package ready to install.
type builtPlugin struct {
	// Full npm package name.
	name string
	// Path-safe form of the package name under pluginsRoot.
	dirName string
	// Built package contents.
	artifacts *dagger.Directory
}

// buildPlugins builds every requested plugin in its own container, all in
// parallel, and drops duplicate package names — the first occurrence of a
// name wins. The aggregate's dependencies are added from the source checkout.
func (m *Dsh) buildPlugins(ctx context.Context, source *dagger.Directory, plugins []*dagger.Directory) ([]builtPlugin, error) {
	type request struct {
		directory *dagger.Directory
		name      string
	}
	requests := []request{}
	seen := map[string]bool{}
	aggregate := false
	for _, plugin := range plugins {
		if plugin == nil {
			continue
		}
		contents, err := plugin.File("package.json").Contents(ctx)
		if err != nil {
			return nil, err
		}
		var manifest struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal([]byte(contents), &manifest); err != nil {
			return nil, err
		}
		if seen[manifest.Name] {
			continue
		}
		seen[manifest.Name] = true
		requests = append(requests, request{directory: plugin, name: manifest.Name})
		if manifest.Name == workflowsBundleName {
			aggregate = true
		}
	}
	if aggregate {
		for _, name := range workflowsBundleDependencies {
			if seen[name] {
				continue
			}
			seen[name] = true
			requests = append(requests, request{
				directory: source.Directory("plugins/" + strings.TrimPrefix(name, "@dshforge/")),
				name:      name,
			})
		}
	}

	containers := []*dagger.Container{}
	for _, request := range requests {
		containers = append(containers, m.buildPluginContainer(request.directory, request.name == workflowsBundleName))
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

	built := []builtPlugin{}
	for i, name := range names {
		built = append(built, builtPlugin{
			name:      name,
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

// buildPluginContainer installs one plugin package's dependencies, builds it
// when its manifest declares a build script, and prints the package name; the
// same pipeline yields the artifacts directory.
// Build output goes to stderr so stdout carries only the name; set -e fails
// the container on a broken build instead of falling through to the name
// print (the if condition stays exempt).
func (m *Dsh) buildPluginContainer(plugin *dagger.Directory, localize bool) *dagger.Container {
	container := dag.Container().
		From("node:24-bookworm").
		WithMountedCache("/root/.local/share/pnpm/store", dag.CacheVolume("dsh-pnpm-store")).
		WithMountedCache("/root/.cache/node/corepack", dag.CacheVolume("dsh-corepack")).
		WithMountedDirectory("/plugin", plugin).
		WithWorkdir("/plugin")
	if localize {
		container = container.WithEnvVariable("DSH_LOCAL_DEPENDENCIES", "1")
	}
	return container.WithExec([]string{"sh", "-c", `
set -e
corepack enable >&2
if [ "${DSH_LOCAL_DEPENDENCIES:-}" = 1 ]; then
  # The aggregate is config-only; the profile installs these localized file dependencies from sibling artifacts.
  node -e 'const fs = require("node:fs"); const p = JSON.parse(fs.readFileSync("package.json", "utf8")); for (const name of Object.keys(p.dependencies ?? {})) { if (name.startsWith("@dshforge/")) p.dependencies[name] = "file:../" + name.replace(/^@/, "").replace("/", "__"); } fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");'
else
  pnpm install >&2
fi
if node -e "const s = require('./package.json').scripts; process.exit(s && s.build ? 0 : 1)"; then
  if [ "${DSH_LOCAL_DEPENDENCIES:-}" = 1 ]; then
    echo "config-only aggregate must not declare a build script" >&2
    exit 1
  fi
  pnpm run build
fi >&2
node -p "require('./package.json').name"
`})
}
