import { z } from 'zod';
import { optionalText, TimestampSchema } from './common.js';
import { IngredientSchema } from './ingredients.js';
import { UnitSchema } from './units.js';

const optionalMinutes = z
  .number()
  .int()
  .nonnegative()
  .max(24 * 60 * 7)
  .nullish()
  .transform((n) => n ?? null);

/**
 * One ingredient line as entered. Quantity and unit go together: both set
 * ("2 cup"), or both null ("salt, to taste").
 */
export const RecipeLineInputSchema = z
  .object({
    ingredientId: z.uuid(),
    quantity: z
      .number()
      .positive()
      .finite()
      .nullish()
      .transform((n) => n ?? null),
    unit: UnitSchema.nullish().transform((u) => u ?? null),
    preparation: optionalText(200),
    isOptional: z.boolean().default(false),
  })
  .superRefine((line, ctx) => {
    if (line.quantity !== null && line.unit === null) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Pick a unit' });
    }
    if (line.quantity === null && line.unit !== null) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter an amount' });
    }
  });
export type RecipeLineInput = z.input<typeof RecipeLineInputSchema>;

const TagNameSchema = z.string().trim().min(1).max(40);

/** Create or fully replace a recipe. Line order is the array order. */
export const RecipeInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  servings: z.number().int().min(1).max(100),
  prepMinutes: optionalMinutes,
  cookMinutes: optionalMinutes,
  /** Markdown. */
  instructions: z.string().max(50_000).default(''),
  sourceUrl: z
    .string()
    .trim()
    .nullish()
    .transform((s) => s || null)
    .pipe(z.url({ protocol: /^https?$/, message: 'Enter a web address (https://…)' }).nullable()),
  notes: optionalText(5_000),
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullish()
    .transform((n) => n ?? null),
  tags: z
    .array(TagNameSchema)
    .max(20)
    .default([])
    // Case-insensitive de-duplication; the first spelling wins.
    .transform((tags) =>
      tags.filter((t, i) => tags.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i),
    ),
  ingredients: z.array(RecipeLineInputSchema).max(100).default([]),
});
export type RecipeInput = z.input<typeof RecipeInputSchema>;

/** The ingredient fields a recipe line needs for display and scaling. */
export const RecipeLineIngredientSchema = IngredientSchema.pick({
  id: true,
  name: true,
  category: true,
  countNoun: true,
  gramsPerMl: true,
  gramsPerEach: true,
  isStaple: true,
  archivedAt: true,
});

export const RecipeLineSchema = z.object({
  id: z.uuid(),
  ingredient: RecipeLineIngredientSchema,
  quantity: z.number().nullable(),
  unit: UnitSchema.nullable(),
  preparation: z.string().nullable(),
  isOptional: z.boolean(),
});
export type RecipeLine = z.infer<typeof RecipeLineSchema>;

const RecipeBaseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  servings: z.number().int(),
  prepMinutes: z.number().int().nullable(),
  cookMinutes: z.number().int().nullable(),
  rating: z.number().int().nullable(),
  tags: z.array(z.string()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable(),
});

export const RecipeSchema = RecipeBaseSchema.extend({
  instructions: z.string(),
  sourceUrl: z.string().nullable(),
  notes: z.string().nullable(),
  ingredients: z.array(RecipeLineSchema),
});
export type Recipe = z.infer<typeof RecipeSchema>;

export const RecipeSummarySchema = RecipeBaseSchema.extend({
  ingredientCount: z.number().int().nonnegative(),
});
export type RecipeSummary = z.infer<typeof RecipeSummarySchema>;

export const RecipeListQuerySchema = z.object({
  /** Name contains (case-insensitive). */
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  ingredientId: z.uuid().optional(),
  includeArchived: z.stringbool().optional(),
});
/** Parsed form (booleans, not query-string text). */
export type RecipeListQuery = z.output<typeof RecipeListQuerySchema>;

export const TagListSchema = z.array(z.string());
