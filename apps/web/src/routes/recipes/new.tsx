import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import type { RecipeImportDraft } from '@meal-planner/shared';
import { PageHeader } from '@/components/PageHeader';
import { RecipeImportCard } from '@/components/recipes/RecipeImportCard';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import { toRecipeFormValuesFromDraft } from '@/forms/recipe-form';
import { useCreateRecipe } from '@/queries/recipes.queries';

export const Route = createFileRoute('/recipes/new')({
  component: NewRecipePage,
});

function NewRecipePage() {
  const navigate = Route.useNavigate();
  const create = useCreateRecipe();
  // Each import remounts the form with the draft as its starting values.
  const [imported, setImported] = useState<{ draft: RecipeImportDraft; key: number } | null>(null);
  const unmatched = imported?.draft.ingredients.filter((l) => !l.ingredientId).length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New recipe" />
      <RecipeImportCard
        onImported={(draft) => setImported((prev) => ({ draft, key: (prev?.key ?? 0) + 1 }))}
      />

      {imported && (
        <div className="bg-card mb-4 flex gap-3 rounded-lg border p-4 text-sm" role="status">
          <Sparkles className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">
              {imported.draft.sourceUrl
                ? `Imported from ${new URL(imported.draft.sourceUrl).hostname}.`
                : 'Read from your scan.'}{' '}
              Check it before saving.
            </p>
            <p className="text-muted-foreground mt-1">
              {imported.draft.ingredients.length} ingredient
              {imported.draft.ingredients.length === 1 ? '' : 's'} read
              {unmatched > 0
                ? `; ${unmatched} need${unmatched === 1 ? 's' : ''} a catalog ingredient picked or added.`
                : ', all matched to your catalog.'}
              {imported.draft.source === 'page-text' &&
                ' The page had no recipe data, so Claude read its text; check the steps too.'}
              {imported.draft.source === 'scan' &&
                ' Compare amounts with the card; printed fractions are easy to misread.'}
            </p>
            {imported.draft.notes && (
              <p className="mt-2">
                <span className="font-medium">Note from Claude:</span> {imported.draft.notes}
              </p>
            )}
          </div>
        </div>
      )}

      <RecipeForm
        key={imported?.key ?? 0}
        initialValues={imported ? toRecipeFormValuesFromDraft(imported.draft) : undefined}
        onSubmit={(input) => create.mutateAsync(input)}
        onSaved={(r) =>
          void navigate({
            to: '/recipes/$recipeId',
            params: { recipeId: r.id },
            ignoreBlocker: true,
          })
        }
        onCancel={() => void navigate({ to: '/recipes' })}
      />
    </div>
  );
}
