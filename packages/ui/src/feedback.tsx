import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { choreographyTokens, durationTokens, springTokens } from './tokens.js';
import { Button, IconButton, Surface } from './primitives.js';
import { cn } from './utils.js';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export function Badge({
  tone = 'neutral',
  children,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className={cn('care-badge', `care-badge--${tone}`)}>
      {icon}
      {children}
    </span>
  );
}
/**
 * A semantic-colored dot with a text label. The text — never the color — is
 * the accessible value; the dot is decorative reinforcement.
 */
export function DotLabel({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone | 'brand';
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span className={cn('care-dot-label', className)} data-tone={tone}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const map = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' } as const;
  return (
    <Badge tone={map[severity]} icon={<span className="care-badge__mark" aria-hidden="true" />}>
      {severity}
    </Badge>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === 'CLOSED' ? 'success' : status === 'IN_PROGRESS' ? 'info' : 'neutral'}>
      {status.replaceAll('_', ' ')}
    </Badge>
  );
}

const toneIcons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: AlertCircle,
  neutral: Info,
};
export function Alert({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = toneIcons[tone];
  return (
    <div
      className={cn('care-alert', `care-alert--${tone}`)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
        {actions ? <div className="care-alert__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

export function Loader({
  label = 'Memuat',
  size = 'md',
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={cn('care-loader', `care-loader--${size}`)} role="status" aria-label={label}>
      <LoaderCircle aria-hidden="true" />
    </span>
  );
}
export function Progress({
  value,
  label,
  description,
}: {
  value: number;
  label: string;
  description?: string;
}) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="care-progress">
      <div>
        <span>{label}</span>
        <strong>{safe}%</strong>
      </div>
      <div
        className="care-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        aria-label={label}
      >
        <span style={{ width: `${safe}%` }} />
      </div>
      {description ? <small>{description}</small> : null}
    </div>
  );
}
export function Skeleton({
  className,
  label = 'Memuat konten',
}: {
  className?: string;
  label?: string;
}) {
  return <span className={cn('care-skeleton', className)} role="status" aria-label={label} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Surface className="care-state">
      <span className="care-state__icon" aria-hidden="true">
        {icon ?? <Info />}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </Surface>
  );
}
export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle />}
      title={title}
      description={description}
      action={onRetry ? <Button onClick={onRetry}>Coba lagi</Button> : undefined}
    />
  );
}
export function PermissionState() {
  return (
    <ErrorState
      title="Halaman tidak tersedia"
      description="Akses tidak tersedia untuk akun ini atau halaman sudah berpindah."
    />
  );
}
export function OfflineBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <Alert
      tone="warning"
      title="Anda sedang offline"
      actions={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        ) : undefined
      }
    >
      Data yang terlihat mungkin sudah usang. Tindakan perubahan membutuhkan koneksi.
    </Alert>
  );
}
export function ConflictState({ onReload }: { onReload: () => void }) {
  return (
    <Alert
      tone="warning"
      title="Data telah berubah"
      actions={
        <Button variant="secondary" size="sm" onClick={onReload}>
          Muat ulang
        </Button>
      }
    >
      Versi terbaru perlu dimuat sebelum tindakan dapat dilanjutkan.
    </Alert>
  );
}

export function Toast({
  open,
  onOpenChange,
  tone = 'neutral',
  title,
  description,
  duration = choreographyTokens.toastDuration,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: Tone;
  title: string;
  description?: string;
  duration?: number;
  action?: ReactNode;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open || duration <= 0) return;
    const timer = window.setTimeout(() => onOpenChange(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration, onOpenChange, open]);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn('care-toast', `care-toast--${tone}`)}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: durationTokens.instant } : springTokens.panel}
        >
          <div>
            <strong>{title}</strong>
            {description ? <p>{description}</p> : null}
          </div>
          {action}
          <IconButton
            variant="ghost"
            aria-label="Tutup notifikasi"
            onClick={() => onOpenChange(false)}
          >
            <X size={17} />
          </IconButton>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
