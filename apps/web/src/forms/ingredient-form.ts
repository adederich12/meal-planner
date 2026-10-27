import { z } from 'zod';
import {
  densityToGramsPerCup,
  gramsPerCupToDensity,
  IngredientCategorySchema,
  IngredientInputSchema,
  type Ingredient,
  type IngredientCategory,
} from '@meal-planner/shared';
import { numberToText, positiveNumberText, validateWith } from './fields';

/**
 * What the ingredient form edits. Density is entered as "1 cup weighs N g",
 * the way USDA and package labels list it, and converted to grams per ml.
 */
export const IngredientFormSchema = z
  .object({
    name: z.string(),
    category: IngredientCategorySchema,
    countNoun: z.string(),
    gramsPerCup: positiveNumberText('Enter grams, e.g. 125'),
    gramsPerEach: positiveNumberText('Enter grams, e.g. 110'),
    isStaple: z.boolean(),
  })
  .transform(({ gramsPerCup, ...rest }) => ({
    ...rest,
    gramsPerMl: gramsPerCup === null ? null : gramsPerCupToDensity(gramsPerCup),
  }))
  .transform(validateWith(IngredientInputSchema));

export type IngredientFormValues = z.input<typeof IngredientFormSchema>;
export type IngredientFormOutput = z.output<typeof IngredientFormSchema>;

export function toIngredientFormValues(
  ingredient?: Ingredient,
  defaults: { name?: string; category?: IngredientCategory } = {},
): IngredientFormValues {
  return {
    name: ingredient?.name ?? defaults.name ?? '',
    category: ingredient?.category ?? defaults.category ?? 'produce',
    countNoun: ingredient?.countNoun ?? '',
    gramsPerCup:
      ingredient?.gramsPerMl == null
        ? ''
        : numberToText(densityToGramsPerCup(ingredient.gramsPerMl), 1),
    gramsPerEach: numberToText(ingredient?.gramsPerEach),
    isStaple: ingredient?.isStaple ?? false,
  };
}
