import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert } from '@care/ui';
import {
  AlarmClock,
  CheckCircle2,
  CircleDot,
  Inbox,
  LoaderCircle,
  MessageCircle,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { createAdminApi, type AdminVoiceReportQuery } from '../../admin-api';
import {
  AdminBars,
  AdminSummary,
  formatCount,
  formatDuration,
} from '../../components/AdminSummary';
import { AdminSkeleton } from '../../components/AdminSkeleton';

type Query = { [K in keyof AdminVoiceReportQuery]?: AdminVoiceReportQuery[K] | undefined };

/** A WIB calendar-day range as ISO instants: the whole of both end days. */
export function wibRange(from: string, to: string) {
  return {
    from: from ? `${from}T00:00:00.000+07:00` : undefined,
    to: to ? `${to}T23:59:59.999+07:00` : undefined,
  };
}

const AREA_LABELS: Record<string, string> = {
  KARAWANG_1: 'Karawang 1',
  KARAWANG_2: 'Karawang 2',
  KARAWANG_3: 'Karawang 3',
  SUNTER_1: 'Sunter 1',
  SUNTER_2: 'Sunter 2',
};
const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};
const SEVERITY_TONES: Record<string, 'danger' | 'warning' | 'success'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
};

function StatusKpi({
  icon,
  tone,
  value,
  label,
  sub,
  pressed,
  onClick,
}: {
  icon: ReactNode;
  tone?: 'danger' | 'warning' | 'success' | 'info' | undefined;
  value: number;
  label: string;
  sub?: string | undefined;
  pressed?: boolean | undefined;
  onClick?: (() => void) | undefined;
}) {
  const body = (
    <>
      <span className="admin-kpi__icon" data-tone={tone ?? 'brand'} aria-hidden="true">
        {icon}
      </span>
      <span className="admin-kpi__body">
        <strong className="admin-kpi__value" {...(tone ? { 'data-tone': tone } : {})}>
          {formatCount(value)}
        </strong>
        <span className="admin-kpi__label">{label}</span>
        {sub ? <span className="admin-kpi__sub">{sub}</span> : null}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="admin-kpi admin-kpi--button"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className="admin-kpi">{body}</div>
  );
}

/**
 * Ringkasan Voice: counts and handling times of exactly the Voices the
 * explorer's filters select. Picking a status, category, severity or area
 * narrows the filters (and the list) to it; picking it again clears it.
 */
export function VoiceSummary({
  query,
  period,
  status,
  category,
  severity,
  area,
  onFilter,
}: {
  query: Query;
  period: string;
  status: string;
  category: string;
  severity: string;
  area: string;
  onFilter: (name: 'status' | 'category' | 'severity' | 'area', value: string) => void;
}) {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const summary = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'voices', 'summary', query),
    queryFn: () => api.voiceSummary(query),
    enabled: !!session,
    placeholderData: (previous) => previous,
  });
  const data = summary.data;
  const count = (key: string) => data?.status.find((row) => row.key === key)?.value ?? 0;
  const toggle =
    (name: 'status' | 'category' | 'severity' | 'area', current: string) => (key: string) =>
      onFilter(name, current === key ? '' : key);
  const closedShare = data?.total ? Math.round((count('CLOSED') / data.total) * 100) : 0;

  return (
    <AdminSummary
      id="voices"
      title="Ringkasan Voice"
      meta={`Mengikuti filter${period ? ` · ${period}` : ''}`}
      chips={
        data
          ? [
              { value: formatCount(data.total), label: 'total' },
              { value: formatCount(count('OPEN')), label: 'terbuka', tone: 'warning' },
              { value: formatCount(count('RESPONDED')), label: 'direspon', tone: 'warning' },
              { value: formatCount(count('IN_PROGRESS')), label: 'diproses', tone: 'info' },
              { value: formatCount(count('CLOSED')), label: 'selesai', tone: 'success' },
              { value: formatCount(data.overdue), label: 'terlambat', tone: 'danger' },
              { value: formatDuration(data.averageResponseSeconds, true), label: 'respon' },
              {
                value: formatDuration(data.averageCompletionSeconds, true),
                label: 'penyelesaian',
              },
            ]
          : []
      }
    >
      {summary.error ? (
        <Alert tone="danger" title="Ringkasan gagal dimuat">
          {String((summary.error as Error).message)}
        </Alert>
      ) : !data ? (
        <AdminSkeleton lines={3} label="Memuat ringkasan" />
      ) : (
        <>
          <div className="admin-kpi-strip">
            <StatusKpi
              icon={<Inbox size={18} />}
              value={data.total}
              label="Total Voice"
              pressed={!status}
              onClick={() => onFilter('status', '')}
            />
            <StatusKpi
              icon={<CircleDot size={18} />}
              tone="warning"
              value={count('OPEN')}
              label="Terbuka"
              pressed={status === 'OPEN'}
              onClick={() => toggle('status', status)('OPEN')}
            />
            <StatusKpi
              icon={<MessageCircle size={18} />}
              tone="warning"
              value={count('RESPONDED')}
              label="Direspon"
              pressed={status === 'RESPONDED'}
              onClick={() => toggle('status', status)('RESPONDED')}
            />
            <StatusKpi
              icon={<LoaderCircle size={18} />}
              tone="info"
              value={count('IN_PROGRESS')}
              label="Diproses"
              pressed={status === 'IN_PROGRESS'}
              onClick={() => toggle('status', status)('IN_PROGRESS')}
            />
            <StatusKpi
              icon={<CheckCircle2 size={18} />}
              tone="success"
              value={count('CLOSED')}
              label="Selesai"
              sub={`${closedShare}%`}
              pressed={status === 'CLOSED'}
              onClick={() => toggle('status', status)('CLOSED')}
            />
            <StatusKpi
              icon={<AlarmClock size={18} />}
              tone="danger"
              value={data.overdue}
              label="Terlambat"
            />
          </div>
          <div className="admin-summary__grid">
            <div className="admin-summary__times">
              <h3 className="admin-bars__title">Waktu penanganan</h3>
              <div className="admin-summary__time">
                <span>Rata-rata respon pertama</span>
                <strong>{formatDuration(data.averageResponseSeconds)}</strong>
                <small>dari {formatCount(data.responseSampleCount)} Voice</small>
              </div>
              <div className="admin-summary__time">
                <span>Rata-rata penyelesaian</span>
                <strong>{formatDuration(data.averageCompletionSeconds)}</strong>
                <small>dari {formatCount(data.completionSampleCount)} Voice</small>
              </div>
              {data.feedbackSampleCount ? (
                <div className="admin-summary__time">
                  <span>Rata-rata rating</span>
                  <strong>
                    {(data.averageFeedbackScore ?? 0).toLocaleString('id-ID', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    / 5
                  </strong>
                  <small>dari {formatCount(data.feedbackSampleCount)} rating</small>
                </div>
              ) : null}
            </div>
            <AdminBars
              title="Kategori"
              rows={data.category.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.value,
              }))}
              active={category}
              onPick={toggle('category', category)}
            />
            <div style={{ display: 'grid', gap: 'var(--space-5)', alignContent: 'start' }}>
              <AdminBars
                title="Severity"
                rows={data.severity.map((row) => ({
                  key: row.key,
                  label: SEVERITY_LABELS[row.key] ?? row.key,
                  value: row.value,
                  tone: SEVERITY_TONES[row.key],
                }))}
                active={severity}
                onPick={toggle('severity', severity)}
              />
              <AdminBars
                title="Area"
                rows={data.area.map((row) => ({
                  key: row.key,
                  label: AREA_LABELS[row.key] ?? row.key,
                  value: row.value,
                }))}
                active={area}
                onPick={toggle('area', area)}
              />
            </div>
          </div>
        </>
      )}
    </AdminSummary>
  );
}
