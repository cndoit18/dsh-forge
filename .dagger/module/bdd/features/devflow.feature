Feature: DevFlow host commands

  Scenario: DevFlow exposes all nine host commands
    Given the authenticated Web GUI is open
    When I inspect the DevFlow command menu
    Then the menu contains all nine DevFlow commands

  Scenario: Deep research starts its packaged workflow directly
    Given the authenticated Web GUI is open
    When I run the deep research command with a BDD question
    Then the deep research workflow reaches scope extraction

  Scenario: Batch planning does not start worktree workers before approval
    Given the authenticated Web GUI is open
    When I run the batch command without an approved plan
    Then batch returns a plan without starting worktree workers
