import { Alert, Badge, DisclosureRow, SettingsGroup, Stack, Switch } from '@care/ui';
import { BellRing, Smartphone } from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import { resolvePushSettingsView } from './push-settings-state';
import { useWebPush } from './use-web-push';

/**
 * Workforce Web Push opt-in/opt-out. The in-app Notification Center is always
 * authoritative; push is best-effort after an explicit user gesture. Every
 * degraded path is surfaced as guidance rather than a silent failure. The
 * collapsed row matches the notification-center concept; the body stays open
 * by default so states and the switch remain reachable without extra taps.
 */
export function PushSettingsCard() {
  const web = useWebPush();
  const view = resolvePushSettingsView(web);

  return (
    <DisclosureRow
      className="push-settings"
      icon={<BellRing size={16} />}
      title="Notifikasi push"
      description="Pemberitahuan singkat saat Voice Anda diperbarui."
      trailing={
        <Badge tone={web.enabled ? 'success' : 'neutral'} icon={<BellRing size={14} />}>
          {web.enabled ? 'Aktif' : 'Nonaktif'}
        </Badge>
      }
      defaultOpen
    >
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

      {view === 'ios-upgrade' ? (
        <Alert tone="info" title="Web Push memerlukan iOS 16.4 atau lebih baru">
          Perangkat ini tetap dapat memakai seluruh fitur online dan Pusat notifikasi CARE. Perbarui
          iOS untuk menerima notifikasi saat CARE sedang ditutup.
        </Alert>
      ) : view === 'ios-install' ? (
        <Alert tone="info" title="Aktifkan dari layar beranda (iOS)">
          Notifikasi push hanya berjalan saat CARE dipasang ke layar beranda. Pilih “Tambahkan ke
          Layar Utama”, lalu buka CARE dari ikonnya.
        </Alert>
      ) : view === 'unsupported' ? (
        <Alert tone="info" title="Web Push tidak didukung di browser ini">
          Browser Anda tidak mendukung notifikasi push. Gunakan browser Chrome/Edge terbaru, atau
          aktifkan CARE dari layar beranda (iOS/iPadOS).
        </Alert>
      ) : view === 'unconfigured' ? (
        <Alert tone="warning" title="Notifikasi push belum dikonfigurasi">
          Admin belum menyiapkan kunci push pada lingkungan ini. Pusat notifikasi di dalam aplikasi
          tetap tersedia.
        </Alert>
      ) : view === 'denied' ? (
        <Alert tone="warning" title="Izin notifikasi ditolak">
          Aktifkan izin notifikasi CARE melalui pengaturan browser, lalu kembali ke halaman ini
          untuk mengaktifkan push.
        </Alert>
      ) : view === 'toggle' ? (
        <Stack gap="md">
          <SettingsGroup className="push-settings__toggle">
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
          </SettingsGroup>
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
      ) : null}
    </DisclosureRow>
  );
}
