import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageHeader } from '@/components/PageHeader';

export const Route = createFileRoute('/recipes/')({
  component: () => (
    <>
      <PageHeader title="Recipes">Your recipe collection.</PageHeader>
      <ComingSoon what="Recipe search and list" />
    </>
  ),
});
