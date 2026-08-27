import { Button, Card, IconButton, Textarea } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '@care/frontend-core';
import { formatDateTime } from '../lib/formatters';
import { idempotencyKey, useApi, useSessionId, voiceQuery } from '../lib/query';
import type { Message } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

export function ConversationPanel({ voiceId }: { voiceId: string }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const messages = useQuery({
    queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
    queryFn: () => api.voiceMessages(voiceId),
    enabled: !!session,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: () => api.sendMessage(voiceId, text, files, idempotencyKey('message')),
    onSuccess: () => {
      setText('');
      setFiles([]);
      void queryClient.invalidateQueries({
        queryKey: voiceQuery(sessionId, 'voice', voiceId, 'messages'),
      });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', voiceId) });
    },
  });

  const items = messages.data ?? [];

  return (
    <Card className="conversation">
      <div className="conversation__head">
        <h3>Percakapan</h3>
        <span className="conversation__count">{items.length} pesan</span>
      </div>
      <div className="conversation__list" role="log" aria-live="polite">
        {messages.isLoading ? (
          <p className="conversation__empty">Memuat percakapan…</p>
        ) : items.length === 0 ? (
          <p className="conversation__empty">Belum ada pesan. Mulai percakapan untuk verifikasi.</p>
        ) : (
          items.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
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
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const { session } = useAuth();
  const isMine = message.senderId === session?.account.id;
  return (
    <article className={`message is-${isMine ? 'mine' : 'theirs'}`}>
      <div className="message__meta">
        <span className="message__sender">
          {isMine ? 'Anda' : (message.sender?.alias ?? 'Responder')}
        </span>
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
      </div>
      {message.text ? <p className="message__text">{message.text}</p> : null}
      {message.attachments?.length ? (
        <MediaGallery attachments={message.attachments} label="Lampiran" />
      ) : null}
    </article>
  );
}
