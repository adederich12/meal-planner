import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Clock, Plus, Search, Users } from 'lucide-react';
import { z } from 'zod';
import type { RecipeSummary } from '@meal-planner/shared';
import { PageHeader } from '@/components/PageHeader';
import { formatMinutes, totalMinutes } from '@/components/recipes/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { recipesQuery, tagsQuery } from '@/queries/recipes.queries';

const SearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  archived: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/recipes/')({
  validateSearch: SearchSchema,
  component: RecipesPage,
});

function RecipesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<z.infer<typeof SearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const { data, isPending, isError, error } = useQuery(
    recipesQuery({ q: search.q, tag: search.tag, includeArchived: search.archived }),
  );
  const { data: tags = [] } = useQuery(tagsQuery());
  const filtering = Boolean(search.q || search.tag);

  return (
    <>
      <PageHeader
        title="Recipes"
        actions={
          <Button asChild>
            <Link to="/recipes/new">
              <Plus /> New recipe
            </Link>
          </Button>
        }
      >
        Your recipe collection.
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 w-full sm:w-72">
          <InputGroupInput
            placeholder="Search recipes"
            value={search.q ?? ''}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            aria-label="Search recipes"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <Switch
            checked={search.archived ?? false}
            onCheckedChange={(v) => setSearch({ archived: v || undefined })}
          />
          Show archived
        </label>
      </div>

      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {tags.map((t) => {
            const active = search.tag?.toLowerCase() === t.toLowerCase();
            return (
              <Button
                key={t}
                size="xs"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => setSearch({ tag: active ? undefined : t })}
              >
                {t}
              </Button>
            );
          })}
        </div>
      )}

      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">Couldn’t load recipes: {error.message}</p>
      ) : data.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          {filtering ? 'No recipes match.' : 'No recipes yet. Add your first one.'}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((r) => (
            <li key={r.id}>
              <RecipeCard recipe={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RecipeCard({ recipe: r }: { recipe: RecipeSummary }) {
  const minutes = totalMinutes(r);
  return (
    <Link
      to="/recipes/$recipeId"
      params={{ recipeId: r.id }}
      className="bg-card hover:border-foreground/20 flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className={r.archivedAt ? 'text-muted-foreground font-medium' : 'font-medium'}>
          {r.name}
        </h2>
        {r.rating !== null && (
          <span className="shrink-0 text-xs text-amber-500" aria-label={`${r.rating} of 5 stars`}>
            {'★'.repeat(r.rating)}
          </span>
        )}
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <Users className="size-3.5" /> {r.servings}
        </span>
        {minutes !== null && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" /> {formatMinutes(minutes)}
          </span>
        )}
        <span>
          {r.ingredientCount} ingredient{r.ingredientCount === 1 ? '' : 's'}
        </span>
      </div>
      {(r.tags.length > 0 || r.archivedAt) && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
          {r.archivedAt && <Badge variant="outline">archived</Badge>}
          {r.tags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </Link>
  );
}
