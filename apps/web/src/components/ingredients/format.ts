import {
  densityToGramsPerCup,
  formatQuantity,
  type IngredientCategory,
  type Ingredient,
} from '@meal-planner/shared';

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: 'Produce',
  bakery: 'Bakery',
  meat: 'Meat',
  seafood: 'Seafood',
  dairy: 'Dairy & eggs',
  pantry: 'Pantry',
  spices: 'Spices',
  frozen: 'Frozen',
  beverages: 'Beverages',
  other: 'Other',
};

/** "1 cup ≈ 160 g · 1 clove ≈ 3 g", or null with no conversion data. */
export function conversionSummary(
  i: Pick<Ingredient, 'name' | 'countNoun' | 'gramsPerMl' | 'gramsPerEach'>,
): string | null {
  const parts: string[] = [];
  if (i.gramsPerMl) parts.push(`1 cup ≈ ${grams(densityToGramsPerCup(i.gramsPerMl))}`);
  if (i.gramsPerEach) parts.push(`1 ${i.countNoun || i.name} ≈ ${grams(i.gramsPerEach)}`);
  return parts.length ? parts.join(' · ') : null;
}

const grams = (g: number) => `${g < 10 ? formatQuantity(g) : Math.round(g)} g`;
