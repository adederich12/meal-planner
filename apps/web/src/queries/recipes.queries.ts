import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RecipeInput, RecipeListQuery } from '@meal-planner/shared';
import { recipeService } from '../services/recipes.service';
import { ingredientKeys, recipeKeys } from './keys';

export const recipesQuery = (query: RecipeListQuery = {}) =>
  queryOptions({
    queryKey: recipeKeys.list(query),
    queryFn: () => recipeService.list(query),
    // Keep showing the last results while a new search loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });

export const recipeQuery = (id: string) =>
  queryOptions({
    queryKey: recipeKeys.detail(id),
    queryFn: () => recipeService.get(id),
  });

export const tagsQuery = () =>
  queryOptions({ queryKey: recipeKeys.tags(), queryFn: recipeService.listTags });

/** Ingredient recipe counts and "used in" lists change with recipes. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: recipeKeys.all }),
      qc.invalidateQueries({ queryKey: ingredientKeys.all }),
    ]);
}

export function useCreateRecipe() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RecipeInput) => recipeService.create(input),
    onSuccess: invalidate,
  });
}

export function useReplaceRecipe() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecipeInput }) =>
      recipeService.replace(id, input),
    onSuccess: invalidate,
  });
}

export function useSetRecipeArchived() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      recipeService.setArchived(id, archived),
    onSuccess: invalidate,
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => recipeService.remove(id),
    onSuccess: (_data, id) => {
      // Drop it first so the invalidation doesn't refetch a 404.
      qc.removeQueries({ queryKey: recipeKeys.detail(id) });
      return invalidate();
    },
  });
}
