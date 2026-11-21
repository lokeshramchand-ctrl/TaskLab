'use client';
import { useEffect, useMemo, useState } from 'react';
import { useExplore, useHome, useMood, useRecs } from '@/lib/api';
import { artistNames, greeting } from '@/lib/format';
import { detectSleep, formatSpan } from '@/lib/sleep';
import { useSleep } from '@/player/sleep';
import Link from 'next/link';
import { formatMinutes, recentTracks, topArtists, weekStats } from '@/lib/insights';
import type { ArtistCard, Item, Shelf, Track } from '@/lib/types';
import { ItemCard, ShelfSkeleton, ShelfTile } from '@/components/Cards';
import { Cover } from '@/components/Art';
import { Bento, Tile } from '@/components/Bento';
import { Icon } from '@/components/Icon';
import { SparkBars, Sheet, Toggle } from '@/components/ui';
import { useLibrary } from '@/player/library';
import { currentTrack, usePlayer } from '@/player/store';
import { HOME_SECTIONS, useSettings } from '@/player/settings';
import { useAuth } from '@/player/sync';
import { warm, warmProps } from '@/lib/warm';
import { dominantColor, useTint } from '@/lib/tint';

export default function Home() {
  const account = useAuth((s) => s.user);
  const isLocal = useAuth((s) => s.local);
  const user = isLocal ? null : account; // the desktop app's built-in account is called "local"; do not greet by it
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
  const anchors = useSleep((s) => s.anchors);
  // The most recent sleep with the queue on, whenever it was (older nights are on the Insights page).
  const lastSleep = useMemo(() => detectSleep(history, anchors)[0] ?? null, [history, anchors]);
  const artists = useMemo(() => topArtists(history), [history]);
  const personal = history.length > 0 || likedList.length > 0;
  const mixes: Shelf[] = recs.data ?? [];
  const mixTracks = (mixes[0]?.items.filter((i): i is Track => i.kind === 'song') ?? []) as Track[];

  const playMix = () => {
    const list = mixTracks.length ? mixTracks : recent;
    if (list.length) usePlayer.getState().play(list, 0, { source: 'home-mix' });
  };

  const showStats = home.stats && history.length > 0;
  const m = formatMinutes(stats.minutes);
  const trending = explore.data?.trending ?? [];
  const hasArtists = home.artists && artists.length > 0;
  const hasMoods = home.moods && (explore.data?.moods?.length ?? 0) > 0;
  useTint(undefined, '#3b3b5c');

  const artistShelf: Shelf = {
    title: 'Your artists',
    subtitle: 'Most played lately',
    items: artists.slice(0, 20).map((a): ArtistCard => ({ kind: 'artist', id: a.id!, title: a.name, thumb: artThumb(history, a.id!) })),
  };

  return (
    <Bento className="fade-in">
      <header className="greet">
        <h1>
          {g1} {g2}
          {user ? <span className="muted">, {user}</span> : null}
        </h1>
        <div className="grow" />
        <button className="btn primary" onClick={playMix} disabled={!mixTracks.length && !recent.length}>
          <Icon name="play" size={12} /> {mixTracks.length ? 'Play my mix' : 'Play recent'}
        </button>
        <Link href="/insights" className="btn">
          <Icon name="history" size={14} /> Insights
        </Link>
        <button className="btn" onClick={() => setCustom(true)}>
          <Icon name="sliders" size={14} /> Customise
        </button>
      </header>

      {home.quick && <QuickPicks tracks={recent.length ? recent : trending.slice(0, 8)} personal={recent.length > 0} loading={!recent.length && explore.isLoading} />}

      {showStats && (
        <>
          <Tile span={4} md={12} tone="card" title="Listened this week" sub="Last 7 days" label="Listened this week">
            <div className="big">
              <span className="n">{m.value}</span>
              {m.unit && <span className="u">{m.unit}</span>}
            </div>
            <div className="foot">
              <span className="muted">{stats.plays} songs finished</span>
              <span className="grow" />
              <SparkBars values={stats.daily} label="Minutes per day this week" />
            </div>
          </Tile>
          <Tile span={4} md={6} sm={6} tone="card" title="Streak" label="Listening streak">
            <div className="big">
              <span className="n">{stats.streak}</span>
              <span className="u">{stats.streak === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="muted small">{stats.streak ? 'Keep it going' : 'Play something today'}</div>
          </Tile>
          <Tile span={4} md={6} sm={6} tone="card" title="Top artist" label="Top artist">
            <div className="big">
              <span className="n clamp1 sm">{stats.topArtist?.name ?? '—'}</span>
            </div>
            <div className="muted small">{stats.topArtist ? 'Most minutes' : 'Nothing yet'}</div>
          </Tile>
          {lastSleep && (
            <Tile span={12} tone="card" href="/insights#sleep" label="Last sleep with the queue on">
              <div className="foot">
                <Icon name="moon" size={20} />
                <span>
                  {new Date(lastSleep.end).toDateString() === new Date().toDateString() ? 'Today' : new Date(lastSleep.end).toLocaleDateString([], { weekday: 'long' })}: you probably fell asleep around <b>{new Date(lastSleep.asleepFrom).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b> during{' '}
                  <b>{lastSleep.lastAwake.title}</b>, and the queue kept going for <b>~{formatSpan(lastSleep.asleepMs)}</b>.
                </span>
                <span className="grow" />
                <span className="muted small">Insights ›</span>
              </div>
            </Tile>
          )}
        </>
      )}

      {hasMoods && <Moods moods={explore.data?.moods ?? []} />}

      {home.mixes && (
        <>
          {recs.isLoading && personal && (
            <Tile span={12} flush label="Loading mixes">
              <ShelfSkeleton title={false} />
            </Tile>
          )}
          {mixes.map((s) => (
            <ShelfTile
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
                  <Icon name="play" size={10} /> Play
                </button>
              }
            />
          ))}
          {!recs.isLoading && !mixes.length && (
            <Tile span={12} tone="quiet" label="Mixes">
              <div className="empty-row">
                <span className="chip-ic lg">
                  <Icon name="sparkles" size={14} />
                </span>
                <div className="grow">
                  <b style={{ color: 'var(--text)', fontWeight: 700 }}>Your mixes will appear here</b>
                  <div className="small muted">LoMu builds Your Mix, On Repeat and Discover from what you finish, skip and like. Play a few songs and come back.</div>
                </div>
              </div>
            </Tile>
          )}
        </>
      )}

      {hasArtists && <ShelfTile shelf={artistShelf} />}
      {home.trending && trending.length > 0 && <ShelfTile shelf={{ title: 'Trending now', subtitle: 'What people are playing right now', items: trending.slice(0, 20) }} />}
      {home.newReleases && explore.data && explore.data.newReleases.length > 0 && (
        <ShelfTile shelf={{ title: 'New releases', subtitle: 'Fresh albums and singles', items: explore.data.newReleases.slice(0, 20) }} />
      )}

      {home.youtube && (
        <>
          {feed.isLoading && (
            <Tile span={12} flush label="Loading feed">
              <ShelfSkeleton title={false} />
            </Tile>
          )}
          {feed.error && (
            <Tile span={12} tone="quiet" label="Feed error">
              <div className="empty-row">
                <Icon name="warn" size={16} />
                <span className="grow">Couldn&apos;t load the YouTube Music feed. {(feed.error as Error).message}</span>
                <button className="btn sm" onClick={() => feed.refetch()}>
                  Retry
                </button>
              </div>
            </Tile>
          )}
          {feed.data?.shelves.map((s) => <ShelfTile key={`yt-${s.title}`} shelf={s} />)}
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
        .greet { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 8px; }
        .greet h1 { font-size: 32px; font-weight: 900; letter-spacing: -.02em; }
        .big { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
        .big .n { font-size: 32px; font-weight: 900; letter-spacing: -.03em; line-height: 1.1; color: var(--ink); }
        .big .n.sm { font-size: 22px; }
        .big .u { color: var(--muted); font-size: 14px; }
        .tile .foot { display: flex; align-items: center; gap: var(--sp-3); font-size: 12px; margin-top: auto; }
        .empty-row { display: flex; align-items: center; gap: var(--sp-3); color: var(--muted); }
        @media (max-width: 700px) { .greet h1 { font-size: 24px; } }
      `}</style>
    </Bento>
  );
}

/** The artist avatar comes from the song art of their most recent play (artist photos need a network call). */
function artThumb(history: { track: Track }[], artistId: string) {
  return history.find((p) => p.track.artists[0]?.id === artistId)?.track.thumb;
}

/** Spotify's home grid: two to four columns of wide tiles; hovering one tints the page with its artwork colour. */
function QuickPicks({ tracks, personal, loading }: { tracks: Track[]; personal: boolean; loading: boolean }) {
  const cur = usePlayer((s) => currentTrack(s)?.id);
  const playing = usePlayer((s) => s.playing);
  // The first few quick picks are the likeliest next play: resolve them while the page is idle.
  useEffect(() => {
    const t = setTimeout(() => tracks.slice(0, 4).forEach((x) => warm(x.id)), 600);
    return () => clearTimeout(t);
  }, [tracks]);
  const tint = (src?: string) => {
    if (!src) return;
    dominantColor(src).then((c) => document.documentElement.style.setProperty('--tint', c));
  };
  if (!loading && !tracks.length) return null;
  return (
    <section className="qwrap" aria-label="Quick picks">
      <div className="qgrid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 4 }} />)
          : tracks.map((t, i) => {
              const active = cur === t.id;
              return (
                <button
                  key={t.id}
                  className={`q${active ? ' active' : ''}`}
                  onClick={() => usePlayer.getState().play(tracks, i, { source: 'home-quick' })}
                  onMouseEnter={() => tint(t.thumb)}
                  onMouseLeave={() => document.documentElement.style.setProperty('--tint', '#3b3b5c')}
                  title={`${t.title} — ${artistNames(t.artists)}`}
                  {...warmProps(t.id)}
                >
                  <Cover src={t.thumb} size={64} radius={0} />
                  <div className="grow tx">
                    <div className="clamp1 t">{t.title}</div>
                    {!personal && <div className="clamp1 s">{artistNames(t.artists)}</div>}
                  </div>
                  <span className="go">
                    <Icon name={active && playing ? 'pause' : 'play'} size={18} />
                  </span>
                </button>
              );
            })}
      </div>
      <style jsx>{`
        .qwrap { grid-column: 1 / -1; }
        .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 16px; }
        .q { position: relative; display: flex; align-items: center; gap: 16px; min-width: 0; width: 100%; height: 64px; padding: 0 16px 0 0; border-radius: 4px; overflow: hidden; background: rgba(255, 255, 255, .1); text-align: left; transition: background .3s var(--ease); }
        .q:hover { background: rgba(255, 255, 255, .2); }
        .q :global(.cover) { border-radius: 4px 0 0 4px; box-shadow: 4px 0 8px rgba(0, 0, 0, .3); }
        .tx { min-width: 0; }
        .t { font-weight: 700; font-size: 16px; color: var(--ink); }
        .q.active .t { color: var(--signal); }
        .s { color: var(--muted); font-size: 13px; }
        .go { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--signal); color: #000; box-shadow: 0 8px 8px rgba(0, 0, 0, .3); opacity: 0; transform: translateY(4px); transition: opacity .3s var(--ease), transform .3s var(--ease); flex: none; }
        .q:hover .go, .q.active .go { opacity: 1; transform: none; }
        @media (max-width: 700px) { .qgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .q { height: 56px; gap: 8px; } .q :global(.cover) { width: 56px !important; height: 56px !important; } .go { display: none; } .t { font-size: 13px; } }
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
    <Tile span={12} title="Browse by mood" sub="Jump straight into a feeling" label="Moods">
      <div className="chips mood-row">
        {moods.slice(0, 16).map((x, i) => (
          <button key={x.params} className={sel === i ? 'on' : ''} onClick={() => setSel(sel === i ? null : i)} aria-pressed={sel === i}>
            {x.title}
          </button>
        ))}
      </div>
      {m && (
        <div className="mood-out">
          {isLoading && <ShelfSkeleton title={false} />}
          {data?.slice(0, 1).map((s) => (
            <div key={s.title} className="hscroll open">
              {s.items.slice(0, 12).map((it) => (
                <MoodItem key={`${it.kind}:${it.id}`} item={it} siblings={s.items.filter((i): i is Track => i.kind === 'song')} />
              ))}
            </div>
          ))}
          {!isLoading && !data?.length && <p className="muted small">Nothing found for this mood right now.</p>}
        </div>
      )}
    </Tile>
  );
}

function MoodItem({ item, siblings }: { item: Item; siblings: Track[] }) {
  return <ItemCard item={item} siblings={siblings.length > 1 ? siblings : undefined} />;
}
