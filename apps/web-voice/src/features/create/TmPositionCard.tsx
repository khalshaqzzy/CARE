import { Card, Select } from '@care/ui';
import { UserRound } from 'lucide-react';
import type { DraftPositionOptions } from '../../workforce-api';
import { NO_LINE } from './useDraftWizard';

/**
 * "Lengkapi posisi kamu" for TM (vocational) reporters: they rotate across
 * Sections and Lines, so each Voice records where they work today. Prefilled
 * from their last Voice.
 */
export function TmPositionCard({
  options,
  section,
  line,
  onChange,
}: {
  options: DraftPositionOptions;
  section: string;
  line: string;
  onChange: (next: { positionSection: string; positionLine: string }) => void;
}) {
  const lines = options.sections.find((item) => item.name === section)?.lines ?? [];
  return (
    <Card variant="raised" padding="lg" className="wizard-card tm-card">
      <section className="wizard-section" aria-label="Posisi kamu">
        <div className="wizard-card__head">
          <span className="wizard-card__icon" aria-hidden="true">
            <UserRound size={18} />
          </span>
          <div className="wizard-card__heading">
            <small>Lengkapi posisi kamu</small>
            <strong>Section &amp; Line saat ini</strong>
          </div>
        </div>
        <div className="wizard-divider" aria-hidden="true" />
        <div className="tm-fields">
          <Select
            label="Section"
            value={section}
            placeholder="Pilih Section"
            onValueChange={(value) =>
              onChange({
                positionSection: value,
                // A Section without Lines can only be "Tidak di Line".
                positionLine: options.sections.find((item) => item.name === value)?.lines.length
                  ? ''
                  : NO_LINE,
              })
            }
            options={options.sections.map((item) => ({ value: item.name, label: item.name }))}
          />
          <Select
            label="Line"
            value={line}
            placeholder="Pilih Line"
            disabled={!section}
            onValueChange={(value) => onChange({ positionSection: section, positionLine: value })}
            options={[
              ...lines.map((name) => ({ value: name, label: name })),
              { value: NO_LINE, label: 'Tidak di Line' },
            ]}
          />
        </div>
        {options.last ? (
          <p className="tm-note">Terisi dari posisi terakhir kamu. Ubah jika sudah pindah.</p>
        ) : null}
      </section>
    </Card>
  );
}
