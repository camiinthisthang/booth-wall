# Booth contribution rules

This repository is intentionally split into narrow build surfaces so many Droids can contribute safely.

1. Ship one feature per pull request.
2. Never edit unrelated features.
3. Keep a feature self-contained in its named component. Do not create coupling between feature components.
4. Run tests before opening a pull request.
5. Put the Linear issue identifier in both the branch name and pull request title.
6. Change a shared file only when the ticket explicitly names that shared file as its intended path. `features/registry.ts`, global styles, adapters, and route handlers are shared files.
7. Do not add a feature to `features/registry.ts` unless the ticket explicitly calls for registry composition.
8. Never expose Linear, GitHub, Redis, or cron credentials to browser code.

The intended file listed in a seeded Linear ticket defines that ticket's edit boundary. If the work cannot be completed within that boundary, stop and request a follow-up ticket rather than expanding the pull request.
