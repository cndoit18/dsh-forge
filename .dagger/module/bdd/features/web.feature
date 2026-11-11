Feature: Web agent and Agent Plugin installation

  Background:
    Given the authenticated Web GUI is open

  Scenario: DSH agent answers through aimock
    When I send "hello dagger" to the agent
    Then I see "aimock fixture loaded" in the conversation

  Scenario: Git installation initializes nested submodules
    When I install a Git Agent Plugin with nested submodules through the UI
    Then the Agent Plugins UI shows the nested submodule files
    And the Agent Plugin contains recursive submodule files without Git metadata
