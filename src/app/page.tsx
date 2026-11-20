import { HomeClient } from '@/components/pages/HomeClient';
import { demoModeEnabled } from '@/lib/config';

export default async function Home({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  return <HomeClient demo={demoModeEnabled()} google={google} />;
}
