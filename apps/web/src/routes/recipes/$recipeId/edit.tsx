import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import { recipeQuery, useReplaceRecipe } from '@/queries/recipes.queries';

export const Route = createFileRoute('/recipes/$recipeId/edit')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.recipeId)),
  component: EditRecipePage,
});

function EditRecipePage() {
  const { recipeId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: recipe } = useSuspenseQuery(recipeQuery(recipeId));
  const replace = useReplaceRecipe();
  const toDetail = () => void navigate({ to: '/recipes/$recipeId', params: { recipeId } });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit ${recipe.name}`} />
      <RecipeForm
        recipe={recipe}
        onSubmit={(input) => replace.mutateAsync({ id: recipeId, input })}
        onSaved={() =>
          void navigate({ to: '/recipes/$recipeId', params: { recipeId }, ignoreBlocker: true })
        }
        onCancel={toDetail}
      />
    </div>
  );
}
