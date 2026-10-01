// Deterministic incident-shop resolution for General Voice routing. The AI
// suggestion is advisory; alias matches and reporter confirmation win.

export type ShopCandidate = { id: string; organizationUnitId: string; aliases: string[] };

export type ShopConfirmationInput =
  { kind: 'SHOP'; shopLocationId: string } | { kind: 'NOT_SHOP' } | null;

export type ShopAiSuggestion = { shopLocationId: string; confidence: number } | null;

export type ShopResolution =
  | {
      status: 'RESOLVED';
      shopLocationId: string;
      source: 'REPORTER_CONFIRMED' | 'ALIAS' | 'AI';
    }
  | { status: 'NOT_SHOP'; source: 'REPORTER_NOT_SHOP' | 'NO_MATCH' }
  | { status: 'NEEDS_CONFIRMATION'; candidateIds: string[] };

/**
 * Lowercases, strips diacritics and punctuation, and splits letter/digit runs
 * so `Assy #1`, `assy1`, `ASSY-1`, and `assy 1` all become `assy 1`.
 */
export function normalizeLocationText(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Normalized alias text used for storage and duplicate detection. */
export function normalizeAlias(value: string) {
  return normalizeLocationText(value).join(' ');
}

function containsSequence(haystack: string[], needle: string[]) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1)
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  return false;
}

/**
 * Shops whose alias appears as a whole-token sequence in the location text.
 * When several shops match, only those with the most specific (longest)
 * matching alias remain, so `assy 2` beats a bare `assy`.
 */
export function matchShopAliases(shops: ShopCandidate[], locationDetail: string) {
  const tokens = normalizeLocationText(locationDetail);
  const scored = shops
    .map((shop) => ({
      id: shop.id,
      score: Math.max(
        0,
        ...shop.aliases
          .map((alias) => normalizeLocationText(alias))
          .filter((alias) => containsSequence(tokens, alias))
          .map((alias) => alias.length),
      ),
    }))
    .filter((row) => row.score > 0);
  const best = Math.max(0, ...scored.map((row) => row.score));
  return scored.filter((row) => row.score === best).map((row) => row.id);
}

export function resolveShop(input: {
  shops: ShopCandidate[];
  locationDetail: string;
  reporterOrganizationUnitId: string | null;
  confirmation: ShopConfirmationInput;
  aiSuggestion: ShopAiSuggestion;
  confidenceThreshold: number;
}): ShopResolution {
  const byId = new Map(input.shops.map((shop) => [shop.id, shop]));
  if (input.confirmation?.kind === 'NOT_SHOP')
    return { status: 'NOT_SHOP', source: 'REPORTER_NOT_SHOP' };
  // A confirmation for a shop that is no longer active in this area is ignored.
  if (input.confirmation?.kind === 'SHOP' && byId.has(input.confirmation.shopLocationId))
    return {
      status: 'RESOLVED',
      shopLocationId: input.confirmation.shopLocationId,
      source: 'REPORTER_CONFIRMED',
    };
  const aliasMatches = matchShopAliases(input.shops, input.locationDetail);
  if (aliasMatches.length === 1)
    return { status: 'RESOLVED', shopLocationId: aliasMatches[0]!, source: 'ALIAS' };
  if (aliasMatches.length > 1) {
    const own = aliasMatches.filter(
      (id) => byId.get(id)!.organizationUnitId === input.reporterOrganizationUnitId,
    );
    if (own.length === 1) return { status: 'RESOLVED', shopLocationId: own[0]!, source: 'ALIAS' };
    return { status: 'NEEDS_CONFIRMATION', candidateIds: aliasMatches };
  }
  const suggestion = input.aiSuggestion;
  if (suggestion && byId.has(suggestion.shopLocationId))
    return suggestion.confidence >= input.confidenceThreshold
      ? { status: 'RESOLVED', shopLocationId: suggestion.shopLocationId, source: 'AI' }
      : { status: 'NEEDS_CONFIRMATION', candidateIds: [suggestion.shopLocationId] };
  return { status: 'NOT_SHOP', source: 'NO_MATCH' };
}
