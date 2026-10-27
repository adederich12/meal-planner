import { asc, count, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  Ingredient,
  IngredientDetail,
  IngredientInputSchema,
  IngredientListItem,
} from '@meal-planner/shared';
import type { AppDeps } from '../app.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { ingredients, recipeIngredients, recipes } from '../db/schema.js';
import { isUniqueViolation } from '../db/sqlite-errors.js';

type IngredientData = z.output<typeof IngredientInputSchema>;
type IngredientRow = typeof ingredients.$inferSelect;

/** Ingredient catalog (DESIGN §4.2). */
export function createIngredientService({ db, now = () => new Date() }: AppDeps) {
  function list({ includeArchived = false } = {}): IngredientListItem[] {
    return db
      .select({
        ...getTableColumns(ingredients),
        recipeCount: sql<number>`count(distinct ${recipeIngredients.recipeId})`,
      })
      .from(ingredients)
      .leftJoin(recipeIngredients, eq(recipeIngredients.ingredientId, ingredients.id))
      .where(includeArchived ? undefined : isNull(ingredients.archivedAt))
      .groupBy(ingredients.id)
      .orderBy(sql`lower(${ingredients.name})`)
      .all()
      .map((row) => ({ ...toApi(row), recipeCount: row.recipeCount }));
  }

  function findRow(id: string): IngredientRow {
    const row = db.select().from(ingredients).where(eq(ingredients.id, id)).get();
    if (!row) throw new NotFoundError('Ingredient', id);
    return row;
  }

  function get(id: string): IngredientDetail {
    const row = findRow(id);
    const usedBy = db
      .selectDistinct({ id: recipes.id, name: recipes.name })
      .from(recipeIngredients)
      .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
      .where(eq(recipeIngredients.ingredientId, id))
      .orderBy(asc(sql`lower(${recipes.name})`))
      .all();
    return { ...toApi(row), usedBy };
  }

  function create(data: IngredientData): Ingredient {
    return withNameCheck(data.name, () =>
      toApi(db.insert(ingredients).values(data).returning().get()),
    );
  }

  function replace(id: string, data: IngredientData): Ingredient {
    return withNameCheck(data.name, () => {
      const row = db.update(ingredients).set(data).where(eq(ingredients.id, id)).returning().get();
      if (!row) throw new NotFoundError('Ingredient', id);
      return toApi(row);
    });
  }

  /** Archived ingredients stay on the recipes that use them but leave the pickers. */
  function setArchived(id: string, archived: boolean): Ingredient {
    const row = db
      .update(ingredients)
      .set({ archivedAt: archived ? now().toISOString() : null })
      .where(eq(ingredients.id, id))
      .returning()
      .get();
    if (!row) throw new NotFoundError('Ingredient', id);
    return toApi(row);
  }

  /** Only unused ingredients can be deleted; archive the rest (DESIGN §4.2). */
  function remove(id: string): void {
    findRow(id);
    const [usage] = db
      .select({ n: count() })
      .from(recipeIngredients)
      .where(eq(recipeIngredients.ingredientId, id))
      .all();
    if (usage && usage.n > 0) {
      throw new ConflictError(
        'INGREDIENT_IN_USE',
        `Used in ${usage.n} recipe line${usage.n === 1 ? '' : 's'}. Archive it instead.`,
        { lineCount: usage.n },
      );
    }
    db.delete(ingredients).where(eq(ingredients.id, id)).run();
  }

  return { list, get, create, replace, setArchived, remove };
}

export type IngredientService = ReturnType<typeof createIngredientService>;

/** Turns the unique-index violation on lower(name) into a 409 the form can show. */
function withNameCheck<T>(name: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError('INGREDIENT_NAME_TAKEN', `"${name}" is already in the catalog`);
    }
    throw err;
  }
}

function toApi(row: IngredientRow): Ingredient {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    countNoun: row.countNoun,
    gramsPerMl: row.gramsPerMl,
    gramsPerEach: row.gramsPerEach,
    isStaple: row.isStaple,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}
