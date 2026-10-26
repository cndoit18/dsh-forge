Feature: Web BDD PoC

  Scenario: DSH agent answers through aimock
    Given the authenticated Web GUI is open
    When I send "hello dagger" to the agent
    Then I see "aimock fixture loaded" in the conversation

  Scenario: AI scenario is skipped unless AI is enabled
    Given the authenticated Web GUI is open
    When I exercise the AI gate
    Then the conversation input is available

  Scenario: Git installation initializes nested submodules
    Given the authenticated Web GUI is open
    When I install a Git Agent Plugin with nested submodules through the UI
    Then the Agent Plugins UI shows the nested submodule files
    And the Agent Plugin contains recursive submodule files without Git metadata
