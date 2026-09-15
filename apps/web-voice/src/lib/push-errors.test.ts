import { describe, expect, it } from 'vitest';
import { FrontendError } from '@care/frontend-core';
import { PushSetupFailure, describePushSetupFailure, pushFailureGuidance } from './push-errors';
import { BrowserPushSubscriptionError } from './push';

const reasonOf = (error: unknown, platform: 'android' | 'ios' | 'other' = 'other') =>
  describePushSetupFailure(error, platform).reason;

describe('push setup failure classification', () => {
  it('keeps the reason of an already classified failure', () => {
    expect(reasonOf(new PushSetupFailure('permission-dismissed', 'x'))).toBe(
      'permission-dismissed',
    );
  });

  it('classifies permission outcomes apart', () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    expect(reasonOf(denied)).toBe('permission-denied');
    expect(reasonOf(new PushSetupFailure('permission-dismissed', 'x'))).toBe(
      'permission-dismissed',
    );
  });

  it('classifies Android device push service failures', () => {
    const abort = Object.assign(new Error('Registration failed - push service error'), {
      name: 'AbortError',
    });
    expect(reasonOf(abort)).toBe('push-service-unavailable');
    expect(reasonOf(new Error('Registration failed - push service not available'))).toBe(
      'push-service-unavailable',
    );
    expect(reasonOf(new BrowserPushSubscriptionError('missing', 'MissingKeysError'))).toBe(
      'push-service-unavailable',
    );
  });

  it('classifies a stale subscription conflict', () => {
    expect(reasonOf(Object.assign(new Error('x'), { name: 'InvalidStateError' }))).toBe(
      'subscription-conflict',
    );
  });

  it('classifies API failures by error code', () => {
    expect(
      reasonOf(new FrontendError('validation', 'endpoint rejected', 'PUSH_ENDPOINT_NOT_ALLOWED')),
    ).toBe('endpoint-not-allowed');
    expect(
      reasonOf(new FrontendError('unknown', 'An internal error occurred', 'INTERNAL_ERROR')),
    ).toBe('server-error');
    expect(reasonOf(new FrontendError('offline', 'offline', 'OFFLINE_MUTATION_BLOCKED'))).toBe(
      'offline',
    );
  });

  it('classifies network failures', () => {
    expect(reasonOf(new TypeError('Failed to fetch'))).toBe('offline');
  });

  it('falls back to a retryable generic failure', () => {
    expect(reasonOf(new Error('something else'))).toBe('unknown');
    expect(reasonOf(undefined)).toBe('unknown');
    expect(describePushSetupFailure(undefined).retryable).toBe(true);
  });
});

describe('push setup guidance', () => {
  it('tells Android users where to re-enable a blocked permission', () => {
    const guidance = pushFailureGuidance('permission-denied', 'android');
    expect(guidance.title).toBe('Izin notifikasi diblokir');
    expect(guidance.body).toContain('Pengaturan Android');
    expect(guidance.retryable).toBe(true);
  });

  it('explains the Android push service requirement', () => {
    const guidance = pushFailureGuidance('push-service-unavailable', 'android');
    expect(guidance.body).toContain('Google Play Services');
    const desktop = pushFailureGuidance('push-service-unavailable', 'other');
    expect(desktop.body).not.toContain('Google Play Services');
    expect(desktop.retryable).toBe(true);
  });

  it('asks for a dismissed prompt to be retried', () => {
    const guidance = pushFailureGuidance('permission-dismissed', 'android');
    expect(guidance.retryable).toBe(true);
    expect(guidance.body).toContain('Izinkan');
  });

  it('does not invite a retry for states a retry cannot fix', () => {
    expect(pushFailureGuidance('unconfigured').retryable).toBe(false);
    expect(pushFailureGuidance('endpoint-not-allowed').retryable).toBe(false);
    expect(pushFailureGuidance('unsupported').retryable).toBe(false);
  });
});
