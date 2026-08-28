import { Badge, Button, Card, Stack } from '@care/ui';
import { Bell, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
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

export function AccountPage() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  const profile = session.workforceProfile;
  const employee = 'employee' in session ? session.employee : null;
  const union = session.unionProfile;
  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Akun</p>
        <h1>Pengaturan akun</h1>
        <p>Informasi sesi, profil dependensi, dan akses Anda saat ini.</p>
      </header>

      <Card variant="raised" className="account-profile-card">
        <Stack gap="md">
          <div className="account-identity">
            <span className="account-identity__avatar">
              {session.account.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2 className="account-identity__name">{session.account.displayName}</h2>
              <p className="account-identity__username">@{session.account.username}</p>
            </div>
          </div>
          <dl className="account-kv-grid">
            <div>
              <dt>Status akun</dt>
              <dd>
                {session.account.status === 'ACTIVE'
                  ? 'Aktif'
                  : session.account.status === 'LEGACY_HANDLER'
                    ? 'Akses historis'
                    : 'Nonaktif'}
              </dd>
            </div>
            <div>
              <dt>Jenis akun</dt>
              <dd>
                {session.account.accountKind === 'WORKFORCE'
                  ? 'Karyawan'
                  : session.account.accountKind === 'UNION'
                    ? 'Union'
                    : 'CARE Admin'}
              </dd>
            </div>
            {employee ? (
              <div>
                <dt>No. Registrasi</dt>
                <dd>{employee.noReg}</dd>
              </div>
            ) : null}
          </dl>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <div className="section-title-row">
            <h3 className="section-title">Profil organisasi</h3>
          </div>
          {profile ? (
            <dl className="account-kv-grid">
              <div>
                <dt>Posisi struktural</dt>
                <dd>
                  {employee?.structuralPosition ?? profile.structuralPosition ?? 'Team Member'}
                </dd>
              </div>
              <div>
                <dt>Directorate</dt>
                <dd>{employee?.directorate ?? '—'}</dd>
              </div>
              <div>
                <dt>Division</dt>
                <dd>{employee?.division ?? '—'}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{employee?.department ?? '—'}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>{employee?.section ?? '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="account-muted">Tidak ada profil workforce (akun Union).</p>
          )}
          {union ? (
            <dl className="account-kv-grid">
              <div>
                <dt>Slot Union</dt>
                <dd>{union.slot}</dd>
              </div>
            </dl>
          ) : null}
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <div className="section-title-row">
            <h3 className="section-title">Kemampuan akses</h3>
          </div>
          <div className="caps-list">
            {session.capabilities.map((capability) => (
              <Badge key={capability} tone="info">
                <ShieldCheck size={14} /> {CAPABILITY_LABELS[capability] ?? capability}
              </Badge>
            ))}
          </div>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <div className="section-title-row">
            <h3 className="section-title">Keamanan & sesi</h3>
            <Badge tone="success">Sesi aktif</Badge>
          </div>
          <p className="account-session-id">
            ID sesi {session.sessionId.slice(0, 8)}… · hanya untuk diagnosis perangkat ini
          </p>
          <div className="account-actions">
            <Button variant="secondary" onClick={() => void navigate('/notifications')}>
              <Bell size={18} /> Notifikasi push
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/change-password')}>
              <KeyRound size={18} /> Ganti password
            </Button>
            <Button variant="danger" onClick={() => void logout().then(() => navigate('/login'))}>
              <LogOut size={18} /> Keluar
            </Button>
          </div>
        </Stack>
      </Card>
    </Stack>
  );
}
