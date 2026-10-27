import { formatIngredientAmount, scaleAmount, type RecipeLine } from '@meal-planner/shared';

/** "1 1/2 cups flour" scaled by `factor`; lines with no amount are "to taste". */
export function describeLine(line: RecipeLine, factor = 1): { text: string; toTaste: boolean } {
  if (line.quantity === null || line.unit === null) {
    return { text: line.ingredient.name, toTaste: true };
  }
  const amount = scaleAmount({ quantity: line.quantity, unit: line.unit }, factor);
  return { text: formatIngredientAmount(amount, line.ingredient), toTaste: false };
}

/** 25 → "25 min", 90 → "1 hr 30 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function totalMinutes(r: { prepMinutes: number | null; cookMinutes: number | null }) {
  return r.prepMinutes === null && r.cookMinutes === null
    ? null
    : (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
}
