Feature: DevFlow commands and workflows

  Background:
    Given the authenticated Web GUI is open

  Scenario: Installed plugin details match their bundle declarations
    When I open the Plugins panel
    Then each installed plugin shows its declared running components

  Scenario: DevFlow exposes all nine host commands
    When I inspect the DevFlow command menu
    Then the menu contains all nine DevFlow commands

  Scenario: Deep research submits the original question to the conversation
    When I run the deep research command with a BDD question
    Then the deep research request appears as a user message and the session stays visible

  Scenario: Deep research works with the ptc Agent preset
    When I run deep research with the ptc preset
    Then the deep research request appears as a user message and the session stays visible

  Scenario: Project filesystem workflow runs as a scoped slash command
    When I run a project filesystem workflow
    Then the project workflow request appears as a user message and the session stays visible

  Scenario: A newly started workflow session stays visible after switching workspaces
    When I run debug in workspace A and create a session in workspace B after its first turn starts
    Then workspace A's session remains visible

  Scenario: Batch planning does not start worktree workers before approval
    When I run the batch command without an approved plan
    Then batch submits its planning message without starting worktree workers

  Scenario: All nine DevFlow commands queue sequentially through the Web UI
    When I queue all nine DevFlow commands through the Web UI
    Then all nine DevFlow commands are queued through the Web UI
