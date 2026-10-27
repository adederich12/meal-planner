import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  extractRecipeJsonLd,
  htmlToText,
  instructionsToMarkdown,
  parseDuration,
  parseYield,
} from './read-page.js';

const page = (...blocks: unknown[]) =>
  `<html><head>${blocks
    .map(
      (b) =>
        `<script type="application/ld+json">${typeof b === 'string' ? b : JSON.stringify(b)}</script>`,
    )
    .join('')}</head><body>Story about my grandmother…</body></html>`;

describe('extractRecipeJsonLd', () => {
  it('finds a Recipe inside @graph, skipping malformed blocks', () => {
    const html = page('{ not json', {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Site' },
        {
          '@type': ['Recipe', 'NewsArticle'],
          name: 'Mac &amp; Cheese',
          recipeYield: ['6', '6 servings'],
          prepTime: 'PT15M',
          cookTime: 'PT1H5M',
          recipeIngredient: ['2 cups <b>elbow</b> macaroni', '&frac12; cup milk', ''],
          recipeInstructions: [
            { '@type': 'HowToStep', text: 'Boil pasta.' },
            { '@type': 'HowToStep', text: 'Stir in cheese.' },
          ],
          recipeCategory: 'Dinner, Main course',
          recipeCuisine: ['American', 'dinner'],
        },
      ],
    });
    expect(extractRecipeJsonLd(html)).toEqual({
      name: 'Mac & Cheese',
      servings: 6,
      prepMinutes: 15,
      cookMinutes: 65,
      ingredientLines: ['2 cups elbow macaroni', '½ cup milk'],
      instructions: '1. Boil pasta.\n2. Stir in cheese.',
      tags: ['Dinner', 'Main course', 'American'],
    });
  });

  it('finds a Recipe under mainEntity', () => {
    const html = page({ '@type': 'WebPage', mainEntity: { '@type': 'Recipe', name: 'Toast' } });
    expect(extractRecipeJsonLd(html)?.name).toBe('Toast');
  });

  it('returns null when the page has no recipe data', () => {
    expect(extractRecipeJsonLd(page({ '@type': 'Article', name: 'News' }))).toBeNull();
    expect(extractRecipeJsonLd('<p>just text</p>')).toBeNull();
  });
});

describe('instructionsToMarkdown', () => {
  it('renders sections as headings with their own numbering', () => {
    expect(
      instructionsToMarkdown([
        {
          '@type': 'HowToSection',
          name: 'Sauce',
          itemListElement: [{ text: 'Melt butter.' }, { text: 'Whisk in flour.' }],
        },
        { '@type': 'HowToSection', name: 'Assemble', itemListElement: [{ text: 'Combine.' }] },
      ]),
    ).toBe('### Sauce\n\n1. Melt butter.\n2. Whisk in flour.\n\n### Assemble\n\n1. Combine.');
  });

  it('splits a plain string into steps, dropping existing numbers', () => {
    expect(instructionsToMarkdown('<p>1. Mix.</p><p>2) Bake.</p>')).toBe('1. Mix.\n2. Bake.');
  });
});

describe('small parsers', () => {
  it.each([
    ['PT30M', 30],
    ['PT1H', 60],
    ['P0DT1H15M', 75],
    ['P1D', 1440],
    ['PT0M', null],
    ['PT', null],
    ['30 minutes', null],
    [undefined, null],
  ])('parseDuration(%j) = %j', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each([
    [4, 4],
    ['4 servings', 4],
    [['8', '8 slices'], 8],
    ['Makes about a dozen', null],
    [0, null],
  ])('parseYield(%j) = %j', (input, expected) => {
    expect(parseYield(input)).toBe(expected);
  });

  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Tom&#39;s &amp; Jerry&#x2019;s &frac34; &bogus;')).toBe(
      "Tom's & Jerry’s ¾ &bogus;",
    );
  });

  it('turns HTML into readable text without scripts or styles', () => {
    expect(
      htmlToText(
        '<style>p{}</style><h1>Soup</h1><ul><li>1 onion</li><li>2 carrots</li></ul><script>x()</script><p>Simmer&nbsp;well.</p>',
      ),
    ).toBe('Soup\n\n• 1 onion\n• 2 carrots\n\nSimmer well.');
  });
});
