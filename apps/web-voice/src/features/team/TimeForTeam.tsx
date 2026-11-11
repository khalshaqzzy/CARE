import { Button, Dialog } from '@care/ui';
import { useAuth } from '@care/frontend-core';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Dumbbell,
  Ellipsis,
  Heart,
  HeartHandshake,
  Hourglass,
  ImagePlus,
  MessageCircle,
  Presentation,
  Trophy,
  UsersRound,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { initials } from '../home/DashboardPeople';
import {
  TEAM_POSTS,
  type TeamPost,
  type TeamPhotoScene,
  type TeamPhotoTone,
} from './time-for-team-data';
import './time-for-team.css';

const SCENE_ICONS: Record<TeamPhotoScene, typeof Dumbbell> = {
  briefing: Presentation,
  meal: UtensilsCrossed,
  sport: Dumbbell,
  award: Trophy,
  sharing: UsersRound,
};

/** Stand-in photo for the design round: a tinted frame with the activity icon. */
export function TeamPhoto({
  tone,
  scene,
  size = 44,
}: {
  tone: TeamPhotoTone;
  scene: TeamPhotoScene;
  size?: number;
}) {
  const Icon = SCENE_ICONS[scene];
  return (
    <span className="tft-photo" data-tone={tone} aria-hidden="true">
      <Icon size={size} strokeWidth={1.5} />
    </span>
  );
}

/** Coming Soon illustration: a blue calendar with an orange hourglass, drawn in CSS. */
function ComingSoonArt() {
  return (
    <span className="tft-soon__art" aria-hidden="true">
      <span className="tft-soon__ray tft-soon__ray--a" />
      <span className="tft-soon__ray tft-soon__ray--b" />
      <span className="tft-soon__ray tft-soon__ray--c" />
      <span className="tft-soon__ray tft-soon__ray--d" />
      <span className="tft-soon__calendar">
        <span className="tft-soon__rings" />
        <span className="tft-soon__days" />
      </span>
      <span className="tft-soon__hourglass">
        <Hourglass size={22} strokeWidth={2.5} />
      </span>
    </span>
  );
}

/**
 * Home entryway (approved design): one tappable card under the profile hero.
 * Until Time for Team is released it opens a Coming Soon dialog, not the page.
 */
export function TimeForTeamCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tft-card tft-entry ops-span-2"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="tft-entry__icon" aria-hidden="true">
          <HeartHandshake size={38} strokeWidth={2.25} />
        </span>
        <span className="tft-entry__text">
          <span className="tft-entry__title">
            <strong>Time for Team</strong>
            <span className="tft-badge">Coming Soon</span>
          </span>
          <span className="tft-entry__desc">Aktivitas kebersamaan untuk memperkuat tim.</span>
        </span>
        <ChevronRight className="tft-entry__chevron" size={24} aria-hidden="true" />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Time for Team"
        size="sm"
        className="tft-soon-dialog"
      >
        <div className="tft-card tft-soon">
          <ComingSoonArt />
          <p className="tft-soon__title" aria-hidden="true">
            Time for Team
          </p>
          <span className="tft-badge tft-badge--lg">Coming Soon</span>
          <p className="tft-soon__text">
            Fitur Time for Team akan segera hadir di CARE. Nantikan pembaruannya!
          </p>
        </div>
      </Dialog>
    </>
  );
}

function PhotoGrid({ photos }: { photos: TeamPost['photos'] }) {
  return (
    <div className="tft-post__photos" data-count={Math.min(photos.length, 3)}>
      {photos.slice(0, 3).map((photo, i) => (
        <TeamPhoto key={i} {...photo} size={i === 0 ? 56 : 36} />
      ))}
    </div>
  );
}

function PostCard({ post }: { post: TeamPost }) {
  const [liked, setLiked] = useState(Boolean(post.liked));
  const likes = post.likes + (liked && !post.liked ? 1 : 0) - (!liked && post.liked ? 1 : 0);
  return (
    <article className="tft-post" aria-label={`Kegiatan oleh ${post.author.name}`}>
      <header className="tft-post__head">
        <span className="tft-avatar" aria-hidden="true">
          {initials(post.author.name)}
        </span>
        <span className="tft-post__who">
          <strong>{post.author.name}</strong>
          <small>
            {post.author.role} · {post.author.unit} · {post.postedAt}
          </small>
        </span>
        <button type="button" className="tft-icon-button" aria-label="Opsi">
          <Ellipsis size={18} aria-hidden="true" />
        </button>
      </header>
      <p className="tft-post__caption">{post.caption}</p>
      <PhotoGrid photos={post.photos} />
      <p className="tft-post__with">
        <UsersRound size={14} aria-hidden="true" /> Bersama {post.participants} anggota tim
      </p>
      <footer className="tft-post__actions">
        <button
          type="button"
          aria-pressed={liked}
          className="tft-react"
          onClick={() => setLiked((v) => !v)}
        >
          <Heart size={18} aria-hidden="true" /> {likes}
        </button>
        <button type="button" className="tft-react">
          <MessageCircle size={18} aria-hidden="true" /> {post.comments}
        </button>
      </footer>
      {post.firstComment ? (
        <p className="tft-post__comment">
          <strong>{post.firstComment.name}</strong> {post.firstComment.text}
        </p>
      ) : null}
    </article>
  );
}

function Composer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Bagikan kegiatan" mobileSheet>
      <div className="tft-compose">
        <div className="tft-compose__photos">
          <TeamPhoto tone="sunrise" scene="sport" size={28} />
          <TeamPhoto tone="sky" scene="briefing" size={28} />
          <button type="button" className="tft-compose__add" aria-label="Tambah foto">
            <ImagePlus size={22} aria-hidden="true" />
          </button>
        </div>
        <label className="tft-compose__field">
          <span>Cerita kegiatan</span>
          <textarea rows={3} defaultValue="Senam pagi dan briefing safety bareng tim Line 2." />
        </label>
        <div className="tft-compose__field">
          <span>Bersama</span>
          <button type="button" className="tft-compose__team">
            <UsersRound size={16} aria-hidden="true" /> Tim Production Control · 18 orang
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Batal
        </Button>
        <Button onClick={() => onOpenChange(false)}>Posting</Button>
      </div>
    </Dialog>
  );
}

export function TimeForTeamPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const composing = params.get('compose') === '1';
  const setComposing = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('compose', '1');
    else next.delete('compose');
    setParams(next);
  };
  const name = session?.account.displayName ?? '';
  const posts = tab === 'mine' ? TEAM_POSTS.filter((p) => p.mine) : TEAM_POSTS;
  return (
    <div className="tft">
      <header className="tft__top">
        <button
          type="button"
          className="tft-icon-button"
          aria-label="Kembali"
          onClick={() => void navigate('/')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1>
          <HeartHandshake size={20} aria-hidden="true" /> Time for Team
        </h1>
      </header>
      <div className="tft__layout">
        <div className="tft__feed">
          <button type="button" className="tft-composer" onClick={() => setComposing(true)}>
            <span className="tft-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="tft-composer__prompt">Bagikan kegiatan bersama tim…</span>
            <span className="tft-composer__camera" aria-hidden="true">
              <Camera size={18} />
            </span>
          </button>
          <div
            className="ops-segmented ops-segmented--small tft__tabs"
            role="group"
            aria-label="Tampilan"
          >
            {(
              [
                ['all', 'Semua'],
                ['mine', 'Postingan saya'],
              ] as const
            ).map(([id, label]) => (
              <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        <aside className="tft__aside" aria-label="Ringkasan bulan ini">
          <section className="tft-summary">
            <h2>Oktober</h2>
            <div className="tft-summary__figures">
              <span>
                <strong>8</strong>
                <small>kegiatan</small>
              </span>
              <span>
                <strong>64</strong>
                <small>anggota terlibat</small>
              </span>
            </div>
            <ul className="tft-summary__units">
              <li>
                <span>Production Control</span>
                <strong>4</strong>
              </li>
              <li>
                <span>Quality Assurance</span>
                <strong>2</strong>
              </li>
              <li>
                <span>Assembly</span>
                <strong>2</strong>
              </li>
            </ul>
          </section>
        </aside>
      </div>
      <Composer open={composing} onOpenChange={setComposing} />
    </div>
  );
}
