import { CropClient } from '@/components/pages/CropClient';

export default async function CropPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CropClient id={id} />;
}
