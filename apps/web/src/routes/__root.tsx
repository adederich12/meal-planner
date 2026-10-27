import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { BookOpen, CalendarDays, Carrot, Settings, ShoppingCart } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { healthQuery } from '@/queries/system.queries';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

const NAV = [
  { to: '/', label: 'Planner', icon: CalendarDays },
  { to: '/recipes', label: 'Recipes', icon: BookOpen },
  { to: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/ingredients', label: 'Ingredients', icon: Carrot },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

/**
 * Sidebar on wide screens; a bottom tab bar on phones, where it's in thumb
 * reach while standing in a grocery aisle.
 */
function RootLayout() {
  return (
    <div className="bg-muted/30 flex min-h-dvh print:block print:bg-white">
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r md:flex print:hidden">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight">🥕 Meal Planner</div>
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-2.5 rounded-md px-3 py-2 text-sm"
              activeProps={{
                className: 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-5 py-4">
          <ApiStatus />
        </div>
      </aside>

      {/* Bottom padding on phones keeps content clear of the tab bar. */}
      <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-8 md:py-8 print:p-0">
        <Outlet />
      </main>

      <nav className="bg-background fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden print:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="text-muted-foreground flex flex-col items-center gap-1 py-2 text-[11px]"
            activeProps={{ className: 'text-foreground font-medium' }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>

      <Toaster richColors position="top-center" />
    </div>
  );
}

function ApiStatus() {
  const { data, isError } = useQuery(healthQuery());
  const label = isError ? 'API offline' : data ? `API v${data.version}` : 'Connecting…';
  const dot = isError ? 'bg-red-500' : data ? 'bg-emerald-500' : 'bg-muted-foreground/40';
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
      <a
        href="/docs"
        target="_blank"
        rel="noreferrer"
        className="ml-auto underline-offset-2 hover:underline"
      >
        API docs
      </a>
    </div>
  );
}
