import { z } from 'zod';
import {
  parseQuantity,
  quantityToInput,
  RecipeInputSchema,
  UnitSchema,
  type Recipe,
} from '@meal-planner/shared';
import { validateWith, wholeNumberText } from './fields';

/**
 * One ingredient line as the form edits it. Quantity is text so people can
 * type "1 1/2" or "½"; unit "" means none ("to taste").
 */
const LineFormSchema = z
  .object({
    ingredientId: z.string().min(1, 'Pick an ingredient'),
    quantity: z.string(),
    unit: UnitSchema.or(z.literal('')),
    preparation: z.string(),
    isOptional: z.boolean(),
  })
  .transform(({ quantity: text, unit, ...rest }, ctx) => {
    let quantity: number | null = null;
    if (text.trim()) {
      quantity = parseQuantity(text);
      if (quantity === null) {
        ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Try 2, 1.5, or 1 1/2' });
        return z.NEVER;
      }
    }
    return { ...rest, quantity, unit: unit || null };
  });

/**
 * The recipe form. Field names match RecipeInputSchema, so errors from the
 * shared schema (e.g. "Pick a unit") land on the right input.
 */
export const RecipeFormSchema = z
  .object({
    name: z.string(),
    servings: wholeNumberText().refine((n) => n !== null, 'How many servings does it make?'),
    prepMinutes: wholeNumberText('Minutes, as a whole number'),
    cookMinutes: wholeNumberText('Minutes, as a whole number'),
    instructions: z.string(),
    sourceUrl: z.string(),
    notes: z.string(),
    /** "" = not rated. */
    rating: z.enum(['', '1', '2', '3', '4', '5']),
    /** Comma-separated. Checked here because one text box can't show a per-tag error. */
    tags: z
      .string()
      .refine(
        (s) => s.split(',').every((t) => t.trim().length <= 40),
        'Keep each tag under 40 characters',
      ),
    ingredients: z.array(LineFormSchema),
  })
  .transform((v) => ({
    ...v,
    servings: v.servings ?? 0,
    rating: v.rating ? Number(v.rating) : null,
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }))
  .transform(validateWith(RecipeInputSchema));

export type RecipeFormValues = z.input<typeof RecipeFormSchema>;
export type RecipeFormOutput = z.output<typeof RecipeFormSchema>;
export type LineFormValues = RecipeFormValues['ingredients'][number];

export const emptyLine = (): LineFormValues => ({
  ingredientId: '',
  quantity: '',
  unit: '',
  preparation: '',
  isOptional: false,
});

export function toRecipeFormValues(recipe?: Recipe, defaultServings = 4): RecipeFormValues {
  if (!recipe) {
    return {
      name: '',
      servings: String(defaultServings),
      prepMinutes: '',
      cookMinutes: '',
      instructions: '',
      sourceUrl: '',
      notes: '',
      rating: '',
      tags: '',
      ingredients: [emptyLine()],
    };
  }
  return {
    name: recipe.name,
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
    cookMinutes: recipe.cookMinutes === null ? '' : String(recipe.cookMinutes),
    instructions: recipe.instructions,
    sourceUrl: recipe.sourceUrl ?? '',
    notes: recipe.notes ?? '',
    rating: recipe.rating === null ? '' : (String(recipe.rating) as RecipeFormValues['rating']),
    tags: recipe.tags.join(', '),
    ingredients: recipe.ingredients.map((line) => ({
      ingredientId: line.ingredient.id,
      // Exact, so re-saving never rounds what was stored.
      quantity: line.quantity === null ? '' : quantityToInput(line.quantity),
      unit: line.unit ?? '',
      preparation: line.preparation ?? '',
      isOptional: line.isOptional,
    })),
  };
}
