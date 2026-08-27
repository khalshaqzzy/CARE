import type { SetURLSearchParams } from 'react-router-dom';

function decodeHistory(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function cursorPagination(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
) {
  const cursor = searchParams.get('cursor') ?? undefined;
  const history = decodeHistory(searchParams.get('cursorHistory'));
  const page = history.length + 1;
  const navigate = (nextCursor: string | undefined, nextHistory: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (nextCursor) params.set('cursor', nextCursor);
    else params.delete('cursor');
    if (nextHistory.length) params.set('cursorHistory', JSON.stringify(nextHistory));
    else params.delete('cursorHistory');
    setSearchParams(params);
  };
  return {
    cursor,
    page,
    canPrevious: history.length > 0,
    next(nextCursor: string) {
      navigate(nextCursor, [...history, cursor ?? '']);
    },
    previous() {
      const nextHistory = history.slice(0, -1);
      const previousCursor = history.at(-1) || undefined;
      navigate(previousCursor, nextHistory);
    },
  };
}
