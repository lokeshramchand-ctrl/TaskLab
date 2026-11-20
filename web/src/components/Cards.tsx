'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Item, Shelf, Track } from '@/lib/types';
import { artistNames, fmtTime, hrefFor } from '@/lib/format';
import { currentTrack, usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { Avatar, Cover } from './Art';
import { Icon } from './Icon';
import { Tile } from './Bento';
import { useMenu } from './Menu';
import { warmProps } from '@/lib/warm';

const CARD = 168;

export function playTrackFrom(item: Track, siblings?: Track[], source = 'shelf') {
  const list = siblings?.length ? siblings : [item];
  const i = list.findIndex((t) => t.id === item.id);
  if (list.length > 1) usePlayer.getState().play(list, Math.max(0, i), { source });
  else usePlayer.getState().playRadio(item);
}

export function ItemCard({ item, siblings }: { item: Item; siblings?: Track[] }) {
  const cur = usePlayer((s) => currentTrack(s)?.id);
  const playing = usePlayer((s) => s.playing);
  if (item.kind === 'song') {
    const active = cur === item.id;
    return (
      <button
        className={`it${active ? ' active' : ''}`}
        onClick={() => playTrackFrom(item, siblings)}
        onContextMenu={(e) => {
          e.preventDefault();
          useMenu.getState().open(item, e);
        }}
        title={`${item.title} — ${artistNames(item.artists)}`}
        {...warmProps(item.id)}
      >
        <div className="art">
          <Cover src={item.thumb} size="100%" />
          <span className="go"><Icon name={active && playing ? 'pause' : 'play'} size={18} /></span>
        </div>
        <div className="t clamp1">{item.title}</div>
        <div className="s clamp1">{artistNames(item.artists)}</div>
        <CardStyle />
      </button>
    );
  }
  const href = hrefFor(item)!;
  const round = item.kind === 'artist';
  return (
    <Link href={href} className="it" title={item.title}>
      <div className="art">
        {round ? <Avatar src={item.thumb} size="100%" /> : <Cover src={item.thumb} size="100%" radius={6} />}
        <span
          className="go"
          role="button"
          aria-label={`Play ${item.title}`}
          onClick={(e) => {
            // The green button plays straight away (like Spotify); the rest of the card opens the page.
            e.preventDefault();
            e.stopPropagation();
            playItem(item);
          }}
        >
          <Icon name="play" size={18} />
        </span>
      </div>
      <div className={`t clamp1${round ? ' c' : ''}`}>{item.title}</div>
      <div className={`s clamp1${round ? ' c' : ''}`}>
        {item.kind === 'album' ? [item.subtitle ?? artistNames(item.artists)].filter(Boolean).join(' · ') : item.subtitle}
      </div>
      <CardStyle />
    </Link>
  );
}

function CardStyle() {
  return (
    <style jsx global>{`
      .it { display: block; width: 100%; min-width: 0; text-align: left; border-radius: 8px; padding: 12px; background: var(--surface); transition: background .3s var(--ease); }
      .it:hover { background: var(--card-hover); }
      .it .art { position: relative; width: 100%; aspect-ratio: 1; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0, 0, 0, .5); border-radius: 6px; }
      .it .art:has(.round) { border-radius: 50%; }
      .it .t { font-weight: 700; font-size: 16px; color: var(--ink); line-height: 1.3; }
      .it .s { color: var(--muted); font-size: 14px; margin-top: 4px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .it .c { text-align: left; }
      .it.active .t { color: var(--signal); }
      .it .go { position: absolute; right: 8px; bottom: 8px; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--signal); color: #000; box-shadow: 0 8px 8px rgba(0, 0, 0, .3); opacity: 0; transform: translateY(8px); transition: opacity .3s var(--ease), transform .3s var(--ease); }
      .it .go:hover { transform: scale(1.06); background: var(--signal-hi); }
      .it:hover .go, .it:focus-visible .go, .it.active .go { opacity: 1; transform: none; }
      .it:hover .go:hover { transform: scale(1.06); }
      @media (max-width: 900px) { .it { padding: 8px; } .it .t { font-size: 14px; } .it .s { font-size: 12px; } .it .go { width: 40px; height: 40px; } }
    `}</style>
  );
}

/** Plays what a card stands for: a song (with its shelf as the queue) or the radio of an album / playlist / artist. */
function playItem(item: Item) {
  if (item.kind === 'song') return playTrackFrom(item);
  const path = item.kind === 'album' ? `/api/album/${item.id}` : item.kind === 'artist' ? `/api/artist/${item.id}` : `/api/playlist/${item.id}`;
  fetch(path)
    .then((r) => r.json())
    .then((d: { tracks?: Track[]; topSongs?: Track[] }) => {
      const list = d.tracks?.length ? d.tracks : d.topSongs ?? [];
      if (list.length) usePlayer.getState().play(list, 0, { source: `${item.kind}:${item.id}` });
    })
    .catch(() => {});
}

function ShowAll({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button className="showall" onClick={onToggle}>
      {open ? 'Show less' : 'Show all'}
    </button>
  );
}

export function ShelfRow({ shelf, action }: { shelf: Shelf; action?: React.ReactNode }) {
  const songs = shelf.items.filter((i): i is Track => i.kind === 'song');
  const [open, setOpen] = useState(false);
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <h2>{shelf.title}</h2>
          {shelf.subtitle && <div className="sub">{shelf.subtitle}</div>}
        </div>
        {action}
        <ShowAll open={open} onToggle={() => setOpen(!open)} />
      </div>
      <div className={`hscroll${open ? ' open' : ''}`}>
        {shelf.items.map((it) => (
          <ItemCard key={`${it.kind}:${it.id}`} item={it} siblings={songs.length > 1 ? songs : undefined} />
        ))}
      </div>
    </section>
  );
}

/** A shelf as a bento tile: title and kicker on top, cards scrolling inside. */
export function ShelfTile({ shelf, action, kicker, span = 12 }: { shelf: Shelf; action?: React.ReactNode; kicker?: string; span?: number }) {
  const songs = shelf.items.filter((i): i is Track => i.kind === 'song');
  const [open, setOpen] = useState(false);
  return (
    <Tile
      span={span}
      md={12}
      kicker={kicker}
      title={shelf.title}
      sub={shelf.subtitle}
      action={
        <>
          {action}
          <ShowAll open={open} onToggle={() => setOpen(!open)} />
        </>
      }
      label={shelf.title}
    >
      <div className={`hscroll${open ? ' open' : ''}`}>
        {shelf.items.map((it) => (
          <ItemCard key={`${it.kind}:${it.id}`} item={it} siblings={songs.length > 1 ? songs : undefined} />
        ))}
      </div>
    </Tile>
  );
}

export function ShelfSkeleton({ title = true }: { title?: boolean }) {
  return (
    <section>
      {title && <div className="skeleton" style={{ width: 160, height: 24, borderRadius: 6, marginBottom: 14 }} />}
      <div className="hscroll">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ padding: 12, borderRadius: 8, background: 'var(--surface)' }}>
            <div className="skeleton" style={{ width: '100%', aspectRatio: '1', borderRadius: 6, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: '70%', height: 16, borderRadius: 5, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 5 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrackRow({
  track,
  index,
  list,
  showIndex,
  showArt = true,
  playlistId,
}: {
  track: Track;
  index: number;
  list: Track[];
  showIndex?: boolean;
  showArt?: boolean;
  playlistId?: string;
}) {
  const active = usePlayer((s) => currentTrack(s)?.id === track.id);
  const playing = usePlayer((s) => s.playing);
  const liked = useLibrary((s) => !!s.liked[track.id]);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const openMenu = (e: { clientX: number; clientY: number }) => useMenu.getState().open(track, e, playlistId ? { playlistId, playlistIndex: index } : undefined);
  return (
    <div
      className={`trow${active ? ' active' : ''}${showIndex ? ' idxrow' : ''}`}
      role="button"
      tabIndex={0}
      {...warmProps(track.id)}
      onClick={() => usePlayer.getState().play(list, index, { source: 'list' })}
      onKeyDown={(e) => e.key === 'Enter' && usePlayer.getState().play(list, index)}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e);
      }}
    >
      {showIndex && (
        <span className="idx">
          <span className="n">{active && playing ? <Bars /> : index + 1}</span>
          <span className="p"><Icon name={active && playing ? 'pause' : 'play'} size={14} /></span>
        </span>
      )}
      {showArt && <Cover src={track.thumb} size={40} radius={4} />}
      <div className="grow">
        <div className="tt clamp1">{track.title}</div>
        <div className="ta clamp1">
          {track.explicit && <span className="e">E</span>}
          {track.artists.map((a, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {a.id ? (
                <Link href={`/artist/${a.id}`} onClick={(e) => e.stopPropagation()}>
                  {a.name}
                </Link>
              ) : (
                a.name
              )}
            </span>
          ))}
        </div>
      </div>
      {!showIndex && track.album?.name && (
        <div className="alb clamp1">
          {track.album.id ? (
            <Link href={`/album/${track.album.id}`} onClick={(e) => e.stopPropagation()}>
              {track.album.name}
            </Link>
          ) : (
            track.album.name
          )}
        </div>
      )}
      <button
        className={`icon-btn sm like${liked ? ' on' : ''}`}
        aria-label={liked ? 'Unlike' : 'Like'}
        onClick={(e) => {
          e.stopPropagation();
          toggleLike(track);
        }}
      >
        <Icon name={liked ? 'heartFill' : 'heart'} size={18} />
      </button>
      <span className="dur">{track.duration ? fmtTime(track.duration) : ''}</span>
      <button
        className="icon-btn sm more"
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          openMenu(e);
        }}
      >
        <Icon name="more" size={18} />
      </button>
      <style jsx>{`
        .trow { display: flex; align-items: center; gap: 16px; height: 56px; padding: 0 16px; border-radius: 4px; cursor: pointer; }
        .trow:hover { background: var(--row-hover); }
        .trow.active { background: transparent; }
        .idx { position: relative; width: 20px; height: 20px; flex: none; display: grid; place-items: center; text-align: right; color: var(--muted); font-size: 16px; }
        .idx .p { position: absolute; inset: 0; display: none; place-items: center; color: var(--ink); }
        .trow:hover .idx .n { visibility: hidden; }
        .trow:hover .idx .p { display: grid; }
        .tt { font-weight: 400; font-size: 16px; color: var(--ink); }
        .trow.active .tt { color: var(--signal); }
        .ta { color: var(--muted); font-size: 14px; margin-top: 0; }
        .trow:hover .ta { color: var(--ink); }
        .ta :global(a:hover), .alb :global(a:hover) { color: var(--ink); text-decoration: underline; }
        .e { display: inline-grid; place-items: center; width: 16px; height: 16px; font-size: 10px; font-weight: 700; border-radius: 2px; background: var(--muted); color: #000; margin-right: 6px; vertical-align: 1px; }
        .alb { flex: 0 0 28%; color: var(--muted); font-size: 14px; }
        .trow:hover .alb { color: var(--ink); }
        .dur { width: 44px; text-align: right; color: var(--muted); font-size: 14px; }
        .like, .more { opacity: 0; color: var(--muted); }
        .trow:hover .like, .like.on, .trow:focus-within .like, .trow:hover .more, .trow:focus-within .more { opacity: 1; }
        .like.on { color: var(--signal); }
        @media (max-width: 1100px) { .alb { display: none; } }
        @media (max-width: 900px) { .dur { display: none; } .like { display: none; } .more { opacity: 1; } .trow { gap: 12px; padding: 0 8px; } }
      `}</style>
    </div>
  );
}

export function Bars() {
  return (
    <span className="bars" aria-label="Playing">
      <i /><i /><i />
      <style jsx>{`
        .bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 13px; }
        .bars i { width: 3px; background: var(--signal); border-radius: 2px; animation: b .9s ease-in-out infinite; }
        .bars i:nth-child(2) { animation-delay: -.3s; }
        .bars i:nth-child(3) { animation-delay: -.6s; }
        @keyframes b { 0%, 100% { height: 4px; } 50% { height: 13px; } }
      `}</style>
    </span>
  );
}
