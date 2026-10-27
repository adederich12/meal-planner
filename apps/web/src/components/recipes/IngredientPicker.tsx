import { useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from 'cn';
import type { Ingredient, IngredientCategory, IngredientListItem } from '@meal-planner/shared';
import { IngredientDialog } from '@/components/ingredients/IngredientDialog';
import { CATEGORY_LABELS } from '@/components/ingredients/format';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Type-ahead over the catalog. When nothing matches exactly, offers to add
 * what was typed as a new ingredient, then selects it.
 */
export function IngredientPicker({
  id,
  value,
  onChange,
  catalog,
  invalid,
  suggestion,
}: {
  id?: string;
  value: string;
  onChange: (ingredientId: string) => void;
  /** The full catalog, archived included (so existing lines can show their name). */
  catalog: IngredientListItem[];
  invalid?: boolean;
  /** From an import: what to add to the catalog when nothing matched. */
  suggestion?: { name: string; category: IngredientCategory } | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  // Bridges the moment between creating an ingredient and the catalog refetch.
  const [justCreated, setJustCreated] = useState<Ingredient | null>(null);

  const selected =
    catalog.find((i) => i.id === value) ?? (justCreated?.id === value ? justCreated : undefined);
  const pickable = catalog.filter((i) => !i.archivedAt);
  const typed = search.trim();
  const exactMatch = pickable.some((i) => i.name.toLowerCase() === typed.toLowerCase());

  // The suggested name may already be in the catalog (added for another line).
  const suggestedMatch =
    suggestion && pickable.find((i) => i.name.toLowerCase() === suggestion.name.toLowerCase());
  const [creatingCategory, setCreatingCategory] = useState<IngredientCategory | undefined>();

  const choose = (ingredientId: string) => {
    onChange(ingredientId);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.name : 'Choose ingredient'}
              {selected?.archivedAt && ' (archived)'}
            </span>
            <ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search or add…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>Not in the catalog yet.</CommandEmpty>
              <CommandGroup>
                {pickable.map((i) => (
                  <CommandItem
                    key={i.id}
                    value={i.name}
                    keywords={[CATEGORY_LABELS[i.category]]}
                    data-checked={i.id === value}
                    onSelect={() => choose(i.id)}
                  >
                    <span className="flex-1 truncate">{i.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {CATEGORY_LABELS[i.category]}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              {typed && !exactMatch && (
                <CommandGroup forceMount>
                  <CommandItem
                    forceMount
                    value={`__create__ ${typed}`}
                    onSelect={() => {
                      setCreating(typed);
                      setOpen(false);
                    }}
                  >
                    <Plus />
                    Add “{typed}” to the catalog
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!selected && suggestion && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto justify-self-start px-0"
          onClick={() => {
            if (suggestedMatch) return choose(suggestedMatch.id);
            setCreatingCategory(suggestion.category);
            setCreating(suggestion.name);
          }}
        >
          {suggestedMatch
            ? `Use “${suggestedMatch.name}”`
            : `+ Add “${suggestion.name}” to the catalog`}
        </Button>
      )}

      <IngredientDialog
        open={creating !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(null);
            setCreatingCategory(undefined);
          }
        }}
        defaultName={creating ?? ''}
        defaultCategory={creatingCategory}
        onSaved={(ingredient) => {
          setJustCreated(ingredient);
          choose(ingredient.id);
        }}
      />
    </>
  );
}
