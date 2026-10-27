import { z } from 'zod';

/** Standard error body returned by every API error response. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** UTC timestamp, e.g. 2026-10-26T14:03:00.000Z */
export const TimestampSchema = z.iso.datetime();

/** Calendar date with no time zone, e.g. 2026-10-26 */
export const CalendarDateSchema = z.iso.date();

/** Optional free text: trims, and treats "" as null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);

/** Optional calendar date: "" becomes null. */
export const OptionalCalendarDateSchema = z
  .string()
  .trim()
  .nullish()
  .transform((s) => s || null)
  .pipe(CalendarDateSchema.nullable());
