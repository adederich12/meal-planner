/**
 * Units of measure and conversion. Pure functions only (no I/O), shared by the
 * API (shopping list aggregation) and the web app (scaling, display).
 * See docs/DESIGN.md §4.1.
 *
 * Every unit belongs to a dimension with a base unit: mass → grams, volume →
 * millilitres, count → each. Converting within a dimension only needs the
 * factor below. Converting across dimensions needs per-ingredient data
 * (density, weight per item), passed in as `IngredientConversion`.
 */
import { z } from 'zod';

export const DIMENSIONS = ['mass', 'volume', 'count'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Unit keys as stored in the database. Order is the order shown in pickers. */
export const UNIT_KEYS = [
  'tsp',
  'tbsp',
  'cup',
  'fl_oz',
  'pint',
  'quart',
  'gallon',
  'ml',
  'l',
  'oz',
  'lb',
  'g',
  'kg',
  'each',
] as const;
export const UnitSchema = z.enum(UNIT_KEYS);
export type Unit = z.infer<typeof UnitSchema>;

interface UnitDef {
  dimension: Dimension;
  /** How many base units (g, ml, each) one of this unit is. */
  toBase: number;
  singular: string;
  plural: string;
}

// US customary volumes, exact by definition (1 US gallon = 231 in³ = 3785.411784 ml).
const TSP_ML = 4.92892159375;

export const UNITS: Record<Unit, UnitDef> = {
  tsp: { dimension: 'volume', toBase: TSP_ML, singular: 'tsp', plural: 'tsp' },
  tbsp: { dimension: 'volume', toBase: TSP_ML * 3, singular: 'tbsp', plural: 'tbsp' },
  fl_oz: { dimension: 'volume', toBase: TSP_ML * 6, singular: 'fl oz', plural: 'fl oz' },
  cup: { dimension: 'volume', toBase: TSP_ML * 48, singular: 'cup', plural: 'cups' },
  pint: { dimension: 'volume', toBase: TSP_ML * 96, singular: 'pint', plural: 'pints' },
  quart: { dimension: 'volume', toBase: TSP_ML * 192, singular: 'quart', plural: 'quarts' },
  gallon: { dimension: 'volume', toBase: TSP_ML * 768, singular: 'gallon', plural: 'gallons' },
  ml: { dimension: 'volume', toBase: 1, singular: 'ml', plural: 'ml' },
  l: { dimension: 'volume', toBase: 1000, singular: 'l', plural: 'l' },
  oz: { dimension: 'mass', toBase: 28.349523125, singular: 'oz', plural: 'oz' },
  lb: { dimension: 'mass', toBase: 453.59237, singular: 'lb', plural: 'lb' },
  g: { dimension: 'mass', toBase: 1, singular: 'g', plural: 'g' },
  kg: { dimension: 'mass', toBase: 1000, singular: 'kg', plural: 'kg' },
  each: { dimension: 'count', toBase: 1, singular: '', plural: '' },
};

/** Per-ingredient data that bridges dimensions. Either may be missing. */
export interface IngredientConversion {
  /** Density: grams per millilitre. Bridges volume ↔ mass. */
  gramsPerMl?: number | null;
  /** Typical weight of one item. Bridges count ↔ mass. */
  gramsPerEach?: number | null;
}

/** An amount in its dimension's base unit (g, ml, or each). */
export interface BaseAmount {
  dimension: Dimension;
  amount: number;
}

export interface Amount {
  quantity: number;
  unit: Unit;
}

export function dimensionOf(unit: Unit): Dimension {
  return UNITS[unit].dimension;
}

export function toBase({ quantity, unit }: Amount): BaseAmount {
  const def = UNITS[unit];
  return { dimension: def.dimension, amount: quantity * def.toBase };
}

/** Grams per one base unit of `dimension`, or null if this ingredient lacks the data. */
function gramsPerBase(dimension: Dimension, conv: IngredientConversion): number | null {
  switch (dimension) {
    case 'mass':
      return 1;
    case 'volume':
      return conv.gramsPerMl || null;
    case 'count':
      return conv.gramsPerEach || null;
  }
}

/**
 * Re-expresses a base amount in another dimension's base unit.
 * Returns null when the ingredient has no data to bridge the two.
 */
export function convertBase(
  from: BaseAmount,
  to: Dimension,
  conv: IngredientConversion = {},
): number | null {
  if (from.dimension === to) return from.amount;
  const fromGrams = gramsPerBase(from.dimension, conv);
  const toGrams = gramsPerBase(to, conv);
  if (fromGrams === null || toGrams === null) return null;
  return (from.amount * fromGrams) / toGrams;
}

/** Converts between any two units. Returns null when the conversion isn't possible. */
export function convertUnit(
  amount: Amount,
  to: Unit,
  conv: IngredientConversion = {},
): number | null {
  const base = convertBase(toBase(amount), UNITS[to].dimension, conv);
  return base === null ? null : base / UNITS[to].toBase;
}

/**
 * Totals several amounts of the same ingredient, merging across dimensions
 * where the ingredient's conversion data allows.
 *
 * Merge target, when amounts span dimensions:
 * 1. count, if present and everything converts to it (you buy onions and eggs by the item);
 * 2. otherwise mass, then volume, if everything converts to it;
 * 3. otherwise the dimension that absorbs the most groups; the rest stay separate.
 *
 * Returns one BaseAmount per resulting dimension, in DIMENSIONS order.
 */
export function combineAmounts(amounts: Amount[], conv: IngredientConversion = {}): BaseAmount[] {
  const totals = new Map<Dimension, number>();
  for (const a of amounts) {
    const base = toBase(a);
    totals.set(base.dimension, (totals.get(base.dimension) ?? 0) + base.amount);
  }
  const groups = DIMENSIONS.filter((d) => totals.has(d)).map((d): BaseAmount => ({
    dimension: d,
    amount: totals.get(d)!,
  }));
  if (groups.length <= 1) return groups;

  const preference: Dimension[] = totals.has('count')
    ? ['count', 'mass', 'volume']
    : ['mass', 'volume', 'count'];

  let best: { target: Dimension; absorbed: number } | null = null;
  for (const target of preference) {
    const absorbed = groups.filter((g) => convertBase(g, target, conv) !== null).length;
    if (absorbed === groups.length) return [mergeInto(groups, target, conv)];
    if (absorbed > 1 && (!best || absorbed > best.absorbed)) best = { target, absorbed };
  }
  if (!best) return groups;

  const merged = mergeInto(groups, best.target, conv);
  const rest = groups.filter((g) => convertBase(g, best.target, conv) === null);
  return DIMENSIONS.flatMap((d) =>
    d === merged.dimension ? [merged] : rest.filter((g) => g.dimension === d),
  );
}

function mergeInto(groups: BaseAmount[], target: Dimension, conv: IngredientConversion) {
  let amount = 0;
  for (const g of groups) amount += convertBase(g, target, conv) ?? 0;
  return { dimension: target, amount };
}

/**
 * Picks a readable US unit for a base amount, e.g. 1420 ml → 6 cups, 900 g → 2 lb.
 */
export function toDisplayAmount({ dimension, amount }: BaseAmount): Amount {
  const pick = (unit: Unit): Amount => ({ quantity: amount / UNITS[unit].toBase, unit });
  switch (dimension) {
    case 'count':
      return pick('each');
    case 'mass':
      return pick(amount < UNITS.lb.toBase ? 'oz' : 'lb');
    case 'volume':
      if (amount < UNITS.tbsp.toBase) return pick('tsp');
      if (amount < UNITS.cup.toBase / 4) return pick('tbsp');
      if (amount < UNITS.gallon.toBase) return pick('cup');
      return pick('gallon');
  }
}

// ---------------------------------------------------------------------------
// Quantities as text
// ---------------------------------------------------------------------------

const UNICODE_FRACTIONS: Record<string, string> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

/**
 * Parses what people type for a quantity: "2", "1.5", "1/2", "1 1/2", "1-1/2", "1½".
 * Returns null for anything else (including zero or negative).
 */
export function parseQuantity(input: string): number | null {
  let s = input.trim();
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replaceAll(glyph, ` ${ascii}`);
  }
  s = s.trim().replace(/\s+/g, ' ');

  const match = /^(?:(\d+)[ -])?(\d+)\/(\d+)$/.exec(s);
  let value: number;
  if (match) {
    const [, whole, num, den] = match;
    if (Number(den) === 0) return null;
    value = Number(whole ?? 0) + Number(num) / Number(den);
  } else if (/^\d*\.?\d+$/.test(s)) {
    value = Number(s);
  } else {
    return null;
  }
  return value > 0 && Number.isFinite(value) ? value : null;
}

/** Fractions cooks actually use, as [value, text]. */
const NICE_FRACTIONS: [number, string][] = [
  [0, ''],
  [1 / 8, '1/8'],
  [1 / 4, '1/4'],
  [1 / 3, '1/3'],
  [3 / 8, '3/8'],
  [1 / 2, '1/2'],
  [5 / 8, '5/8'],
  [2 / 3, '2/3'],
  [3 / 4, '3/4'],
  [7 / 8, '7/8'],
  [1, ''],
];

/**
 * Formats a quantity the way a recipe would: 1.5 → "1 1/2", 0.333 → "1/3", 12.4 → "12".
 * Below 10 it rounds to the nearest common fraction; from 10 up, to a whole number.
 * Tiny amounts that would round to zero keep two decimals.
 */
export function formatQuantity(value: number): string {
  if (value >= 10) return String(Math.round(value));

  let whole = Math.floor(value);
  const frac = value - whole;
  let closest = NICE_FRACTIONS[0]!;
  for (const candidate of NICE_FRACTIONS) {
    if (Math.abs(candidate[0] - frac) < Math.abs(closest[0] - frac)) closest = candidate;
  }
  if (closest[0] === 1) whole += 1;

  if (whole === 0 && closest[1] === '') return String(Number(value.toFixed(2)));
  if (whole === 0) return closest[1];
  return closest[1] ? `${whole} ${closest[1]}` : String(whole);
}

/** Naive English plural, good enough for count nouns: clove → cloves, bunch → bunches. */
export function pluralize(noun: string): string {
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * "1 1/2 cups", "4 oz", "2 cloves". For `each`, pass the ingredient's count noun
 * (e.g. "clove"); without one, just the number is returned.
 */
export function formatAmount({ quantity, unit }: Amount, countNoun?: string | null): string {
  const qty = formatQuantity(quantity);
  const isOne = qty === '1' || /^\d+\/\d+$/.test(qty);
  if (unit === 'each') {
    if (!countNoun) return qty;
    return `${qty} ${isOne ? countNoun : pluralize(countNoun)}`;
  }
  const def = UNITS[unit];
  return `${qty} ${isOne ? def.singular : def.plural}`;
}
