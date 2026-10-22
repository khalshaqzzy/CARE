import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { useMemo } from 'react';
import { createAdminApi } from '../../admin-api';

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const number = (value: number) => value.toLocaleString('id-ID');

/**
 * Responders (Group Leader up to Division Head) must be in CARE before their
 * members report, so their login state gets its own summary. It follows the
 * Divisi/Departemen/Seksi filters of the account list.
 */
export function ResponderLoginSummary({
  division,
  department,
  section,
  onShowMissing,
}: {
  division: string;
  department: string;
  section: string;
  onShowMissing: (level: string) => void;
}) {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      'responders',
      division,
      department,
      section,
    ),
    queryFn: () =>
      api.responderSummary({
        division: division || undefined,
        department: department || undefined,
        section: section || undefined,
      }),
    enabled: !!session,
  });
  if (!q.data) return null;
  const { total, loggedIn, levels } = q.data;
  return (
    <section className="admin-card admin-responders" aria-label="Login responder">
      <div className="admin-responders__total">
        <h2 className="admin-card__title">Login responder</h2>
        <strong className="admin-nums">
          {number(loggedIn)}
          <span> / {number(total)}</span>
        </strong>
        <span className="admin-meta--xs">
          {percent(loggedIn, total)}% sudah login · {number(total - loggedIn)} belum
          {section || department || division ? ` · ${section || department || division}` : ''}
        </span>
        <button
          type="button"
          className="admin-responders__link"
          disabled={total === loggedIn}
          onClick={() => onShowMissing('ANY')}
        >
          Lihat yang belum login
        </button>
      </div>
      <ul className="admin-responders__levels">
        {levels.map((level) => (
          <li key={level.level}>
            <button
              type="button"
              aria-label={`${level.label}: ${level.loggedIn} dari ${level.total} sudah login`}
              onClick={() => onShowMissing(level.level)}
            >
              <span className="admin-responders__label">{level.label}</span>
              <span className="admin-login-groups__bar" aria-hidden="true">
                <span style={{ width: `${percent(level.loggedIn, level.total)}%` }} />
              </span>
              <span className="admin-nums admin-responders__count" aria-hidden="true">
                {number(level.loggedIn)}/{number(level.total)}
              </span>
              <span className="admin-responders__missing" aria-hidden="true">
                {level.total - level.loggedIn
                  ? `${number(level.total - level.loggedIn)} belum`
                  : 'Lengkap'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
