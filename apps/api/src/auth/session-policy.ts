import type { Response } from 'express';
import { loadConfig } from '../config';

const DAY = 86_400_000;
// The rolling expiry and its cookie advance in whole-day steps, not on every request.
const RENEWAL_STEP = DAY;

/**
 * Sessions of every account kind persist until logout (or a security revocation)
 * so Web Push and the installed apps keep working; they end only after a long
 * period without use.
 */
const inactiveWindow = () => loadConfig().SESSION_INACTIVE_DAYS * DAY;

export function initialSessionExpiry(now: number) {
  const end = new Date(now + inactiveWindow());
  return { expiresAt: end, absoluteExpiresAt: end };
}

/** The expiry after an authenticated request; `renewed` means the cookie must be re-issued. */
export function refreshedSessionExpiry(absoluteExpiresAt: Date, now: number) {
  const candidate = now + inactiveWindow();
  const renewed = candidate - absoluteExpiresAt.getTime() >= RENEWAL_STEP;
  const absolute = renewed ? new Date(candidate) : absoluteExpiresAt;
  return { expiresAt: absolute, absoluteExpiresAt: absolute, renewed };
}

export function setSessionCookie(response: Response, token: string, expires: Date) {
  const config = loadConfig();
  response.cookie(config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.NODE_ENV !== 'development' && config.NODE_ENV !== 'test',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}
