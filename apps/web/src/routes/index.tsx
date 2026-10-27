import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageHeader } from '@/components/PageHeader';

export const Route = createFileRoute('/')({
  component: () => (
    <>
      <PageHeader title="This week">Plan meals for the week.</PageHeader>
      <ComingSoon what="The weekly planner" />
    </>
  ),
});
