'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useExplore, useHome, useMood, useRecs } from '@/lib/api';
import { artistNames, greeting } from '@/lib/format';
import { formatMinutes, recentTracks, topArtists, weekStats } from '@/lib/insights';
import type { Shelf, Track } from '@/lib/types';
import { ShelfRow, ShelfSkeleton } from '@/components/Cards';
import { Avatar, Cover } from '@/components/Art';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHeader, SparkBars, Stat, Sheet, Toggle } from '@/components/ui';
import { useLibrary } from '@/player/library';
import { currentTrack, usePlayer } from '@/player/store';
import { HOME_SECTIONS, useSettings } from '@/player/settings';
import { useAuth } from '@/player/sync';
import { warm, warmProps } from '@/lib/warm';

const dateLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export default function Home() {
  const user = useAuth((s) => s.user);
  const home = useSettings((s) => s.home);
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const [g1, g2] = greeting();
  const [custom, setCustom] = useState(false);

  const recs = useRecs();
  const explore = useExplore();
  const feed = useHome();

  const likedList = useMemo(() => Object.values(liked), [liked]);
  const recent = useMemo(() => recentTracks(history, likedList, 8), [history, likedList]);
  const stats = useMemo(() => weekStats(history), [history]);
  const artists = useMemo(() => topArtists(history), [history]);
  const personal = history.length > 0 || likedList.length > 0;
  const mixes: Shelf[] = recs.data ?? [];
  const mixTracks = (mixes[0]?.items.filter((i): i is Track => i.kind === 'song') ?? []) as Track[];

  const playMix = () => {
    const list = mixTracks.length ? mixTracks : recent;
    if (list.length) usePlayer.getState().play(list, 0, { source: 'home-mix' });
  };

  return (
    <>
      <PageHeader
        eyebrow={dateLine()}
        title={
          <>
            {g1} {g2}
            {user ? <span className="muted">, {user}</span> : null}
          </>
        }
        sub={personal ? 'Your music, picked from what you play and like.' : 'Play a few songs and this page starts to fit you.'}
        actions={
          <>
            <button className="btn" onClick={() => setCustom(true)}>
              <Icon name="sliders" size={16} /> Customise
            </button>
            <button className="btn primary" onClick={playMix} disabled={!mixTracks.length && !recent.length}>
              <Icon name="play" size={14} /> {mixTracks.length ? 'Play my mix' : 'Play recent'}
            </button>
          </>
        }
      />

      {home.stats && history.length > 0 && <WeekStats stats={stats} />}

      {home.quick && <QuickPicks tracks={recent.length ? recent : (explore.data?.trending ?? []).slice(0, 8)} personal={recent.length > 0} loading={!recent.length && explore.isLoading} />}

      {home.mixes && (
        <>
          {recs.isLoading && personal && <ShelfSkeleton />}
          {mixes.map((s) => (
            <ShelfRow
              key={`rec-${s.title}`}
              shelf={s}
              action={
                <button
                  className="btn sm"
                  onClick={() => {
                    const t = s.items.filter((i): i is Track => i.kind === 'song');
                    if (t.length) usePlayer.getState().play(t, 0, { source: 'home-mix' });
                  }}
                >
                  <Icon name="play" size={12} /> Play
                </button>
              }
            />
          ))}
          {!recs.isLoading && !mixes.length && (
            <div className="callout">
              <span className="chip-ic lg"><Icon name="sparkles" size={18} /></span>
              <div className="grow">
                <b style={{ color: 'var(--text)' }}>Your mixes will appear here</b>
                <div className="small">LoMu builds Your Mix, On Repeat and Discover from what you finish, skip and like. Play a few songs and come back.</div>
              </div>
            </div>
          )}
        </>
      )}

      {home.artists && artists.length > 0 && (
        <section className="fade-in">
          <div className="section-head">
            <div>
              <h2>Your artists</h2>
              <div className="sub">Most played lately</div>
            </div>
          </div>
          <div className="hscroll">
            {artists.map((a) => (
              <Link key={a.id} href={`/artist/${a.id}`} className="art-card" title={a.name}>
                <Avatar src={artThumb(history, a.id!)} size={96} />
                <span className="clamp1">{a.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {home.moods && <Moods moods={explore.data?.moods ?? []} />}

      {home.trending && explore.data && explore.data.trending.length > 0 && (
        <ShelfRow shelf={{ title: 'Trending now', subtitle: 'What people are playing right now', items: explore.data.trending.slice(0, 20) }} />
      )}
      {home.newReleases && explore.data && explore.data.newReleases.length > 0 && (
        <ShelfRow shelf={{ title: 'New releases', subtitle: 'Fresh albums and singles', items: explore.data.newReleases.slice(0, 20) }} />
      )}

      {home.youtube && (
        <>
          {feed.isLoading && <ShelfSkeleton />}
          {feed.error && (
            <div className="callout err">
              <Icon name="warn" size={18} />
              <span className="grow">Couldn&apos;t load the YouTube Music feed. {(feed.error as Error).message}</span>
              <button className="btn sm" onClick={() => feed.refetch()}>
                Retry
              </button>
            </div>
          )}
          {feed.data?.shelves.map((s) => <ShelfRow key={`yt-${s.title}`} shelf={s} />)}
        </>
      )}

      <Sheet
        open={custom}
        onClose={() => setCustom(false)}
        title="Customise home"
        eyebrow="Home"
        sub="Choose what shows up and what stays out of the way. Saved on this device."
        footer={
          <button className="btn" onClick={() => HOME_SECTIONS.forEach((s) => useSettings.getState().setHome(s.id, s.id !== 'youtube'))}>
            Reset
          </button>
        }
      >
        {HOME_SECTIONS.map((s) => (
          <Toggle key={s.id} label={s.label} hint={s.hint} on={home[s.id]} onChange={(v) => useSettings.getState().setHome(s.id, v)} />
        ))}
      </Sheet>

      <style jsx global>{`
        .art-card { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 104px; font-size: 13px; font-weight: 500; text-align: center; border-radius: 6px; padding: 4px; transition: background .2s, transform .3s var(--spring); }
        .art-card:hover { background: var(--surface); }
        .art-card:active { transform: scale(.97); }
        .art-card span { max-width: 100%; }
      `}</style>
    </>
  );
}

/** The artist avatar comes from the song art of their most recent play (artist photos need a network call). */
function artThumb(history: { track: Track }[], artistId: string) {
  return history.find((p) => p.track.artists[0]?.id === artistId)?.track.thumb;
}

function WeekStats({ stats }: { stats: ReturnType<typeof weekStats> }) {
  const m = formatMinutes(stats.minutes);
  return (
    <section className="grid-stats fade-in" aria-label="Your week">
      <Stat icon="headphones" label="Listened this week" value={m.value} unit={m.unit} sub="Last 7 days" spark={<SparkBars values={stats.daily} label="Minutes per day this week" />} />
      <Stat icon="note" label="Songs finished" value={stats.plays} sub="This week" />
      <Stat icon="flame" label="Listening streak" value={stats.streak} unit={stats.streak === 1 ? 'day' : 'days'} sub={stats.streak ? 'Keep it going' : 'Play something today'} />
      <Stat icon="star" label="Top artist" value={stats.topArtist?.name ?? '—'} sub={stats.topArtist ? 'Most minutes this week' : 'Nothing yet'} />
    </section>
  );
}

function QuickPicks({ tracks, personal, loading }: { tracks: Track[]; personal: boolean; loading: boolean }) {
  const cur = usePlayer((s) => currentTrack(s)?.id);
  const playing = usePlayer((s) => s.playing);
  // The first few quick picks are the likeliest next play: resolve them while the page is idle.
  useEffect(() => {
    const t = setTimeout(() => tracks.slice(0, 4).forEach((x) => warm(x.id)), 600);
    return () => clearTimeout(t);
  }, [tracks]);
  if (loading) {
    return (
      <section>
        <div className="qgrid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 6 }} />
          ))}
        </div>
        <style jsx>{`
          .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        `}</style>
      </section>
    );
  }
  if (!tracks.length) return null;
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <h2>{personal ? 'Quick picks' : 'Start here'}</h2>
          <div className="sub">{personal ? 'Pick up where you left off' : 'Popular right now. Your own picks replace these as you listen.'}</div>
        </div>
      </div>
      <div className="qgrid">
        {tracks.map((t, i) => {
          const active = cur === t.id;
          return (
            <button key={t.id} className={`q card${active ? ' active' : ''}`} onClick={() => usePlayer.getState().play(tracks, i, { source: 'home-quick' })} title={`${t.title} — ${artistNames(t.artists)}`} {...warmProps(t.id)}>
              <Cover src={t.thumb} size={64} radius={0} />
              <div className="grow tx">
                <div className="clamp1 t">{t.title}</div>
                <div className="clamp1 s">{artistNames(t.artists)}</div>
              </div>
              <span className="go">
                <Icon name={active && playing ? 'pause' : 'play'} size={14} />
              </span>
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .q { display: flex; align-items: center; gap: 12px; padding: 0 12px 0 0; height: 64px; overflow: hidden; text-align: left; transition: box-shadow .25s var(--ease), transform .3s var(--spring), border-color .2s; }
        .q :global(.cover) { border-radius: 0; box-shadow: none; }
        .q:hover { box-shadow: var(--lift-hi); transform: translateY(-1px); }
        .q:active { transform: scale(.985); }
        .q.active { border-color: var(--signal); }
        .tx { min-width: 0; }
        .t { font-weight: 600; font-size: 13.5px; letter-spacing: -.015em; }
        .q.active .t { color: var(--signal); }
        .s { color: var(--muted); font-size: 12.5px; }
        .go { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--ink); color: var(--on-ink); opacity: 0; transform: scale(.85); transition: opacity .2s, transform .35s var(--spring); flex: none; }
        .q:hover .go, .q.active .go { opacity: 1; transform: none; }
        @media (max-width: 900px) { .qgrid { grid-template-columns: 1fr 1fr; gap: 8px; } .go { display: none; } .q { height: 56px; } .q :global(.cover) { width: 56px !important; height: 56px !important; } }
      `}</style>
    </section>
  );
}

function Moods({ moods }: { moods: { title: string; params: string; browseId: string }[] }) {
  const [sel, setSel] = useState<number | null>(null);
  const m = sel != null ? moods[sel] : undefined;
  const { data, isLoading } = useMood(m?.browseId ?? '', m?.params ?? '');
  if (!moods.length) return null;
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <h2>Moods</h2>
          <div className="sub">Jump straight into a feeling</div>
        </div>
      </div>
      <div className="mood-row">
        {moods.slice(0, 14).map((x, i) => (
          <button key={x.params} className={`btn${sel === i ? ' primary' : ''}`} onClick={() => setSel(sel === i ? null : i)} aria-pressed={sel === i}>
            {x.title}
          </button>
        ))}
      </div>
      {m && (
        <div style={{ marginTop: 18 }}>
          {isLoading && <ShelfSkeleton title={false} />}
          {data?.slice(0, 2).map((s) => <ShelfRow key={s.title} shelf={s} />)}
          {!isLoading && !data?.length && <p className="muted">Nothing found for this mood right now.</p>}
        </div>
      )}
      <style jsx>{`
        .mood-row { display: flex; flex-wrap: wrap; gap: 8px; }
      `}</style>
    </section>
  );
}
