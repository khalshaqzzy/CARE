import { OpenAI } from 'openai';

/**
 * Sanitized diagnostics for OpenAI-compatible provider failures.
 *
 * Produces a short, redacted reason that is safe to emit in deployment logs,
 * audit summaries, or error responses. It never includes the API key, the
 * request body, or the instructions/prompt content — prompts and full request
 * payloads are deliberately excluded (PRD §13.2, §26.5).
 */

const MAX_DETAIL_LENGTH = 300;

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=]+/gi,
  /\bsk-[A-Za-z0-9*_-]{4,}\b/g,
  /\b(api[_-]?key|authorization)\s*[:=]\s*[A-Za-z0-9._~+/-]{8,}/gi,
];

function scrub(value: string): string {
  let result = value;
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[redacted]');
  return result;
}

function typeName(error: Error): string {
  // OpenAI SDK error classes keep `name = 'Error'`; the constructor name carries
  // the distinct class (e.g. APIConnectionError vs APIError).
  return error.constructor?.name || error.name;
}

function causeMessage(cause: unknown): string | null {
  // System/network errors (for example `getaddrinfo ENOTFOUND <host>`) carry
  // the useful root cause as the wrapped error message.
  if (cause instanceof Error && cause.message) return cause.message;
  return null;
}

export function sanitizedErrorDetail(error: unknown): string | null {
  if (error instanceof OpenAI.APIConnectionError) {
    const cause = (error as { cause?: unknown }).cause;
    const detail = causeMessage(cause) ?? error.message;
    return scrub(`${typeName(error)}: ${detail}`).slice(0, MAX_DETAIL_LENGTH);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ? ` (status=${error.status})` : '';
    return scrub(`${typeName(error)}${status}: ${error.message}`).slice(0, MAX_DETAIL_LENGTH);
  }
  if (error instanceof Error) {
    return scrub(`${typeName(error)}: ${error.message}`).slice(0, MAX_DETAIL_LENGTH);
  }
  return null;
}
