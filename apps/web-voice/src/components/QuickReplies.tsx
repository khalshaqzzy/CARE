import { useAuth } from '@care/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { useApi, useSessionId, voiceQuery } from '../lib/query';
import type { components } from '@care/contracts';

type Groups = components['schemas']['QuickReplyGroups'];
export type QuickReplyPlacement = keyof Groups;
type QuickReply = components['schemas']['QuickReplyItem'];

/** Fills an empty note, swaps an untouched quick reply, otherwise appends. */
export function applyQuickReply(current: string, text: string, items: QuickReply[]) {
  const trimmed = current.trim();
  if (!trimmed || items.some((item) => item.text === trimmed)) return text;
  return `${current.trimEnd()}\n${text}`;
}

/**
 * Jawaban Cepat: CARE Admin's ready-made sentences for this responder action,
 * shown as chips above the note. Nothing renders when the place has none.
 */
export function QuickReplies({
  placement,
  value,
  onChange,
  disabled,
}: {
  placement: QuickReplyPlacement;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const groups = useQuery({
    queryKey: voiceQuery(sessionId, 'quick-replies'),
    queryFn: () => api.quickReplies(),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
  const items = groups.data?.[placement] ?? [];
  if (!items.length) return null;
  return (
    <div className="quick-replies" role="group" aria-label="Jawaban cepat">
      <span className="quick-replies__label" aria-hidden="true">
        <Zap size={14} /> Jawaban cepat
      </span>
      <div className="quick-replies__list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={value.trim() === item.text}
            title={item.text}
            disabled={disabled}
            onClick={() => onChange(applyQuickReply(value, item.text, items))}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
