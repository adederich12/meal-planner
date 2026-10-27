# Meal Planner — Design Document

A locally hosted app for keeping recipes, planning a week of meals, and turning that plan into a single, combined grocery list, with the aim of lowering household food costs.

- **Status:** Phase 1 (ingredients + recipes) implemented
- **Last updated:** 2026-10-27

---

## 1. Goals

- Keep a recipe collection where each ingredient line points to a shared **ingredient catalog** instead of free text, so the app knows that "1 onion, diced" in two recipes is the same onion.
- Plan a week: assign recipes to days and meal slots, with a serving count per entry (scaling the recipe).
- Generate one **shopping list** per week that combines every ingredient across the plan, converts units where possible, and groups items by store section, so one trip covers the week.
- Suggest recipes that **share ingredients** with what's already planned, so partly used items (half a bunch of cilantro, the rest of a can of tomato paste) get used instead of wasted.
- Be easy to run: `npm install`, then `npm run dev` or `npm start`. No system-wide dependencies beyond Node.js LTS.

### Non-goals (for now)

- Multi-user support, authentication, or cloud hosting.
- Nutrition tracking.
- Store APIs or online grocery ordering.
- Native mobile app. Phones use the web app over home Wi-Fi (§9).

---

## 2. Architecture

Same shape and stack as Jobber, so patterns carry over.

```
┌──────────────────────┐   HTTP/JSON    ┌──────────────────────────┐
│  apps/web            │ ─────────────▶ │  apps/api                │
│  React + Vite        │                │  Fastify                 │
│  TanStack Router     │                │  routes → services       │
│  TanStack Query      │                │   → Drizzle              │
└──────────┬───────────┘                └───────────┬──────────────┘
           │        packages/shared                 │
           └──── Zod schemas, units, types ─────────┤
                                                 SQLite
                                               (Drizzle)
```

### Monorepo layout (npm workspaces)

```
meal-planner/
  package.json            root scripts: dev, build, start, test, lint, typecheck, db:*
  apps/
    web/                  React frontend
    api/                  Fastify backend
  packages/
    shared/               Zod schemas, inferred types, enums, unit table + conversion
  data/                   (git-ignored) meal-planner.db + backups/
  docs/
    DESIGN.md
```

### Runtime modes

- **Development (`npm run dev`):** Vite dev server and the API (watch mode) run together. Vite proxies `/api` to the backend.
- **Production-style (`npm run build && npm start`):** React is built to static files and served by Fastify. One process, one port.
- **Ports:** API on **3002**, Vite on **5174**, so this app and Jobber (3001 / 5173) can run at the same time.

### Tech stack

| Concern          | Choice                                                   | Notes                                      |
| ---------------- | -------------------------------------------------------- | ------------------------------------------ |
| Language         | TypeScript (strict)                                      | Everywhere                                 |
| Frontend         | React + Vite                                             |                                            |
| Routing          | TanStack Router                                          | Type-safe routes and search params         |
| Server state     | TanStack Query                                           | Wraps app services; caching, invalidation  |
| Forms            | React Hook Form + `zodResolver`                          | Validated with the shared schemas          |
| UI components    | shadcn/ui (Radix + Tailwind)                             | Components are owned code in the repo      |
| Backend          | Fastify                                                  | `fastify-type-provider-zod` for validation |
| API docs         | OpenAPI 3 via `@fastify/swagger` + `@fastify/swagger-ui` | Generated from the Zod schemas             |
| Database         | SQLite via `better-sqlite3`                              | WAL mode, `foreign_keys = ON`              |
| ORM / migrations | Drizzle ORM + drizzle-kit                                |                                            |
| AI (later)       | `@anthropic-ai/sdk`, model `claude-opus-5-5`             | Optional; recipe import (§6)               |
| Testing          | Vitest, React Testing Library, MSW                       |                                            |
| Lint / format    | ESLint (flat config) + typescript-eslint + Prettier      |                                            |
| CI               | GitHub Actions                                           | typecheck → lint → test → build            |

---

## 3. Key principles

1. **One schema, many uses.** Zod schemas in `packages/shared` are the API contract: request validation, OpenAPI docs, form validation, frontend types.
2. **API contract ≠ database schema.** Services map between Drizzle rows and the shared API schemas.
3. **Derive, don't store, computed data.** The shopping list, recipe overlap, and (later) cost estimates are computed from recipes and the plan when requested. Only _user decisions_ about the list are stored: checked-off items, "already have it", and manual extras (§4.6).
4. **Store what the user entered; normalize when computing.** A recipe line keeps "2 cups" as written. Conversion to base units happens during aggregation, so recipes always read the way they were typed.
5. **Unit math lives in one pure module.** `packages/shared/src/units.ts` owns the unit table and conversion functions. It has no I/O, so it's easy to unit test thoroughly, and both API and web can use it (for example, to show a scaled recipe).
6. **Thin routes, fat services.** Same as Jobber: routes parse input and shape output; services hold the rules and throw typed `AppError`s.
7. **AI drafts, the human confirms.** Any import feature fills in a form for review and never writes to the database directly.

---

## 4. Data model

Conventions (same as Jobber):

- IDs are UUIDs (text). Timestamps are UTC ISO-8601 strings. Calendar dates are `YYYY-MM-DD` strings handled only through `packages/shared/src/dates.ts` helpers.
- Money is integer cents. Never floats.
- Quantities are `REAL`. They are measurements, not money, and small float error is harmless once results are rounded for display. The UI accepts and displays fractions ("1 1/2", "⅓").
- Enums are Zod enums in `packages/shared`, with `CHECK` constraints generated from the same constants (only on tables created with the enum; see Jobber's note on SQLite `ALTER TABLE`).
- Case-insensitive unique names use a unique index on `lower(name)`.

### 4.1 Units (code, not a table)

Units are a fixed list in `packages/shared`, not rows in the database. Each unit has a **dimension** and a factor to that dimension's base unit:

| Dimension | Base | Units                                                            |
| --------- | ---- | ---------------------------------------------------------------- |
| mass      | g    | g, kg, oz, lb                                                    |
| volume    | ml   | ml, l, tsp, tbsp, cup, fl oz, pint, quart, gallon                |
| count     | each | each (displayed with the ingredient's own noun, e.g. "2 cloves") |

Converting **within** a dimension is always possible. Converting **across** dimensions needs ingredient-specific data (§4.2): `gramsPerMl` (density) bridges volume↔mass, and `gramsPerEach` bridges count↔mass. When the data is missing, the shopping list shows the amounts on separate lines instead of guessing.

### 4.2 Ingredients

The catalog that makes combining and overlap possible.

| Column         | Type  | Notes                                                                                          |
| -------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `id`           | text  |                                                                                                |
| `name`         | text  | Unique (case-insensitive). Singular: "yellow onion"                                            |
| `category`     | enum  | Store section: produce, meat, seafood, dairy, bakery, pantry, spices, frozen, beverages, other |
| `countNoun`    | text? | Shown with `each`, e.g. "clove", "can". Defaults to the name                                   |
| `gramsPerMl`   | real? | Density, for volume↔mass                                                                       |
| `gramsPerEach` | real? | For count↔mass ("1 onion ≈ 150 g")                                                             |
| `isStaple`     | bool  | Salt, oil, pepper: left off the list by default and ignored when scoring overlap               |
| `archivedAt`   | text? | Archive instead of delete when recipes use it                                                  |

### 4.3 Recipes

`recipes`: `id`, `name`, `servings` (int, what the recipe yields), `prepMinutes?`, `cookMinutes?`, `instructions` (Markdown), `sourceUrl?`, `notes?`, `rating?` (1–5), `createdAt`, `updatedAt`, `archivedAt?`.

`recipe_ingredients` (ordered lines):

| Column         | Type  | Notes                                      |
| -------------- | ----- | ------------------------------------------ |
| `id`           | text  |                                            |
| `recipeId`     | text  | FK, cascade delete                         |
| `ingredientId` | text  | FK to ingredients, restrict delete         |
| `quantity`     | real? | Null for "to taste"                        |
| `unit`         | enum? | Null when `quantity` is null               |
| `preparation`  | text? | "diced", "room temperature"                |
| `isOptional`   | bool  | Excluded from the shopping list by default |
| `sortOrder`    | int   |                                            |

`tags` / `recipe_tags`: free-form tags ("dinner", "freezer-friendly", "kid favorite") for filtering.

### 4.4 Meal plans

`meal_plans`: `id`, `weekStart` (`YYYY-MM-DD`, unique; week start day is a setting), `notes?`.

`meal_plan_entries`:

| Column       | Type  | Notes                                                     |
| ------------ | ----- | --------------------------------------------------------- |
| `id`         | text  |                                                           |
| `mealPlanId` | text  | FK, cascade delete                                        |
| `date`       | text  | `YYYY-MM-DD`, within the plan's week                      |
| `slot`       | enum  | breakfast, lunch, dinner, snack                           |
| `recipeId`   | text? | Null for a free-text entry ("leftovers", "eating out")    |
| `label`      | text? | Required when `recipeId` is null                          |
| `servings`   | int?  | Defaults to the household size setting; scales the recipe |

A "leftovers" entry has no recipe, so it adds nothing to the shopping list. Cooking a double batch is expressed through `servings`.

### 4.5 Shopping list (derived)

For a meal plan:

1. Expand every entry with a recipe into its ingredient lines, scaled by `entry.servings / recipe.servings`. Skip optional lines and staples (unless the user includes them).
2. Group by `ingredientId`.
3. Within each group, convert each amount to its dimension's base unit. Merge across dimensions using `gramsPerMl` / `gramsPerEach` when available; otherwise keep one line per dimension.
4. Pick a readable display unit for each total (for example, 1,420 ml → "6 cups").
5. Add manual extras, remove "already have" items, and group by `category`.

Each line keeps a **breakdown** ("Tue tacos: 1, Thu chili: 2") so the user can see where the amount came from.

This runs in a TypeScript service (using `units.ts`), not SQL. SQL fetches the rows; the unit math would be unreadable in SQL. This differs from Jobber, where derived values are pure SQL.

### 4.6 Shopping list state (stored)

The list itself is derived, but these user decisions are stored:

- `shopping_list_checks`: (`mealPlanId`, `ingredientId`) → `checkedAt`. Checked off in the store.
- `shopping_list_have`: (`mealPlanId`, `ingredientId`). Already in the pantry this week.
- `shopping_list_extras`: `mealPlanId`, `text`, `category`, `checkedAt?`. Non-recipe items (paper towels).

Keys use `ingredientId`, not a line ID, because lines are recomputed whenever the plan changes.

### 4.7 Settings

A single-row `settings` table: `householdSize` (default servings), `weekStartsOn` (0–6).

### 4.8 Writes, archiving, and deletes

- **Full replace (`PUT`), not `PATCH`,** for ingredients and recipes. The forms always send the whole record, and a Zod `.partial()` over fields with defaults (`isStaple`) or null-transforms is easy to get wrong: a missing field can quietly become its default.
- **Recipe lines are replaced on every save**, so line IDs aren't stable. Nothing may reference a line ID (shopping list state keys on `ingredientId`, §4.6).
- **Ingredients:** `DELETE` works only when no recipe uses the ingredient (409 `INGREDIENT_IN_USE`); otherwise archive it (`POST /:id/archive`, `/:id/restore`). Archived ingredients leave the catalog list and the recipe picker but still show on recipes that use them. Recipes may keep referencing archived ingredients.
- **Recipes:** archive/restore the same way. `DELETE` removes the recipe and its lines. **Phase 2 must revisit this**: a recipe used by meal plan entries should be archived, not deleted.
- **Tags** exist only while a recipe uses them; unused tags are removed on save and delete. They're de-duplicated case-insensitively, first spelling kept.
- **Conversion data in the UI:** density is entered as "1 cup weighs N g" (how USDA and package labels list it) and stored as `gramsPerMl`.
- **Form text vs API input:** web form schemas (`apps/web/src/forms/`) parse what people type ("1 1/2", "") and then validate with the shared API schema, so both sides enforce the same rules. Edit fields show stored quantities exactly (`quantityToInput`), never rounded, so re-saving doesn't change data.

---

## 5. Ingredient overlap

**Question answered:** "Given what's planned this week, which recipes would reuse the most of the same ingredients?"

- Planned set **P** = non-staple ingredient IDs across the week's recipes.
- For each candidate recipe with non-staple set **R**, score by shared count `|R ∩ P|` and by **coverage** `|R ∩ P| / |R|` (how much of the recipe you'd already be buying).
- This is plain SQL: a join of `recipe_ingredients` against the planned set, `GROUP BY recipeId`, ordered by score.

The concept is **set similarity**. Jaccard similarity (`|A ∩ B| / |A ∪ B|`) is the textbook version. Coverage is the better fit here because it prefers small recipes that are mostly "free".

The same query, run for a single recipe, gives "recipes similar to this one" on the recipe page.

---

## 6. Later phases

| Phase | Feature                       | Notes                                                                                                                                                                                                                            |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Ingredients + recipes CRUD    | Units module with thorough tests                                                                                                                                                                                                 |
| 2     | Weekly planner                | 7-day × slot grid; copy last week                                                                                                                                                                                                |
| 3     | Shopping list                 | Aggregation, checks, extras, print view                                                                                                                                                                                          |
| 4     | Overlap suggestions           | Panel in the planner                                                                                                                                                                                                             |
| 5     | Prices and cost estimates     | `ingredient_prices` (package size, price in cents, store, date); cost per recipe/serving/week; derived                                                                                                                           |
| 6     | Recipe import from URL        | First parse schema.org `Recipe` JSON-LD (most recipe sites embed it; no AI needed). Then use Claude to split ingredient lines into quantity/unit/ingredient/preparation and match catalog ingredients. Review form before saving |
| 7     | Package-aware waste reduction | "You need 1/2 cup cilantro; it's sold by the bunch (~1 cup)". Needs package sizes from phase 5                                                                                                                                   |

---

## 7. Frontend pages

- **Planner** (home): week grid, prev/next week, drag a recipe into a slot, overlap suggestions panel.
- **Recipes**: search and filter by tag/ingredient; detail page with scaling by servings; edit form with an ingredient-line editor (type-ahead on the catalog, create an ingredient inline). Filters and the scaled serving count live in URL search params (`?q=&tag=`, `?servings=6`), so Back and shared links keep them.
- **Ingredients**: catalog table; edit category, staple flag, and conversion data; shows the recipes that use each one.
- **Shopping list**: grouped by store section, checkboxes, "already have", extras, print-friendly layout.
- **Settings**: household size, week start.

---

## 8. Testing

- `units.ts`: table-driven unit tests for every conversion, plus rounding/display choices. This is the riskiest logic.
- Shopping list service: fixture recipes and plans → expected lists (scaling, merging across dimensions, staples, optional lines).
- API: `createTestDeps()` pattern from Jobber (in-memory SQLite with real migrations), no mocks.

---

## 9. Home network access

The household (laptop, phones) uses the app over home Wi-Fi. It must **not** be reachable from the internet.

Layers, from outside in:

1. **Router NAT.** A home router doesn't forward incoming internet traffic to devices unless a port-forward rule (or UPnP) creates one. The app never asks for one, so nothing outside can reach it. This is the main protection; the layers below are defense in depth.
2. **Windows Firewall.** The first time Node listens on the network, Windows asks which network types to allow. Allow **Private** only, and make sure the home Wi-Fi is set to _Private_ (Settings → Network → Wi-Fi → network properties). On public Wi-Fi (a coffee shop) the app is then blocked automatically.
3. **Bind address.** `HOST` defaults to `127.0.0.1` (this machine only). Setting `HOST=0.0.0.0` in `.env` opens it to the network. `npm run dev` always stays local.
4. **Private-network guard** (`apps/api/src/lan-guard.ts`), a Fastify `onRequest` hook that runs on every request:
   - Rejects (403) any client IP outside loopback and the private ranges: RFC 1918 (10/8, 172.16/12, 192.168/16), link-local, and IPv6 ULA (fc00::/7).
   - Rejects a `Host` header that isn't `localhost`, a private IP, or this machine's name. This blocks **DNS rebinding**, where a malicious website points its own domain at your LAN IP so your browser talks to the app on the site's behalf.

There's no login. Anyone on the home Wi-Fi can use the app, which is acceptable for a household tool. Guests on the main Wi-Fi could reach it too. A router's guest network usually isolates guests from your devices.

Phones open `http://<laptop-name>:3002` (or its IP). Because of that, every page must work at phone width.

---

## 10. Ingredient seed data

`npm run db:seed` adds a starter catalog of common ingredients (`apps/api/src/db/seed-ingredients.ts`) with category, staple flag, and conversion data. It only inserts names that don't exist yet, so it's safe to run on real data.

Conversion values come from the **USDA FoodData Central** "SR Legacy" dataset (public domain, CC0). It lists household portion weights for each food ("1 cup, chopped = 160 g", "1 medium = 110 g"), which gives `gramsPerMl` (grams per cup ÷ 236.6) and `gramsPerEach` directly. The values are rounded averages, accurate enough for a shopping list. Edit them on the Ingredients page if your store's onions run bigger.

FoodData Central has a free API (api.nal.usda.gov, needs a free key). A later "look up conversions" button on the ingredient form could call it for ingredients outside the seed list.

---

## 11. Open questions

- **Q2. Prices in v1?** Cost is the end goal, but prices need ongoing data entry. Plan: ship phases 1–4 first, then add prices.
- **Q3. Pantry inventory?** The per-week "already have" (§4.6) is the lightweight version. A full pantry with quantities and expiry dates is a bigger feature. Is it wanted later?
