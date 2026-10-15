import { Button } from '@care/ui';
import { CheckCircle2, CircleDashed, Download, Users } from 'lucide-react';
import type { AccountLoginSummary } from '../../admin-api';

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const number = (value: number) => value.toLocaleString('id-ID');

function formatSince(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
}

/** Login counts for the chosen division or department, with one bar per unit below it. */
export function LoginSummary({
  summary,
  exporting,
  onExport,
  onPickGroup,
  onPickLogin,
}: {
  summary: AccountLoginSummary;
  exporting: boolean;
  onExport: () => void;
  onPickGroup: (name: string) => void;
  onPickLogin: (value: 'true' | 'false') => void;
}) {
  const since = formatSince(summary.trackingSince);
  const share = percent(summary.loggedIn, summary.total);
  return (
    <section className="admin-card" aria-label="Ringkasan login">
      <div className="admin-card__head">
        <div>
          <h2 className="admin-card__title">
            Login · {summary.department ?? summary.division ?? 'Semua divisi'}
          </h2>
          {since ? <p className="admin-meta--xs">Sejak {since}</p> : null}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={exporting}
          disabled={!summary.notLoggedIn}
          onClick={onExport}
        >
          <Download size={14} aria-hidden="true" /> Ekspor belum login
        </Button>
      </div>
      <div className="admin-kpi-strip">
        <div className="admin-kpi">
          <span className="admin-kpi__icon" aria-hidden="true">
            <Users size={18} />
          </span>
          <div className="admin-kpi__body">
            <span className="admin-kpi__value">{number(summary.total)}</span>
            <span className="admin-kpi__label">Akun aktif</span>
          </div>
        </div>
        <button
          type="button"
          className="admin-kpi admin-kpi--button"
          onClick={() => onPickLogin('true')}
        >
          <span className="admin-kpi__icon" data-tone="success" aria-hidden="true">
            <CheckCircle2 size={18} />
          </span>
          <span className="admin-kpi__body">
            <span className="admin-kpi__value" data-tone="success">
              {number(summary.loggedIn)}
            </span>
            <span className="admin-kpi__label">Sudah login · {share}%</span>
          </span>
        </button>
        <button
          type="button"
          className="admin-kpi admin-kpi--button"
          onClick={() => onPickLogin('false')}
        >
          <span className="admin-kpi__icon" data-tone="warning" aria-hidden="true">
            <CircleDashed size={18} />
          </span>
          <span className="admin-kpi__body">
            <span className="admin-kpi__value" data-tone="warning">
              {number(summary.notLoggedIn)}
            </span>
            <span className="admin-kpi__label">Belum login</span>
          </span>
        </button>
      </div>
      {summary.groups.length > 1 ? (
        <ul className="admin-login-groups">
          {summary.groups.map((group) => (
            <li key={group.name}>
              <button
                type="button"
                aria-label={`${group.name}: ${group.loggedIn} dari ${group.total} sudah login`}
                onClick={() => onPickGroup(group.name)}
              >
                <span className="admin-login-groups__name">{group.name}</span>
                <span className="admin-login-groups__bar" aria-hidden="true">
                  <span style={{ width: `${percent(group.loggedIn, group.total)}%` }} />
                </span>
                <span className="admin-login-groups__count admin-nums" aria-hidden="true">
                  {number(group.loggedIn)}/{number(group.total)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
