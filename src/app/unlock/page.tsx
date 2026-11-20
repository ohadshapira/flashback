import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnlockClient } from '@/components/pages/UnlockClient';
import { OWNER_COOKIE, tokenIsOwner } from '@/lib/owner';

export const metadata = { title: 'Unlock' };

export default async function UnlockPage() {
  if (tokenIsOwner((await cookies()).get(OWNER_COOKIE)?.value)) redirect('/new'); // not locked, or already unlocked
  return <UnlockClient />;
}
