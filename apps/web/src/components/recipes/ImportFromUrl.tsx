import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, LoaderCircle } from 'lucide-react';
import { RecipeImportRequestSchema, type RecipeImportDraft } from '@meal-planner/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useImportRecipe } from '@/queries/recipes.queries';
import { healthQuery } from '@/queries/system.queries';

/**
 * Paste a recipe link; the API reads it and the draft fills the form below
 * for review (DESIGN §6). Nothing is saved until the form is.
 */
export function ImportFromUrl({ onImported }: { onImported: (draft: RecipeImportDraft) => void }) {
  const { data: health } = useQuery(healthQuery());
  const importRecipe = useImportRecipe();
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const enabled = health?.features.recipeImport ?? false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = RecipeImportRequestSchema.safeParse({ url: url.trim() });
    if (!parsed.success) {
      setInvalid(parsed.error.issues[0]?.message ?? 'Enter a web address');
      return;
    }
    setInvalid(null);
    importRecipe.mutate(parsed.data.url, {
      onSuccess: (draft) => {
        setUrl('');
        onImported(draft);
      },
    });
  };

  const error = invalid ?? (importRecipe.isError ? importRecipe.error.message : null);

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Import from a website</CardTitle>
        <CardDescription>
          Paste a recipe link to fill in the form. Claude splits the ingredients and matches them to
          your catalog; you review everything before saving.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {health && !enabled ? (
          <p className="text-muted-foreground text-sm">
            Import is off. Add <code className="text-foreground">ANTHROPIC_API_KEY</code> to{' '}
            <code className="text-foreground">.env</code> and restart the app to turn it on.
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-2" noValidate>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InputGroup className="h-9 flex-1">
                <InputGroupInput
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  aria-label="Recipe web address"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={importRecipe.isPending}
                  aria-invalid={Boolean(error) || undefined}
                />
                <InputGroupAddon>
                  <Link2 />
                </InputGroupAddon>
              </InputGroup>
              <Button type="submit" className="h-9" disabled={importRecipe.isPending || !enabled}>
                {importRecipe.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" /> Reading…
                  </>
                ) : (
                  'Import'
                )}
              </Button>
            </div>
            {importRecipe.isPending ? (
              <p className="text-muted-foreground text-xs">
                Reading the recipe. This can take up to a minute.
              </p>
            ) : error ? (
              <p className="text-destructive text-xs">{error}</p>
            ) : null}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
