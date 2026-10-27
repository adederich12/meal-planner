import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { IngredientInput, IngredientListQuery } from '@meal-planner/shared';
import { ingredientService } from '../services/ingredients.service';
import { ingredientKeys, recipeKeys } from './keys';

export const ingredientsQuery = (query: IngredientListQuery = {}) =>
  queryOptions({
    queryKey: ingredientKeys.list(query),
    queryFn: () => ingredientService.list(query),
  });

/** The whole catalog, archived included: recipe lines may point at archived ingredients. */
export const allIngredientsQuery = () => ingredientsQuery({ includeArchived: true });

export const ingredientQuery = (id: string) =>
  queryOptions({
    queryKey: ingredientKeys.detail(id),
    queryFn: () => ingredientService.get(id),
  });

/** Recipes embed ingredient data (name, count noun), so they're refreshed too. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ingredientKeys.all }),
      qc.invalidateQueries({ queryKey: recipeKeys.all }),
    ]);
}

export function useCreateIngredient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: IngredientInput) => ingredientService.create(input),
    onSuccess: invalidate,
  });
}

export function useReplaceIngredient() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IngredientInput }) =>
      ingredientService.replace(id, input),
    onSuccess: invalidate,
  });
}

export function useSetIngredientArchived() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      ingredientService.setArchived(id, archived),
    onSuccess: invalidate,
  });
}

export function useDeleteIngredient() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => ingredientService.remove(id),
    onSuccess: (_data, id) => {
      // Drop it first so the invalidation doesn't refetch a 404.
      qc.removeQueries({ queryKey: ingredientKeys.detail(id) });
      return invalidate();
    },
  });
}
