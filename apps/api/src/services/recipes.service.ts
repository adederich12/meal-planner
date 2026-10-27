import { and, asc, eq, exists, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  Recipe,
  RecipeInputSchema,
  RecipeListQuerySchema,
  RecipeSummary,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import type { Db } from '../db/client.js';
import { ingredients, recipeIngredients, recipes, recipeTags, tags } from '../db/schema.js';
import { BadRequestError, NotFoundError } from '../errors.js';

type RecipeData = z.output<typeof RecipeInputSchema>;
type RecipeListQuery = z.output<typeof RecipeListQuerySchema>;
type RecipeRow = typeof recipes.$inferSelect;
/** Drizzle's transaction handle has the same query API as the database. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Recipes and their ingredient lines (DESIGN §4.3). */
export function createRecipeService({ db, now = () => new Date() }: AppDeps) {
  function list(query: RecipeListQuery = {}): RecipeSummary[] {
    const where: SQL[] = [];
    if (!query.includeArchived) where.push(isNull(recipes.archivedAt));
    if (query.q) where.push(sql`instr(lower(${recipes.name}), lower(${query.q})) > 0`);
    if (query.tag) {
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeTags)
            .innerJoin(tags, eq(tags.id, recipeTags.tagId))
            .where(
              and(
                eq(recipeTags.recipeId, recipes.id),
                sql`lower(${tags.name}) = lower(${query.tag})`,
              ),
            ),
        ),
      );
    }
    if (query.ingredientId) {
      where.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(recipeIngredients)
            .where(
              and(
                eq(recipeIngredients.recipeId, recipes.id),
                eq(recipeIngredients.ingredientId, query.ingredientId),
              ),
            ),
        ),
      );
    }

    const rows = db
      .select({
        recipe: recipes,
        ingredientCount: sql<number>`count(${recipeIngredients.id})`,
      })
      .from(recipes)
      .leftJoin(recipeIngredients, eq(recipeIngredients.recipeId, recipes.id))
      .where(and(...where))
      .groupBy(recipes.id)
      .orderBy(sql`lower(${recipes.name})`)
      .all();

    const tagMap = tagsFor(
      db,
      rows.map((r) => r.recipe.id),
    );
    return rows.map(({ recipe, ingredientCount }) => ({
      ...summaryFields(recipe),
      tags: tagMap.get(recipe.id) ?? [],
      ingredientCount,
    }));
  }

  function get(id: string): Recipe {
    const recipe = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!recipe) throw new NotFoundError('Recipe', id);

    const lines = db
      .select({ line: recipeIngredients, ingredient: ingredients })
      .from(recipeIngredients)
      .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredients.sortOrder))
      .all();

    return {
      ...summaryFields(recipe),
      tags: tagsFor(db, [id]).get(id) ?? [],
      instructions: recipe.instructions,
      sourceUrl: recipe.sourceUrl,
      notes: recipe.notes,
      ingredients: lines.map(({ line, ingredient }) => ({
        id: line.id,
        ingredient: {
          id: ingredient.id,
          name: ingredient.name,
          category: ingredient.category,
          countNoun: ingredient.countNoun,
          gramsPerMl: ingredient.gramsPerMl,
          gramsPerEach: ingredient.gramsPerEach,
          isStaple: ingredient.isStaple,
          archivedAt: ingredient.archivedAt,
        },
        quantity: line.quantity,
        unit: line.unit,
        preparation: line.preparation,
        isOptional: line.isOptional,
      })),
    };
  }

  function create(data: RecipeData): Recipe {
    const id = db.transaction((tx) => {
      checkIngredientsExist(tx, data);
      const { id } = tx
        .insert(recipes)
        .values(recipeColumns(data))
        .returning({ id: recipes.id })
        .get();
      writeLinesAndTags(tx, id, data);
      return id;
    });
    return get(id);
  }

  /**
   * Replaces the whole recipe, lines included. Line IDs change on every save;
   * nothing references them (shopping list state keys on ingredientId, §4.6).
   */
  function replace(id: string, data: RecipeData): Recipe {
    db.transaction((tx) => {
      checkIngredientsExist(tx, data);
      const updated = tx.update(recipes).set(recipeColumns(data)).where(eq(recipes.id, id)).run();
      if (updated.changes === 0) throw new NotFoundError('Recipe', id);
      writeLinesAndTags(tx, id, data);
    });
    return get(id);
  }

  function setArchived(id: string, archived: boolean): Recipe {
    const updated = db
      .update(recipes)
      .set({ archivedAt: archived ? now().toISOString() : null })
      .where(eq(recipes.id, id))
      .run();
    if (updated.changes === 0) throw new NotFoundError('Recipe', id);
    return get(id);
  }

  function remove(id: string): void {
    db.transaction((tx) => {
      const deleted = tx.delete(recipes).where(eq(recipes.id, id)).run();
      if (deleted.changes === 0) throw new NotFoundError('Recipe', id);
      deleteOrphanTags(tx);
    });
  }

  /** Every tag in use, alphabetical. */
  function listTags(): string[] {
    return db
      .select({ name: tags.name })
      .from(tags)
      .orderBy(sql`lower(${tags.name})`)
      .all()
      .map((t) => t.name);
  }

  return { list, get, create, replace, setArchived, remove, listTags };
}

export type RecipeService = ReturnType<typeof createRecipeService>;

function recipeColumns(data: RecipeData) {
  return {
    name: data.name,
    servings: data.servings,
    prepMinutes: data.prepMinutes,
    cookMinutes: data.cookMinutes,
    instructions: data.instructions,
    sourceUrl: data.sourceUrl,
    notes: data.notes,
    rating: data.rating,
  };
}

function summaryFields(row: RecipeRow) {
  return {
    id: row.id,
    name: row.name,
    servings: row.servings,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    rating: row.rating,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

/** A clear 400 instead of a bare foreign-key failure. Archived ingredients are allowed. */
function checkIngredientsExist(tx: Tx, data: RecipeData) {
  const wanted = [...new Set(data.ingredients.map((l) => l.ingredientId))];
  if (wanted.length === 0) return;
  const found = new Set(
    tx
      .select({ id: ingredients.id })
      .from(ingredients)
      .where(inArray(ingredients.id, wanted))
      .all()
      .map((r) => r.id),
  );
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new BadRequestError('UNKNOWN_INGREDIENT', 'Some ingredients no longer exist', {
      ingredientIds: missing,
    });
  }
}

function writeLinesAndTags(tx: Tx, recipeId: string, data: RecipeData) {
  tx.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId)).run();
  if (data.ingredients.length > 0) {
    tx.insert(recipeIngredients)
      .values(data.ingredients.map((line, i) => ({ ...line, recipeId, sortOrder: i })))
      .run();
  }

  tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId)).run();
  if (data.tags.length > 0) {
    // DO NOTHING with no target covers the unique index on lower(name).
    tx.insert(tags)
      .values(data.tags.map((name) => ({ name })))
      .onConflictDoNothing()
      .run();
    const tagIds = tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        inArray(
          sql`lower(${tags.name})`,
          data.tags.map((t) => t.toLowerCase()),
        ),
      )
      .all();
    tx.insert(recipeTags)
      .values(tagIds.map(({ id }) => ({ recipeId, tagId: id })))
      .run();
  }
  deleteOrphanTags(tx);
}

/** Tags exist only while a recipe uses them. */
function deleteOrphanTags(tx: Tx) {
  tx.delete(tags)
    .where(notInArray(tags.id, tx.select({ id: recipeTags.tagId }).from(recipeTags)))
    .run();
}

/** recipeId → tag names (alphabetical), in one query. */
function tagsFor(db: Db | Tx, recipeIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (recipeIds.length === 0) return map;
  const rows = db
    .select({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(tags.id, recipeTags.tagId))
    .where(inArray(recipeTags.recipeId, recipeIds))
    .orderBy(sql`lower(${tags.name})`)
    .all();
  for (const { recipeId, name } of rows) {
    map.set(recipeId, [...(map.get(recipeId) ?? []), name]);
  }
  return map;
}
