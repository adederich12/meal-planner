import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/PageHeader';
import { RecipeForm } from '@/components/recipes/RecipeForm';
import { useCreateRecipe } from '@/queries/recipes.queries';

export const Route = createFileRoute('/recipes/new')({
  component: NewRecipePage,
});

function NewRecipePage() {
  const navigate = Route.useNavigate();
  const create = useCreateRecipe();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New recipe" />
      <RecipeForm
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
