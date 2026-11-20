import { PhotosClient } from '@/components/pages/PhotosClient';

export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ game?: string; google?: string }> }) {
  const { game, google } = await searchParams;
  return <PhotosClient gameId={game ?? ''} googleFlag={google ?? null} />;
}
