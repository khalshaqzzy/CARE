import type { components } from '@care/contracts';

export type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
export type AppErrorKind =
  | 'unauthenticated'
  | 'validation'
  | 'not-found'
  | 'permission'
  | 'conflict'
  | 'rate-limited'
  | 'offline'
  | 'unknown';

export class FrontendError extends Error {
  constructor(
    public readonly kind: AppErrorKind,
    message: string,
    public readonly code: string,
    public readonly correlationId?: string,
    public readonly fieldErrors: ErrorEnvelope['errors'] = [],
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FrontendError';
  }
}

export function normalizeApiError(error: unknown, status?: number): FrontendError {
  if (error instanceof FrontendError) return error;
  const value = typeof error === 'object' && error ? (error as Partial<ErrorEnvelope>) : {};
  const code = typeof value.code === 'string' ? value.code : 'UNKNOWN_ERROR';
  const message =
    typeof value.message === 'string' ? value.message : 'Permintaan tidak dapat diproses.';
  const kind: AppErrorKind =
    status === 401 || code === 'UNAUTHENTICATED'
      ? 'unauthenticated'
      : status === 400 || code === 'VALIDATION_ERROR'
        ? 'validation'
        : status === 404 || code === 'NOT_FOUND'
          ? 'not-found'
          : status === 403 || code === 'FORBIDDEN' || code === 'PERMISSION_DENIED'
            ? 'permission'
            : status === 409 || code.includes('CONFLICT')
              ? 'conflict'
              : status === 429 || code === 'RATE_LIMITED'
                ? 'rate-limited'
                : 'unknown';
  return new FrontendError(
    kind,
    message,
    code,
    value.correlationId,
    Array.isArray(value.errors) ? value.errors : [],
    value.meta,
  );
}

export const offlineError = () =>
  new FrontendError(
    'offline',
    'Tindakan membutuhkan koneksi. Tidak ada perubahan yang diantrekan.',
    'OFFLINE_MUTATION_BLOCKED',
  );
