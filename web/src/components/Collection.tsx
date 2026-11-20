'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ArtistRef, Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { Cover } from './Art';
import { Icon } from './Icon';
import { Bento, Tile } from './Bento';
import { TrackRow } from './Cards';

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
  extra,
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
  extra?: React.ReactNode;
}) {
  const [more, setMore] = useState(false);
  const rows: [string, React.ReactNode][] = [
    ['Type', kind],
    ['Songs', tracks.length],
    ...(meta ? ([['Details', meta]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Bento className="fade-in">
      <Tile span={12} tone="glow" className="hd" label={`${kind} header`}>
        <div className="ph-head">
          <div className="ph-art">{cover ?? <Cover src={thumb} size="100%" radius={8} />}</div>
          <div className="ph-info">
            <div className="ph-kind">{kind}</div>
            {heading ?? <h1 className="ph-title clamp2">{title}</h1>}
            {artists && artists.length > 0 && (
              <div className="ph-sub">
                {artists.map((a, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {a.id ? <Link href={`/artist/${a.id}`}>{a.name}</Link> : a.name}
                  </span>
                ))}
              </div>
            )}
            <div className="ph-actions">
              <button className="btn primary lg" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source })}>
                <Icon name="play" size={12} /> Play
              </button>
              <button className="btn lg" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source, shuffle: true })}>
                <Icon name="shuffle" size={14} /> Shuffle
              </button>
              {actions}
            </div>
          </div>
        </div>
      </Tile>

      {!tracks.length && (
        <Tile span={12} tone="quiet" label="Empty">
          {empty}
        </Tile>
      )}
      {tracks.length > 0 && (
        <>
          <Tile span={8} md={12} flush kicker="01" title="Songs" sub={`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`} label="Songs">
            <div className="list">
              {tracks.map((t, i) => (
                <TrackRow key={`${t.id}-${i}`} track={t} index={i} list={tracks} showIndex={numbered} showArt={!numbered} playlistId={playlistId} />
              ))}
            </div>
          </Tile>
          <Tile span={4} md={12} kicker="02" title="About" label="About">
            {description && (
              <div>
                <p className={`ph-desc${more ? '' : ' clamp4'}`}>{description}</p>
                {description.length > 140 && (
                  <button className="ph-more" onClick={() => setMore(!more)}>
                    {more ? 'Show less' : 'More'}
                  </button>
                )}
              </div>
            )}
            <dl className="facts">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Tile>
        </>
      )}
      {extra}
    </Bento>
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
    <div className="tile" style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-end' }}>
      <div className="skeleton" style={{ width: 136, height: 136, borderRadius: 6 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ width: '55%', height: 38, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '25%', height: 16, borderRadius: 6, marginTop: 14 }} />
      </div>
    </div>
  );
}
