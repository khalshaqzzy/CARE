import { Check, Circle, Eye, Play } from 'lucide-react';

const steps = [
  { status: 'OPEN', label: 'Terbuka', icon: Circle },
  { status: 'MONITORED', label: 'Dimonitor', icon: Eye },
  { status: 'IN_PROGRESS', label: 'Diproses', icon: Play },
  { status: 'CLOSED', label: 'Selesai', icon: Check },
];
const descriptions: Record<string, string> = {
  OPEN: 'Voice menunggu ditinjau oleh penanggung jawab.',
  MONITORED:
    'Voice telah diterima dan sedang dimonitor. Percakapan tersedia setelah penanganan dimulai.',
  IN_PROGRESS: 'Voice sedang ditangani. Diskusikan tindak lanjut melalui percakapan.',
  CLOSED: 'Penanganan Voice telah selesai. Hasil penyelesaian dan penilaian tersedia di bawah.',
};

export function VoiceProgress({ status }: { status: string }) {
  const current = steps.findIndex((step) => step.status === status);
  return (
    <section className="voice-progress" aria-label="Progres Voice">
      <ol className="voice-progress__steps">
        {steps.map((step, index) => {
          const Icon = index < current ? Check : step.icon;
          return (
            <li
              key={step.status}
              data-state={index < current ? 'done' : index === current ? 'current' : 'next'}
              aria-current={index === current ? 'step' : undefined}
            >
              <span className="voice-progress__indicator">
                <Icon size={17} aria-hidden="true" />
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="voice-progress__description">{descriptions[status]}</p>
    </section>
  );
}
