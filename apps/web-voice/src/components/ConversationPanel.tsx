import { Alert, Button, Card, IconButton, Textarea } from '@care/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Send, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '@care/frontend-core';
import { formatNotificationTime } from '../lib/formatters';
import { useMutationKey, useApi, useSessionId, voiceQuery } from '../lib/query';
import { useCursorFeed } from '../lib/useCursorFeed';
import type { Message } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

const PAGE_SIZE = 50;

export function ConversationPanel({
  voiceId,
  state,
}: {
  voiceId: string;
  state: 'ACTIVE' | 'READ_ONLY';
}) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const messageKey = useMutationKey('message');

  const feed = useCursorFeed<Message>({
    queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
    fetchPage: (cursor) =>
      api.voiceMessages(voiceId, {
        limit: PAGE_SIZE,
        order: 'desc',
        ...(cursor ? { cursor } : {}),
      }),
    enabled: !!session,
    refetchInterval: 3000,
    resetKey: voiceId,
  });

  const send = useMutation({
    mutationFn: () => api.sendMessage(voiceId, text, files, messageKey.key()),
    onSuccess: () => {
      setText('');
      setFiles([]);
      void queryClient.invalidateQueries({
        queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
      });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', voiceId) });
    },
    onSettled: messageKey.reset,
  });

  // `feed.items` is newest-first; reverse so the newest message sits at the bottom.
  const items = [...feed.items].reverse();

  return (
    <Card className="conversation" id="voice-conversation" tabIndex={-1}>
      <div className="conversation__head">
        <div>
          <p className="care-eyebrow">Verifikasi</p>
          <h3>Percakapan</h3>
        </div>
        <span className="conversation__count">
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
      <div className="conversation__list" role="log" aria-live="polite">
        {feed.isLoading ? (
          <p className="conversation__empty">Memuat percakapan…</p>
        ) : items.length === 0 ? (
          <p className="conversation__empty">Belum ada pesan. Mulai percakapan untuk verifikasi.</p>
        ) : (
          <>
            {feed.canLoadMore ? (
              <button
                type="button"
                className="conversation__history"
                onClick={() => feed.loadMore()}
                disabled={feed.isFetching}
              >
                {feed.isFetching ? 'Memuat…' : 'Muat pesan sebelumnya'}
              </button>
            ) : null}
            {items.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </>
        )}
      </div>
      {state === 'ACTIVE' ? (
        <form
          className="conversation__composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() || files.length) send.mutate();
          }}
        >
          <div className="conversation__input">
            <IconButton
              aria-label="Lampirkan gambar"
              onClick={() => fileInput.current?.click()}
              disabled={files.length >= 5}
            >
              <ImagePlus size={18} />
            </IconButton>
            <Textarea
              label="Pesan"
              hideLabel
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={1}
              maxLength={4000}
              placeholder="Tulis pesan…"
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
              aria-label="Kirim pesan"
              loading={send.isPending}
              disabled={!text.trim() && !files.length}
            >
              <Send size={18} />
            </Button>
          </div>
          {files.length ? (
            <div className="conversation__picked">
              {files.map((file, index) => (
                <span className="conversation__picked-item" key={`${file.name}-${index}`}>
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
      ) : null}
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const { session } = useAuth();
  const isMine = message.senderId === session?.account.id;
  return (
    <article className={`message is-${isMine ? 'mine' : 'theirs'}`}>
      {!isMine ? (
        <span className="message__avatar" aria-hidden="true">
          <UserRound size={15} />
        </span>
      ) : null}
      <div className="message__stack">
        <div className="message__bubble">
          <span className="care-sr-only">
            {isMine ? 'Anda: ' : `${message.sender?.alias ?? 'Responder'}: `}
          </span>
          {message.text ? <p className="message__text">{message.text}</p> : null}
          {message.attachments?.length ? (
            <MediaGallery attachments={message.attachments} label="Lampiran" />
          ) : null}
          <time className="message__time" dateTime={message.createdAt}>
            {formatNotificationTime(message.createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
}
