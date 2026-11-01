import { Button } from '@care/ui';
import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/** Hero shortcut to the Panduan page, beside the notification bell. */
export function GuideButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="member-hero__orb"
      aria-label="Buka panduan"
      onClick={() => void navigate('/panduan')}
    >
      <BookOpen size={20} />
    </Button>
  );
}
