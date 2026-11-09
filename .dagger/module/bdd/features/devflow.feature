Feature: DevFlow host commands

  Scenario: Installed plugin details match their bundle declarations
    Given the authenticated Web GUI is open
    When I open the Plugins panel
    Then each installed plugin shows its declared running components

  Scenario: DevFlow exposes all nine host commands
    Given the authenticated Web GUI is open
    When I inspect the DevFlow command menu
    Then the menu contains all nine DevFlow commands

  Scenario: Deep research completes directly without queuing a user message
    Given the authenticated Web GUI is open
    When I run the deep research command with a BDD question
    Then the deep research workflow completes without a user message or model tool call

  Scenario: Deep research works with the ptc Agent preset
    Given the authenticated Web GUI is open
    When I run deep research with the ptc preset
    Then the deep research workflow completes without a user message or model tool call

  Scenario: Project filesystem workflow runs as a scoped slash command
    Given the authenticated Web GUI is open
    When I run a project filesystem workflow
    Then the project filesystem workflow completes without a user message or model tool call

  Scenario: Batch planning does not start worktree workers before approval
    Given the authenticated Web GUI is open
    When I run the batch command without an approved plan
    Then batch completes planning directly without starting worktree workers

  Scenario: All nine DevFlow commands execute sequentially through the Web UI
    Given the authenticated Web GUI is open
    When I execute all nine DevFlow commands through the Web UI
    Then all nine DevFlow commands complete through the Web UI
