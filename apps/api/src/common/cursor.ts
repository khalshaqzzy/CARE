import { Buffer } from 'node:buffer';
import { hmac256, safeEqual } from './crypto';
import { badRequest } from './errors';
import { loadConfig } from '../config';

export function encodeCursor(id: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, id }), 'utf8').toString('base64url');
  const signature = hmac256(loadConfig().CURSOR_SIGNING_SECRET, payload);
  return `${payload}.${signature}`;
}

export function decodeCursor(cursor: string): string {
  const [payload, signature, extra] = cursor.split('.');
  if (!payload || !signature || extra) throw invalidCursor();
  const expected = hmac256(loadConfig().CURSOR_SIGNING_SECRET, payload);
  if (!safeEqual(signature, expected)) throw invalidCursor();
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (
      !value ||
      typeof value !== 'object' ||
      !('v' in value) ||
      value.v !== 1 ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      value.id.length > 100
    )
      throw invalidCursor();
    return value.id;
  } catch (error) {
    if (error instanceof Error && 'code' in error) throw error;
    throw invalidCursor();
  }
}

function invalidCursor() {
  return badRequest('INVALID_CURSOR', 'Cursor is invalid or expired');
}
