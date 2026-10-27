# Meal Planner

A locally hosted app for keeping recipes, planning the week's meals, and turning the plan into one combined grocery list, so a single trip covers the week and less food goes to waste.

- Recipes built from a shared ingredient catalog, with unit conversion (cups ↔ grams ↔ items)
- Weekly planner with per-meal servings
- Combined shopping list grouped by store section
- Suggestions for recipes that reuse ingredients you're already buying
- Usable from phones on your home Wi-Fi; never exposed to the internet

> **Status:** scaffold. See [docs/DESIGN.md](docs/DESIGN.md).

## Stack

TypeScript · React + Vite · TanStack Router & Query · Fastify · SQLite + Drizzle · Zod · OpenAPI/Swagger UI

## Getting started

Requires Node.js 22+ (24 LTS recommended).

```bash
npm install
npm run db:seed         # optional: add ~140 common ingredients
npm run dev
```

- App: http://localhost:5174
- API docs (Swagger UI): http://localhost:5174/docs

## Using it from phones at home

```bash
cp .env.example .env    # then set HOST=0.0.0.0
npm run build
npm start
```

The log prints the address to open on a phone (for example `http://192.168.1.10:3002`). The first time, Windows asks whether to let Node through the firewall: allow **Private networks** only, and check your home Wi-Fi is set to _Private_ in Windows network settings. Don't set up port forwarding on your router. See [DESIGN §9](docs/DESIGN.md#9-home-network-access) for how the app stays off the internet.

## Scripts

| Command                                   | What it does                                       |
| ----------------------------------------- | -------------------------------------------------- |
| `npm run dev`                             | API and web app in watch mode (this computer only) |
| `npm run build`                           | Build the web app and bundle the API               |
| `npm start`                               | Serve the built app and API from one port          |
| `npm test`                                | Run all tests (Vitest)                             |
| `npm run typecheck`                       | Type-check every workspace                         |
| `npm run lint`                            | ESLint                                             |
| `npm run format` / `npm run format:check` | Prettier                                           |
| `npm run db:generate -- --name <change>`  | Generate a migration from schema changes           |
| `npm run db:migrate`                      | Apply migrations (also runs on API start)          |
| `npm run db:seed`                         | Add starter ingredients (skips existing names)     |
| `npm run db:studio`                       | Browse the database in Drizzle Studio              |

Your data lives in `data/`, which git ignores.

## Layout

```
apps/api         Fastify API (Zod-validated routes, OpenAPI docs)
apps/web         React + Vite app (TanStack Router & Query)
packages/shared  Zod schemas, types, and unit conversion used by both
docs/            Design document
```

Ingredient conversion data is adapted from USDA FoodData Central (public domain).
