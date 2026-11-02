import { useAuth } from '@care/frontend-core';
import { Button, Dialog } from '@care/ui';
import { useNavigate } from 'react-router-dom';

/**
 * Every "Keluar" control asks first: CARE stays signed in until logout, and
 * logging out stops Voice update notifications on this device.
 */
export function LogoutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Yakin keluar dari CARE?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onOpenChange(false);
              void logout().then(() => navigate('/login'));
            }}
          >
            Keluar
          </Button>
        </>
      }
    >
      <p className="dialog-copy">
        Notifikasi update Voice tidak akan masuk ke perangkat ini, jadi update bisa terlewat.
      </p>
    </Dialog>
  );
}
