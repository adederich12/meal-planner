import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../app.js';
import type { PageFetcher } from '../services/recipe-import/fetch-page.js';
import type { ParsedLine, RecipeAi } from '../services/recipe-import/recipe-ai.js';
import { createTestDeps, testConfig } from '../test/helpers.js';

const URL = 'https://example.com/soup';

const recipePage = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Garlic soup',
  recipeYield: '4 servings',
  cookTime: 'PT40M',
  recipeIngredient: ['6 cloves garlic, sliced', '1 quart stock', 'salt and pepper to taste'],
  recipeInstructions: [{ text: 'Simmer.' }],
})}</script>`;

const line = (over: Partial<ParsedLine>): ParsedLine => ({
  original: '',
  catalogName: null,
  newIngredientName: 'x',
  category: 'other',
  quantity: null,
  unit: null,
  preparation: null,
  optional: false,
  ...over,
});

/** Records what it was asked and answers like Claude would. */
function fakeAi(): RecipeAi & { seen: { lines?: string[]; catalog?: string[] } } {
  const seen: { lines?: string[]; catalog?: string[] } = {};
  return {
    seen,
    async parseLines({ lines, catalog }) {
      seen.lines = lines;
      seen.catalog = catalog.map((c) => c.name);
      return [
        line({
          original: lines[0]!,
          catalogName: 'GARLIC',
          quantity: 6,
          unit: 'each',
          preparation: 'sliced',
        }),
        // Made-up catalog name: must not turn into a match.
        line({
          original: lines[1]!,
          catalogName: 'chicken stock',
          newIngredientName: 'Chicken Stock',
          category: 'pantry',
          quantity: 1,
          unit: 'quart',
        }),
        line({ original: lines[2]!, catalogName: 'salt' }),
        // Quantity without a unit gets "each"; unit without a quantity is dropped.
        line({ original: lines[2]!, catalogName: 'black pepper', quantity: null, unit: 'tsp' }),
        line({ original: 'extra', quantity: 2, unit: null }),
      ];
    },
    async readPage({ pageText }) {
      if (!pageText.includes('Ingredients')) return null;
      return {
        name: ' Plain soup ',
        servings: 3.6,
        prepMinutes: null,
        cookMinutes: 20,
        instructions: '1. Cook.',
        tags: ['dinner'],
        lines: [
          line({ original: '1 onion', catalogName: 'yellow onion', quantity: 1, unit: 'each' }),
        ],
      };
    },
  };
}

describe('POST /api/recipes/import', () => {
  let app: App;
  let cleanup = () => {};

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  async function setup(html: string, recipeAi: RecipeAi | null = fakeAi()) {
    const fetchPage: PageFetcher = async (url) => ({ url: `${url}?final`, html });
    const deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, { ...deps, fetchPage, recipeAi });
    const ids: Record<string, string> = {};
    for (const [name, category] of [
      ['garlic', 'produce'],
      ['salt', 'spices'],
      ['black pepper', 'spices'],
      ['yellow onion', 'produce'],
      ['old thing', 'other'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ingredients',
        payload: { name, category },
      });
      ids[name] = res.json().id;
    }
    await app.inject({ method: 'POST', url: `/api/ingredients/${ids['old thing']}/archive` });
    return ids;
  }

  const importUrl = () =>
    app.inject({ method: 'POST', url: '/api/recipes/import', payload: { url: URL } });

  it('uses structured data and matches lines to the catalog', async () => {
    const ai = fakeAi();
    const ids = await setup(recipePage, ai);
    const res = await importUrl();

    expect(res.statusCode).toBe(200);
    const draft = res.json();
    expect(draft).toMatchObject({
      name: 'Garlic soup',
      servings: 4,
      cookMinutes: 40,
      prepMinutes: null,
      instructions: '1. Simmer.',
      sourceUrl: `${URL}?final`,
      source: 'structured-data',
    });
    expect(ai.seen.lines).toHaveLength(3);
    // Archived ingredients aren't offered for matching.
    expect(ai.seen.catalog).not.toContain('old thing');

    expect(draft.ingredients).toEqual([
      expect.objectContaining({
        ingredientId: ids.garlic,
        quantity: 6,
        unit: 'each',
        preparation: 'sliced',
      }),
      expect.objectContaining({
        ingredientId: null,
        suggestedName: 'chicken stock',
        suggestedCategory: 'pantry',
      }),
      expect.objectContaining({ ingredientId: ids.salt, quantity: null, unit: null }),
      expect.objectContaining({ ingredientId: ids['black pepper'], quantity: null, unit: null }),
      expect.objectContaining({ quantity: 2, unit: 'each' }),
    ]);
  });

  it('falls back to reading the page text', async () => {
    const ids = await setup('<h1>Plain soup</h1><h2>Ingredients</h2><ul><li>1 onion</li></ul>');
    const draft = (await importUrl()).json();
    expect(draft).toMatchObject({
      name: 'Plain soup',
      servings: 4, // rounded
      cookMinutes: 20,
      source: 'page-text',
      tags: ['dinner'],
    });
    expect(draft.ingredients[0].ingredientId).toBe(ids['yellow onion']);
  });

  it('422s when the page has no recipe', async () => {
    await setup('<p>About us</p>');
    const res = await importUrl();
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('IMPORT_NO_RECIPE');
  });

  it('503s with a setup hint when no API key is configured', async () => {
    await setup(recipePage, null);
    const res = await importUrl();
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('AI_NOT_CONFIGURED');
    const health = (await app.inject({ url: '/api/health' })).json();
    expect(health.features.recipeImport).toBe(false);
  });

  it('rejects non-web URLs before fetching', async () => {
    await setup(recipePage);
    const res = await app.inject({
      method: 'POST',
      url: '/api/recipes/import',
      payload: { url: 'ftp://example.com/x' },
    });
    expect(res.statusCode).toBe(400);
  });
});
