import { careQueryKey, useAuth } from '@care/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { createAdminApi } from './admin-api';

/** Pending Manager → Admin handovers for the menu and tab badge: "N", or "N+" past one page. */
export function useHandoverCount() {
  const { session, transport } = useAuth();
  const admin = !!session?.capabilities.includes('CARE_ADMIN');
  const queue = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'admin-handovers', 'menu-count'),
    queryFn: () => createAdminApi(transport).adminHandovers(),
    enabled: admin,
    staleTime: 60_000,
  });
  const items = queue.data?.items.length ?? 0;
  return items ? `${items}${queue.data?.nextCursor ? '+' : ''}` : null;
}
