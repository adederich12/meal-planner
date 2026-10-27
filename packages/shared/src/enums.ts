import { z } from 'zod';

/** Store sections, in a typical walk-through order. The shopping list groups by these. */
export const INGREDIENT_CATEGORIES = [
  'produce',
  'bakery',
  'meat',
  'seafood',
  'dairy',
  'pantry',
  'spices',
  'frozen',
  'beverages',
  'other',
] as const;
export const IngredientCategorySchema = z.enum(INGREDIENT_CATEGORIES);
export type IngredientCategory = z.infer<typeof IngredientCategorySchema>;

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const MealSlotSchema = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof MealSlotSchema>;
