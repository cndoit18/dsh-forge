# Worktree BDD mock model

Test-only provider that returns one deterministic assistant response for every model call. Mount it only in Web BDD builds, then select provider `e2e-mock` and model `bdd` through the native `session/selectModel` Remote method. It is not part of the production Worktree plugin composition.
