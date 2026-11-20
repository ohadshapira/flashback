import { DetailsClient } from '@/components/pages/DetailsClient';

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailsClient id={id} />;
}
