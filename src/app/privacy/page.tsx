import { BackLink, PageShell } from '@/components/Shell';
import { PrivacyContent } from '@/components/pages/PrivacyContent';
import { retentionDays } from '@/lib/config';

export const metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <PageShell>
      <BackLink href="/" />
      <PrivacyContent days={retentionDays()} />
    </PageShell>
  );
}
