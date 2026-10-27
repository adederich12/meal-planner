import type { ReactNode } from 'react';

export function PageHeader({
  title,
  children,
  actions,
}: {
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <div className="text-muted-foreground mt-1 text-sm">{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ComingSoon({ what }: { what: string }) {
  return (
    <div className="bg-card text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
      {what} will live here.
    </div>
  );
}
