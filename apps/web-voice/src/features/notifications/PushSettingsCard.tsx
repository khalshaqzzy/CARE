import { Alert, Badge, Button, DisclosureRow, SettingsGroup, Stack, Switch } from '@care/ui';
import { BellRing, Smartphone } from 'lucide-react';
import { formatDateTime } from '../../lib/formatters';
import { pushFailureGuidance } from '../../lib/push-errors';
import { resolvePushSettingsView } from './push-settings-state';
import { useWebPush } from './use-web-push';

/**
 * Workforce Web Push opt-in/opt-out. The in-app Notification Center is always
 * authoritative; push is best-effort after an explicit user gesture. Every
 * degraded path is surfaced as guidance rather than a silent failure, and each
 * failure carries the action that can actually resolve it — a dismissed prompt
 * on Android, a browser-level block, an unavailable device push service, or a
 * server-side rejection. The collapsed row matches the notification-center
 * concept; the body stays open by default so states and the switch remain
 * reachable without extra taps.
 */
export function PushSettingsCard() {
  const web = useWebPush();
  const view = resolvePushSettingsView(web);
  const platform = web.platform;
  // States that already render this guidance must not also show the raw last
  // failure as a second, identical alert.
  const viewOwnsGuidance =
    view === 'unconfigured' ||
    view === 'unsupported' ||
    view === 'denied' ||
    view === 'permission-blocked';

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
      {web.failure && !viewOwnsGuidance ? (
        <Alert
          tone={web.failure.retryable ? 'warning' : 'danger'}
          title={web.failure.title}
          actions={
            web.failure.retryable ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={web.busy}
                onClick={() => web.setEnabled(true)}
              >
                Coba lagi
              </Button>
            ) : undefined
          }
        >
          {web.failure.body}
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
        <Alert tone="info" title={pushFailureGuidance('unsupported', platform).title}>
          {pushFailureGuidance('unsupported', platform).body}
        </Alert>
      ) : view === 'unconfigured' ? (
        <Alert tone="warning" title={pushFailureGuidance('unconfigured', platform).title}>
          {pushFailureGuidance('unconfigured', platform).body}
        </Alert>
      ) : view === 'denied' ? (
        <Alert tone="warning" title={pushFailureGuidance('permission-denied', platform).title}>
          {pushFailureGuidance('permission-denied', platform).body}
        </Alert>
      ) : view === 'permission-blocked' ? (
        <Alert
          tone="warning"
          title={pushFailureGuidance('permission-dismissed', platform).title}
          actions={
            <Button
              size="sm"
              variant="secondary"
              disabled={web.busy}
              onClick={() => web.setEnabled(true)}
            >
              Coba lagi
            </Button>
          }
        >
          {pushFailureGuidance('permission-dismissed', platform).body}
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

      {view === 'toggle' || view === 'denied' || view === 'permission-blocked' ? (
        <DisclosureRow
          title="Detail teknis"
          description="Untuk membantu admin CARE bila push gagal."
        >
          <dl className="push-settings__diagnostics">
            <div>
              <dt>Izin browser</dt>
              <dd>{web.permission}</dd>
            </div>
            <div>
              <dt>Service worker</dt>
              <dd>
                {web.diagnostics.serviceWorkerFailed
                  ? 'gagal didaftarkan'
                  : web.diagnostics.serviceWorkerSupported
                    ? 'aktif'
                    : 'tidak didukung'}
              </dd>
            </div>
            <div>
              <dt>Penyedia push</dt>
              <dd>{web.diagnostics.providerHost ?? 'belum terdaftar'}</dd>
            </div>
            <div>
              <dt>Terdaftar di server</dt>
              <dd>{web.diagnostics.installationRegistered ? 'ya' : 'belum'}</dd>
            </div>
            <div>
              <dt>Kegagalan terakhir</dt>
              <dd>{web.lastFailure ?? 'tidak ada'}</dd>
            </div>
          </dl>
        </DisclosureRow>
      ) : null}
    </DisclosureRow>
  );
}
