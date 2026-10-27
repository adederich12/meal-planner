import { z } from 'zod';

/** Form text → positive number, or null when blank. */
export const positiveNumberText = (message = 'Enter a number above 0') =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (!s) return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return n;
    });

/** Form text → whole number, or null when blank. */
export const wholeNumberText = (message = 'Enter a whole number') =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (!s) return null;
      if (!/^\d+$/.test(s)) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return Number(s);
    });

/**
 * For the last step of a form schema: validate the converted values with the
 * shared API schema, so the form and the API enforce the same rules. Issues
 * keep their paths, so they land on the matching inputs.
 *
 * (Zod's `.pipe()` would be the usual tool, but its types require the target's
 * input to match exactly, and the API schemas also accept `undefined`.)
 */
export function validateWith<S extends z.ZodType>(schema: S) {
  return (value: unknown, ctx: z.RefinementCtx): z.output<S> => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    }
    return z.NEVER;
  };
}

/** A number for a text input: blank for null, and no float noise (0.1 + 0.2). */
export const numberToText = (n: number | null | undefined, decimals = 6): string =>
  n === null || n === undefined ? '' : String(Number(n.toFixed(decimals)));
