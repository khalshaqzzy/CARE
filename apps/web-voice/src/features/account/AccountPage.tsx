import {
  Badge,
  Button,
  Dialog,
  DisclosureRow,
  SectionCard,
  SettingsGroup,
  SettingsRow,
  Stack,
} from '@care/ui';
import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Fingerprint,
  KeyRound,
  LogOut,
  Lock,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';

const CAPABILITY_LABELS: Record<string, string> = {
  MEMBER: 'Member',
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Manager',
  DIVISION_LEADERSHIP: 'Divisi Leadership',
  DIRECTOR: 'Director',
  UNION_HEAD: 'Union Head',
  UNION_OFFICER: 'Union Officer',
  CARE_ADMIN: 'CARE Admin',
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  LEGACY_HANDLER: 'Akses historis',
  INACTIVE: 'Nonaktif',
};

const ACCOUNT_KIND_LABELS: Record<string, string> = {
  WORKFORCE: 'Karyawan',
  UNION: 'Union',
  CARE_ADMIN: 'CARE Admin',
};

export function AccountPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!session) return null;
  const profile = session.workforceProfile;
  const employee = 'employee' in session ? session.employee : null;
  const union = session.unionProfile;
  const statusLabel = ACCOUNT_STATUS_LABELS[session.account.status] ?? session.account.status;
  const kindLabel = ACCOUNT_KIND_LABELS[session.account.accountKind] ?? session.account.accountKind;

  const organizationRows = profile
    ? [
        {
          label: 'Posisi struktural',
          value: employee?.structuralPosition ?? profile.structuralPosition ?? 'Team Member',
        },
        { label: 'Directorat', value: employee?.directorate ?? '—' },
        { label: 'Division', value: employee?.division ?? '—' },
        { label: 'Department', value: employee?.department ?? '—' },
        { label: 'Section', value: employee?.section ?? '—' },
      ]
    : union
      ? [{ label: 'Slot Union', value: union.slot }]
      : [];

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <h1>Pengaturan akun</h1>
      </header>

      <section className="account-hero" aria-label="Identitas akun">
        <div className="account-hero__identity">
          <span className="account-hero__avatar" aria-hidden="true">
            {session.account.displayName.charAt(0).toUpperCase()}
          </span>
          <div className="account-hero__who">
            <h2 className="account-hero__name">{session.account.displayName}</h2>
            <p className="account-hero__meta">
              {employee ? `No. Reg ${employee.noReg}` : `@${session.account.username}`}
            </p>
          </div>
        </div>
        <div className="account-hero__chips">
          <span className="account-hero__chip">
            <BadgeCheck size={14} aria-hidden="true" />
            {statusLabel}
          </span>
          <span className="account-hero__chip">
            <Briefcase size={14} aria-hidden="true" />
            {kindLabel}
          </span>
          {union ? <span className="account-hero__chip">Slot {union.slot}</span> : null}
        </div>
      </section>

      <SectionCard
        title="Profil organisasi"
        description="Unit efektif dari snapshot organisasi terbaru."
        icon={<Building2 size={16} />}
        padding="md"
      >
        {organizationRows.length ? (
          <dl className="account-kv" aria-label="Profil organisasi">
            {organizationRows.map((row) => (
              <div className="account-kv__row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="account-note">Tidak ada profil workforce (akun Union).</p>
        )}
      </SectionCard>

      <SettingsGroup className="account-actions" aria-label="Keamanan dan tindakan akun">
        <DisclosureRow
          className="account-actions__disclosure"
          icon={<KeyRound size={16} />}
          title="Kemampuan akses"
          description="Diturunkan dari posisi struktural dan penugasan aktif Anda."
          defaultOpen
        >
          <div className="caps-list">
            {session.capabilities.map((capability) => (
              <Badge key={capability} tone="info">
                {CAPABILITY_LABELS[capability] ?? capability}
              </Badge>
            ))}
          </div>
        </DisclosureRow>
        <SettingsRow
          icon={<Bell size={15} />}
          title="Notifikasi push"
          description="Kelola izin dan perangkat terdaftar"
          onClick={() => void navigate('/notifications')}
        />
        <SettingsRow
          icon={<Lock size={15} />}
          title="Ganti password"
          description="Password baru 6–128 karakter"
          onClick={() => void navigate('/change-password')}
        />
        <SettingsRow
          icon={<Fingerprint size={15} />}
          title="ID sesi"
          description={`Sesi aktif pada perangkat ini · ${session.sessionId.slice(0, 8)}…`}
        />
        <SettingsRow
          icon={<LogOut size={15} />}
          title="Keluar"
          description="Akhiri sesi CARE pada perangkat ini"
          tone="danger"
          onClick={() => setConfirmLogout(true)}
        />
      </SettingsGroup>

      <Dialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Keluar dari CARE?"
        description="Sesi pada perangkat ini akan diakhiri. Anda dapat masuk kembali kapan saja."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmLogout(false);
                void logout().then(() => navigate('/login'));
              }}
            >
              Keluar
            </Button>
          </>
        }
      >
        <p className="dialog-copy">Pastikan pekerjaan Anda sudah disimpan sebelum keluar.</p>
      </Dialog>
    </Stack>
  );
}
