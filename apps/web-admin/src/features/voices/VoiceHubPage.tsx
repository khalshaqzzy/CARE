import { Stack } from '@care/ui';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSections } from '../../components/AdminSections';
import { AdminHandoverQueuePage } from '../handovers/AdminHandoverPage';
import { CategoryCorrectionsPage } from '../remediation/CategoryCorrections';
import { VoiceExplorerPage } from './VoiceExplorerPage';

/**
 * CARE Admin's Voice workspace: browsing every Voice, the Manager → Admin
 * handover queue, and category corrections, each on its own tab.
 */
export function VoiceHubPage({ pendingHandovers }: { pendingHandovers: string | null }) {
  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Voice"
        title="Voice Explorer"
        description="Seluruh Voice, antrean handover ke Admin, dan koreksi kategori."
      />
      <AdminSections
        label="Bagian Voice Explorer"
        sections={[
          { value: 'voices', label: 'Semua Voice', content: <VoiceExplorerPage /> },
          {
            value: 'handovers',
            label: pendingHandovers ? `Handover Admin (${pendingHandovers})` : 'Handover Admin',
            content: <AdminHandoverQueuePage />,
          },
          {
            value: 'corrections',
            label: 'Koreksi Kategori',
            content: <CategoryCorrectionsPage />,
          },
        ]}
      />
    </Stack>
  );
}
