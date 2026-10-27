import { z } from 'zod';
import { optionalText, TimestampSchema } from './common.js';
import { IngredientCategorySchema } from './enums.js';

/** Positive number or null. Zero isn't a useful conversion factor, so it's rejected. */
const conversionFactor = z
  .number()
  .positive()
  .finite()
  .nullish()
  .transform((n) => n ?? null);

export const IngredientInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  category: IngredientCategorySchema,
  /** Shown with the `each` unit ("clove", "can"). Null means use the name. */
  countNoun: optionalText(50),
  /** Density, grams per millilitre (bridges volume ↔ mass). */
  gramsPerMl: conversionFactor,
  /** Weight of one item in grams (bridges count ↔ mass). */
  gramsPerEach: conversionFactor,
  isStaple: z.boolean().default(false),
});
/** Create, or fully replace (PUT). */
export type IngredientInput = z.input<typeof IngredientInputSchema>;

export const IngredientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: IngredientCategorySchema,
  countNoun: z.string().nullable(),
  gramsPerMl: z.number().nullable(),
  gramsPerEach: z.number().nullable(),
  isStaple: z.boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/** A catalog row: the ingredient plus how many recipes use it. */
export const IngredientListItemSchema = IngredientSchema.extend({
  recipeCount: z.number().int().nonnegative(),
});
export type IngredientListItem = z.infer<typeof IngredientListItemSchema>;

export const IngredientDetailSchema = IngredientSchema.extend({
  usedBy: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type IngredientDetail = z.infer<typeof IngredientDetailSchema>;

export const IngredientListQuerySchema = z.object({
  includeArchived: z.stringbool().optional(),
});
/** Parsed form (booleans, not query-string text). */
export type IngredientListQuery = z.output<typeof IngredientListQuerySchema>;
