import { Card, Dialog, Button, Skeleton } from '@care/ui';
import { Clock3, CircleCheck, Info, Star } from 'lucide-react';
import { useState } from 'react';
import type { components } from '@care/contracts';

type Performance = components['schemas']['DashboardView']['performance'];
type Unit = 'hours' | 'days';
export function durationDisplay(seconds: number | null, override?: Unit) {
  const unit = override ?? (seconds !== null && seconds > 86400 ? 'days' : 'hours');
  return {
    unit,
    value: seconds === null ? '—' : (seconds / (unit === 'days' ? 86400 : 3600)).toFixed(2),
  };
}
export function DashboardPerformance({ data }: { data?: Performance | undefined }) {
  const [responseUnit, setResponseUnit] = useState<Unit>();
  const [completionUnit, setCompletionUnit] = useState<Unit>();
  const [info, setInfo] = useState<string>();
  const durations = [
    {
      title: 'Average Response Time',
      seconds: data?.averageResponseSeconds ?? null,
      count: data?.responseSampleCount ?? 0,
      sample: 'Voice',
      unit: responseUnit,
      setUnit: setResponseUnit,
      icon: <Clock3 size={18} />,
      description:
        'Rata-rata waktu sejak submit sampai pertama kali Dimonitor, termasuk melalui assignment. Voice tanpa event Dimonitor tidak dihitung.',
    },
    {
      title: 'Average Completion Time',
      seconds: data?.averageCompletionSeconds ?? null,
      count: data?.completionSampleCount ?? 0,
      sample: 'siklus',
      unit: completionUnit,
      setUnit: setCompletionUnit,
      icon: <CircleCheck size={18} />,
      description:
        'Rata-rata per siklus selesai: submit sampai closed pertama, lalu reopen sampai closed berikutnya. Waktu menunggu feedback tidak masuk siklus berikutnya.',
    },
  ];
  return (
    <section className="dashboard-performance" aria-label="Performa penanganan">
      {durations.map((metric) => {
        const display = durationDisplay(metric.seconds, metric.unit);
        return (
          <Card key={metric.title} className="dashboard-performance__card" padding="none">
            <div className="dashboard-performance__top">
              <span className="dashboard-performance__icon" aria-hidden="true">
                {metric.icon}
              </span>
              <button
                type="button"
                className="dashboard-performance__unit"
                aria-label={`Ubah satuan ${metric.title} ke ${display.unit === 'hours' ? 'days' : 'hours'}`}
                onClick={() => metric.setUnit(display.unit === 'hours' ? 'days' : 'hours')}
              >
                {display.unit === 'hours' ? 'hrs' : 'days'}
              </button>
            </div>
            <h2>{metric.title}</h2>
            {data ? (
              <>
                <p className="dashboard-performance__value">
                  {display.value}
                  <span>{metric.seconds !== null ? display.unit : ''}</span>
                </p>
                <div className="dashboard-performance__foot">
                  <small>
                    {metric.count ? `${metric.count} ${metric.sample}` : 'Belum ada sampel'}
                  </small>
                  <button
                    type="button"
                    aria-label={`Tentang ${metric.title}`}
                    onClick={() => setInfo(metric.description)}
                  >
                    <Info size={15} />
                  </button>
                </div>
              </>
            ) : (
              <Skeleton label={`Memuat ${metric.title}`} />
            )}
          </Card>
        );
      })}
      <Card className="dashboard-performance__card dashboard-performance__rating" padding="none">
        <div className="dashboard-performance__top">
          <span className="dashboard-performance__icon" aria-hidden="true">
            <Star size={18} />
          </span>
          <button
            type="button"
            aria-label="Tentang Performance"
            onClick={() =>
              setInfo(
                'Rata-rata seluruh rating pada setiap siklus, termasuk rating rendah yang memicu reopen. Satu Voice dapat menyumbang lebih dari satu rating.',
              )
            }
          >
            <Info size={15} />
          </button>
        </div>
        <h2>Performance</h2>
        {data ? (
          <>
            <p
              className="dashboard-performance__value"
              aria-label={
                data.averageFeedbackScore === null
                  ? 'Belum ada rating'
                  : `${data.averageFeedbackScore.toFixed(2)} dari 5 bintang`
              }
            >
              {data.averageFeedbackScore?.toFixed(2) ?? '—'}
              <span>{data.averageFeedbackScore !== null ? '/ 5' : ''}</span>
            </p>
            <div className="dashboard-performance__foot">
              <span className="dashboard-performance__stars" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i}>
                    <Star size={17} />
                    <span
                      style={{
                        width: `${Math.min(1, Math.max(0, (data.averageFeedbackScore ?? 0) - i)) * 100}%`,
                      }}
                    >
                      <Star size={17} fill="currentColor" />
                    </span>
                  </span>
                ))}
              </span>
              <small>{data.feedbackSampleCount} rating</small>
            </div>
          </>
        ) : (
          <Skeleton label="Memuat Performance" />
        )}
      </Card>
      <Dialog
        open={Boolean(info)}
        onOpenChange={(open) => {
          if (!open) setInfo(undefined);
        }}
        title="Tentang metrik"
        mobileSheet
      >
        <p>{info}</p>
        <p>
          Semua metrik mengikuti filter aktif. Rentang tanggal berdasarkan waktu submit Voice;
          seluruh siklus dan rating Voice terpilih ikut dihitung. Durasi memakai waktu kalender.
        </p>
        <div className="dialog-actions">
          <Button onClick={() => setInfo(undefined)}>Mengerti</Button>
        </div>
      </Dialog>
    </section>
  );
}
