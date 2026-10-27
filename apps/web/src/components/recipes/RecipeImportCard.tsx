import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, FileText, Image as ImageIcon, Link2, LoaderCircle, X } from 'lucide-react';
import { cn } from 'cn';
import {
  MAX_SCAN_FILES,
  MAX_SCAN_TOTAL_BYTES,
  RecipeImportRequestSchema,
  type RecipeImportDraft,
} from '@meal-planner/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { shrinkImage } from '@/lib/shrink-image';
import { useImportRecipe, useImportScan } from '@/queries/recipes.queries';
import { healthQuery } from '@/queries/system.queries';

type OnImported = (draft: RecipeImportDraft) => void;

/**
 * Fill the recipe form from a web link or from scans/photos of a paper card
 * (DESIGN §6.1). Nothing is saved until the form is.
 */
export function RecipeImportCard({ onImported }: { onImported: OnImported }) {
  const { data: health } = useQuery(healthQuery());
  const enabled = health?.features.recipeImport ?? false;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Import a recipe</CardTitle>
        <CardDescription>
          From a web link or a paper recipe card. Claude reads it and matches the ingredients to
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
          <Tabs defaultValue="link">
            <TabsList className="mb-3">
              <TabsTrigger value="link">
                <Link2 /> Web link
              </TabsTrigger>
              <TabsTrigger value="scan">
                <Camera /> Scan or photo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="link">
              <UrlImport enabled={enabled} onImported={onImported} />
            </TabsContent>
            <TabsContent value="scan">
              <ScanImport enabled={enabled} onImported={onImported} />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function UrlImport({ enabled, onImported }: { enabled: boolean; onImported: OnImported }) {
  const importRecipe = useImportRecipe();
  const [url, setUrl] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

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
          <Busy pending={importRecipe.isPending} label="Import" />
        </Button>
      </div>
      <Status pending={importRecipe.isPending} error={error} />
    </form>
  );
}

function ScanImport({ enabled, onImported }: { enabled: boolean; onImported: OnImported }) {
  const importScan = useImportScan();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || importScan.isPending;

  const add = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setProblem(null);
    setPreparing(true);
    try {
      const shrunk = await Promise.all([...picked].map(shrinkImage));
      const next = [...files, ...shrunk];
      if (next.length > MAX_SCAN_FILES) {
        setProblem(`One recipe at a time: up to ${MAX_SCAN_FILES} files.`);
      }
      setFiles(next.slice(0, MAX_SCAN_FILES));
    } finally {
      setPreparing(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return setProblem('Add a scan or photo first.');
    if (files.reduce((n, f) => n + f.size, 0) > MAX_SCAN_TOTAL_BYTES) {
      return setProblem('Those files add up to more than 20 MB. Try a lower-resolution scan.');
    }
    setProblem(null);
    importScan.mutate(files, {
      onSuccess: (draft) => {
        setFiles([]);
        onImported(draft);
      },
    });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void add(e.dataTransfer.files);
  };

  const error = problem ?? (importScan.isError ? importScan.error.message : null);

  return (
    <form onSubmit={submit} className="grid gap-2" noValidate>
      {files.length < MAX_SCAN_FILES && (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex items-center gap-3 rounded-lg border border-dashed p-4 text-left text-sm transition-colors',
            'hover:bg-muted/50 focus-visible:ring-ring/50 outline-none focus-visible:ring-3 disabled:opacity-50',
            dragging && 'border-primary bg-muted',
          )}
        >
          <Camera className="text-muted-foreground size-5 shrink-0" />
          <span>
            <span className="block font-medium">
              {files.length === 0 ? 'Take a photo or choose a scan' : 'Add the other side'}
            </span>
            <span className="text-muted-foreground block text-xs">
              PDF or photo; front and back of one card ({MAX_SCAN_FILES} files max)
            </span>
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        // image/* lets phones offer the camera; iPhones convert HEIC to JPEG for it.
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        aria-label="Recipe scans or photos"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = ''; // so picking the same file again still fires
        }}
      />

      {files.length > 0 && (
        <ul className="grid gap-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            >
              {f.type === 'application/pdf' ? (
                <FileText className="text-muted-foreground size-4 shrink-0" />
              ) : (
                <ImageIcon className="text-muted-foreground size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {formatSize(f.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${f.name}`}
                disabled={busy}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="submit"
        className="h-9 justify-self-start"
        disabled={busy || !enabled || files.length === 0}
      >
        <Busy pending={importScan.isPending} label="Read recipe" />
      </Button>
      <Status pending={importScan.isPending} error={error} />
    </form>
  );
}

function Busy({ pending, label }: { pending: boolean; label: string }) {
  return pending ? (
    <>
      <LoaderCircle className="animate-spin" /> Reading…
    </>
  ) : (
    label
  );
}

function Status({ pending, error }: { pending: boolean; error: string | null }) {
  if (pending) {
    return (
      <p className="text-muted-foreground text-xs">
        Reading the recipe. This can take up to a minute.
      </p>
    );
  }
  return error ? <p className="text-destructive text-xs">{error}</p> : null;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
