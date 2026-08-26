import { Monitor, WifiOff } from 'lucide-react';
import { type ReactNode } from 'react';
import { EmptyState } from './feedback.js';

export function AppShell({
  sidebar,
  topbar,
  children,
  bottomNav,
  density = 'comfortable',
}: {
  sidebar?: ReactNode;
  topbar?: ReactNode;
  children: ReactNode;
  bottomNav?: ReactNode;
  density?: 'compact' | 'comfortable' | 'roomy';
}) {
  return (
    <div className="care-app-shell" data-density={density}>
      {sidebar}
      {topbar ? <header className="care-app-shell__topbar">{topbar}</header> : null}
      <main className="care-app-shell__content">{children}</main>
      {bottomNav}
    </div>
  );
}
export function DesktopOnlyGate({ matches, children }: { matches: boolean; children: ReactNode }) {
  return matches ? (
    children
  ) : (
    <main className="care-desktop-gate">
      <EmptyState
        icon={<Monitor />}
        title="CARE Admin memerlukan layar desktop"
        description="Gunakan layar dengan lebar minimal 1280 px untuk membuka data dan fungsi administrasi."
      />
    </main>
  );
}
export function OfflineFallback() {
  return (
    <main className="care-offline-fallback">
      <EmptyState
        icon={<WifiOff />}
        title="CARE tidak dapat terhubung"
        description="App shell tersedia, tetapi data terbaru dan seluruh tindakan membutuhkan koneksi. Periksa jaringan lalu coba lagi."
        action={
          <button
            type="button"
            className="care-button care-button--primary care-button--md"
            onClick={() => window.location.reload()}
          >
            Coba lagi
          </button>
        }
      />
    </main>
  );
}
