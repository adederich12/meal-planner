/**
 * Reads recipe data out of HTML with no AI: the schema.org Recipe JSON-LD that
 * most recipe sites embed for search engines, or else the page's visible text.
 * Pure functions, so they're easy to test with saved pages.
 */

export interface StructuredRecipe {
  name: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Ingredient lines exactly as written ("2 cloves garlic, minced"). */
  ingredientLines: string[];
  /** Markdown. */
  instructions: string;
  tags: string[];
}

const LD_JSON_SCRIPT =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

/** The page's schema.org Recipe, or null when it has none. */
export function extractRecipeJsonLd(html: string): StructuredRecipe | null {
  for (const match of html.matchAll(LD_JSON_SCRIPT)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]!.replace(/^\s*<!--|-->\s*$/g, '').trim());
    } catch {
      continue; // Malformed blocks are common; try the next one.
    }
    const recipe = findRecipeNode(data, 0);
    if (recipe) return toStructured(recipe);
  }
  return null;
}

type Node = Record<string, unknown>;

/** Recipes hide in arrays, @graph, or under mainEntity; search a few levels deep. */
function findRecipeNode(value: unknown, depth: number): Node | null {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = value as Node;
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  for (const child of Object.values(node)) {
    const found = findRecipeNode(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function toStructured(node: Node): StructuredRecipe {
  const ingredients = node.recipeIngredient ?? node.ingredients;
  return {
    name: cleanText(asString(node.name)) || 'Imported recipe',
    servings: parseYield(node.recipeYield),
    prepMinutes: parseDuration(node.prepTime),
    cookMinutes: parseDuration(node.cookTime),
    ingredientLines: asArray(ingredients)
      .map((i) => cleanText(asString(i)))
      .filter(Boolean),
    instructions: instructionsToMarkdown(node.recipeInstructions),
    tags: [...asArray(node.recipeCategory), ...asArray(node.recipeCuisine)]
      // Some sites pack several into one string: "Breakfast, Brunch".
      .flatMap((t) => asString(t).split(','))
      .map((t) => cleanText(t))
      .filter((t) => t && t.length <= 40)
      .filter((t, i, all) => all.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i)
      .slice(0, 5),
  };
}

/** "4", "4 servings", ["4", "4 servings"], 4 → 4. */
export function parseYield(value: unknown): number | null {
  for (const v of asArray(value)) {
    const n = typeof v === 'number' ? v : Number(/\d+/.exec(asString(v))?.[0]);
    if (Number.isInteger(n) && n > 0 && n <= 100) return n;
  }
  return null;
}

/** ISO 8601 durations: "PT1H30M" → 90, "P0DT45M" → 45. */
export function parseDuration(value: unknown): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/i.exec(asString(value).trim());
  if (!m || m[0] === 'P' || m[0] === 'PT') return null;
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return minutes > 0 ? minutes : null;
}

/** String, HowToStep[], or HowToSection[] → numbered Markdown steps, with section headings. */
export function instructionsToMarkdown(value: unknown): string {
  if (typeof value === 'string') {
    const steps = htmlToText(value)
      .split(/\n+/)
      .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    return numbered(steps);
  }
  const blocks: string[] = [];
  let steps: string[] = [];
  const flush = () => {
    if (steps.length) blocks.push(numbered(steps));
    steps = [];
  };
  for (const item of asArray(value)) {
    if (typeof item === 'string') {
      steps.push(cleanText(item));
    } else if (item && typeof item === 'object') {
      const node = item as Node;
      if (node['@type'] === 'HowToSection' || Array.isArray(node.itemListElement)) {
        flush();
        const title = cleanText(asString(node.name));
        if (title) blocks.push(`### ${title}`);
        steps = asArray(node.itemListElement)
          .map((s) => cleanText(asString((s as Node)?.text ?? (s as Node)?.name ?? s)))
          .filter(Boolean);
        flush();
      } else {
        const text = cleanText(asString(node.text ?? node.name));
        if (text) steps.push(text);
      }
    }
  }
  flush();
  return blocks.join('\n\n');
}

const numbered = (steps: string[]) =>
  steps
    .filter(Boolean)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');

/** Visible text of a page, roughly as a reader sees it. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|h[1-6]|ul|ol|table|tr|section|article|header|footer)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const cleanText = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  frac13: '⅓',
  frac23: '⅔',
  frac18: '⅛',
  deg: '°',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  eacute: 'é',
  egrave: 'è',
  ntilde: 'ñ',
  ccedil: 'ç',
  uuml: 'ü',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+\d*);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const asString = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const asArray = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
