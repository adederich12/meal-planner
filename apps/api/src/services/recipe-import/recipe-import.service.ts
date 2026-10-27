import { isNull } from 'drizzle-orm';
import {
  MAX_SCAN_IMAGE_BYTES,
  MAX_SCAN_TOTAL_BYTES,
  type ImportedLine,
  type RecipeImportDraft,
  type ScanMediaType,
} from '@meal-planner/shared';
import type { AppDeps } from '../../app.js';
import { ingredients, settings } from '../../db/schema.js';
import { AppError, BadRequestError } from '../../errors.js';
import { fetchPage as defaultFetchPage } from './fetch-page.js';
import { extractRecipeJsonLd, htmlToText } from './read-page.js';
import type { CatalogEntry, PageRecipe, ParsedLine, RecipeAi, ScanFile } from './recipe-ai.js';

/** About 75k tokens. Recipe pages are far smaller; anything bigger isn't worth the cost. */
const MAX_PAGE_TEXT = 300_000;

/** Matches the settings table default (DESIGN §4.7). */
const DEFAULT_HOUSEHOLD_SIZE = 2;

export interface UploadedScan {
  fileName: string;
  data: Buffer;
}

/**
 * Recipe import (DESIGN §6.1): a URL or a scanned card → a recipe draft.
 * Never writes to the database: the draft fills a form the user reviews.
 */
export function createRecipeImportService({ db, fetchPage = defaultFetchPage, recipeAi }: AppDeps) {
  function requireAi(): RecipeAi {
    if (!recipeAi) {
      throw new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'Recipe import needs a Claude API key. Add ANTHROPIC_API_KEY to .env and restart the app.',
      );
    }
    return recipeAi;
  }

  /** The catalog Claude matches against, and a name → id lookup for its answers. */
  function loadCatalog() {
    const rows = db
      .select({
        id: ingredients.id,
        name: ingredients.name,
        category: ingredients.category,
        countNoun: ingredients.countNoun,
      })
      .from(ingredients)
      .where(isNull(ingredients.archivedAt))
      .all();
    const catalog: CatalogEntry[] = rows.map(({ id: _id, ...rest }) => rest);
    const idByName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));
    return { catalog, toLine: (p: ParsedLine): ImportedLine => toImportedLine(p, idByName) };
  }

  async function importFromUrl(url: string): Promise<RecipeImportDraft> {
    const ai = requireAi();
    const page = await fetchPage(url);
    const { catalog, toLine } = loadCatalog();

    const structured = extractRecipeJsonLd(page.html);
    if (structured) {
      const lines =
        structured.ingredientLines.length > 0
          ? await ai.parseLines({ lines: structured.ingredientLines, catalog })
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
        notes: null,
      };
    }

    const pageText = htmlToText(page.html);
    if (pageText.length > MAX_PAGE_TEXT) {
      throw new AppError(422, 'IMPORT_PAGE_TOO_LARGE', 'That page is too long to read.');
    }
    const recipe = await ai.readPage({ url: page.url, pageText, catalog });
    if (!recipe) {
      throw new AppError(422, 'IMPORT_NO_RECIPE', 'Couldn’t find a recipe on that page.');
    }
    return { ...fromRead(recipe, toLine), sourceUrl: page.url, source: 'page-text', notes: null };
  }

  async function importFromScan(uploads: UploadedScan[]): Promise<RecipeImportDraft> {
    const ai = requireAi();
    const files: ScanFile[] = uploads.map((u) => {
      const mediaType = sniffScanType(u.data);
      if (!mediaType) {
        throw new BadRequestError(
          'UNSUPPORTED_FILE',
          `${u.fileName} isn’t a PDF, JPEG, PNG, or WebP. (iPhone HEIC photos: set the camera to “Most Compatible”, or scan to PDF.)`,
        );
      }
      if (mediaType !== 'application/pdf' && u.data.byteLength > MAX_SCAN_IMAGE_BYTES) {
        throw new AppError(
          413,
          'FILE_TOO_LARGE',
          `${u.fileName} is over 5 MB. Use a smaller photo.`,
        );
      }
      return { mediaType, data: u.data };
    });
    if (uploads.reduce((n, u) => n + u.data.byteLength, 0) > MAX_SCAN_TOTAL_BYTES) {
      throw new AppError(413, 'FILE_TOO_LARGE', 'Those files add up to more than 20 MB.');
    }
    const { catalog, toLine } = loadCatalog();
    const householdSize =
      db.select({ size: settings.householdSize }).from(settings).get()?.size ??
      DEFAULT_HOUSEHOLD_SIZE;

    const recipe = await ai.readScan({ files, householdSize, catalog });
    if (!recipe) {
      throw new AppError(422, 'IMPORT_NO_RECIPE', 'Couldn’t find a recipe in that scan.');
    }
    return {
      ...fromRead(recipe, toLine),
      sourceUrl: null,
      source: 'scan',
      notes: recipe.reviewNote?.trim() || null,
    };
  }

  return { importFromUrl, importFromScan };
}

export type RecipeImportService = ReturnType<typeof createRecipeImportService>;

/** The fields Claude reads the same way from page text and from scans. */
function fromRead(recipe: PageRecipe, toLine: (p: ParsedLine) => ImportedLine) {
  return {
    name: recipe.name.trim() || 'Imported recipe',
    servings: wholeOrNull(recipe.servings, 1, 100),
    prepMinutes: wholeOrNull(recipe.prepMinutes, 0, 10_080),
    cookMinutes: wholeOrNull(recipe.cookMinutes, 0, 10_080),
    instructions: recipe.instructions.trim(),
    tags: recipe.tags
      .map((t) => t.trim())
      .filter((t) => t && t.length <= 40)
      .slice(0, 5),
    ingredients: recipe.lines.map(toLine),
  };
}

/**
 * The file's real type from its first bytes ("magic numbers"). The name and
 * Content-Type come from the client and can say anything.
 */
export function sniffScanType(data: Buffer): ScanMediaType | null {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

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
