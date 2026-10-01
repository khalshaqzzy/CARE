import { Alert, Button, ChoiceCardGroup } from '@care/ui';
import { Building2, Check, Factory, MapPinned, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { ShopOption, ShopResolution } from '../../workforce-api';

const NOT_SHOP = 'NOT_SHOP';

/**
 * Incident-shop confirmation on the draft review. Rendered only when the
 * classified category routes by location owner: an uncertain shop asks for a
 * one-tap answer, while a resolved one collapses to a row the reporter can change.
 */
export function ShopClarification({
  resolution,
  areaLabel,
  locationDetail,
  pending,
  error,
  onConfirm,
}: {
  resolution: ShopResolution;
  areaLabel: string;
  locationDetail: string;
  pending: boolean;
  error: string | null;
  onConfirm: (shopLocationId: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [choice, setChoice] = useState('');
  if (!resolution.applies) return null;
  const needsAnswer = resolution.status === 'NEEDS_CONFIRMATION';
  const confirm = (shopLocationId: string | null) => {
    setPicking(false);
    setChoice('');
    onConfirm(shopLocationId);
  };

  if (!needsAnswer && !picking) {
    const detected = resolution.status === 'RESOLVED' && resolution.shop;
    if (!detected && resolution.source === 'NO_MATCH' && !resolution.areaShops.length) return null;
    return (
      <section
        className="shop-clarify shop-clarify--done"
        aria-label="Lokasi kejadian"
        data-state={detected ? 'shop' : 'not-shop'}
      >
        <span
          className={`shop-clarify__icon${detected ? ' shop-clarify__icon--ok' : ''}`}
          aria-hidden="true"
        >
          {detected ? <Check size={18} /> : <Building2 size={18} />}
        </span>
        <div className="shop-clarify__done-body">
          <small>Lokasi kejadian</small>
          <strong>
            {detected
              ? `${resolution.shop!.department} · ${areaLabel}`
              : resolution.source === 'REPORTER_NOT_SHOP'
                ? 'Bukan di area shop'
                : 'Tidak terdeteksi di area shop'}
          </strong>
        </div>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPicking(true)}>
          <Pencil size={14} />{' '}
          {detected || resolution.source === 'REPORTER_NOT_SHOP' ? 'Ubah' : 'Pilih shop'}
        </Button>
      </section>
    );
  }

  const single = needsAnswer && !picking && resolution.candidates.length === 1;
  const pool: ShopOption[] = picking ? resolution.areaShops : resolution.candidates;
  return (
    <section className="shop-clarify" aria-label="Konfirmasi lokasi kejadian">
      <header className="shop-clarify__head">
        <span className="shop-clarify__icon" aria-hidden="true">
          <MapPinned size={18} />
        </span>
        <div>
          <h2>Konfirmasi lokasi kejadian</h2>
          <p>
            Anda menulis <q>{locationDetail}</q> di {areaLabel}. Pilih Shop agar Voice diterima oleh
            PIC yang tepat.
          </p>
        </div>
      </header>
      {error ? (
        <Alert tone="danger" title="Lokasi belum tersimpan">
          {error}
        </Alert>
      ) : null}
      {single ? (
        <>
          <p className="shop-clarify__question">
            Apakah maksud Anda <strong>{resolution.candidates[0]!.department}</strong>{' '}
            {`(${areaLabel})?`}
          </p>
          <div className="shop-clarify__actions">
            <Button
              variant="primary"
              loading={pending}
              onClick={() => confirm(resolution.candidates[0]!.id)}
            >
              <Check size={16} /> Ya, benar
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setPicking(true)}>
              Pilih shop lain
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => confirm(null)}>
              Bukan di shop
            </Button>
          </div>
        </>
      ) : (
        <>
          <ChoiceCardGroup
            label={picking ? `Shop di ${areaLabel}` : 'Shop yang dimaksud'}
            value={choice}
            onValueChange={setChoice}
            columns={1}
            indicator="radio"
            appearance="brand"
            disabled={pending}
            options={[
              ...pool.map((shop) => ({
                value: shop.id,
                label: shop.department,
                icon: <Factory size={18} />,
              })),
              {
                value: NOT_SHOP,
                label: 'Bukan di area shop',
                description: 'Office, area umum, atau lainnya',
                icon: <Building2 size={18} />,
              },
            ]}
          />
          <div className="shop-clarify__actions">
            <Button
              variant="primary"
              loading={pending}
              disabled={!choice}
              onClick={() => confirm(choice === NOT_SHOP ? null : choice)}
            >
              <Check size={16} /> Konfirmasi lokasi
            </Button>
            {picking ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setPicking(false);
                  setChoice('');
                }}
              >
                Batal
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
