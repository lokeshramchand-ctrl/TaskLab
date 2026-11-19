'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ArtistRef, Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { Cover } from './Art';
import { Icon } from './Icon';
import { TrackRow } from './Cards';
import { useTint } from '@/lib/tint';

/** Shared header + tracklist for albums and playlists. */
export function Collection({
  kind,
  title,
  thumb,
  artists,
  meta,
  description,
  tracks,
  source,
  numbered,
  actions,
  playlistId,
  cover,
  empty,
  heading,
}: {
  kind: string;
  title: string;
  thumb?: string;
  artists?: ArtistRef[];
  meta?: string;
  description?: string;
  tracks: Track[];
  source: string;
  numbered?: boolean;
  actions?: React.ReactNode;
  playlistId?: string;
  cover?: React.ReactNode;
  empty?: React.ReactNode;
  heading?: React.ReactNode;
}) {
  const [more, setMore] = useState(false);
  const tint = useTint(thumb);
  return (
    <div className="fade-in dh-page" style={tint ? ({ ['--tint' as string]: tint } as React.CSSProperties) : undefined}>
      <div className="dh-wash" aria-hidden />
      <header className="dh">
        <div className="dh-art">{cover ?? <Cover src={thumb} size="100%" radius={16} />}</div>
        {heading ?? <h1 className="dh-title clamp2">{title}</h1>}
        {artists && artists.length > 0 && (
          <div className="dh-sub">
            {artists.map((a, i) => (
              <span key={i}>
                {i > 0 && ', '}
                {a.id ? <Link href={`/artist/${a.id}`}>{a.name}</Link> : a.name}
              </span>
            ))}
          </div>
        )}
        {meta && <div className="dh-meta">{[kind, meta].join(' · ')}</div>}
        <div className="dh-actions">
          <button className="dh-round" aria-label="Shuffle" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source, shuffle: true })}>
            <Icon name="shuffle" size={20} />
          </button>
          <button className="dh-play" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source })}>
            <Icon name="play" size={16} /> Play
          </button>
          {actions}
        </div>
        {description && (
          <div>
            <p className={`dh-desc${more ? '' : ' clamp2'}`}>{description}</p>
            {description.length > 140 && (
              <button className="dh-more" onClick={() => setMore(!more)}>
                {more ? 'Show less' : 'More'}
              </button>
            )}
          </div>
        )}
      </header>
      {!tracks.length && empty}
      <div className="dh-list">
        {tracks.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} track={t} index={i} list={tracks} showIndex={numbered} showArt={!numbered} playlistId={playlistId} />
        ))}
      </div>
    </div>
  );
}

export function PageError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="callout err" style={{ maxWidth: 560 }}>
      <Icon name="warn" size={20} />
      <div className="grow">
        <b>Couldn&apos;t load this page</b>
        <div className="small">{error instanceof Error ? error.message : String(error ?? 'Unknown error')}</div>
      </div>
      {retry && (
        <button className="btn sm" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="card pad" style={{ display: 'flex', gap: 28, alignItems: 'flex-end' }}>
      <div className="skeleton" style={{ width: 208, height: 208, borderRadius: 14 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ width: '55%', height: 38, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '25%', height: 16, borderRadius: 6, marginTop: 14 }} />
      </div>
    </div>
  );
}
