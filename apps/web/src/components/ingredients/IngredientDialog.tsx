import { useEffect, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  INGREDIENT_CATEGORIES,
  type Ingredient,
  type IngredientCategory,
} from '@meal-planner/shared';
import { FormField } from '@/components/FormField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  IngredientFormSchema,
  toIngredientFormValues,
  type IngredientFormOutput,
  type IngredientFormValues,
} from '@/forms/ingredient-form';
import { ApiRequestError } from '@/lib/api-client';
import {
  ingredientQuery,
  useCreateIngredient,
  useDeleteIngredient,
  useReplaceIngredient,
  useSetIngredientArchived,
} from '@/queries/ingredients.queries';
import { CATEGORY_LABELS } from './format';

/**
 * Add or edit a catalog ingredient. Used by the Ingredients page and, for
 * adding, inline from the recipe editor.
 */
export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  defaultName,
  defaultCategory,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this one; omit to add a new ingredient. */
  ingredient?: Ingredient | undefined;
  defaultName?: string;
  defaultCategory?: IngredientCategory;
  onSaved?: (ingredient: Ingredient) => void;
}) {
  const isEdit = Boolean(ingredient);
  const form = useForm<IngredientFormValues, unknown, IngredientFormOutput>({
    resolver: zodResolver(IngredientFormSchema),
    defaultValues: toIngredientFormValues(ingredient, {
      name: defaultName,
      category: defaultCategory,
    }),
  });
  const { register, handleSubmit, control, reset, setError, formState } = form;

  // Fresh values each time it opens (the dialog stays mounted between uses).
  useEffect(() => {
    if (open) {
      reset(toIngredientFormValues(ingredient, { name: defaultName, category: defaultCategory }));
    }
  }, [open, ingredient, defaultName, defaultCategory, reset]);

  const create = useCreateIngredient();
  const replace = useReplaceIngredient();
  const saving = create.isPending || replace.isPending;

  const save = handleSubmit(async (input) => {
    try {
      const saved = ingredient
        ? await replace.mutateAsync({ id: ingredient.id, input })
        : await create.mutateAsync(input);
      toast.success(isEdit ? `Saved ${saved.name}` : `Added ${saved.name}`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'INGREDIENT_NAME_TAKEN') {
        setError('name', { message: err.message });
      } else {
        toast.error(err instanceof Error ? err.message : 'Could not save');
      }
    }
  });

  // The dialog renders in a portal, but React events still bubble up the
  // component tree, so a submit here would also submit a surrounding recipe form.
  const onSubmit = (e: FormEvent) => {
    e.stopPropagation();
    void save(e);
  };

  const err = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit ingredient' : 'Add ingredient'}</DialogTitle>
          <DialogDescription>
            Conversion data lets the shopping list combine cups, grams, and counts.
          </DialogDescription>
        </DialogHeader>

        <form id="ingredient-form" onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            label="Name"
            htmlFor="ing-name"
            error={err.name?.message}
            hint="Singular, e.g. “yellow onion”"
          >
            <Input id="ing-name" autoComplete="off" {...register('name')} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Store section" error={err.category?.message}>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INGREDIENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField
              label="Counted as"
              htmlFor="ing-noun"
              error={err.countNoun?.message}
              hint="clove, can, bunch…"
            >
              <Input
                id="ing-noun"
                autoComplete="off"
                placeholder="(the name)"
                {...register('countNoun')}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="1 cup weighs"
              htmlFor="ing-cup"
              error={err.gramsPerCup?.message}
              hint="grams; links cups ↔ weight"
            >
              <Input
                id="ing-cup"
                inputMode="decimal"
                placeholder="—"
                {...register('gramsPerCup')}
              />
            </FormField>
            <FormField
              label="1 item weighs"
              htmlFor="ing-each"
              error={err.gramsPerEach?.message}
              hint="grams; links count ↔ weight"
            >
              <Input
                id="ing-each"
                inputMode="decimal"
                placeholder="—"
                {...register('gramsPerEach')}
              />
            </FormField>
          </div>

          <Controller
            control={control}
            name="isStaple"
            render={({ field }) => (
              <label className="flex items-start gap-3 rounded-lg border p-3">
                <Switch checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                <span>
                  <span className="font-medium">Pantry staple</span>
                  <span className="text-muted-foreground block text-xs">
                    Always on hand (salt, oil). Left off the shopping list and ignored when matching
                    recipes.
                  </span>
                </span>
              </label>
            )}
          />
        </form>

        {ingredient && (
          <ManageIngredient ingredient={ingredient} onDone={() => onOpenChange(false)} />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="ingredient-form" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Add ingredient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Where it's used, plus archive/restore and delete. */
function ManageIngredient({ ingredient, onDone }: { ingredient: Ingredient; onDone: () => void }) {
  const { data } = useQuery(ingredientQuery(ingredient.id));
  const archive = useSetIngredientArchived();
  const remove = useDeleteIngredient();
  const [showAll, setShowAll] = useState(false);
  const usedBy = data?.usedBy ?? [];
  const shown = showAll ? usedBy : usedBy.slice(0, 5);
  const archived = Boolean(ingredient.archivedAt);

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="text-sm">
        <div className="font-medium">Used in</div>
        {!data ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : usedBy.length === 0 ? (
          <p className="text-muted-foreground">No recipes yet.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {shown.map((r) => (
              <li key={r.id}>
                <Link
                  to="/recipes/$recipeId"
                  params={{ recipeId: r.id }}
                  className="underline underline-offset-2"
                  onClick={onDone}
                >
                  {r.name}
                </Link>
              </li>
            ))}
            {usedBy.length > shown.length && (
              <li>
                <button
                  type="button"
                  className="text-muted-foreground underline"
                  onClick={() => setShowAll(true)}
                >
                  +{usedBy.length - shown.length} more
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={archive.isPending}
          onClick={() =>
            archive.mutate(
              { id: ingredient.id, archived: !archived },
              {
                onSuccess: () => {
                  toast.success(
                    archived ? `Restored ${ingredient.name}` : `Archived ${ingredient.name}`,
                  );
                  onDone();
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {archived ? 'Restore' : 'Archive'}
        </Button>
        {data && usedBy.length === 0 && (
          <ConfirmButton
            title={`Delete ${ingredient.name}?`}
            description="It isn't used by any recipe. This can't be undone."
            confirmLabel="Delete"
            onConfirm={() =>
              remove.mutate(ingredient.id, {
                onSuccess: () => {
                  toast.success(`Deleted ${ingredient.name}`);
                  onDone();
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Delete
          </ConfirmButton>
        )}
      </div>
      {!archived && usedBy.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Archiving hides it from the ingredient picker; recipes that use it keep it.
        </p>
      )}
    </div>
  );
}
