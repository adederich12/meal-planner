import type { IngredientListQuery, RecipeListQuery } from '@meal-planner/shared';

// One file, because ingredient and recipe mutations invalidate each other's queries.

export const ingredientKeys = {
  all: ['ingredients'] as const,
  list: (query: IngredientListQuery) => [...ingredientKeys.all, 'list', query] as const,
  detail: (id: string) => [...ingredientKeys.all, 'detail', id] as const,
};

export const recipeKeys = {
  all: ['recipes'] as const,
  list: (query: RecipeListQuery) => [...recipeKeys.all, 'list', query] as const,
  detail: (id: string) => [...recipeKeys.all, 'detail', id] as const,
  tags: () => [...recipeKeys.all, 'tags'] as const,
};
