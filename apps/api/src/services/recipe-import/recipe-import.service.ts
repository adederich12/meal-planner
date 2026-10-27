import { isNull } from 'drizzle-orm';
import type { ImportedLine, RecipeImportDraft } from '@meal-planner/shared';
import type { AppDeps } from '../../app.js';
import { ingredients } from '../../db/schema.js';
import { AppError } from '../../errors.js';
import { fetchPage as defaultFetchPage } from './fetch-page.js';
import { extractRecipeJsonLd, htmlToText } from './read-page.js';
import type { CatalogEntry, ParsedLine } from './recipe-ai.js';

/** About 75k tokens. Recipe pages are far smaller; anything bigger isn't worth the cost. */
const MAX_PAGE_TEXT = 300_000;

/**
 * URL → recipe draft (DESIGN §6). Reads the page's structured data when it has
 * some (Claude only parses the ingredient lines), otherwise lets Claude read
 * the page text. Never writes to the database: the draft fills a form.
 */
export function createRecipeImportService({ db, fetchPage = defaultFetchPage, recipeAi }: AppDeps) {
  async function importFromUrl(url: string): Promise<RecipeImportDraft> {
    if (!recipeAi) {
      throw new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'Recipe import needs a Claude API key. Add ANTHROPIC_API_KEY to .env and restart the app.',
      );
    }

    const page = await fetchPage(url);
    const catalogRows = db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        category: ingredients.category,
        countNoun: ingredients.countNoun,
      })
      .from(ingredients)
      .where(isNull(ingredients.archivedAt))
      .all();
    const catalog: CatalogEntry[] = catalogRows.map(({ id: _id, ...rest }) => rest);
    const idByName = new Map(catalogRows.map((r) => [r.name.toLowerCase(), r.id]));
    const toLine = (p: ParsedLine): ImportedLine => toImportedLine(p, idByName);

    const structured = extractRecipeJsonLd(page.html);
    if (structured) {
      const lines =
        structured.ingredientLines.length > 0
          ? await recipeAi.parseLines({ lines: structured.ingredientLines, catalog })
          : [];
      return {
        name: structured.name,
        servings: structured.servings,
        prepMinutes: structured.prepMinutes,
        cookMinutes: structured.cookMinutes,
        instructions: structured.instructions,
        sourceUrl: page.url,
        tags: structured.tags,
        ingredients: lines.map(toLine),
        source: 'structured-data',
      };
    }

    const pageText = htmlToText(page.html);
    if (pageText.length > MAX_PAGE_TEXT) {
      throw new AppError(422, 'IMPORT_PAGE_TOO_LARGE', 'That page is too long to read.');
    }
    const recipe = await recipeAi.readPage({ url: page.url, pageText, catalog });
    if (!recipe) {
      throw new AppError(422, 'IMPORT_NO_RECIPE', 'Couldn’t find a recipe on that page.');
    }
    return {
      name: recipe.name.trim() || 'Imported recipe',
      servings: wholeOrNull(recipe.servings, 1, 100),
      prepMinutes: wholeOrNull(recipe.prepMinutes, 0, 10_080),
      cookMinutes: wholeOrNull(recipe.cookMinutes, 0, 10_080),
      instructions: recipe.instructions.trim(),
      sourceUrl: page.url,
      tags: recipe.tags
        .map((t) => t.trim())
        .filter((t) => t && t.length <= 40)
        .slice(0, 5),
      ingredients: recipe.lines.map(toLine),
      source: 'page-text',
    };
  }

  return { importFromUrl };
}

export type RecipeImportService = ReturnType<typeof createRecipeImportService>;

/**
 * Model output → a line the form accepts. Catalog names are matched exactly
 * (case-insensitive) so a made-up name can never become a wrong match, and a
 * quantity without a unit, or the reverse, is fixed rather than rejected.
 */
export function toImportedLine(p: ParsedLine, idByName: Map<string, string>): ImportedLine {
  const quantity =
    p.quantity !== null && p.quantity > 0 && Number.isFinite(p.quantity) ? p.quantity : null;
  return {
    original: p.original,
    ingredientId: (p.catalogName && idByName.get(p.catalogName.toLowerCase())) || null,
    suggestedName: p.newIngredientName.trim().toLowerCase() || p.original,
    suggestedCategory: p.category,
    quantity,
    unit: quantity === null ? null : (p.unit ?? 'each'),
    preparation: p.preparation?.trim() || null,
    isOptional: p.optional,
  };
}

function wholeOrNull(n: number | null, min: number, max: number): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}
