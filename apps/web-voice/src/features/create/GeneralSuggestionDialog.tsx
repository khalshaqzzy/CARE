import { Button, Dialog } from '@care/ui';
import { Briefcase } from 'lucide-react';

/** Offers General Voice for a Private Voice about a general workplace issue. */
export function GeneralSuggestionDialog({
  open,
  onKeepPrivate,
  onMoveToGeneral,
}: {
  open: boolean;
  onKeepPrivate: () => void;
  onMoveToGeneral: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeepPrivate();
      }}
      title="Cocok sebagai General Voice?"
      description="Isinya terlihat seperti masalah umum."
      mobileSheet
      footer={
        <div className="general-suggestion__actions">
          <Button variant="secondary" onClick={onKeepPrivate}>
            Tetap Private
          </Button>
          <Button variant="primary" onClick={onMoveToGeneral}>
            <Briefcase size={18} /> Pindah ke General
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0 }}>
        General Voice langsung diteruskan ke tim yang menangani, dan nama Anda terlihat oleh mereka.
        Isian Anda tetap tersimpan.
      </p>
    </Dialog>
  );
}
