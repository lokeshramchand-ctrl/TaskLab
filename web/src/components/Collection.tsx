'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { ArtistRef, Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { Cover } from './Art';
import { Icon } from './Icon';
import { Bento, Tile } from './Bento';
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
  useTint(thumb ?? tracks[0]?.thumb);
  const rows: [string, React.ReactNode][] = [
    ['Type', kind],
    ['Songs', tracks.length],
    ...(meta ? ([['Details', meta]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Bento className="fade-in">
      <Tile span={12} className="hd" label={`${kind} header`}>
        <div className="ph-head">
          <div className="ph-art">{cover ?? <Cover src={thumb} size="100%" radius={4} />}</div>
          <div className="ph-info">
            <div className="ph-kind">{kind}</div>
            {heading ?? <h1 className="ph-title clamp2">{title}</h1>}
            <div className="ph-sub">
              {artists?.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {a.id ? <Link href={`/artist/${a.id}`}>{a.name}</Link> : <b>{a.name}</b>}
                </span>
              ))}
              {artists && artists.length > 0 && meta && <span className="dot"> • </span>}
              {meta && <span>{meta}</span>}
            </div>
          </div>
        </div>
      </Tile>

      <div className="bento-full actionbar">
        <button className="bigplay" aria-label="Play" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source })}>
          <Icon name="play" size={24} />
        </button>
        <button className="icon-btn big" aria-label="Shuffle play" title="Shuffle" disabled={!tracks.length} onClick={() => usePlayer.getState().play(tracks, 0, { source, shuffle: true })}>
          <Icon name="shuffle" size={28} />
        </button>
        {actions}
      </div>

      {!tracks.length && (
        <Tile span={12} tone="quiet" label="Empty">
          {empty}
        </Tile>
      )}
      {tracks.length > 0 && (
        <>
          <Tile span={12} flush label="Songs">
            <div className="thead" aria-hidden>
              <span className="i">#</span>
              <span className="g" style={numbered ? undefined : { paddingLeft: 56 }}>Title</span>
              {!numbered && <span className="a">Album</span>}
              <span className="sp" />
              <span className="d"><Icon name="clock" size={16} /></span>
              <span className="sp" />
            </div>
            <div className="list">
              {tracks.map((t, i) => (
                <TrackRow key={`${t.id}-${i}`} track={t} index={i} list={tracks} showIndex showArt={!numbered} playlistId={playlistId} />
              ))}
            </div>
          </Tile>
          <Tile span={12} tone="card" title="About" label="About">
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
    <div className="tile" style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-end' }}>
      <div className="skeleton" style={{ width: 232, height: 232, borderRadius: 4 }} />
      <div style={{ flex: 1 }}>
        <div className="skeleton" style={{ width: '55%', height: 64, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '25%', height: 16, borderRadius: 6, marginTop: 14 }} />
      </div>
    </div>
  );
}
