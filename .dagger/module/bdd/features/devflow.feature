Feature: DevFlow commands and workflows

  Background:
    Given the authenticated Web GUI is open

  Scenario: Installed plugin details match their bundle declarations
    When I open the Plugins panel
    Then each installed plugin shows its declared running components

  Scenario: DevFlow exposes all nine host commands
    When I inspect the DevFlow command menu
    Then the menu contains all nine DevFlow commands

  Scenario: Deep research completes directly without model-mediated dispatch
    When I run the deep research command with a BDD question
    Then the deep research workflow returns its result without model-mediated dispatch

  Scenario: Deep research works with the ptc Agent preset
    When I run deep research with the ptc preset
    Then the deep research workflow returns its result without model-mediated dispatch

  Scenario: Project filesystem workflow runs as a scoped slash command
    When I run a project filesystem workflow
    Then the project filesystem workflow returns its result without model-mediated dispatch

  Scenario: Batch planning does not start worktree workers before approval
    When I run the batch command without an approved plan
    Then batch returns an unapproved plan without starting worktree workers

  Scenario: All nine DevFlow commands execute sequentially through the Web UI
    When I execute all nine DevFlow commands through the Web UI
    Then all nine DevFlow commands complete through the Web UI
