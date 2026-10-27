/**
 * Database schema (Drizzle). This is the storage model; the API contract lives in
 * @meal-planner/shared and the services map between the two. See docs/DESIGN.md §4.
 *
 * Conventions:
 * - IDs are UUID strings.
 * - Timestamps are UTC ISO-8601 strings; calendar dates are YYYY-MM-DD strings.
 * - Money is stored as integer cents. Quantities are REAL.
 * - Enum columns get a CHECK constraint built from the shared constants.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { INGREDIENT_CATEGORIES, UNIT_KEYS } from '@meal-planner/shared';

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const nowIso = () => new Date().toISOString();

const createdAt = () => text('created_at').notNull().$defaultFn(nowIso);

const updatedAt = () => text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso);

/** CHECK (column IN ('a', 'b', ...)): SQLite has no enum type. */
function oneOf(column: AnySQLiteColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ');
  return sql`${column} IN (${sql.raw(list)})`;
}

// ---------------------------------------------------------------------------
// Ingredients (DESIGN §4.2)
// ---------------------------------------------------------------------------

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: id(),
    name: text('name').notNull(),
    category: text('category', { enum: INGREDIENT_CATEGORIES }).notNull(),
    /** Shown with the `each` unit ("clove", "can"). Null means use the name. */
    countNoun: text('count_noun'),
    gramsPerMl: real('grams_per_ml'),
    gramsPerEach: real('grams_per_each'),
    isStaple: integer('is_staple', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: text('archived_at'),
  },
  (t) => [
    uniqueIndex('ingredients_name_unique').on(sql`lower(${t.name})`),
    check('ingredients_category_check', oneOf(t.category, INGREDIENT_CATEGORIES)),
    check('ingredients_grams_per_ml_check', sql`${t.gramsPerMl} IS NULL OR ${t.gramsPerMl} > 0`),
    check(
      'ingredients_grams_per_each_check',
      sql`${t.gramsPerEach} IS NULL OR ${t.gramsPerEach} > 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Recipes (DESIGN §4.3)
// ---------------------------------------------------------------------------

export const recipes = sqliteTable(
  'recipes',
  {
    id: id(),
    name: text('name').notNull(),
    servings: integer('servings').notNull(),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    /** Markdown. */
    instructions: text('instructions').notNull().default(''),
    sourceUrl: text('source_url'),
    notes: text('notes'),
    rating: integer('rating'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: text('archived_at'),
  },
  (t) => [
    index('recipes_name_idx').on(t.name),
    check('recipes_servings_check', sql`${t.servings} > 0`),
    check('recipes_rating_check', sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const recipeIngredients = sqliteTable(
  'recipe_ingredients',
  {
    id: id(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    /** Null for "to taste". */
    quantity: real('quantity'),
    unit: text('unit', { enum: UNIT_KEYS }),
    preparation: text('preparation'),
    isOptional: integer('is_optional', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('recipe_ingredients_recipe_idx').on(t.recipeId, t.sortOrder),
    index('recipe_ingredients_ingredient_idx').on(t.ingredientId),
    check('recipe_ingredients_unit_check', sql`${t.unit} IS NULL OR ${oneOf(t.unit, UNIT_KEYS)}`),
    check(
      'recipe_ingredients_quantity_check',
      sql`(${t.quantity} IS NULL AND ${t.unit} IS NULL) OR (${t.quantity} > 0 AND ${t.unit} IS NOT NULL)`,
    ),
  ],
);

export const tags = sqliteTable(
  'tags',
  {
    id: id(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('tags_name_unique').on(sql`lower(${t.name})`)],
);

export const recipeTags = sqliteTable(
  'recipe_tags',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] }), index('recipe_tags_tag_idx').on(t.tagId)],
);

// ---------------------------------------------------------------------------
// Settings (DESIGN §4.7): a single row with id = 1.
// ---------------------------------------------------------------------------

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    householdSize: integer('household_size').notNull().default(2),
    /** 0 = Sunday … 6 = Saturday. */
    weekStartsOn: integer('week_starts_on').notNull().default(0),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    check('settings_household_size_check', sql`${t.householdSize} > 0`),
    check('settings_week_starts_on_check', sql`${t.weekStartsOn} BETWEEN 0 AND 6`),
  ],
);
