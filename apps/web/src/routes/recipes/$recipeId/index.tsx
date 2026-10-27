import { useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Clock, ExternalLink, Minus, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Recipe } from '@meal-planner/shared';
import { Markdown } from '@/components/Markdown';
import { PageHeader } from '@/components/PageHeader';
import { describeLine, formatMinutes } from '@/components/recipes/format';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { recipeQuery, useDeleteRecipe, useSetRecipeArchived } from '@/queries/recipes.queries';

const SearchSchema = z.object({
  /** Scale to this many servings. Absent = as written. */
  servings: z.number().int().min(1).max(100).optional().catch(undefined),
});

export const Route = createFileRoute('/recipes/$recipeId/')({
  validateSearch: SearchSchema,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(recipeQuery(params.recipeId)),
  component: RecipePage,
  errorComponent: ({ error }) => (
    <div className="grid gap-3">
      <p className="text-destructive text-sm">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Link to="/recipes" className="text-sm underline">
        Back to recipes
      </Link>
    </div>
  ),
});

function RecipePage() {
  const { recipeId } = Route.useParams();
  const { data: recipe } = useSuspenseQuery(recipeQuery(recipeId));
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const servings = search.servings ?? recipe.servings;
  const factor = servings / recipe.servings;
  const setServings = (n: number) =>
    void navigate({
      search: { servings: n === recipe.servings ? undefined : Math.min(100, Math.max(1, n)) },
      replace: true,
    });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/recipes"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Recipes
      </Link>
      <PageHeader
        title={recipe.name}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/recipes/$recipeId/edit" params={{ recipeId }}>
                <Pencil /> Edit
              </Link>
            </Button>
            <RecipeMenu recipe={recipe} />
          </>
        }
      >
        <RecipeMeta recipe={recipe} />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="self-start">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Ingredients</CardTitle>
            <div className="flex items-center gap-1" role="group" aria-label="Servings">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Fewer servings"
                disabled={servings <= 1}
                onClick={() => setServings(servings - 1)}
              >
                <Minus />
              </Button>
              <span className="min-w-20 text-center text-sm tabular-nums" aria-live="polite">
                {servings} serving{servings === 1 ? '' : 's'}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More servings"
                disabled={servings >= 100}
                onClick={() => setServings(servings + 1)}
              >
                <Plus />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {factor !== 1 && (
              <p className="text-muted-foreground mb-3 text-xs">
                Scaled from {recipe.servings}.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setServings(recipe.servings)}
                >
                  Reset
                </button>
              </p>
            )}
            {recipe.ingredients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No ingredients listed.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {recipe.ingredients.map((line) => {
                  const { text, toTaste } = describeLine(line, factor);
                  return (
                    <li key={line.id} className="flex flex-wrap items-baseline gap-x-1.5">
                      <span>
                        {text}
                        {line.preparation && (
                          <span className="text-muted-foreground">, {line.preparation}</span>
                        )}
                        {toTaste && <span className="text-muted-foreground"> (to taste)</span>}
                      </span>
                      {line.isOptional && <Badge variant="outline">optional</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 self-start">
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              {recipe.instructions.trim() ? (
                <Markdown>{recipe.instructions}</Markdown>
              ) : (
                <p className="text-muted-foreground text-sm">No instructions yet.</p>
              )}
            </CardContent>
          </Card>
          {recipe.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{recipe.notes}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipeMeta({ recipe: r }: { recipe: Recipe }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
      {r.archivedAt && <Badge variant="outline">archived</Badge>}
      {(r.prepMinutes !== null || r.cookMinutes !== null) && (
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {[
            r.prepMinutes !== null && `${formatMinutes(r.prepMinutes)} prep`,
            r.cookMinutes !== null && `${formatMinutes(r.cookMinutes)} cook`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
      {r.rating !== null && (
        <span className="text-amber-500" aria-label={`${r.rating} of 5 stars`}>
          {'★'.repeat(r.rating)}
          <span className="text-muted-foreground/40">{'★'.repeat(5 - r.rating)}</span>
        </span>
      )}
      {r.sourceUrl && (
        <a
          href={r.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 underline underline-offset-2"
        >
          Source <ExternalLink className="size-3.5" />
        </a>
      )}
      {r.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {r.tags.map((t) => (
            <Link key={t} to="/recipes" search={{ tag: t }}>
              <Badge variant="secondary">{t}</Badge>
            </Link>
          ))}
        </span>
      )}
    </div>
  );
}

function RecipeMenu({ recipe }: { recipe: Recipe }) {
  const navigate = Route.useNavigate();
  const archive = useSetRecipeArchived();
  const remove = useDeleteRecipe();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = Boolean(recipe.archivedAt);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              archive.mutate(
                { id: recipe.id, archived: !archived },
                {
                  onSuccess: () => toast.success(archived ? 'Restored' : 'Archived'),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            {archived ? 'Restore' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {recipe.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This can’t be undone. To just hide it, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                remove.mutate(recipe.id, {
                  onSuccess: () => {
                    toast.success(`Deleted ${recipe.name}`);
                    void navigate({ to: '/recipes' });
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
