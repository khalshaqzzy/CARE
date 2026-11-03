import { Dialog } from '@care/ui';
import { Camera, Images } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';

/**
 * Chrome on Android 14+ routes an image-only file input to the system photo
 * picker, which has no camera entry. Touch devices therefore choose the source
 * first: "Ambil foto" opens a `capture` input (the camera app), "Pilih dari
 * galeri" opens the page's existing gallery input. Mouse devices keep the
 * single file dialog, where `capture` would do nothing.
 */
export function prefersSourceChoice(scope: Partial<Pick<Window, 'matchMedia'>> = window) {
  try {
    return scope.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

export function usePhotoSource(galleryRef: RefObject<HTMLInputElement | null>) {
  const [open, setOpen] = useState(false);
  const start = () => {
    if (prefersSourceChoice()) setOpen(true);
    else galleryRef.current?.click();
  };
  return { open, setOpen, start };
}

export function PhotoSourceSheet({
  open,
  onOpenChange,
  galleryRef,
  onFiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  galleryRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  // The picker must open inside the tap's user activation, so each option
  // closes the sheet and clicks its input synchronously.
  const choose = (input: RefObject<HTMLInputElement | null>) => {
    onOpenChange(false);
    input.current?.click();
  };
  return (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        data-photo-source="camera"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <Dialog open={open} onOpenChange={onOpenChange} title="Tambah foto" size="sm" mobileSheet>
        <div className="photo-source">
          <button type="button" className="photo-source__option" onClick={() => choose(cameraRef)}>
            <Camera size={20} aria-hidden="true" /> Ambil foto
          </button>
          <button type="button" className="photo-source__option" onClick={() => choose(galleryRef)}>
            <Images size={20} aria-hidden="true" /> Pilih dari galeri
          </button>
        </div>
      </Dialog>
    </>
  );
}
