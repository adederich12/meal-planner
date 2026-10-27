# Meal Planner

Local recipe keeper, weekly meal planner, and combined grocery list. The full design (architecture, data model, API, pages, and the reasoning behind decisions) is in `docs/DESIGN.md`. Read it before making structural changes, and update it when a design decision changes.

## Working with the owner

The owner is a software engineer using this project to sharpen their skills. When a request or design choice doesn't match current best practice, say so, explain why, and name the concept or tool worth learning.

## Conventions

- Same stack and patterns as the owner's Jobber project: TypeScript strict mode everywhere; npm workspaces (`apps/web`, `apps/api`, `packages/shared`).
- Zod schemas in `packages/shared` are the API contract; don't duplicate types.
- Frontend components never call `fetch` directly: component → TanStack Query hook → service → API.
- Computed values (shopping list, overlap, costs) are derived, not stored. Only user decisions about the shopping list are stored (DESIGN §4.6).
- All unit math goes through `packages/shared/src/units.ts`. Recipe lines store quantity + unit exactly as entered.
- Every page must work at phone width: the household uses it from phones on home Wi-Fi.
- Never weaken the private-network guard (`apps/api/src/lan-guard.ts`) or suggest port forwarding; the app must stay off the internet (DESIGN §9).
- Runtime data lives in `data/` (git-ignored). Once real recipes are in it, never delete `data/` or wipe tables without asking.
- Schema changes: edit `apps/api/src/db/schema.ts`, then `npm run db:generate -- --name <change>`. Never edit generated migrations by hand.
- API tests use `createTestDeps()` (in-memory SQLite with real migrations), not mocks.
- Ports: API 3002, Vite 5174 (Jobber uses 3001/5173, so both can run at once).
- On Windows this session's shell may predate the Node/Git install; if `node`/`git` aren't found, reload PATH from the registry.
