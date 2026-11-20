import { PartyPlayClient } from '@/components/pages/PartyPlayClient';

export default async function PartyPlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PartyPlayClient code={code.toUpperCase()} />;
}
