import { Alert, Button, Dialog, IconButton, Skeleton, Stack, Textarea, EmptyState } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ImagePlus, Send, UserRound } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { clipParticipantName } from '../../lib/handling-target';
import { VoiceHero } from '../../components/VoiceHero';
import { MediaGallery } from '../../components/MediaGallery';
import { formatDayDivider, formatNotificationTime } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useConversation } from '../../lib/useConversation';
import type { Message, VoiceDetail } from '../../workforce-api';

/**
 * Dedicated conversation surface (screen 20 of the member redesign): the
 * compact voice hero, a day-grouped message log with sender labels, and a
 * composer pinned above the dock. Reachable from the detail page's
 * "Percakapan · Buka Chat" card; unreadable conversations redirect back.
 */
export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const detail = useQuery({
    queryKey: voiceQuery(sessionId, 'voice', id),
    queryFn: () => api.voiceDetail(id!),
    enabled: !!id && !!session,
    refetchInterval: 3000,
  });

  const back = () => {
    if (id) {
      void navigate(`/voices/${id}`);
      return;
    }
    // Deep links have no in-app history to return to; land on the root instead.
    if (window.history.length > 1 && location.key !== 'default') void navigate(-1);
    else void navigate('/');
  };

  if (detail.isLoading) {
    return (
      <Stack gap="lg">
        <Skeleton label="Memuat percakapan" />
      </Stack>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        title="Percakapan tidak tersedia"
        description="Voice tidak ditemukan atau Anda tidak memiliki akses."
      />
    );
  }

  const voice = detail.data;
  if (voice.conversationState === 'UNAVAILABLE') {
    return <Navigate to={`/voices/${voice.id}`} replace />;
  }

  return <ConversationSurface voice={voice} state={voice.conversationState} onBack={back} />;
}

function ConversationSurface({
  voice,
  state,
  onBack,
}: {
  voice: VoiceDetail;
  state: 'ACTIVE' | 'READ_ONLY';
  onBack: () => void;
}) {
  const { feed, items, send } = useConversation(voice.id);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousRef = useRef<{ first: string; last: string; height: number } | null>(null);
  const participants = voice.participants ?? [];

  useEffect(() => {
    const setHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--care-chat-viewport-height', `${height}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    window.visualViewport?.addEventListener('resize', setHeight);
    return () => {
      window.removeEventListener('resize', setHeight);
      window.visualViewport?.removeEventListener('resize', setHeight);
      document.documentElement.style.removeProperty('--care-chat-viewport-height');
    };
  }, []);

  useLayoutEffect(() => {
    const log = logRef.current;
    const first = items[0]?.id;
    const last = items[items.length - 1]?.id;
    if (!log || !first || !last) return;
    const previous = previousRef.current;
    if (!previous || (previous.last !== last && nearBottomRef.current)) {
      log.scrollTop = log.scrollHeight;
      setShowLatest(false);
    } else if (previous.first !== first && previous.last === last) {
      log.scrollTop += log.scrollHeight - previous.height;
    } else if (previous.last !== last) {
      setShowLatest(true);
    }
    previousRef.current = { first, last, height: log.scrollHeight };
  }, [items]);

  const groups: { key: string; label: string; messages: Message[] }[] = [];
  for (const message of items) {
    const day = formatDayDivider(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === day.key) last.messages.push(message);
    else groups.push({ key: day.key || message.id, label: day.label, messages: [message] });
  }

  return (
    <div className="chat-page">
      <div className="chat-page__fixed-head">
        <VoiceHero voice={voice} variant="compact" onBack={onBack} />
        <button
          type="button"
          className="chat-participants"
          onClick={() => setShowParticipants(true)}
          aria-label="Lihat peserta percakapan"
        >
          <span className="chat-participants__heading">
            <strong>Peserta percakapan</strong>
            <span>
              Lihat semua <ChevronRight size={15} aria-hidden="true" />
            </span>
          </span>
          <span className="chat-participants__people">
            {participants.map((participant) => (
              <span
                key={participant.id}
                className="chat-participant"
                aria-label={participant.displayName}
                title={participant.displayName}
              >
                <span className="chat-participant__avatar" aria-hidden="true">
                  {participant.displayName.slice(0, 1)}
                </span>
                <span>
                  <strong>{participant.displayName}</strong>
                  <small>{participantRole(participant.role)}</small>
                </span>
              </span>
            ))}
          </span>
        </button>
        <Dialog
          open={showParticipants}
          onOpenChange={setShowParticipants}
          mobileSheet
          title="Peserta percakapan"
          description="Pihak yang terlibat dalam penanganan Voice ini."
        >
          <ul className="chat-participant-list">
            {participants.map((participant) => (
              <li key={participant.id}>
                <strong>{participant.displayName}</strong>
                <span>{participantRole(participant.role)}</span>
              </li>
            ))}
          </ul>
        </Dialog>
        <div className="chat-head">
          <h2>Percakapan</h2>
          <span className="chat-head__count">
            {state === 'READ_ONLY' ? 'Hanya baca' : `${items.length} pesan`}
          </span>
        </div>
        {state === 'READ_ONLY' ? (
          <Alert
            tone="info"
            title={voice.status === 'CLOSED' ? 'Percakapan telah selesai' : 'Akses hanya baca'}
          >
            Riwayat tersedia untuk dibaca. Pengiriman pesan tidak tersedia pada akses ini.
          </Alert>
        ) : null}
        {send.isError ? (
          <Alert tone="danger" title="Pesan gagal dikirim">
            {send.error instanceof Error ? send.error.message : 'Coba kirim kembali.'}
          </Alert>
        ) : null}
        {feed.error ? (
          <Alert tone="danger" title="Percakapan gagal dimuat">
            Pesan akan dimuat ulang otomatis. Anda juga dapat memuat ulang halaman.
          </Alert>
        ) : null}
      </div>
      <div
        className="chat-log"
        role="log"
        aria-live="polite"
        ref={logRef}
        onScroll={(event) => {
          const log = event.currentTarget;
          nearBottomRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
          if (nearBottomRef.current) setShowLatest(false);
        }}
      >
        {feed.isLoading ? (
          <p className="chat-empty">Memuat percakapan…</p>
        ) : items.length === 0 ? (
          <p className="chat-empty">Belum ada pesan. Diskusikan tindak lanjut Voice di sini.</p>
        ) : (
          <>
            {feed.canLoadMore ? (
              <button
                type="button"
                className="chat-history"
                onClick={() => feed.loadMore()}
                disabled={feed.isFetching}
              >
                {feed.isFetching ? 'Memuat…' : 'Muat pesan sebelumnya'}
              </button>
            ) : null}
            {groups.map((group) => (
              <Fragment key={group.key}>
                <div className="chat-day" role="separator" aria-label={group.label}>
                  <span>{group.label}</span>
                </div>
                {group.messages.map((message) => (
                  <ChatMessage key={message.id} message={message} voice={voice} />
                ))}
              </Fragment>
            ))}
          </>
        )}
        {showLatest ? (
          <button
            type="button"
            className="chat-latest"
            onClick={() => {
              if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
              nearBottomRef.current = true;
              setShowLatest(false);
            }}
          >
            Pesan baru ↓
          </button>
        ) : null}
      </div>
      {state === 'ACTIVE' ? <Composer send={send} /> : null}
    </div>
  );
}

/** Resolves the other party's display label without leaking anonymous identity. */
function participantRole(role: string): string {
  return (
    (
      {
        REPORTER: 'Pelapor',
        DEPARTMENT_HEAD: 'Dept Head',
        SECTION_HEAD: 'Section Head',
        COMMITTEE: 'Komite',
      } as Record<string, string>
    )[role] ?? 'Responder'
  );
}
function senderLabel(message: Message, voice: VoiceDetail): string {
  if (message.sender?.alias) return message.sender.alias;
  if (message.sender?.displayName) return message.sender.displayName;
  const participant = voice.participants?.find((item) => item.id === message.senderId);
  if (participant) return participant.displayName;
  if (voice.visibility === 'PRIVATE') return 'Komite';
  if (message.senderId === voice.routeOwner?.id) return voice.routeOwner.displayName;
  if (voice.currentHandler && message.senderId === voice.currentHandler.id)
    return voice.currentHandler.displayName;
  return 'reporter' in voice && 'name' in voice.reporter ? String(voice.reporter.name) : 'Pelapor';
}

function ChatMessage({ message, voice }: { message: Message; voice: VoiceDetail }) {
  const { session } = useAuth();
  const isMine = message.senderId === session?.account.id;
  const label =
    message.sender?.alias ??
    (isMine
      ? voice.visibility === 'PRIVATE' && voice.audience !== 'REPORTER_SELF'
        ? 'Komite'
        : (message.sender?.displayName ?? session?.account.displayName ?? 'Anda')
      : senderLabel(message, voice));
  return (
    <article className={`chat-msg ${isMine ? 'is-mine' : 'is-theirs'}`}>
      {!isMine ? (
        <span className="chat-msg__avatar" aria-hidden="true">
          <UserRound size={15} />
        </span>
      ) : null}
      <div className="chat-msg__stack">
        <span className="chat-msg__sender" title={label} aria-label={label}>
          {clipParticipantName(label)}
          {isMine ? <small> · Anda</small> : null}
        </span>
        <div className="chat-msg__bubble">
          <span className="care-sr-only">{label}: </span>
          {message.text ? <p className="chat-msg__text">{message.text}</p> : null}
          {message.attachments?.length ? (
            <MediaGallery attachments={message.attachments} label="Lampiran" />
          ) : null}
        </div>
        <time className="chat-msg__time" dateTime={message.createdAt}>
          {formatNotificationTime(message.createdAt)}
        </time>
      </div>
    </article>
  );
}

function Composer({ send }: { send: ReturnType<typeof useConversation>['send'] }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // PRD §16: opening the room focuses the composer so the reporter or PIC can
  // answer immediately.
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  const pending = send.isPending;
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim() && !files.length) return;
        if (pending) return;
        send.mutate(
          { text, files },
          {
            onSuccess: () => {
              setText('');
              setFiles([]);
            },
          },
        );
      }}
    >
      <div className="chat-composer__row">
        <IconButton
          aria-label="Lampirkan gambar"
          className="chat-composer__attach"
          onClick={() => fileInput.current?.click()}
          disabled={pending || files.length >= 5}
        >
          <ImagePlus size={19} />
        </IconButton>
        <Textarea
          label="Pesan"
          hideLabel
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={1}
          maxLength={4000}
          placeholder="Tulis pesan…"
          disabled={pending}
          ref={fieldRef}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []).slice(0, 5 - files.length);
            setFiles((current) => [...current, ...picked]);
            event.currentTarget.value = '';
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="chat-composer__send"
          aria-label="Kirim pesan"
          loading={pending}
          disabled={pending || (!text.trim() && !files.length)}
        >
          <Send size={18} />
        </Button>
      </div>
      {files.length ? (
        <div className="chat-composer__picked">
          {files.map((file, index) => (
            <span className="chat-composer__picked-item" key={`${file.name}-${index}`}>
              {file.name}
              <button
                type="button"
                disabled={pending}
                aria-label={`Hapus ${file.name}`}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </form>
  );
}
