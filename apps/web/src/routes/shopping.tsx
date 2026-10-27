import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageHeader } from '@/components/PageHeader';

export const Route = createFileRoute('/shopping')({
  component: () => (
    <>
      <PageHeader title="Shopping list">
        Everything for this week, grouped by store section.
      </PageHeader>
      <ComingSoon what="This week's combined shopping list" />
    </>
  ),
});
