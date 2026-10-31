import type { components } from '@care/contracts';
import { Alert, EmptyState, SettingsGroup, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, FileText, PlayCircle } from 'lucide-react';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';

type Guide = components['schemas']['GuideList']['items'][number];

function sizeLabel(bytes: number) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

/** "YouTube", "Google Drive", … from the link, so members know where it opens. */
export function videoSource(url: string) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YouTube';
  if (host === 'drive.google.com') return 'Google Drive';
  if (host.endsWith('sharepoint.com')) return 'SharePoint';
  return host;
}

function GuideRow({ guide }: { guide: Guide }) {
  const video = guide.kind === 'VIDEO';
  return (
    <a
      className="care-settings-row"
      href={video ? guide.videoUrl! : `/api/v1/guides/${guide.id}/file`}
      target="_blank"
      rel={video ? 'noopener noreferrer' : 'noopener'}
    >
      <span
        className={`care-settings-row__icon${video ? ' guide-row__icon--video' : ''}`}
        aria-hidden="true"
      >
        {video ? <PlayCircle size={16} /> : <FileText size={16} />}
      </span>
      <span className="care-settings-row__text">
        <strong>{guide.title}</strong>
        <small>
          {video
            ? `Video · ${videoSource(guide.videoUrl!)}`
            : `PDF · ${sizeLabel(guide.size ?? 0)}`}
        </small>
      </span>
      <ExternalLink size={16} className="care-settings-row__chevron" aria-hidden="true" />
    </a>
  );
}

/**
 * Guides managed in CARE Admin; the API returns only the ones for this
 * account's role, grouped as Dokumen and Video. PDFs open in the device viewer,
 * videos at their host.
 */
export function GuidePage() {
  const api = useApi();
  const sessionId = useSessionId();
  const guides = useQuery({ queryKey: voiceQuery(sessionId, 'guides'), queryFn: api.guides });
  const items = guides.data?.items ?? [];
  // Documents first, then videos; each keeps the admin order.
  const groups = [
    { label: 'Dokumen', items: items.filter((guide) => guide.kind === 'PDF') },
    { label: 'Video', items: items.filter((guide) => guide.kind === 'VIDEO') },
  ].filter((group) => group.items.length);

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <h1>Panduan</h1>
      </header>
      {guides.isLoading ? (
        <Skeleton label="Memuat panduan" />
      ) : guides.error ? (
        <Alert tone="danger" title="Panduan gagal dimuat">
          Periksa koneksi lalu coba lagi.
        </Alert>
      ) : items.length ? (
        groups.map((group) => (
          <section key={group.label} className="guide-group">
            <h2 className="guide-group__title">{group.label}</h2>
            <SettingsGroup role="group" aria-label={group.label}>
              {group.items.map((guide) => (
                <GuideRow key={guide.id} guide={guide} />
              ))}
            </SettingsGroup>
          </section>
        ))
      ) : (
        <EmptyState
          icon={<BookOpen />}
          title="Belum ada panduan"
          description="Panduan akan tampil di sini."
        />
      )}
    </Stack>
  );
}
