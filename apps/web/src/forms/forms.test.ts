import { describe, expect, it } from 'vitest';
import type { Recipe } from '@meal-planner/shared';
import { IngredientFormSchema, toIngredientFormValues } from './ingredient-form';
import { emptyLine, RecipeFormSchema, toRecipeFormValues } from './recipe-form';

const ID = '00000000-0000-4000-8000-000000000001';

describe('IngredientFormSchema', () => {
  it('turns grams per cup into density and blanks into null', () => {
    const out = IngredientFormSchema.parse({
      ...toIngredientFormValues(undefined, { name: ' onion ' }),
      gramsPerCup: '160',
      gramsPerEach: '',
    });
    expect(out.name).toBe('onion');
    expect(out.gramsPerMl).toBeCloseTo(160 / 236.588, 4);
    expect(out.gramsPerEach).toBeNull();
    expect(out.countNoun).toBeNull();
  });

  it('flags a bad number on its own field', () => {
    const result = IngredientFormSchema.safeParse({
      ...toIngredientFormValues(undefined, { name: 'onion' }),
      gramsPerEach: '-3',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(['gramsPerEach']);
  });
});

describe('RecipeFormSchema', () => {
  const base = () => ({ ...toRecipeFormValues(), name: 'Soup' });

  it('parses fraction quantities, tags, and blank numbers', () => {
    const out = RecipeFormSchema.parse({
      ...base(),
      tags: 'dinner, , quick ',
      rating: '4',
      ingredients: [
        { ...emptyLine(), ingredientId: ID, quantity: '1 1/2', unit: 'cup' },
        { ...emptyLine(), ingredientId: ID, preparation: 'to taste' },
      ],
    });
    expect(out).toMatchObject({
      servings: 4,
      prepMinutes: null,
      rating: 4,
      sourceUrl: null,
      tags: ['dinner', 'quick'],
    });
    expect(out.ingredients[0]).toMatchObject({ quantity: 1.5, unit: 'cup' });
    expect(out.ingredients[1]).toMatchObject({ quantity: null, unit: null });
  });

  it('puts errors on the line field that caused them', () => {
    const paths = (ingredients: ReturnType<typeof emptyLine>[]) =>
      RecipeFormSchema.safeParse({ ...base(), ingredients }).error?.issues.map((i) =>
        i.path.join('.'),
      );
    expect(paths([{ ...emptyLine(), ingredientId: ID, quantity: 'a lot', unit: 'cup' }])).toEqual([
      'ingredients.0.quantity',
    ]);
    // Caught by the shared schema after the form transform.
    expect(paths([{ ...emptyLine(), ingredientId: ID, quantity: '2' }])).toEqual([
      'ingredients.0.unit',
    ]);
    expect(paths([emptyLine()])).toEqual(['ingredients.0.ingredientId']);
  });

  it('round-trips a stored recipe without changing quantities', () => {
    const recipe = {
      id: ID,
      name: 'Soup',
      servings: 2,
      prepMinutes: 5,
      cookMinutes: null,
      rating: null,
      tags: ['a', 'b'],
      instructions: '',
      sourceUrl: null,
      notes: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
      ingredients: [
        {
          id: ID,
          ingredient: {
            id: ID,
            name: 'x',
            category: 'other',
            countNoun: null,
            gramsPerMl: null,
            gramsPerEach: null,
            isStaple: false,
            archivedAt: null,
          },
          quantity: 0.3,
          unit: 'cup',
          preparation: null,
          isOptional: false,
        },
      ],
    } satisfies Recipe;
    const out = RecipeFormSchema.parse(toRecipeFormValues(recipe));
    expect(out.ingredients[0]!.quantity).toBe(0.3);
    expect(out.tags).toEqual(['a', 'b']);
    expect(out.prepMinutes).toBe(5);
  });
});
