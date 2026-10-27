import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, Search } from 'lucide-react';
import { z } from 'zod';
import {
  INGREDIENT_CATEGORIES,
  IngredientCategorySchema,
  type IngredientListItem,
} from '@meal-planner/shared';
import { PageHeader } from '@/components/PageHeader';
import { IngredientDialog } from '@/components/ingredients/IngredientDialog';
import { CATEGORY_LABELS, conversionSummary } from '@/components/ingredients/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ingredientsQuery } from '@/queries/ingredients.queries';

const SearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: IngredientCategorySchema.optional().catch(undefined),
  archived: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/ingredients/')({
  validateSearch: SearchSchema,
  component: IngredientsPage,
});

type DialogState = { mode: 'add' } | { mode: 'edit'; ingredient: IngredientListItem } | null;

function IngredientsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<z.infer<typeof SearchSchema>>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const { data, isPending, isError, error } = useQuery(
    ingredientsQuery({ includeArchived: search.archived ?? false }),
  );
  const [dialog, setDialog] = useState<DialogState>(null);

  // The catalog is small (a few hundred rows), so filtering here is instant
  // and saves a request per keystroke.
  const groups = useMemo(() => {
    const q = search.q?.trim().toLowerCase() ?? '';
    const rows = (data ?? []).filter(
      (i) =>
        (!q || i.name.toLowerCase().includes(q)) &&
        (!search.category || i.category === search.category),
    );
    return INGREDIENT_CATEGORIES.map((c) => ({
      category: c,
      items: rows.filter((i) => i.category === c),
    })).filter((g) => g.items.length > 0);
  }, [data, search.q, search.category]);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <PageHeader
        title="Ingredients"
        actions={
          <Button onClick={() => setDialog({ mode: 'add' })}>
            <Plus /> Add
          </Button>
        }
      >
        The catalog every recipe draws from.
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InputGroup className="h-9 w-full sm:w-64">
          <InputGroupInput
            placeholder="Search ingredients"
            value={search.q ?? ''}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            aria-label="Search ingredients"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        <Select
          value={search.category ?? 'all'}
          onValueChange={(v) =>
            setSearch({ category: v === 'all' ? undefined : IngredientCategorySchema.parse(v) })
          }
        >
          <SelectTrigger className="h-9! w-40" aria-label="Store section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {INGREDIENT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <Switch
            checked={search.archived ?? false}
            onCheckedChange={(v) => setSearch({ archived: v || undefined })}
          />
          Show archived
        </label>
      </div>

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">Couldn’t load ingredients: {error.message}</p>
      ) : total === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
          {data.length === 0 ? (
            <>
              The catalog is empty. Run <code className="text-foreground">npm run db:seed</code> for
              a starter list, or add ingredients one at a time.
            </>
          ) : (
            'No ingredients match.'
          )}
        </div>
      ) : (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section key={g.category}>
              <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {CATEGORY_LABELS[g.category]}{' '}
                <span className="font-normal normal-case">({g.items.length})</span>
              </h2>
              <ul className="bg-card divide-y rounded-lg border">
                {g.items.map((i) => (
                  <li key={i.id}>
                    <IngredientRow
                      ingredient={i}
                      onClick={() => setDialog({ mode: 'edit', ingredient: i })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <IngredientDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        ingredient={dialog?.mode === 'edit' ? dialog.ingredient : undefined}
        defaultName={dialog?.mode === 'add' ? (search.q ?? '') : undefined}
      />
    </>
  );
}

function IngredientRow({
  ingredient: i,
  onClick,
}: {
  ingredient: IngredientListItem;
  onClick: () => void;
}) {
  const conversion = conversionSummary(i);
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={i.archivedAt ? 'text-muted-foreground line-through' : 'font-medium'}>
            {i.name}
          </span>
          {i.isStaple && <Badge variant="secondary">staple</Badge>}
          {i.archivedAt && <Badge variant="outline">archived</Badge>}
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-xs">
          {conversion ?? 'No conversion data'}
        </div>
      </div>
      <div className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {i.recipeCount > 0 ? `${i.recipeCount} recipe${i.recipeCount === 1 ? '' : 's'}` : '—'}
      </div>
    </button>
  );
}
