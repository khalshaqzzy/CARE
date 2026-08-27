import { Button } from '@care/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pager({
  page,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  loading,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: (() => void) | undefined;
  loading?: boolean;
}) {
  return (
    <nav className="pager" aria-label="Paginasi">
      <span className="pager__label">{loading ? 'Memuat…' : `Halaman ${page}`}</span>
      <div className="pager__buttons">
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasPrevious || loading}
          onClick={onPrevious}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={16} /> Sebelumnya
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasNext || !onNext || loading}
          onClick={onNext}
          aria-label="Halaman berikutnya"
        >
          Berikutnya <ChevronRight size={16} />
        </Button>
      </div>
    </nav>
  );
}
