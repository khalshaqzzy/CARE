/**
 * Pure mapping from a Web Push opt-in failure to user guidance.
 *
 * The setup path can fail in ways that look identical in a generic alert but
 * need different actions: a dismissed permission dialog, a browser-level block,
 * a device that cannot reach its push service (common on Android without
 * Google Play Services or in incognito), an endpoint provider the server does
 * not allow, or a server-side failure. Channel-specific copy lives here so the
 * card stays presentational and the mapping is unit-testable.
 */

import { FrontendError } from '@care/frontend-core';
import { BrowserPushSubscriptionError, type PushPlatform } from './push';

export type PushSetupFailureReason =
  | 'unconfigured'
  | 'unsupported'
  | 'permission-denied'
  | 'permission-dismissed'
  | 'push-service-unavailable'
  | 'subscription-conflict'
  | 'endpoint-not-allowed'
  | 'server-error'
  | 'offline'
  | 'unknown';

export type PushSetupGuidance = {
  reason: PushSetupFailureReason;
  title: string;
  body: string;
  retryable: boolean;
};

/** Failure raised inside the opt-in flow with an already-classified reason. */
export class PushSetupFailure extends Error {
  constructor(
    public readonly reason: PushSetupFailureReason,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PushSetupFailure';
  }
}

function guidanceFor(reason: PushSetupFailureReason, platform: PushPlatform): PushSetupGuidance {
  switch (reason) {
    case 'unconfigured':
      return {
        reason,
        title: 'Notifikasi push belum dikonfigurasi',
        body: 'Admin belum menyiapkan kunci push pada lingkungan ini. Pusat notifikasi di dalam aplikasi tetap tersedia.',
        retryable: false,
      };
    case 'unsupported':
      return {
        reason,
        title: 'Web Push tidak didukung di browser ini',
        body: 'Gunakan browser Chrome/Edge terbaru, atau aktifkan CARE dari layar beranda (iOS/iPadOS).',
        retryable: false,
      };
    case 'permission-denied':
      return {
        reason,
        title: 'Izin notifikasi diblokir',
        body:
          platform === 'android'
            ? 'Buka ikon gembok pada address bar → Izin (Permissions) → Notifikasi → Setel ulang, lalu aktifkan lagi dari halaman ini. Jika masih gagal, aktifkan notifikasi untuk aplikasi Chrome di Pengaturan Android → Aplikasi → Chrome → Notifikasi.'
            : 'Aktifkan izin notifikasi CARE melalui pengaturan browser (ikon gembok pada address bar → Izin → Notifikasi), lalu kembali ke halaman ini.',
        retryable: true,
      };
    case 'permission-dismissed':
      return {
        reason,
        title: 'Izin notifikasi belum diberikan',
        body:
          platform === 'android'
            ? 'Dialog izin belum muncul atau ditutup. Ketuk sakelar sekali lagi dan pilih “Izinkan” pada dialog Chrome. Bila dialog tetap tidak muncul, pastikan notifikasi aplikasi Chrome aktif di Pengaturan Android.'
            : 'Dialog izin belum muncul atau ditutup. Ketuk sakelar sekali lagi dan pilih “Izinkan”.',
        retryable: true,
      };
    case 'push-service-unavailable':
      return {
        reason,
        title: 'Pendaftaran push gagal di perangkat ini',
        body:
          platform === 'android'
            ? 'Chrome tidak dapat menghubungi layanan push perangkat (Google Play Services). Pastikan Chrome tidak dibuka dalam mode incognito, Google Play Services aktif, lalu coba lagi.'
            : 'Browser tidak dapat menghubungi layanan push perangkat. Pastikan browser tidak dalam mode privat, lalu coba lagi.',
        retryable: true,
      };
    case 'subscription-conflict':
      return {
        reason,
        title: 'Langganan lama perangkat ini tidak dapat dipakai',
        body: 'Tutup semua tab CARE, buka kembali aplikasi, lalu aktifkan notifikasi sekali lagi.',
        retryable: true,
      };
    case 'endpoint-not-allowed':
      return {
        reason,
        title: 'Penyedia push perangkat ini belum diizinkan',
        body: 'Server CARE belum mengizinkan layanan push dari browser ini. Laporkan nama dan versi browser yang Anda pakai ke admin CARE.',
        retryable: false,
      };
    case 'server-error':
      return {
        reason,
        title: 'Server gagal menyimpan langganan',
        body: 'Langganan perangkat tidak tersimpan. Coba lagi sebentar lagi; bila berulang, laporkan waktu kejadian ke admin CARE.',
        retryable: true,
      };
    case 'offline':
      return {
        reason,
        title: 'Tidak ada koneksi',
        body: 'Pendaftaran notifikasi membutuhkan koneksi. Sambungkan perangkat ke internet, lalu coba lagi.',
        retryable: true,
      };
    default:
      return {
        reason: 'unknown',
        title: 'Pengaturan push gagal diperbarui',
        body: 'Coba lagi dalam beberapa saat. Pusat notifikasi di dalam aplikasi tetap tersedia.',
        retryable: true,
      };
  }
}

function classify(error: unknown): PushSetupFailureReason {
  if (error instanceof PushSetupFailure) return error.reason;
  if (error instanceof FrontendError) {
    if (error.code === 'PUSH_ENDPOINT_NOT_ALLOWED') return 'endpoint-not-allowed';
    if (error.kind === 'offline' || error.code === 'OFFLINE_MUTATION_BLOCKED') return 'offline';
    if (error.code === 'INTERNAL_ERROR' || error.kind === 'unknown') return 'server-error';
    return 'unknown';
  }
  if (error instanceof BrowserPushSubscriptionError)
    return error.browserErrorName === 'MissingKeysError' ? 'push-service-unavailable' : 'unknown';
  if (error instanceof Error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      return 'permission-denied';
    if (error.name === 'InvalidStateError') return 'subscription-conflict';
    if (error.name === 'AbortError') return 'push-service-unavailable';
    if (/push service|registration failed|failed to subscribe/i.test(error.message))
      return 'push-service-unavailable';
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(error.message))
      return 'offline';
  }
  return 'unknown';
}

export function describePushSetupFailure(
  error: unknown,
  platform: PushPlatform = 'other',
): PushSetupGuidance {
  return guidanceFor(classify(error), platform);
}

/** Guidance for a reason the card needs to render directly (no error object). */
export function pushFailureGuidance(
  reason: PushSetupFailureReason,
  platform: PushPlatform = 'other',
): PushSetupGuidance {
  return guidanceFor(reason, platform);
}
