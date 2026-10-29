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

  Scenario: Deep research submits the original question to the conversation
    Given the authenticated Web GUI is open
    When I run the deep research command with a BDD question
    Then the deep research request appears as a user message

  Scenario: Deep research works with the ptc Agent preset
    Given the authenticated Web GUI is open
    When I run deep research with the ptc preset
    Then the deep research request appears as a user message

  Scenario: Batch planning does not start worktree workers before approval
    Given the authenticated Web GUI is open
    When I run the batch command without an approved plan
    Then batch submits its planning message without starting worktree workers
