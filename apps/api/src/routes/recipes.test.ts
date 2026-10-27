import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@meal-planner/shared';
import { buildApp, type App } from '../app.js';
import { createTestDeps, testConfig } from '../test/helpers.js';

describe('recipe routes', () => {
  let app: App;
  let cleanup: () => void;
  let flour: string;
  let egg: string;
  let salt: string;

  beforeEach(async () => {
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, deps);
    const add = async (name: string, category: string) =>
      (
        await app.inject({ method: 'POST', url: '/api/ingredients', payload: { name, category } })
      ).json().id as string;
    flour = await add('flour', 'pantry');
    egg = await add('eggs', 'dairy');
    salt = await add('salt', 'spices');
  });

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  const pancakes = (): RecipeInput => ({
    name: 'Pancakes',
    servings: 4,
    prepMinutes: 10,
    instructions: '1. Mix.\n2. Cook.',
    tags: ['Breakfast', 'breakfast', 'quick'],
    ingredients: [
      { ingredientId: flour, quantity: 1.5, unit: 'cup' },
      { ingredientId: egg, quantity: 2, unit: 'each', preparation: 'beaten' },
      { ingredientId: salt, quantity: null, unit: null, isOptional: true },
    ],
  });

  const create = (body: RecipeInput) =>
    app.inject({ method: 'POST', url: '/api/recipes', payload: body });

  it('creates a recipe and returns lines in order with their ingredients', async () => {
    const res = await create(pancakes());
    expect(res.statusCode).toBe(201);
    const recipe = res.json();
    expect(recipe).toMatchObject({
      name: 'Pancakes',
      servings: 4,
      cookMinutes: null,
      sourceUrl: null,
      // De-duplicated case-insensitively, first spelling kept, alphabetical.
      tags: ['Breakfast', 'quick'],
    });
    expect(
      recipe.ingredients.map((l: { ingredient: { name: string } }) => l.ingredient.name),
    ).toEqual(['flour', 'eggs', 'salt']);
    expect(recipe.ingredients[1]).toMatchObject({
      quantity: 2,
      unit: 'each',
      preparation: 'beaten',
    });
    expect(recipe.ingredients[2]).toMatchObject({ quantity: null, unit: null, isOptional: true });
  });

  it('requires quantity and unit together', async () => {
    const res = await create({
      ...pancakes(),
      ingredients: [{ ingredientId: flour, quantity: 2, unit: null }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects ingredient ids that do not exist', async () => {
    const missing = crypto.randomUUID();
    const res = await create({
      ...pancakes(),
      ingredients: [{ ingredientId: missing, quantity: 1, unit: 'cup' }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({
      code: 'UNKNOWN_INGREDIENT',
      details: { ingredientIds: [missing] },
    });
  });

  it('rejects non-web source URLs', async () => {
    const res = await create({ ...pancakes(), sourceUrl: 'javascript:alert(1)' });
    expect(res.statusCode).toBe(400);
  });

  it('replaces lines and tags, and drops tags nothing uses', async () => {
    const { id } = (await create(pancakes())).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${id}`,
      payload: {
        ...pancakes(),
        tags: ['quick'],
        ingredients: [
          { ingredientId: egg, quantity: 3, unit: 'each' },
          { ingredientId: flour, quantity: 200, unit: 'g' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ingredients.map((l: { quantity: number }) => l.quantity)).toEqual([3, 200]);
    expect((await app.inject({ url: '/api/tags' })).json()).toEqual(['quick']);
  });

  it('lists with filters by name, tag, and ingredient', async () => {
    await create(pancakes());
    await create({
      name: 'Plain omelette',
      servings: 1,
      tags: ['quick'],
      ingredients: [{ ingredientId: egg, quantity: 3, unit: 'each' }],
    });

    const names = async (qs: string) =>
      (await app.inject({ url: `/api/recipes${qs}` })).json().map((r: { name: string }) => r.name);

    expect(await names('')).toEqual(['Pancakes', 'Plain omelette']);
    expect(await names('?q=OMEL')).toEqual(['Plain omelette']);
    expect(await names('?tag=BREAKFAST')).toEqual(['Pancakes']);
    expect(await names('?tag=quick')).toEqual(['Pancakes', 'Plain omelette']);
    expect(await names(`?ingredientId=${flour}`)).toEqual(['Pancakes']);
    // LIKE wildcards are plain text here.
    expect(await names('?q=%25')).toEqual([]);

    const [summary] = (await app.inject({ url: '/api/recipes' })).json();
    expect(summary).toMatchObject({ ingredientCount: 3, tags: ['Breakfast', 'quick'] });
  });

  it('archives (hidden from the list) and restores', async () => {
    const { id } = (await create(pancakes())).json();
    await app.inject({ method: 'POST', url: `/api/recipes/${id}/archive` });
    expect((await app.inject({ url: '/api/recipes' })).json()).toEqual([]);
    expect((await app.inject({ url: '/api/recipes?includeArchived=true' })).json()).toHaveLength(1);
    await app.inject({ method: 'POST', url: `/api/recipes/${id}/restore` });
    expect((await app.inject({ url: '/api/recipes' })).json()).toHaveLength(1);
  });

  it('deletes a recipe, its lines, and its now-unused tags', async () => {
    const { id } = (await create(pancakes())).json();
    const res = await app.inject({ method: 'DELETE', url: `/api/recipes/${id}` });
    expect(res.statusCode).toBe(204);
    expect((await app.inject({ url: `/api/recipes/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/tags' })).json()).toEqual([]);
    // The ingredient is free to delete now.
    const del = await app.inject({ method: 'DELETE', url: `/api/ingredients/${flour}` });
    expect(del.statusCode).toBe(204);
  });

  it('404s when replacing an unknown recipe', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/recipes/${crypto.randomUUID()}`,
      payload: pancakes(),
    });
    expect(res.statusCode).toBe(404);
  });
});
