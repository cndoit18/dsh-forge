// Publishes npm packages to the npm registry.
package main

import (
	"context"
	"strconv"
	"strings"
	"sync"

	"dagger/npm/internal/dagger"
)

// Npm provides npm package publishing workflows.
type Npm struct{}

// Publish builds and publishes every given package directory to
// registry.npmjs.org, all in parallel. Each `packages` element is one
// package directory; repeat the flag to publish multiple packages. A
// package with a build script is installed and built first; one without
// ships as-is. Scoped names publish with --access public, and npm itself
// refuses private manifests. Pass dryRun to run every step except the
// upload. Pass stage to upload as a stage instead: the version waits for
// a maintainer's 2FA approval and never goes live directly. Authentication
// uses GitHub Actions OIDC when oidcRequestToken is set; otherwise it uses
// token.
func (m *Npm) Publish(ctx context.Context,
	// Package directories to publish; repeat the flag per package.
	packages []*dagger.Directory,
	// npm access token for registry.npmjs.org, used without GitHub OIDC.
	// +optional
	token *dagger.Secret,
	// GitHub Actions OIDC request URL for trusted publishing.
	// +optional
	oidcRequestURL string,
	// GitHub Actions OIDC request token for trusted publishing.
	// +optional
	oidcRequestToken *dagger.Secret,
	// Run the build and all publish validations without uploading.
	// +optional
	// +default=false
	dryRun bool,
	// Upload as a stage for maintainer approval instead of publishing
	// directly. Requires stage publishing permission.
	// +optional
	// +default=false
	stage bool,
) (string, error) {
	containers := []*dagger.Container{}
	for _, pkg := range packages {
		if pkg == nil {
			continue
		}
		containers = append(containers, publishContainer(pkg, token, oidcRequestURL, oidcRequestToken, dryRun, stage))
	}

	outputs := make([]string, len(containers))
	var wait sync.WaitGroup
	errs := make([]error, len(containers))
	for i, container := range containers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			out, err := container.Stdout(ctx)
			if err == nil {
				outputs[i] = strings.TrimSpace(out)
			}
			errs[i] = err
		}()
	}
	wait.Wait()
	for _, err := range errs {
		if err != nil {
			return "", err
		}
	}

	return strings.Join(outputs, "\n"), nil
}

// publishContainer installs, builds, and publishes one package in its own
// container; the pipeline's stdout is npm's own publish line (name@version),
// so build steps write to stderr to keep it clean.
func publishContainer(pkg *dagger.Directory, token *dagger.Secret, oidcRequestURL string, oidcRequestToken *dagger.Secret, dryRun, stage bool) *dagger.Container {
	container := dag.Container().
		From("node:24-bookworm").
		WithMountedCache("/root/.local/share/pnpm/store", dag.CacheVolume("dsh-pnpm-store")).
		WithMountedCache("/root/.cache/node/corepack", dag.CacheVolume("dsh-corepack")).
		WithMountedDirectory("/pkg", pkg).
		WithWorkdir("/pkg")
	if token != nil {
		container = container.WithSecretVariable("NPM_TOKEN", token)
	}
	if oidcRequestToken != nil {
		// Provenance needs GitHub workflow metadata that is not forwarded.
		container = container.
			WithEnvVariable("GITHUB_ACTIONS", "true").
			WithEnvVariable("ACTIONS_ID_TOKEN_REQUEST_URL", oidcRequestURL).
			WithSecretVariable("ACTIONS_ID_TOKEN_REQUEST_TOKEN", oidcRequestToken).
			WithEnvVariable("NPM_CONFIG_PROVENANCE", "false")
	}
	return container.
		WithEnvVariable("DRY_RUN", strconv.FormatBool(dryRun)).
		WithEnvVariable("STAGE", strconv.FormatBool(stage)).
		WithExec([]string{"sh", "-c", publishScript})
}

const publishScript = `
set -e
corepack enable
if node -e "const s = require('./package.json').scripts; process.exit(s && s.build ? 0 : 1)"; then
  pnpm install
  pnpm run build
fi >&2
if [ -n "${NPM_TOKEN:-}" ]; then
  echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > /root/.npmrc
fi

args="publish"
if [ "$STAGE" = "true" ]; then
  # node:24 ships npm 11, which predates the npm stage command (npm 12).
  npm install -g npm@12 >&2
  args="stage publish"
elif [ -n "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" ]; then
  # Trusted publishing requires npm 11.5.1 or later.
  npm install -g npm@11 >&2
fi
# Scoped names default to restricted access on first publish. Like the
# build check above, use process.exit so the predicate prints nothing.
if node -e "process.exit(require('./package.json').name.startsWith('@') ? 0 : 1)"; then
  args="$args --access public"
fi
if [ "$DRY_RUN" = "true" ]; then
  args="$args --dry-run"
fi
npm $args
`
