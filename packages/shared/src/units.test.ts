import { describe, expect, it } from 'vitest';
import {
  combineAmounts,
  convertUnit,
  densityToGramsPerCup,
  formatIngredientAmount,
  gramsPerCupToDensity,
  quantityToInput,
  scaleAmount,
  formatAmount,
  formatQuantity,
  parseQuantity,
  pluralize,
  toDisplayAmount,
  UNITS,
  type Amount,
  type Unit,
} from './units.js';

const ONION = { gramsPerMl: 0.68, gramsPerEach: 150 };
const FLOUR = { gramsPerMl: 0.53 };

describe('convertUnit', () => {
  it.each<[Amount, Unit, number]>([
    [{ quantity: 3, unit: 'tsp' }, 'tbsp', 1],
    [{ quantity: 16, unit: 'tbsp' }, 'cup', 1],
    [{ quantity: 2, unit: 'cup' }, 'pint', 1],
    [{ quantity: 4, unit: 'quart' }, 'gallon', 1],
    [{ quantity: 8, unit: 'fl_oz' }, 'cup', 1],
    [{ quantity: 1, unit: 'cup' }, 'ml', 236.5882365],
    [{ quantity: 1, unit: 'l' }, 'ml', 1000],
    [{ quantity: 16, unit: 'oz' }, 'lb', 1],
    [{ quantity: 1, unit: 'kg' }, 'g', 1000],
    [{ quantity: 1, unit: 'lb' }, 'g', 453.59237],
  ])('%o → %s = %d (same dimension)', (amount, to, expected) => {
    expect(convertUnit(amount, to)).toBeCloseTo(expected, 6);
  });

  it('bridges volume → mass with density', () => {
    // 1 cup flour ≈ 125 g
    expect(convertUnit({ quantity: 1, unit: 'cup' }, 'g', FLOUR)).toBeCloseTo(125.39, 1);
  });

  it('bridges count → mass and count → volume', () => {
    expect(convertUnit({ quantity: 2, unit: 'each' }, 'g', ONION)).toBe(300);
    expect(convertUnit({ quantity: 1, unit: 'each' }, 'cup', ONION)).toBeCloseTo(0.932, 3);
  });

  it('returns null when the ingredient lacks bridging data', () => {
    expect(convertUnit({ quantity: 1, unit: 'cup' }, 'g')).toBeNull();
    expect(convertUnit({ quantity: 1, unit: 'each' }, 'g', FLOUR)).toBeNull();
    expect(convertUnit({ quantity: 1, unit: 'cup' }, 'each', { gramsPerMl: 1 })).toBeNull();
  });

  it('treats a zero conversion value as missing data', () => {
    expect(convertUnit({ quantity: 1, unit: 'cup' }, 'g', { gramsPerMl: 0 })).toBeNull();
  });
});

describe('combineAmounts', () => {
  it('returns nothing for no amounts', () => {
    expect(combineAmounts([])).toEqual([]);
  });

  it('sums within one dimension', () => {
    const result = combineAmounts([
      { quantity: 1, unit: 'cup' },
      { quantity: 4, unit: 'tbsp' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.dimension).toBe('volume');
    expect(result[0]!.amount).toBeCloseTo(UNITS.cup.toBase * 1.25, 6);
  });

  it('prefers count when everything converts to it', () => {
    const result = combineAmounts(
      [
        { quantity: 1, unit: 'each' },
        { quantity: 300, unit: 'g' },
      ],
      ONION,
    );
    expect(result).toEqual([{ dimension: 'count', amount: 3 }]);
  });

  it('merges volume into mass when density is known', () => {
    const result = combineAmounts(
      [
        { quantity: 200, unit: 'g' },
        { quantity: 1, unit: 'cup' },
      ],
      FLOUR,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.dimension).toBe('mass');
    expect(result[0]!.amount).toBeCloseTo(325.39, 1);
  });

  it('keeps dimensions separate when no conversion data exists', () => {
    expect(
      combineAmounts([
        { quantity: 100, unit: 'g' },
        { quantity: 1, unit: 'each' },
      ]),
    ).toEqual([
      { dimension: 'mass', amount: 100 },
      { dimension: 'count', amount: 1 },
    ]);
  });

  it('merges what it can and leaves the rest', () => {
    // Density known, weight per item unknown: mass + volume merge, count stays.
    const result = combineAmounts(
      [
        { quantity: 100, unit: 'g' },
        { quantity: 1, unit: 'cup' },
        { quantity: 2, unit: 'each' },
      ],
      FLOUR,
    );
    expect(result.map((r) => r.dimension)).toEqual(['mass', 'count']);
    expect(result[1]!.amount).toBe(2);
  });
});

describe('toDisplayAmount', () => {
  const display = (unit: Unit, quantity: number) => {
    const base = { dimension: UNITS[unit].dimension, amount: quantity * UNITS[unit].toBase };
    const shown = toDisplayAmount(base);
    return [shown.unit, Number(shown.quantity.toFixed(3))];
  };

  it.each<[Unit, number, Unit, number]>([
    ['tsp', 2, 'tsp', 2],
    ['tsp', 6, 'tbsp', 2],
    ['tbsp', 3, 'tbsp', 3],
    ['tbsp', 5, 'cup', 0.313],
    ['ml', 1419.53, 'cup', 6],
    ['cup', 20, 'gallon', 1.25],
    ['g', 113.4, 'oz', 4],
    ['g', 907.18, 'lb', 2],
    ['each', 3, 'each', 3],
  ])('%s × %d shows as %s', (unit, qty, expectedUnit, expectedQty) => {
    expect(display(unit, qty)).toEqual([expectedUnit, expectedQty]);
  });
});

describe('parseQuantity', () => {
  it.each<[string, number | null]>([
    ['2', 2],
    ['1.5', 1.5],
    ['.5', 0.5],
    ['1/2', 0.5],
    ['1 1/2', 1.5],
    ['1-1/2', 1.5],
    ['  2  1/4 ', 2.25],
    ['½', 0.5],
    ['1½', 1.5],
    ['1 ⅓', 4 / 3],
    ['', null],
    ['0', null],
    ['1/0', null],
    ['-1', null],
    ['abc', null],
    ['1 cup', null],
  ])('%j → %s', (input, expected) => {
    const result = parseQuantity(input);
    if (expected === null) expect(result).toBeNull();
    else expect(result).toBeCloseTo(expected, 9);
  });
});

describe('formatQuantity', () => {
  it.each<[number, string]>([
    [1, '1'],
    [0.5, '1/2'],
    [1.5, '1 1/2'],
    [0.333, '1/3'],
    [2.6667, '2 2/3'],
    [0.125, '1/8'],
    [1.97, '2'],
    [0.98, '1'],
    [12.4, '12'],
    [0.01, '0.01'],
  ])('%d → %j', (value, expected) => {
    expect(formatQuantity(value)).toBe(expected);
  });
});

describe('formatAmount and pluralize', () => {
  it('pluralizes units and count nouns', () => {
    expect(formatAmount({ quantity: 1, unit: 'cup' })).toBe('1 cup');
    expect(formatAmount({ quantity: 0.5, unit: 'cup' })).toBe('1/2 cup');
    expect(formatAmount({ quantity: 1.5, unit: 'cup' })).toBe('1 1/2 cups');
    expect(formatAmount({ quantity: 3, unit: 'tbsp' })).toBe('3 tbsp');
    expect(formatAmount({ quantity: 2, unit: 'each' }, 'clove')).toBe('2 cloves');
    expect(formatAmount({ quantity: 1, unit: 'each' }, 'can')).toBe('1 can');
    expect(formatAmount({ quantity: 3, unit: 'each' })).toBe('3');
  });

  it.each([
    ['clove', 'cloves'],
    ['bunch', 'bunches'],
    ['box', 'boxes'],
    ['berry', 'berries'],
    ['day', 'days'],
  ])('%s → %s', (noun, plural) => {
    expect(pluralize(noun)).toBe(plural);
  });
});

describe('quantityToInput', () => {
  it.each<[number, string]>([
    [2, '2'],
    [0.5, '1/2'],
    [1.5, '1 1/2'],
    [1 / 3, '1/3'],
    [2 + 2 / 3, '2 2/3'],
    // Not a common fraction: stays exact instead of rounding to 1/3.
    [0.3, '0.3'],
    [12.4, '12.4'],
    [0.01, '0.01'],
  ])('%d → %j', (value, expected) => {
    expect(quantityToInput(value)).toBe(expected);
  });

  it('round-trips through parseQuantity', () => {
    for (const v of [0.25, 1 / 3, 1.75, 0.3, 2.125, 7]) {
      expect(parseQuantity(quantityToInput(v))).toBeCloseTo(v, 6);
    }
  });
});

describe('scaleAmount', () => {
  const scaled = (a: Amount, f: number) => {
    const r = scaleAmount(a, f);
    return [Number(r.quantity.toFixed(3)), r.unit];
  };

  it.each<[Amount, number, number, Unit]>([
    [{ quantity: 1, unit: 'cup' }, 1, 1, 'cup'],
    [{ quantity: 0.5, unit: 'cup' }, 3, 1.5, 'cup'],
    [{ quantity: 1, unit: 'tsp' }, 3, 1, 'tbsp'],
    [{ quantity: 1, unit: 'tbsp' }, 0.25, 0.75, 'tsp'],
    [{ quantity: 2, unit: 'tbsp' }, 4, 0.5, 'cup'],
    // Huge batches stay in cups rather than jumping to gallons.
    [{ quantity: 4, unit: 'cup' }, 4, 16, 'cup'],
    // Other units keep the unit the recipe used.
    [{ quantity: 200, unit: 'g' }, 2, 400, 'g'],
    [{ quantity: 1, unit: 'lb' }, 0.5, 0.5, 'lb'],
    [{ quantity: 2, unit: 'each' }, 1.5, 3, 'each'],
  ])('%o × %d → %d %s', (amount, factor, qty, unit) => {
    expect(scaled(amount, factor)).toEqual([qty, unit]);
  });
});

describe('formatIngredientAmount', () => {
  it.each<[Amount, { name: string; countNoun?: string | null }, string]>([
    [{ quantity: 1.5, unit: 'cup' }, { name: 'all-purpose flour' }, '1 1/2 cups all-purpose flour'],
    [{ quantity: 2, unit: 'each' }, { name: 'garlic', countNoun: 'clove' }, '2 cloves garlic'],
    [{ quantity: 3, unit: 'each' }, { name: 'yellow onion' }, '3 yellow onions'],
    [{ quantity: 1, unit: 'each' }, { name: 'yellow onion', countNoun: null }, '1 yellow onion'],
    [{ quantity: 2, unit: 'each' }, { name: 'eggs', countNoun: 'egg' }, '2 eggs'],
    [{ quantity: 1, unit: 'each' }, { name: 'eggs', countNoun: 'egg' }, '1 egg'],
    [
      { quantity: 1, unit: 'each' },
      { name: 'diced tomatoes', countNoun: 'can' },
      '1 can diced tomatoes',
    ],
  ])('%o %o → %j', (amount, ingredient, expected) => {
    expect(formatIngredientAmount(amount, ingredient)).toBe(expected);
  });
});

describe('density from grams per cup', () => {
  it('round-trips', () => {
    expect(gramsPerCupToDensity(236.5882365)).toBeCloseTo(1, 9);
    expect(densityToGramsPerCup(gramsPerCupToDensity(125))).toBeCloseTo(125, 9);
  });
});
