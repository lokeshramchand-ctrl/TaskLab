'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useExplore, useMood } from '@/lib/api';
import type { AlbumCard, Track } from '@/lib/types';
import { ItemCard, ShelfRow, ShelfSkeleton, TrackRow } from '@/components/Cards';
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
      <>
        <PageHeader eyebrow="Explore" title="Explore is off" sub="Trending songs, new releases and moods. Turn it on under Settings → Developer." />
        <div>
          <Link href="/settings" className="btn primary">
            Open settings
          </Link>
        </div>
      </>
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
    <>
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

      <div className="chips" role="tablist" style={{ alignSelf: 'flex-start' }}>
        {([['trending', 'Trending', trending.length], ['new', 'New releases', releases.length], ['moods', 'Moods', data?.moods?.length ?? 0]] as [Tab, string, number][]).map(([id, label, n]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {n > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, opacity: 0.6 }}>{n}</span>}
          </button>
        ))}
      </div>

      {isLoading && (tab === 'trending' ? (
        <div className="cols">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 6 }} />
          ))}
        </div>
      ) : <ShelfSkeleton />)}
      {error && (
        <div className="callout err">
          <Icon name="warn" size={18} /> Couldn&apos;t load Explore. {(error as Error).message}
        </div>
      )}

      {tab === 'trending' && (
        <section className="fade-in cols">
          {trending.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} list={trending} showIndex />
          ))}
        </section>
      )}

      {tab === 'new' && (
        <section className="fade-in grid">
          {releases.map((a) => (
            <ItemCard key={a.id} item={a} />
          ))}
          {!isLoading && !releases.length && <EmptyState icon="disc" title="No new releases right now" />}
        </section>
      )}

      {tab === 'moods' && (
        <section className="fade-in">
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
          {mood && (
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {moodData.isLoading && <ShelfSkeleton />}
              {moodData.data?.map((s) => <ShelfRow key={s.title} shelf={s} />)}
            </div>
          )}
          {!mood && (data?.moods?.length ?? 0) > 0 && <p className="muted" style={{ marginTop: 16 }}>Pick a mood to see playlists for it.</p>}
          {!isLoading && !(data?.moods?.length) && <EmptyState icon="sparkles" title="No moods available right now" />}
        </section>
      )}

      <style jsx>{`
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(164px, 1fr)); gap: 24px 20px; }
        .cols { columns: 2 420px; column-gap: 24px; }
        .cols > :global(*) { break-inside: avoid; margin-bottom: 1px; }
        .mood-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
        .mood { position: relative; height: 64px; padding: 0 16px; border-radius: 6px; text-align: left; font-weight: 600; font-size: 14px; letter-spacing: -.02em; border: 1px solid var(--border); background: linear-gradient(135deg, hsl(var(--h) 80% 60% / .16), hsl(var(--h) 80% 60% / .04)); transition: transform .3s var(--spring), box-shadow .25s var(--ease), border-color .2s; }
        .mood:hover { transform: translateY(-2px); box-shadow: var(--lift-hi); }
        .mood.on { border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-soft); }
      `}</style>
    </>
  );
}
