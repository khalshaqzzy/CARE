import { describe, expect, it } from 'vitest';
import {
  matchShopAliases,
  normalizeAlias,
  normalizeLocationText,
  resolveShop,
  type ShopCandidate,
} from '../../src/shops/shop-matching';

const assy1: ShopCandidate = {
  id: 'assy-1',
  organizationUnitId: 'unit-assy-1',
  aliases: ['assy', 'asy', 'assy 1', 'assembly 1'],
};
const assy2: ShopCandidate = {
  id: 'assy-2',
  organizationUnitId: 'unit-assy-2',
  aliases: ['assy', 'assy 2'],
};
const logistic: ShopCandidate = {
  id: 'log',
  organizationUnitId: 'unit-log',
  aliases: ['logistic', 'gudang'],
};

const base = {
  reporterOrganizationUnitId: 'unit-office',
  confirmation: null,
  aiSuggestion: null,
  confidenceThreshold: 0.75,
};

describe('location text normalization', () => {
  it.each(['Assy #1', 'assy1', 'ASSY-1', 'assy 1', 'Assy  #1.'])('normalizes %s', (value) => {
    expect(normalizeAlias(value)).toBe('assy 1');
  });

  it('strips diacritics and punctuation', () => {
    expect(normalizeLocationText('Gudang (Sunter) – rak 3')).toEqual([
      'gudang',
      'sunter',
      'rak',
      '3',
    ]);
  });
});

describe('alias matching', () => {
  it('matches whole tokens only', () => {
    expect(matchShopAliases([logistic], 'gudangan belakang')).toEqual([]);
    expect(matchShopAliases([logistic], 'Gudang rak 3')).toEqual(['log']);
  });

  it('prefers the most specific alias', () => {
    expect(matchShopAliases([assy1, assy2], 'Assy #2 line 3')).toEqual(['assy-2']);
    expect(matchShopAliases([assy1, assy2], 'assy dekat pos 3').sort()).toEqual([
      'assy-1',
      'assy-2',
    ]);
  });
});

describe('shop resolution', () => {
  it('resolves a single alias match', () => {
    expect(
      resolveShop({ ...base, shops: [assy1, logistic], locationDetail: 'asy line 2' }),
    ).toEqual({ status: 'RESOLVED', shopLocationId: 'assy-1', source: 'ALIAS' });
  });

  it('asks for confirmation when several shops match equally', () => {
    expect(
      resolveShop({ ...base, shops: [assy1, assy2], locationDetail: 'assy dekat pos 3' }),
    ).toEqual({ status: 'NEEDS_CONFIRMATION', candidateIds: ['assy-1', 'assy-2'] });
  });

  it('breaks an ambiguous match with the reporter department', () => {
    expect(
      resolveShop({
        ...base,
        reporterOrganizationUnitId: 'unit-assy-2',
        shops: [assy1, assy2],
        locationDetail: 'assy dekat pos 3',
      }),
    ).toEqual({ status: 'RESOLVED', shopLocationId: 'assy-2', source: 'ALIAS' });
  });

  it('uses a confident AI suggestion and confirms an uncertain one', () => {
    const input = { ...base, shops: [assy1, logistic], locationDetail: 'area perakitan pos 3' };
    expect(
      resolveShop({ ...input, aiSuggestion: { shopLocationId: 'assy-1', confidence: 0.9 } }),
    ).toEqual({ status: 'RESOLVED', shopLocationId: 'assy-1', source: 'AI' });
    expect(
      resolveShop({ ...input, aiSuggestion: { shopLocationId: 'assy-1', confidence: 0.4 } }),
    ).toEqual({ status: 'NEEDS_CONFIRMATION', candidateIds: ['assy-1'] });
  });

  it('ignores an AI suggestion outside the area catalog', () => {
    expect(
      resolveShop({
        ...base,
        shops: [logistic],
        locationDetail: 'area perakitan',
        aiSuggestion: { shopLocationId: 'assy-1', confidence: 0.99 },
      }),
    ).toEqual({ status: 'NOT_SHOP', source: 'NO_MATCH' });
  });

  it('lets the reporter confirmation win over alias matches', () => {
    const input = { ...base, shops: [assy1, logistic], locationDetail: 'asy line 2' };
    expect(
      resolveShop({ ...input, confirmation: { kind: 'SHOP', shopLocationId: 'log' } }),
    ).toEqual({ status: 'RESOLVED', shopLocationId: 'log', source: 'REPORTER_CONFIRMED' });
    expect(resolveShop({ ...input, confirmation: { kind: 'NOT_SHOP' } })).toEqual({
      status: 'NOT_SHOP',
      source: 'REPORTER_NOT_SHOP',
    });
  });

  it('ignores a confirmation for a shop no longer active in the area', () => {
    expect(
      resolveShop({
        ...base,
        shops: [assy1],
        locationDetail: 'asy line 2',
        confirmation: { kind: 'SHOP', shopLocationId: 'log' },
      }),
    ).toEqual({ status: 'RESOLVED', shopLocationId: 'assy-1', source: 'ALIAS' });
  });

  it('falls back to no shop for office locations', () => {
    expect(
      resolveShop({ ...base, shops: [assy1, logistic], locationDetail: 'Ruang meeting lantai 2' }),
    ).toEqual({ status: 'NOT_SHOP', source: 'NO_MATCH' });
  });
});
