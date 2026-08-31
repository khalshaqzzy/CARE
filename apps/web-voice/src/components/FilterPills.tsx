import { Button, Dialog, IconButton, Select } from '@care/ui';
import { ListFilter } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

export type FilterSelect = {
  /** Stable key, also used as the React key. */
  id: string;
  label: string;
  icon?: ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onValueChange: (value: string) => void;
  /**
   * Value that means "no filter chosen"; the pill renders neutral unless the
   * current value differs (or `alwaysNeutral` keeps it quiet, e.g. Status).
   */
  neutralValue?: string;
  alwaysNeutral?: boolean;
};

/**
 * Mockup pill row (screens 17/18/20/22/25): icon-leading select pills plus a
 * funnel button that opens a bottom sheet holding the remaining filters with
 * an active-count badge and a quiet reset. The pills stay real selects so
 * keyboard and screen-reader behavior (and the "combobox" anchors) survive.
 */
export function FilterPillRow({
  primary,
  secondary,
  onClear,
  clearLabel = 'Bersihkan filter',
  customContent,
  sheetContent,
}: {
  primary: FilterSelect[];
  secondary: FilterSelect[];
  onClear: () => void;
  clearLabel?: string;
  /** Visible extras under the pill row (e.g. custom date inputs). */
  customContent?: ReactNode;
  /** Extras inside the funnel sheet (e.g. date-range inputs). */
  sheetContent?: ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const secondaryActive = secondary.filter(isActive).length;
  return (
    <div className="filter-pills">
      <div className="filter-pills__row">
        {primary.map((filter) => (
          <PillSelect key={filter.id} filter={filter} />
        ))}
        <IconButton
          aria-label={`Filter lainnya${secondaryActive ? `, ${secondaryActive} aktif` : ''}`}
          className="filter-pills__funnel"
          onClick={() => setSheetOpen(true)}
        >
          <ListFilter size={18} />
          {secondaryActive ? (
            <span className="filter-pills__badge" aria-hidden="true">
              {secondaryActive}
            </span>
          ) : null}
        </IconButton>
      </div>
      {customContent}
      <Dialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Filter lainnya"
        description="Persempit daftar dengan filter tambahan."
        mobileSheet
      >
        <div className="filter-pills__sheet">
          {secondary.map((filter) => (
            <Select
              key={filter.id}
              label={filter.label}
              leading={filter.icon}
              value={filter.value}
              onValueChange={filter.onValueChange}
              options={filter.options}
            />
          ))}
          {sheetContent}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={onClear}>
              {clearLabel}
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Terapkan
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function isActive(filter: FilterSelect): boolean {
  if (filter.alwaysNeutral) return false;
  if (filter.neutralValue === undefined) return filter.value !== '';
  return filter.value !== '' && filter.value !== filter.neutralValue;
}

function PillSelect({ filter }: { filter: FilterSelect }) {
  return (
    <div className="filter-pills__pill" data-active={isActive(filter) || undefined}>
      <Select
        label={filter.label}
        hideLabel
        leading={filter.icon}
        value={filter.value}
        placeholder={filter.label}
        onValueChange={filter.onValueChange}
        options={filter.options}
      />
    </div>
  );
}
