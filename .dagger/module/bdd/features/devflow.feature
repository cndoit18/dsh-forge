Feature: DevFlow host commands

  Scenario: DevFlow exposes all nine host commands
    Given the authenticated Web GUI is open
    When I inspect the DevFlow command menu
    Then the menu contains all nine DevFlow commands

  Scenario: DevFlow icons follow commands after menu filtering
    Given the authenticated Web GUI is open
    When I inspect the DevFlow command menu
    And I filter the DevFlow command menu with "f"
    Then the filtered DevFlow commands keep their icons

  Scenario: Deep research completes and publishes its catalog through the system prompt
    Given the authenticated Web GUI is open
    When I run the deep research command with a BDD question
    Then the deep research workflow completes and publishes its catalog through the system prompt

  Scenario: Deep research works with the ptc Agent preset
    Given the authenticated Web GUI is open
    When I run deep research with the ptc preset
    Then the deep research workflow completes and publishes its catalog through the system prompt

  Scenario: Project filesystem workflow runs as a scoped slash command
    Given the authenticated Web GUI is open
    When I run a project filesystem workflow
    Then the project filesystem workflow completes and publishes its catalog through the system prompt

  Scenario: Batch planning does not start worktree workers before approval
    Given the authenticated Web GUI is open
    When I run the batch command without an approved plan
    Then batch completes planning and publishes its catalog without starting worktree workers

  Scenario: All nine DevFlow commands execute sequentially through the Web UI
    Given the authenticated Web GUI is open
    When I execute all nine DevFlow commands through the Web UI
    Then all nine DevFlow commands complete through the Web UI
