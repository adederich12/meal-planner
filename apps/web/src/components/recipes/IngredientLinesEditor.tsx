import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { UNIT_KEYS, UNITS, type Unit } from '@meal-planner/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { emptyLine, type RecipeFormValues } from '@/forms/recipe-form';
import { allIngredientsQuery } from '@/queries/ingredients.queries';
import { IngredientPicker } from './IngredientPicker';

const unitLabel = (u: Unit) => (u === 'each' ? 'each / whole' : UNITS[u].singular);
/** Radix Select can't use "" as an item value. */
const NO_UNIT = 'none';

/** Ordered ingredient lines: amount, unit, catalog ingredient, preparation. */
export function IngredientLinesEditor() {
  const { control, register, formState } = useFormContext<RecipeFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'ingredients' });
  const { data: catalog = [] } = useQuery(allIngredientsQuery());
  const errors = formState.errors.ingredients;

  return (
    <div className="grid gap-3">
      {fields.length === 0 && <p className="text-muted-foreground text-sm">No ingredients yet.</p>}
      <ol className="grid gap-3">
        {fields.map((field, i) => {
          const e = errors?.[i];
          const hint = field.hint;
          const messages = [e?.quantity, e?.unit, e?.ingredientId, e?.preparation]
            .map((x) => x?.message)
            .filter(Boolean);
          return (
            <li key={field.id} className="bg-background grid gap-2 rounded-lg border p-3">
              {hint && (
                <p className="text-muted-foreground text-xs">
                  From the page: <q className="text-foreground">{hint.original}</q>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[5rem_8rem_minmax(0,1fr)_minmax(0,1fr)]">
                <Input
                  aria-label={`Line ${i + 1} amount`}
                  placeholder="Amount"
                  inputMode="text"
                  autoComplete="off"
                  aria-invalid={Boolean(e?.quantity) || undefined}
                  {...register(`ingredients.${i}.quantity`)}
                />
                <Controller
                  control={control}
                  name={`ingredients.${i}.unit`}
                  render={({ field: f }) => (
                    <Select
                      value={f.value || NO_UNIT}
                      onValueChange={(v) => f.onChange(v === NO_UNIT ? '' : v)}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Line ${i + 1} unit`}
                        aria-invalid={Boolean(e?.unit) || undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_UNIT}>to taste</SelectItem>
                        <SelectSeparator />
                        {UNIT_KEYS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {unitLabel(u)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <div className="col-span-2 grid gap-1 sm:col-span-1">
                  <Controller
                    control={control}
                    name={`ingredients.${i}.ingredientId`}
                    render={({ field: f }) => (
                      <IngredientPicker
                        value={f.value}
                        onChange={f.onChange}
                        catalog={catalog}
                        suggestion={
                          hint && { name: hint.suggestedName, category: hint.suggestedCategory }
                        }
                        invalid={Boolean(e?.ingredientId)}
                      />
                    )}
                  />
                </div>
                <Input
                  className="col-span-2 sm:col-span-1"
                  aria-label={`Line ${i + 1} preparation`}
                  placeholder="diced, softened…"
                  autoComplete="off"
                  {...register(`ingredients.${i}.preparation`)}
                />
              </div>

              <div className="flex items-center gap-1">
                <Controller
                  control={control}
                  name={`ingredients.${i}.isOptional`}
                  render={({ field: f }) => (
                    <label className="text-muted-foreground mr-auto flex items-center gap-2 text-xs">
                      <Checkbox checked={f.value} onCheckedChange={(v) => f.onChange(v === true)} />
                      Optional
                    </label>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove line"
                  onClick={() => remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>

              {messages.length > 0 && (
                <p className="text-destructive text-xs">{messages.join(' · ')}</p>
              )}
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() => append(emptyLine())}
      >
        <Plus /> Add line
      </Button>
    </div>
  );
}
