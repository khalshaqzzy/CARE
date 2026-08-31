import { getBrowserCapabilities } from './lib/browser-capabilities.js';
import './styles.css';

declare global {
  interface Window {
    __CARE_BOOT__?: {
      markMounted(): void;
      showUnsupported(message: string): void;
      showFailure(): void;
    };
  }
}

const capabilities = getBrowserCapabilities();
const isDesignRoute =
  window.location.pathname === '/design' || window.location.pathname.startsWith('/design/');
const legacyDesignRoute =
  isDesignRoute && capabilities.ios && (capabilities.iosVersion?.major ?? 0) < 16;

if (!capabilities.coreSupported || legacyDesignRoute) {
  const message = legacyDesignRoute
    ? 'Design system CARE memerlukan Safari versi terbaru. Aplikasi utama tetap dapat digunakan.'
    : capabilities.reason === 'ios-too-old'
      ? 'CARE memerlukan iOS 11.3 atau versi yang lebih baru.'
      : 'Browser ini tidak menyediakan fitur dasar yang diperlukan CARE.';
  window.__CARE_BOOT__?.showUnsupported(message);
} else {
  import('./bootstrap-app.js')
    .then(({ mountCareApp }) => mountCareApp(isDesignRoute))
    .catch(() => window.__CARE_BOOT__?.showFailure());
}
