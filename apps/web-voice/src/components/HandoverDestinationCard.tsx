import { Building2, Check, CircleAlert, MapPinned, UserRound } from 'lucide-react';
import { categoryIcon } from '../lib/voice-visuals';
import type { HandoverOption } from '../workforce-api';

export function filterHandoverOptions(options: HandoverOption[], search: string) {
  const term = search.trim().toLocaleLowerCase('id-ID');
  if (!term) return options;
  return options.filter((option) =>
    [
      option.category.name,
      option.category.key,
      option.department?.department,
      option.department?.division,
      option.department?.directorate,
      option.pic?.displayName,
    ].some((value) => value?.toLocaleLowerCase('id-ID').includes(term)),
  );
}

export function HandoverDestinationCard({
  option,
  selected,
  onSelect,
}: {
  option: HandoverOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const CategoryIcon = categoryIcon(option.category.key ?? undefined);
  const context = [option.department?.directorate, option.department?.division]
    .filter(Boolean)
    .join(' · ');

  return (
    <label
      className="handover-destination"
      data-selected={selected || undefined}
      data-disabled={!option.available || undefined}
    >
      <input
        type="radio"
        name="handover-destination"
        value={option.category.id ?? ''}
        checked={selected}
        disabled={!option.available}
        onChange={onSelect}
      />
      <span className="handover-destination__category-icon" aria-hidden="true">
        <CategoryIcon size={21} />
      </span>
      <span className="handover-destination__body">
        <span className="handover-destination__heading">
          <strong>{option.category.name ?? option.category.key ?? 'Kategori'}</strong>
          {selected ? (
            <span className="handover-destination__check" aria-hidden="true">
              <Check size={15} strokeWidth={3} />
            </span>
          ) : null}
        </span>
        {option.isReporterDepartment ? (
          <span className="handover-destination__badge">
            <MapPinned size={13} aria-hidden="true" />
            Department Reporter
          </span>
        ) : null}
        {option.available ? (
          <span className="handover-destination__route">
            <span className="handover-destination__building" aria-hidden="true">
              <Building2 size={20} />
            </span>
            <span>
              <strong>{option.department?.department ?? 'Department'}</strong>
              {context ? <small>{context}</small> : null}
            </span>
          </span>
        ) : (
          <span className="handover-destination__warning">
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              <strong>Rute belum tersedia</strong>
              <small>
                {option.disabledReason ?? 'Hubungi CARE Admin untuk melengkapi rute kategori.'}
              </small>
            </span>
          </span>
        )}
        {option.pic ? (
          <span className="handover-destination__pic">
            <UserRound size={16} aria-hidden="true" />
            <span>
              <small>{option.pic.type === 'DEFAULT_PIC' ? 'Default PIC' : 'Department Head'}</small>
              <strong>{option.pic.displayName}</strong>
            </span>
          </span>
        ) : null}
      </span>
    </label>
  );
}
