import { Alert, Button, IconButton, Skeleton, Stack, Textarea, EmptyState } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Send, UserRound } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
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

  const groups: { key: string; label: string; messages: Message[] }[] = [];
  for (const message of items) {
    const day = formatDayDivider(message.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === day.key) last.messages.push(message);
    else groups.push({ key: day.key || message.id, label: day.label, messages: [message] });
  }

  return (
    <div className="chat-page">
      <VoiceHero voice={voice} variant="compact" onBack={onBack} />
      <div className="chat-head">
        <h2>Percakapan</h2>
        <span className="chat-head__count">
          {state === 'READ_ONLY' ? 'Hanya baca' : `${items.length} pesan`}
        </span>
      </div>
      {state === 'READ_ONLY' ? (
        <Alert tone="info" title="Percakapan telah selesai">
          Riwayat tetap tersedia, tetapi pesan baru tidak dapat dikirim pada status ini.
        </Alert>
      ) : null}
      {send.isError ? (
        <Alert tone="danger" title="Pesan gagal dikirim">
          {send.error instanceof Error ? send.error.message : 'Coba kirim kembali.'}
        </Alert>
      ) : null}
      <div className="chat-log" role="log" aria-live="polite">
        {feed.isLoading ? (
          <p className="chat-empty">Memuat percakapan…</p>
        ) : items.length === 0 ? (
          <p className="chat-empty">Belum ada pesan. Mulai percakapan untuk verifikasi.</p>
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
            <ChatAnchor items={items} />
          </>
        )}
      </div>
      {state === 'ACTIVE' ? <Composer send={send} /> : null}
    </div>
  );
}

/** Keeps the latest message in view once a conversation is already open. */
function ChatAnchor({ items }: { items: Message[] }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (lastIdRef.current && last.id !== lastIdRef.current) {
      anchorRef.current?.scrollIntoView();
    }
    lastIdRef.current = last.id;
  }, [items]);
  return <div ref={anchorRef} aria-hidden="true" />;
}

/** Resolves the other party's display label without leaking anonymous identity. */
function senderLabel(message: Message, voice: VoiceDetail): string {
  if (message.sender?.alias) return message.sender.alias;
  if (voice.currentHandler && message.senderId === voice.currentHandler.id) {
    return voice.currentHandler.displayName;
  }
  switch (voice.audience) {
    case 'REPORTER_SELF':
      return voice.currentHandler?.displayName ?? voice.routeOwner?.displayName ?? 'PIC';
    case 'UNION_IDENTIFIED':
      return voice.reporter.name;
    case 'UNION_ANONYMOUS':
      return voice.anonymousReporter.alias;
    case 'GENERAL_RESPONDER':
      return voice.reporter.name;
    case 'LEADERSHIP_GENERAL_READ_ONLY': {
      // Leadership contract keeps the reporter snapshot loose; read defensively.
      const reporter = voice.reporter as { name?: string };
      return reporter.name ?? 'Reporter';
    }
    default:
      return 'Responder';
  }
}

function ChatMessage({ message, voice }: { message: Message; voice: VoiceDetail }) {
  const { session } = useAuth();
  const isMine = message.senderId === session?.account.id;
  const label = isMine ? 'Anda' : senderLabel(message, voice);
  return (
    <article className={`chat-msg ${isMine ? 'is-mine' : 'is-theirs'}`}>
      {!isMine ? (
        <span className="chat-msg__avatar" aria-hidden="true">
          <UserRound size={15} />
        </span>
      ) : null}
      <div className="chat-msg__stack">
        <span className="chat-msg__sender">{label}</span>
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
        send.mutate({ text, files });
        setText('');
        setFiles([]);
      }}
    >
      <div className="chat-composer__row">
        <IconButton
          aria-label="Lampirkan gambar"
          className="chat-composer__attach"
          onClick={() => fileInput.current?.click()}
          disabled={files.length >= 5}
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
          disabled={!text.trim() && !files.length}
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
