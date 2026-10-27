import { afterEach, describe, expect, it } from 'vitest';
import { MAX_SCAN_FILES } from '@meal-planner/shared';
import { buildApp, type App } from '../app.js';
import { settings } from '../db/schema.js';
import { sniffScanType } from '../services/recipe-import/recipe-import.service.js';
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
interface Seen {
  lines?: string[];
  catalog?: string[];
  scan?: { mediaTypes: string[]; householdSize: number };
}

function fakeAi(): RecipeAi & { seen: Seen } {
  const seen: Seen = {};
  return {
    async readScan({ files, householdSize }) {
      seen.scan = { mediaTypes: files.map((f) => f.mediaType), householdSize };
      if (files[0]!.data.includes('BLANK')) return null;
      return {
        name: 'Isthmus chili',
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 30,
        instructions: '1. Brown the beef.\n2. Simmer.',
        tags: ['dinner'],
        reviewNote: ' Used the 4-serving column. ',
        lines: [
          line({ original: '2 cloves garlic', catalogName: 'garlic', quantity: 2, unit: 'each' }),
          line({
            original: '1 packet Isthmus Chili Blend',
            newIngredientName: 'isthmus chili blend',
            category: 'spices',
            quantity: 1,
            unit: 'each',
          }),
        ],
      };
    },
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

// ---------------------------------------------------------------------------
// Scans and photos
// ---------------------------------------------------------------------------

const PDF = Buffer.from('%PDF-1.4\n% fake card\n');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fake jpeg')]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic')]);

/** A multipart/form-data body, built by hand so tests need no form library. */
function multipart(files: { name: string; data: Buffer }[]) {
  const boundary = '----meal-planner-test';
  const parts = files.map((f) =>
    Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      f.data,
      Buffer.from('\r\n'),
    ]),
  );
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('POST /api/recipes/import/scan', () => {
  let app: App;
  let cleanup = () => {};
  let deps: ReturnType<typeof createTestDeps>;

  afterEach(async () => {
    await app.close();
    cleanup();
  });

  async function setup(recipeAi: RecipeAi | null = fakeAi()) {
    deps = createTestDeps();
    cleanup = deps.cleanup;
    app = await buildApp(testConfig, { ...deps, recipeAi });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingredients',
      payload: { name: 'garlic', category: 'produce' },
    });
    return res.json().id as string;
  }

  const upload = (files: { name: string; data: Buffer }[]) =>
    app.inject({ method: 'POST', url: '/api/recipes/import/scan', ...multipart(files) });

  it('reads the front and back of a card into a draft', async () => {
    const ai = fakeAi();
    const garlicId = await setup(ai);
    const res = await upload([
      { name: 'front.pdf', data: PDF },
      { name: 'back.jpg', data: JPEG },
    ]);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'Isthmus chili',
      servings: 4,
      source: 'scan',
      sourceUrl: null,
      notes: 'Used the 4-serving column.',
      ingredients: [
        { ingredientId: garlicId, quantity: 2, unit: 'each' },
        { ingredientId: null, suggestedName: 'isthmus chili blend', suggestedCategory: 'spices' },
      ],
    });
    // Types come from the file bytes, not the names or headers.
    expect(ai.seen.scan).toEqual({
      mediaTypes: ['application/pdf', 'image/jpeg'],
      householdSize: 2,
    });
  });

  it('passes the household size from settings', async () => {
    const ai = fakeAi();
    await setup(ai);
    deps.db.insert(settings).values({ householdSize: 5 }).run();
    await upload([{ name: 'card.pdf', data: PDF }]);
    expect(ai.seen.scan?.householdSize).toBe(5);
  });

  it('rejects files that are not PDFs or common images', async () => {
    await setup();
    const res = await upload([{ name: 'IMG_0001.HEIC', data: HEIC }]);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('UNSUPPORTED_FILE');
  });

  it('limits one import to a few files', async () => {
    await setup();
    const res = await upload(
      Array.from({ length: MAX_SCAN_FILES + 1 }, (_, i) => ({ name: `${i}.pdf`, data: PDF })),
    );
    expect(res.statusCode).toBe(413);
  });

  it('requires at least one file', async () => {
    await setup();
    expect((await upload([])).json().error.code).toBe('FILE_REQUIRED');
    const json = await app.inject({
      method: 'POST',
      url: '/api/recipes/import/scan',
      payload: { url: 'https://example.com' },
    });
    expect(json.json().error.code).toBe('EXPECTED_MULTIPART');
  });

  it('422s when the scan has no recipe', async () => {
    await setup();
    const res = await upload([{ name: 'blank.pdf', data: Buffer.from('%PDF-1.4 BLANK') }]);
    expect(res.statusCode).toBe(422);
  });

  it('503s when no API key is configured', async () => {
    await setup(null);
    expect((await upload([{ name: 'card.pdf', data: PDF }])).statusCode).toBe(503);
  });
});

describe('sniffScanType', () => {
  it.each([
    [PDF, 'application/pdf'],
    [JPEG, 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'image/png'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 'image/webp'],
    [HEIC, null],
    [Buffer.from('<html>'), null],
    [Buffer.alloc(0), null],
  ])('%#', (data, expected) => {
    expect(sniffScanType(data)).toBe(expected);
  });
});

describe('scan size limits', () => {
  it('rejects an image over 5 MB and uploads over 20 MB in total', async () => {
    const deps = createTestDeps();
    const app = await buildApp(testConfig, { ...deps, recipeAi: fakeAi() });
    try {
      const bigJpeg = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
      const big = await app.inject({
        method: 'POST',
        url: '/api/recipes/import/scan',
        ...multipart([{ name: 'big.jpg', data: bigJpeg }]),
      });
      expect(big.statusCode).toBe(413);

      const pdf = Buffer.concat([PDF, Buffer.alloc(11 * 1024 * 1024)]);
      const total = await app.inject({
        method: 'POST',
        url: '/api/recipes/import/scan',
        ...multipart([
          { name: 'a.pdf', data: pdf },
          { name: 'b.pdf', data: pdf },
        ]),
      });
      expect(total.statusCode).toBe(413);
      expect(total.json().error.code).toBe('FILE_TOO_LARGE');
    } finally {
      await app.close();
      deps.cleanup();
    }
  });
});
