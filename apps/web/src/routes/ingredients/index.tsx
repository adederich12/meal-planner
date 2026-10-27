import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon, PageHeader } from '@/components/PageHeader';

export const Route = createFileRoute('/ingredients/')({
  component: () => (
    <>
      <PageHeader title="Ingredients">The catalog every recipe draws from.</PageHeader>
      <ComingSoon what="The ingredient catalog" />
    </>
  ),
});
