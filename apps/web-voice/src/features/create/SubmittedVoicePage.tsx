import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import submittedVoiceAsset from '../../assets/submit-voice-asset.png';

type SubmittedLocationState = {
  submitted?: boolean;
};

export function SubmittedVoicePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [canShow] = useState(
    () => (location.state as SubmittedLocationState | null)?.submitted === true,
  );

  useEffect(() => {
    if (canShow) {
      // Consume the receipt immediately. The mounted page remains visible, but
      // refresh/direct access and a later browser-back visit cannot replay it.
      void navigate('/voices/submitted', { replace: true, state: null });
    }
  }, [canShow, navigate]);

  if (!canShow) return <Navigate to="/history" replace />;

  return (
    <main className="submitted-voice-page">
      <div className="submitted-voice-page__surface">
        <section className="submitted-voice-hero" aria-label="Voice berhasil dikirim">
          <div className="submitted-voice-hero__lockup" aria-label="CARE">
            <span aria-hidden="true">C</span>
            <strong>CARE</strong>
          </div>

          <div className="submitted-voice-hero__check" aria-hidden="true">
            <Check strokeWidth={2.6} />
          </div>

          <img
            className="submitted-voice-hero__asset"
            src={submittedVoiceAsset}
            width="1122"
            height="1402"
            alt=""
          />

          <svg
            className="submitted-voice-hero__waves"
            viewBox="0 0 512 118"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="submitted-wave-back" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#8fc8fb" />
                <stop offset="0.55" stopColor="#a8d6ff" />
                <stop offset="1" stopColor="#86c1f6" />
              </linearGradient>
              <linearGradient id="submitted-wave-middle" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#b7dcff" />
                <stop offset="0.52" stopColor="#d3eaff" />
                <stop offset="1" stopColor="#b8dcfd" />
              </linearGradient>
              <linearGradient id="submitted-wave-front" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#e3f1ff" />
                <stop offset="0.48" stopColor="#f4f9ff" />
                <stop offset="1" stopColor="#dcecff" />
              </linearGradient>
            </defs>
            <path
              d="M0 39C79 7 112 73 194 64C279 55 326 8 403 13C452 16 482 39 512 51V118H0Z"
              fill="url(#submitted-wave-back)"
            />
            <path
              d="M0 61C68 92 116 91 177 74C241 56 291 29 357 43C419 56 461 88 512 91V118H0Z"
              fill="url(#submitted-wave-middle)"
            />
            <path
              d="M0 91C66 88 118 65 185 69C252 72 301 104 366 108C428 112 472 93 512 71V118H0Z"
              fill="url(#submitted-wave-front)"
            />
            <path
              d="M0 108C66 111 119 87 184 88C252 89 305 116 370 116C430 116 474 98 512 80V118H0Z"
              fill="var(--surface-raised)"
            />
          </svg>
        </section>

        <section className="submitted-voice-content">
          <div className="submitted-voice-content__copy">
            <h1>Terima kasih</h1>
            <p>Voice Anda telah diterima. CARE akan segera menangani Voice Anda.</p>
          </div>

          <div className="submitted-voice-content__actions">
            <button
              type="button"
              className="submitted-voice-button submitted-voice-button--primary"
              onClick={() => void navigate('/history')}
            >
              Lihat riwayat Voice
            </button>
            <button
              type="button"
              className="submitted-voice-button submitted-voice-button--secondary"
              onClick={() => void navigate('/')}
            >
              Ke dashboard
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
