import { describe, expect, it } from 'vitest';
import {
  combineAmounts,
  convertUnit,
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
