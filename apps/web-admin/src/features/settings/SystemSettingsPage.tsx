import { Stack } from '@care/ui';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSections } from '../../components/AdminSections';
import { EscalationSettingsPage } from '../escalation/EscalationSettingsPage';
import { GuidesPage } from '../guides/GuidesPage';
import { QuickRepliesPage } from '../quick-replies/QuickRepliesPage';

/** System-wide settings that change how CARE behaves for everyone, one per tab. */
export function SystemSettingsPage() {
  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Konfigurasi"
        title="Pengaturan Sistem"
        description="Kalender kerja dan eskalasi, jawaban cepat responder, dan panduan aplikasi."
      />
      <AdminSections
        label="Bagian Pengaturan Sistem"
        sections={[
          {
            value: 'escalation',
            label: 'Kalender & Eskalasi',
            content: <EscalationSettingsPage />,
          },
          { value: 'quick-replies', label: 'Jawaban Cepat', content: <QuickRepliesPage /> },
          { value: 'guides', label: 'Panduan', content: <GuidesPage /> },
        ]}
      />
    </Stack>
  );
}
