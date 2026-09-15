import { describe, expect, it } from 'vitest';
import { buildNotification, parsePushPayload, parsePushPayloadText } from './push-payload';

describe('push payload parsing', () => {
  it('reads the server payload fields', () => {
    expect(
      parsePushPayload({
        title: 'Voice diperbarui',
        body: 'Status berubah',
        deepLink: '/voices/1',
      }),
    ).toEqual({ title: 'Voice diperbarui', body: 'Status berubah', deepLink: '/voices/1' });
  });

  it('accepts the legacy url field', () => {
    expect(parsePushPayload({ url: '/voices/2' }).deepLink).toBe('/voices/2');
  });

  it('prefers deepLink over url', () => {
    expect(parsePushPayload({ deepLink: '/voices/3', url: '/voices/9' }).deepLink).toBe(
      '/voices/3',
    );
  });

  it('falls back to the notification center for missing or unusable deep links', () => {
    expect(parsePushPayload(undefined).deepLink).toBe('/notifications');
    expect(parsePushPayload({ deepLink: 'https://evil.example/x' }).deepLink).toBe(
      '/notifications',
    );
    expect(parsePushPayload({ deepLink: '//evil.example' }).deepLink).toBe('/notifications');
    expect(parsePushPayload({ deepLink: '  ' }).deepLink).toBe('/notifications');
  });

  it('falls back to generic copy for empty or non-string fields', () => {
    expect(parsePushPayload({ title: '  ', body: 42 })).toEqual({
      title: 'Pembaruan CARE',
      body: 'Buka CARE untuk melihat pembaruan terbaru.',
      deepLink: '/notifications',
    });
  });

  it('never throws on malformed payload bytes', () => {
    expect(parsePushPayloadText('not json')).toEqual(parsePushPayload(undefined));
    expect(parsePushPayloadText('')).toEqual(parsePushPayload(undefined));
    expect(parsePushPayloadText(null)).toEqual(parsePushPayload(undefined));
    expect(parsePushPayloadText('"a string"')).toEqual(parsePushPayload(undefined));
  });
});

describe('notification building', () => {
  it('collapses repeats of one Voice into a single notification slot', () => {
    const payload = parsePushPayload({ title: 'CARE', body: 'Pembaruan', deepLink: '/voices/7' });
    const { title, options } = buildNotification(payload);
    expect(title).toBe('CARE');
    expect(options.tag).toBe('care:/voices/7');
    expect(options.renotify).toBe(true);
    expect(options.data).toEqual({ url: '/voices/7' });
    expect(options.icon).toBe('/icon-192.png');
    expect(options.badge).toBe('/icon-192.png');
  });

  it('keeps distinct Voices in distinct slots', () => {
    const first = buildNotification(parsePushPayload({ deepLink: '/voices/1' }));
    const second = buildNotification(parsePushPayload({ deepLink: '/voices/2' }));
    expect(first.options.tag).not.toBe(second.options.tag);
  });
});
