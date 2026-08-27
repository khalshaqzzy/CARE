import { Alert, Badge, Card, Stack, Switch } from '@care/ui';
import { BellRing, Smartphone } from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import { useWebPush } from './use-web-push';

/**
 * Workforce Web Push opt-in/opt-out. The in-app Notification Center is always
 * authoritative; push is best-effort after an explicit user gesture. Every
 * degraded path is surfaced as guidance rather than a silent failure.
 */
export function PushSettingsCard() {
  const web = useWebPush();

  return (
    <Card className="push-settings">
      <div className="section-title-row">
        <h3 className="section-title">Notifikasi push</h3>
        <Badge tone={web.enabled ? 'success' : 'neutral'} icon={<BellRing size={14} />}>
          {web.enabled ? 'Aktif' : 'Nonaktif'}
        </Badge>
      </div>

      <p className="push-settings__intro">
        Dapatkan pemberitahuan singkat saat Voice Anda atau yang Anda tangani diperbarui. Pusat
        notifikasi di dalam aplikasi tetap menjadi sumber utama.
      </p>

      {web.error ? (
        <Alert tone="danger" title="Pengaturan push gagal diperbarui">
          {web.error instanceof Error ? web.error.message : 'Coba lagi dalam beberapa saat.'}
        </Alert>
      ) : null}

      {web.busy ? (
        <Alert tone="info" title="Memperbarui langganan notifikasi">
          Menyinkronkan perangkat Anda…
        </Alert>
      ) : null}

      {!web.supported ? (
        <Alert tone="info" title="Web Push tidak didukung di browser ini">
          Browser Anda tidak mendukung notifikasi push. Gunakan browser Chrome/Edge terbaru, atau
          aktifkan CARE dari layar beranda (iOS/iPadOS).
        </Alert>
      ) : !web.configured ? (
        <Alert tone="warning" title="Notifikasi push belum dikonfigurasi">
          Admin belum menyiapkan kunci push pada lingkungan ini. Pusat notifikasi di dalam aplikasi
          tetap tersedia.
        </Alert>
      ) : web.permission === 'denied' ? (
        <Alert tone="warning" title="Izin notifikasi ditolak">
          Aktifkan izin notifikasi CARE melalui pengaturan browser, lalu kembali ke halaman ini
          untuk mengaktifkan push.
        </Alert>
      ) : web.ios === false || web.standalone === true ? (
        <Stack gap="md">
          <Switch
            checked={web.enabled}
            onCheckedChange={(next) => web.setEnabled(next)}
            label={web.enabled ? 'Notifikasi push aktif' : 'Aktifkan notifikasi push'}
            description={
              web.enabled
                ? `Terdaftar pada ${web.subscriptionCount} perangkat.`
                : 'Izinkan CARE untuk mengirim pemberitahuan singkat.'
            }
          />
          {web.enabled && web.subscriptions.length > 0 ? (
            <ul className="push-settings__devices">
              {web.subscriptions.map((subscription) => (
                <li key={subscription.id}>
                  <Smartphone size={16} aria-hidden="true" />
                  <span>
                    <strong>{subscription.installationId}</strong>
                    <small>
                      {subscription.lastSuccessAt
                        ? `Terakhir terkirim ${formatDateTime(subscription.lastSuccessAt)}`
                        : 'Menunggu pengiriman pertama'}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Stack>
      ) : (
        <Alert tone="info" title="Aktifkan dari layar beranda (iOS)">
          Notifikasi push hanya berjalan saat CARE dipasang ke layar beranda. Pilih “Tambahkan ke
          Layar Utama”, lalu buka dari sana.
        </Alert>
      )}
    </Card>
  );
}
