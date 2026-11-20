import { NewGameClient } from '@/components/pages/NewGameClient';

export default async function NewGamePage({ searchParams }: { searchParams: Promise<{ mode?: string; swap?: string }> }) {
  const { mode, swap } = await searchParams;
  const initial = mode === 'party' ? 'party' : mode === 'partners' ? 'partners' : mode === 'family-shared' || mode === 'family_shared' ? 'family_shared' : 'couple';
  return <NewGameClient initialMode={initial} swap={swap === '1'} />;
}
