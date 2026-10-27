import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageHeader } from '@/components/PageHeader';

export const Route = createFileRoute('/settings')({
  component: () => (
    <>
      <PageHeader title="Settings">Household size and week start.</PageHeader>
      <ComingSoon what="Settings" />
    </>
  ),
});
