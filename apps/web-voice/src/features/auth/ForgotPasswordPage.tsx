import { useAuth } from '@care/frontend-core';
import { Alert, Button, Card, Input, NativeSelect, Stack } from '@care/ui';
import { ArrowLeft, ArrowRight, CalendarDays, LockKeyhole, Shield, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthReveal } from './AuthReveal';
import { authFailureMessage } from './messages';

const months = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const pad = (value: number) => String(value).padStart(2, '0');

export function ForgotPasswordPage() {
  const { transport, clearAfterReset } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [noReg, setNoReg] = useState((location.state as { noReg?: string } | null)?.noReg ?? '');
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current += 1;
    },
    [],
  );
  const currentYear = new Date().getFullYear();
  const days = month && year ? new Date(Number(year), Number(month), 0).getDate() : 31;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const requestVersion = ++version.current;
    setPending(true);
    try {
      if (eligible !== true) {
        const result = await transport.resetEligibility(noReg);
        if (version.current === requestVersion) setEligible(result.eligible);
        return;
      }
      const date = `${year}-${month}-${day}`;
      const parsed = new Date(`${date}T00:00:00.000Z`);
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date ||
        date > new Date().toISOString().slice(0, 10)
      ) {
        setError('Pilih tanggal lahir yang valid.');
        return;
      }
      await transport.resetPassword(noReg, date);
      await clearAfterReset();
      if (version.current !== requestVersion) return;
      void navigate('/login', { replace: true, state: { noReg, resetSuccess: true } });
    } catch (cause) {
      if (version.current === requestVersion) setError(authFailureMessage(cause, 'reset'));
    } finally {
      setPending(false);
    }
  }
  function editIdentifier() {
    version.current += 1;
    setEligible(null);
    setDay('');
    setMonth('');
    setYear('');
    setError('');
    identifierRef.current?.focus();
  }
  return (
    <main className="auth-layout auth-layout--recovery">
      <section className="auth-brand auth-brand--security">
        <span className="auth-brand__badge" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <h1>Keamanan akun</h1>
        <p>Pulihkan akses akun Anda untuk kembali terhubung dengan CARE.</p>
        <Shield className="auth-brand__watermark" aria-hidden="true" />
      </section>
      <Card variant="raised" className="auth-card">
        <Stack gap="lg">
          <div>
            <Link
              to="/login"
              state={{ noReg }}
              className="auth-back auth-back--login auth-text-link"
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Kembali ke login
            </Link>
            <h2>Lupa Password</h2>
            <p>Masukkan No. Reg untuk memeriksa ketersediaan reset password.</p>
          </div>
          {error ? (
            <Alert tone="danger" title="Password belum direset">
              {error}
            </Alert>
          ) : null}
          <form className="auth-form" onSubmit={submit}>
            <Input
              ref={identifierRef}
              label="No. Reg"
              placeholder="Masukkan No. Reg Anda"
              leading={<UserRound size={18} />}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              required
              value={noReg}
              readOnly={eligible !== null || pending}
              onChange={(event) => setNoReg(event.target.value)}
            />
            {eligible !== null ? (
              <div className="auth-step-heading">
                <span>{eligible ? 'Verifikasi akun' : 'Ketersediaan reset'}</span>
                <Button type="button" variant="ghost" disabled={pending} onClick={editIdentifier}>
                  Ubah No. Reg
                </Button>
              </div>
            ) : null}
            {eligible === false ? (
              <Alert tone="info" title="Reset belum tersedia">
                Reset Password belum tersedia untuk akun Anda.
              </Alert>
            ) : null}
            <AuthReveal open={eligible === true}>
              <fieldset className="auth-birth-date" disabled={pending}>
                <legend>
                  <CalendarDays size={18} aria-hidden="true" />
                  Tanggal lahir
                </legend>
                <p>Pilih tanggal lahir sesuai data kepegawaian Anda.</p>
                <div className="auth-date-fields">
                  <NativeSelect
                    label="Tanggal"
                    required
                    value={day}
                    onChange={(event) => setDay(event.target.value)}
                  >
                    {[
                      { value: '', label: 'Tanggal' },
                      ...Array.from({ length: days }, (_, i) => ({
                        value: pad(i + 1),
                        label: String(i + 1),
                      })),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    label="Bulan"
                    required
                    value={month}
                    onChange={(event) => {
                      setMonth(event.target.value);
                      setDay('');
                    }}
                  >
                    {[
                      { value: '', label: 'Bulan' },
                      ...months.map((label, i) => ({ value: pad(i + 1), label })),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    label="Tahun"
                    required
                    value={year}
                    onChange={(event) => {
                      setYear(event.target.value);
                      setDay('');
                    }}
                  >
                    {[
                      { value: '', label: 'Tahun' },
                      ...Array.from({ length: currentYear - 1899 }, (_, i) => ({
                        value: String(currentYear - i),
                        label: String(currentYear - i),
                      })),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </fieldset>
            </AuthReveal>
            {eligible !== false ? (
              <Button className="auth-submit" type="submit" loading={pending}>
                {eligible ? 'Reset password' : 'Lanjutkan'}
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            ) : null}
          </form>
        </Stack>
      </Card>
    </main>
  );
}
