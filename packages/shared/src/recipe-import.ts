import { z } from 'zod';
import { IngredientCategorySchema } from './enums.js';
import { UnitSchema } from './units.js';

/**
 * Recipe import (DESIGN §6, phase 6). The API reads a recipe page and returns
 * a draft for the recipe form. Nothing is saved until the user reviews it.
 */
export const RecipeImportRequestSchema = z.object({
  url: z.url({ protocol: /^https?$/, message: 'Enter a web address (https://…)' }).max(2000),
});
export type RecipeImportRequest = z.infer<typeof RecipeImportRequestSchema>;

/** One ingredient line as read from the page, split into parts and matched to the catalog. */
export const ImportedLineSchema = z.object({
  /** The line exactly as the page wrote it, for review. */
  original: z.string(),
  /** Catalog match, or null when nothing in the catalog fits. */
  ingredientId: z.uuid().nullable(),
  /** What to call a new catalog ingredient when unmatched ("garlic", singular). */
  suggestedName: z.string(),
  suggestedCategory: IngredientCategorySchema,
  quantity: z.number().positive().nullable(),
  unit: UnitSchema.nullable(),
  preparation: z.string().nullable(),
  isOptional: z.boolean(),
});
export type ImportedLine = z.infer<typeof ImportedLineSchema>;

export const RecipeImportDraftSchema = z.object({
  name: z.string(),
  /** Null when the page doesn't say. */
  servings: z.number().int().positive().nullable(),
  prepMinutes: z.number().int().nonnegative().nullable(),
  cookMinutes: z.number().int().nonnegative().nullable(),
  /** Markdown. */
  instructions: z.string(),
  sourceUrl: z.string(),
  tags: z.array(z.string()),
  ingredients: z.array(ImportedLineSchema),
  /** Where the data came from: the page's schema.org Recipe data, or its visible text. */
  source: z.enum(['structured-data', 'page-text']),
});
export type RecipeImportDraft = z.infer<typeof RecipeImportDraftSchema>;
