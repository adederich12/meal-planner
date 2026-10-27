import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IngredientInput } from '@meal-planner/shared';
import { buildApp, type App } from '../app.js';
import { createTestDeps, testConfig } from '../test/helpers.js';

const onion: IngredientInput = {
  name: 'Yellow onion',
  category: 'produce',
  gramsPerMl: 0.68,
  gramsPerEach: 110,
};

describe('ingredient routes', () => {
  let app: App;
  let cleanup: () => void;

  beforeEach(async () => {
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, deps);
  });

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  const create = (body: IngredientInput) =>
    app.inject({ method: 'POST', url: '/api/ingredients', payload: body });

  async function createRecipeUsing(ingredientId: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      payload: {
        name: 'Soup',
        servings: 4,
        ingredients: [{ ingredientId, quantity: 1, unit: 'each' }],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('creates an ingredient with defaults filled in', async () => {
    const res = await create({ name: '  garlic ', category: 'produce', countNoun: '' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: 'garlic',
      countNoun: null,
      gramsPerMl: null,
      isStaple: false,
      archivedAt: null,
    });
  });

  it('rejects a duplicate name, ignoring case', async () => {
    await create(onion);
    const res = await create({ ...onion, name: 'YELLOW ONION' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('INGREDIENT_NAME_TAKEN');
  });

  it('rejects zero or negative conversion data', async () => {
    const res = await create({ ...onion, gramsPerEach: 0 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('lists alphabetically with recipe counts, hiding archived ones', async () => {
    const a = (await create({ name: 'basil', category: 'produce' })).json();
    const b = (await create(onion)).json();
    await create({ name: 'Apple', category: 'produce' });
    await createRecipeUsing(b.id);
    await app.inject({ method: 'POST', url: `/api/ingredients/${a.id}/archive` });

    const visible = (await app.inject({ url: '/api/ingredients' })).json();
    expect(visible.map((i: { name: string }) => i.name)).toEqual(['Apple', 'Yellow onion']);
    expect(visible[1].recipeCount).toBe(1);

    const all = (await app.inject({ url: '/api/ingredients?includeArchived=true' })).json();
    expect(all).toHaveLength(3);
  });

  it('replaces an ingredient', async () => {
    const { id } = (await create(onion)).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/ingredients/${id}`,
      payload: { ...onion, gramsPerEach: null, isStaple: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ gramsPerEach: null, isStaple: true, gramsPerMl: 0.68 });
  });

  it('renaming onto another name is a conflict', async () => {
    await create({ name: 'salt', category: 'spices' });
    const { id } = (await create(onion)).json();
    const res = await app.inject({
      method: 'PUT',
      url: `/api/ingredients/${id}`,
      payload: { ...onion, name: 'Salt' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('shows which recipes use an ingredient', async () => {
    const { id } = (await create(onion)).json();
    await createRecipeUsing(id);
    const res = await app.inject({ url: `/api/ingredients/${id}` });
    expect(res.json().usedBy).toEqual([{ id: expect.any(String), name: 'Soup' }]);
  });

  it('deletes an unused ingredient but refuses one a recipe uses', async () => {
    const unused = (await create({ name: 'salt', category: 'spices' })).json();
    const used = (await create(onion)).json();
    await createRecipeUsing(used.id);

    const ok = await app.inject({ method: 'DELETE', url: `/api/ingredients/${unused.id}` });
    expect(ok.statusCode).toBe(204);

    const refused = await app.inject({ method: 'DELETE', url: `/api/ingredients/${used.id}` });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('INGREDIENT_IN_USE');
  });

  it('archives and restores', async () => {
    const { id } = (await create(onion)).json();
    const archived = await app.inject({ method: 'POST', url: `/api/ingredients/${id}/archive` });
    expect(archived.json().archivedAt).toEqual(expect.any(String));
    const restored = await app.inject({ method: 'POST', url: `/api/ingredients/${id}/restore` });
    expect(restored.json().archivedAt).toBeNull();
  });

  it('404s on an unknown id', async () => {
    const res = await app.inject({ url: `/api/ingredients/${crypto.randomUUID()}` });
    expect(res.statusCode).toBe(404);
  });
});
