import { ReviewClient } from '@/components/pages/ReviewClient';

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  return <ReviewClient gameId={game ?? ''} />;
}
