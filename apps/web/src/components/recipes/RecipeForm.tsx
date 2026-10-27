import { zodResolver } from '@hookform/resolvers/zod';
import { useBlocker } from '@tanstack/react-router';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Recipe } from '@meal-planner/shared';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  RecipeFormSchema,
  toRecipeFormValues,
  type RecipeFormOutput,
  type RecipeFormValues,
} from '@/forms/recipe-form';
import { IngredientLinesEditor } from './IngredientLinesEditor';

export function RecipeForm({
  recipe,
  initialValues,
  onSubmit,
  onSaved,
  onCancel,
}: {
  recipe?: Recipe;
  /** Starting values instead of `recipe` (e.g. an imported draft). */
  initialValues?: RecipeFormValues;
  onSubmit: (input: RecipeFormOutput) => Promise<Recipe>;
  /** Navigate away with `ignoreBlocker: true`; the form is still "dirty" at this point. */
  onSaved: (recipe: Recipe) => void;
  onCancel: () => void;
}) {
  const form = useForm<RecipeFormValues, unknown, RecipeFormOutput>({
    resolver: zodResolver(RecipeFormSchema),
    defaultValues: initialValues ?? toRecipeFormValues(recipe),
  });
  const { register, control, handleSubmit, formState } = form;
  // Read during render: React Hook Form only tracks isDirty when it's read.
  const { isDirty } = formState;

  // Don't lose a half-typed recipe to a stray tap on the nav bar. After a
  // successful save, `onSaved` navigates with `ignoreBlocker`.
  useBlocker({
    shouldBlockFn: () => isDirty && !window.confirm('Discard your changes?'),
    enableBeforeUnload: isDirty,
  });

  const save = handleSubmit(
    async (input) => {
      try {
        const result = await onSubmit(input);
        toast.success(`Saved ${result.name}`);
        onSaved(result);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not save');
      }
    },
    () => toast.error('Check the highlighted fields'),
  );

  const err = formState.errors;
  return (
    <FormProvider {...form}>
      <form onSubmit={save} noValidate className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField label="Name" htmlFor="name" error={err.name?.message}>
              <Input id="name" autoComplete="off" {...register('name')} />
            </FormField>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <FormField label="Servings" htmlFor="servings" error={err.servings?.message}>
                <Input id="servings" inputMode="numeric" {...register('servings')} />
              </FormField>
              <FormField label="Prep (min)" htmlFor="prep" error={err.prepMinutes?.message}>
                <Input id="prep" inputMode="numeric" {...register('prepMinutes')} />
              </FormField>
              <FormField label="Cook (min)" htmlFor="cook" error={err.cookMinutes?.message}>
                <Input id="cook" inputMode="numeric" {...register('cookMinutes')} />
              </FormField>
              <FormField label="Rating" error={err.rating?.message}>
                <Controller
                  control={control}
                  name="rating"
                  render={({ field }) => (
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger className="w-full" aria-label="Rating">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not rated</SelectItem>
                        {(['5', '4', '3', '2', '1'] as const).map((r) => (
                          <SelectItem key={r} value={r}>
                            {'★'.repeat(Number(r))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>
            <FormField
              label="Tags"
              htmlFor="tags"
              error={err.tags?.message}
              hint="Comma-separated, e.g. dinner, freezer-friendly"
            >
              <Input id="tags" autoComplete="off" {...register('tags')} />
            </FormField>
            <FormField label="Source" htmlFor="source" error={err.sourceUrl?.message}>
              <Input
                id="source"
                type="url"
                placeholder="https://…"
                autoComplete="off"
                {...register('sourceUrl')}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingredients</CardTitle>
          </CardHeader>
          <CardContent>
            <IngredientLinesEditor />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FormField
              label="Steps"
              htmlFor="instructions"
              error={err.instructions?.message}
              hint="Markdown: start lines with “1.” for numbered steps."
            >
              <Textarea id="instructions" rows={10} {...register('instructions')} />
            </FormField>
            <FormField label="Notes" htmlFor="notes" error={err.notes?.message}>
              <Textarea id="notes" rows={3} {...register('notes')} />
            </FormField>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? 'Saving…' : 'Save recipe'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
