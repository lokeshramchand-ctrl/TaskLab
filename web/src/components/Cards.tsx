'use client';
import Link from 'next/link';
import type { Item, Shelf, Track } from '@/lib/types';
import { artistNames, fmtTime, hrefFor } from '@/lib/format';
import { currentTrack, usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { Avatar, Cover } from './Art';
import { Icon } from './Icon';
import { Tile } from './Bento';
import { useMenu } from './Menu';
import { warmProps } from '@/lib/warm';

const CARD = 148;

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
          <span className="go"><Icon name={active && playing ? 'pause' : 'play'} size={14} /></span>
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
      <div className="art">{round ? <Avatar src={item.thumb} size="100%" /> : <Cover src={item.thumb} size="100%" />}</div>
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
      .it { display: block; width: ${CARD}px; text-align: left; border-radius: 6px; padding: 6px; margin: -6px; transition: background .12s var(--ease), transform .2s var(--spring); }
      .it:hover { background: var(--hover); }
      .it:active { transform: scale(.985); }
      .it .art { position: relative; width: 100%; aspect-ratio: 1; margin-bottom: 8px; }
      .it .t { font-weight: 500; font-size: 13px; color: var(--ink); }
      .it .s { color: var(--muted); font-size: 12px; margin-top: 1px; }
      .it .c { text-align: center; }
      .it.active .t { color: var(--peri-t); }
      .it .go { position: absolute; right: 6px; bottom: 6px; width: 28px; height: 28px; border-radius: 5px; display: grid; place-items: center; background: var(--signal); color: #fff; box-shadow: var(--lift-hi); opacity: 0; transform: translateY(4px); transition: opacity .15s var(--ease), transform .25s var(--spring); }
      .it:hover .go, .it:focus-visible .go, .it.active .go { opacity: 1; transform: none; }
      @media (max-width: 900px) { .it { width: 128px; } }
    `}</style>
  );
}

export function ShelfRow({ shelf, action }: { shelf: Shelf; action?: React.ReactNode }) {
  const songs = shelf.items.filter((i): i is Track => i.kind === 'song');
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <h2>{shelf.title}</h2>
          {shelf.subtitle && <div className="sub">{shelf.subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="hscroll">
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
  return (
    <Tile span={span} md={12} kicker={kicker} title={shelf.title} sub={shelf.subtitle} action={action} label={shelf.title}>
      <div className="hscroll">
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
      {title && <div className="skeleton" style={{ width: 160, height: 18, borderRadius: 6, marginBottom: 14 }} />}
      <div className="hscroll">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ width: CARD }}>
            <div className="skeleton" style={{ width: CARD, height: CARD, borderRadius: 6, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: 110, height: 13, borderRadius: 5 }} />
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
      className={`trow${active ? ' active' : ''}`}
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
      {showIndex && <span className="idx">{active && playing ? <Bars /> : index + 1}</span>}
      {showArt && <Cover src={track.thumb} size={30} radius={4} />}
      <div className="grow">
        <div className="tt clamp1">
          {track.title}
          {track.explicit && <span className="e">E</span>}
        </div>
        <div className="ta clamp1">
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
          {track.album?.name && !showIndex && <span> · {track.album.name}</span>}
        </div>
      </div>
      <button
        className={`icon-btn sm like${liked ? ' on' : ''}`}
        aria-label={liked ? 'Unlike' : 'Like'}
        onClick={(e) => {
          e.stopPropagation();
          toggleLike(track);
        }}
      >
        <Icon name={liked ? 'heartFill' : 'heart'} size={17} />
      </button>
      <span className="dur">{track.duration ? fmtTime(track.duration) : ''}</span>
      <button
        className="icon-btn sm"
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          openMenu(e);
        }}
      >
        <Icon name="more" size={18} />
      </button>
      <style jsx>{`
        .trow { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 12px; border-radius: 0; cursor: pointer; transition: background .12s var(--ease); }
        .trow:hover { background: var(--hover); }
        .trow.active { background: var(--signal-soft); }
        .idx { width: 22px; text-align: right; color: var(--muted); font-size: 12px; }
        .tt { font-weight: 400; font-size: 13px; color: var(--ink); }
        .trow.active .tt { color: var(--peri-t); }
        .ta { color: var(--muted); font-size: 12px; margin-top: 0; }
        .ta :global(a:hover) { color: var(--text); text-decoration: underline; }
        .e { display: inline-grid; place-items: center; width: 14px; height: 14px; font-size: 9px; font-weight: 600; border-radius: 3px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border-2); color: var(--muted); margin-left: 8px; vertical-align: 1px; }
        .dur { width: 42px; text-align: right; color: var(--muted); font-size: 12px; }
        .like { opacity: 0; color: var(--muted); }
        .trow:hover .like, .like.on, .trow:focus-within .like { opacity: 1; }
        .like.on { color: var(--peri-t); }
        @media (max-width: 900px) { .dur { display: none; } .like { display: none; } .trow { gap: 10px; padding: 0 8px; } }
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
