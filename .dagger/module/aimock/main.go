// Run CopilotKit aimock with a directory of JSON fixtures.

package main

import "dagger/aimock/internal/dagger"

const aimockImage = "ghcr.io/copilotkit/aimock:1.46.0"

type Aimock struct{}

// Aimock returns an aimock service that replays fixtures from mockData.
func (m *Aimock) Aimock(
	// Directory containing aimock JSON fixture files, optionally nested.
	mockData *dagger.Directory,
) *dagger.Service {
	return dag.Container().
		From(aimockImage).
		WithMountedDirectory("/fixtures", mockData, dagger.ContainerWithMountedDirectoryOpts{
			ReadOnly: true,
		}).
		WithExposedPort(4010).
		AsService(dagger.ContainerAsServiceOpts{
			Args: []string{
				"--fixtures", "/fixtures",
				"--host", "0.0.0.0",
				"--port", "4010",
			},
			UseEntrypoint: true,
		})
}
