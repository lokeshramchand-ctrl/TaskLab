'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useExplore, useMood } from '@/lib/api';
import type { AlbumCard, Track } from '@/lib/types';
import { ItemCard, ShelfSkeleton, ShelfTile, TrackRow } from '@/components/Cards';
import { Bento, Tile } from '@/components/Bento';
import { EmptyState, PageHeader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useSettings } from '@/player/settings';
import { usePlayer } from '@/player/store';

type Tab = 'trending' | 'new' | 'moods';

/** Stable hue per mood name, so each tile keeps its colour. */
function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export default function ExploreGate() {
  const enabled = useSettings((s) => s.dev.explore);
  if (!enabled)
    return (
      <Bento>
        <PageHeader eyebrow="Explore" title="Explore is off" sub="Trending songs, new releases and moods. Turn it on under Settings → Developer." />
        <Tile span={12} tone="quiet" label="Explore is off">
          <div>
            <Link href="/settings" className="btn primary">
              Open settings
            </Link>
          </div>
        </Tile>
      </Bento>
    );
  return <Explore />;
}

function Explore() {
  const { data, isLoading, error } = useExplore();
  const [tab, setTab] = useState<Tab>('trending');
  const [mood, setMood] = useState<{ browseId: string; params: string; title: string } | null>(null);
  const moodData = useMood(mood?.browseId ?? '', mood?.params ?? '');

  const trending: Track[] = useMemo(() => (data?.trending ?? []).filter((t) => t.thumb), [data]);
  const releases: AlbumCard[] = data?.newReleases ?? [];

  return (
    <Bento className="fade-in">
      <PageHeader
        eyebrow="Explore"
        title="What's happening"
        sub="Charts, fresh releases and moods from YouTube Music."
        actions={
          tab === 'trending' && trending.length > 0 ? (
            <div className="row">
              <button className="btn primary" onClick={() => usePlayer.getState().play(trending, 0, { source: 'explore:trending' })}>
                <Icon name="play" size={14} /> Play trending
              </button>
              <button className="btn" onClick={() => usePlayer.getState().play(trending, 0, { source: 'explore:trending', shuffle: true })}>
                <Icon name="shuffle" size={16} /> Shuffle
              </button>
            </div>
          ) : undefined
        }
      />

      <Tile span={12} className="bar-tile" label="Explore tabs">
      <div className="chips" role="tablist" style={{ alignSelf: 'flex-start' }}>
        {([['trending', 'Trending', trending.length], ['new', 'New releases', releases.length], ['moods', 'Moods', data?.moods?.length ?? 0]] as [Tab, string, number][]).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {n > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, opacity: 0.6 }}>{n}</span>}
          </button>
        ))}
      </div>
      </Tile>

      {isLoading && (
        <Tile span={12} label="Loading">
          <div className="cols">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 40, borderRadius: 6 }} />
            ))}
          </div>
        </Tile>
      )}
      {error && (
        <Tile span={12} tone="quiet" label="Explore error">
          <div className="callout err">
            <Icon name="warn" size={16} /> Couldn&apos;t load Explore. {(error as Error).message}
          </div>
        </Tile>
      )}

      {tab === 'trending' && (
        <Tile span={12} flush kicker="01" title="Trending" sub={`${trending.length} songs`} label="Trending">
          <div className="cols list">
            {trending.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} list={trending} showIndex />
            ))}
          </div>
        </Tile>
      )}

      {tab === 'new' && (
        <Tile span={12} kicker="01" title="New releases" sub={`${releases.length} albums and singles`} label="New releases">
          <div className="grid">
            {releases.map((a) => (
              <ItemCard key={a.id} item={a} />
            ))}
            {!isLoading && !releases.length && <EmptyState icon="disc" title="No new releases right now" />}
          </div>
        </Tile>
      )}

      {tab === 'moods' && (
        <>
          <Tile span={12} kicker="01" title="Moods" sub="Pick a mood to see playlists for it" label="Moods">
            <div className="mood-grid">
              {(data?.moods ?? []).map((m) => {
                const on = mood?.params === m.params;
                return (
                  <button
                    key={m.params}
                    className={`mood${on ? ' on' : ''}`}
                    style={{ ['--h' as string]: hue(m.title) }}
                    onClick={() => setMood(on ? null : m)}
                    aria-pressed={on}
                  >
                    {m.title}
                  </button>
                );
              })}
            </div>
            {!isLoading && !(data?.moods?.length) && <EmptyState icon="sparkles" title="No moods available right now" />}
          </Tile>
          {mood && moodData.isLoading && (
            <Tile span={12} flush label="Loading mood">
              <ShelfSkeleton title={false} />
            </Tile>
          )}
          {mood && moodData.data?.map((s, i) => <ShelfTile key={s.title} shelf={s} kicker={String(i + 2).padStart(2, '0')} />)}
        </>
      )}

      <style jsx>{`
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: var(--sp-4); }
        .cols { columns: 2 420px; column-gap: 0; }
        .cols > :global(*) { break-inside: avoid; margin-bottom: 1px; }
        .mood-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-2); }
        .mood { position: relative; height: 56px; padding: 0 var(--sp-4); border-radius: 6px; text-align: left; font-weight: 600; font-size: 14px; letter-spacing: -.02em; border: 1px solid var(--border); background: linear-gradient(135deg, hsl(var(--h) 80% 60% / .16), hsl(var(--h) 80% 60% / .04)); transition: transform .3s var(--spring), box-shadow .25s var(--ease), border-color .2s; }
        .mood:hover { transform: translateY(-2px); box-shadow: var(--lift-hi); }
        .mood.on { border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
      `}</style>
    </Bento>
  );
}
