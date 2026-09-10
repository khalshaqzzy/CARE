import { FrontendError } from '@care/frontend-core';

export function authFailureMessage(cause: unknown, mode: 'login' | 'reset') {
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || cause instanceof TypeError)
    return 'Koneksi terputus. Periksa internet Anda, lalu coba kembali.';
  if (cause instanceof FrontendError) {
    if (cause.kind === 'rate-limited')
      return 'Terlalu banyak percobaan. Silakan coba kembali dalam 15 menit.';
    if (cause.kind === 'offline') return 'Periksa koneksi internet Anda, lalu coba kembali.';
    if (cause.code === 'PASSWORD_RESET_UNAVAILABLE')
      return 'Reset Password belum tersedia untuk akun Anda.';
    if (cause.code === 'RESET_VERIFICATION_FAILED')
      return 'No. Reg atau tanggal lahir tidak sesuai. Periksa kembali data Anda.';
    if (['LOGIN_IDENTIFIER_INVALID', 'RESET_IDENTIFIER_INVALID'].includes(cause.code))
      return 'No. Reg atau username tidak dapat digunakan. Periksa kembali input Anda.';
    if (cause.kind === 'unauthenticated') return 'No. Reg, username, atau password tidak sesuai.';
    if (cause.kind === 'validation' && mode === 'reset') return 'Pilih tanggal lahir yang valid.';
  }
  return mode === 'login'
    ? 'Login belum berhasil. Silakan coba kembali.'
    : 'Password belum direset. Silakan coba kembali.';
}
