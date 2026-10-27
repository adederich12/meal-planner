import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDeps } from '../test/helpers.js';
import { ingredients } from './schema.js';
import { SEED_INGREDIENTS, seedIngredients } from './seed-ingredients.js';

describe('seedIngredients', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('has unique names', () => {
    const names = SEED_INGREDIENTS.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('inserts the catalog once and is safe to re-run', () => {
    const deps = createTestDeps();
    cleanup = deps.cleanup;

    expect(seedIngredients(deps.db)).toBe(SEED_INGREDIENTS.length);
    expect(seedIngredients(deps.db)).toBe(0);
    const [{ count }] = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(ingredients)
      .all() as [{ count: number }];
    expect(count).toBe(SEED_INGREDIENTS.length);
  });

  it('never overwrites an ingredient the user already has', () => {
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    deps.db
      .insert(ingredients)
      .values({ name: 'Yellow Onion', category: 'produce', gramsPerEach: 250 })
      .run();

    seedIngredients(deps.db);

    const onions = deps.db
      .select()
      .from(ingredients)
      .where(eq(sql`lower(${ingredients.name})`, 'yellow onion'))
      .all();
    expect(onions).toHaveLength(1);
    expect(onions[0]!.gramsPerEach).toBe(250);
  });

  it('converts USDA cup weights to grams per ml', () => {
    const flour = SEED_INGREDIENTS.find((i) => i.name === 'all-purpose flour')!;
    expect(flour.gramsPerMl).toBeCloseTo(125 / 236.588, 3);
  });
});
