import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { OWNER_COOKIE, tokenIsOwner } from '@/lib/owner';

/** Creating games is the owner's job: with OWNER_PASSCODE set, every /new page needs the owner cookie. */
export default async function NewLayout({ children }: { children: React.ReactNode }) {
  if (!tokenIsOwner((await cookies()).get(OWNER_COOKIE)?.value)) redirect('/unlock');
  return children;
}
