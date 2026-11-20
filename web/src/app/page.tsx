'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useExplore, useHome, useMood, useRecs } from '@/lib/api';
import { artistNames, greeting } from '@/lib/format';
import { formatMinutes, recentTracks, topArtists, weekStats } from '@/lib/insights';
import type { Item, Shelf, Track } from '@/lib/types';
import { ItemCard, ShelfSkeleton, ShelfTile } from '@/components/Cards';
import { Avatar, Cover } from '@/components/Art';
import { Bento, Tile } from '@/components/Bento';
import { Icon } from '@/components/Icon';
import { SparkBars, Sheet, Toggle } from '@/components/ui';
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

  const showStats = home.stats && history.length > 0;
  let n = 0;
  const k = () => String(++n).padStart(2, '0');
  const m = formatMinutes(stats.minutes);
  const trending = explore.data?.trending ?? [];
  const hasArtists = home.artists && artists.length > 0;
  const hasMoods = home.moods && (explore.data?.moods?.length ?? 0) > 0;

  return (
    <Bento className="fade-in">
      <Tile span={showStats ? 8 : 12} md={12} rows={showStats ? 2 : undefined} tone="accent" className="hero" label="Welcome">
        <Link href="/settings" className="avatar-link" aria-label="Account and settings">
          {(user ?? 'L')[0]?.toUpperCase()}
        </Link>
        <div>
          <div className="eyebrow">{dateLine()}</div>
          <h1 className="hero-h">
            {g1} {g2}
            {user ? <span className="muted">, {user}</span> : null}
          </h1>
          <p className="hero-s">{personal ? 'Your music, picked from what you play and like.' : 'Play a few songs and this page starts to fit you.'}</p>
        </div>
        <div className="hero-a">
          <button className="btn primary lg" onClick={playMix} disabled={!mixTracks.length && !recent.length}>
            <Icon name="play" size={12} /> {mixTracks.length ? 'Play my mix' : 'Play recent'}
          </button>
          <button className="btn lg" onClick={() => setCustom(true)}>
            <Icon name="sliders" size={14} /> Customise
          </button>
        </div>
      </Tile>

      {showStats && (
        <>
          <Tile span={4} md={12} kicker={k()} title="Listened this week" sub="Last 7 days" label="Listened this week">
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
          <Tile span={2} md={6} sm={6} title="Streak" label="Listening streak">
            <div className="big">
              <span className="n">{stats.streak}</span>
              <span className="u">{stats.streak === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="muted small">{stats.streak ? 'Keep it going' : 'Play something today'}</div>
          </Tile>
          <Tile span={2} md={6} sm={6} title="Top artist" label="Top artist">
            <div className="big">
              <span className="n clamp1 sm">{stats.topArtist?.name ?? '—'}</span>
            </div>
            <div className="muted small">{stats.topArtist ? 'Most minutes' : 'Nothing yet'}</div>
          </Tile>
        </>
      )}

      {home.quick && (
        <QuickPicks tracks={recent.length ? recent : trending.slice(0, 8)} personal={recent.length > 0} loading={!recent.length && explore.isLoading} kicker={k()} span={hasMoods ? 8 : 12} />
      )}
      {hasMoods && <Moods moods={explore.data?.moods ?? []} kicker={k()} />}

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
              kicker={k()}
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
                  <b style={{ color: 'var(--text)', fontWeight: 500 }}>Your mixes will appear here</b>
                  <div className="small muted">LoMu builds Your Mix, On Repeat and Discover from what you finish, skip and like. Play a few songs and come back.</div>
                </div>
              </div>
            </Tile>
          )}
        </>
      )}

      {hasArtists && (
        <Tile span={4} md={12} kicker={k()} title="Your artists" sub="Most played lately" label="Your artists">
          <div className="artists">
            {artists.slice(0, 6).map((a) => (
              <Link key={a.id} href={`/artist/${a.id}`} className="art-card" title={a.name}>
                <Avatar src={artThumb(history, a.id!)} size={64} />
                <span className="clamp1">{a.name}</span>
              </Link>
            ))}
          </div>
        </Tile>
      )}
      {home.trending && trending.length > 0 && (
        <ShelfTile shelf={{ title: 'Trending now', subtitle: 'What people are playing right now', items: trending.slice(0, 20) }} kicker={k()} span={hasArtists ? 8 : 12} />
      )}
      {home.newReleases && explore.data && explore.data.newReleases.length > 0 && (
        <ShelfTile shelf={{ title: 'New releases', subtitle: 'Fresh albums and singles', items: explore.data.newReleases.slice(0, 20) }} kicker={k()} />
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
          {feed.data?.shelves.map((s) => <ShelfTile key={`yt-${s.title}`} shelf={s} kicker={k()} />)}
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
        .hero { justify-content: space-between; gap: var(--sp-5); min-height: 176px; }
        .hero-h { margin-top: var(--sp-1); font-size: 28px; font-weight: 500; line-height: 1.2; letter-spacing: -.02em; color: var(--ink); }
        .hero-s { margin-top: var(--sp-2); max-width: 46ch; color: var(--muted); font-size: 13px; }
        .hero-a { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
        .big { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
        .big .n { font-size: 32px; font-weight: 500; letter-spacing: -.03em; line-height: 1.1; color: var(--ink); }
        .big .n.sm { font-size: 20px; }
        .big .u { color: var(--muted); font-size: 13px; }
        .tile .foot { display: flex; align-items: center; gap: var(--sp-3); font-size: 12px; margin-top: auto; }
        .empty-row { display: flex; align-items: center; gap: var(--sp-3); color: var(--muted); }
        .artists { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
        .art-card { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); min-width: 0; font-size: 12px; font-weight: 500; text-align: center; border-radius: 6px; padding: var(--sp-1); transition: background .15s, transform .25s var(--spring); }
        .art-card:hover { background: var(--hover); }
        .art-card:active { transform: scale(.97); }
        .art-card span { max-width: 100%; }
        @media (max-width: 700px) { .hero { min-height: 0; } .hero-h { font-size: 24px; } .tile .avatar-link { top: var(--sp-3); right: var(--sp-3); } }
      `}</style>
    </Bento>
  );
}

/** The artist avatar comes from the song art of their most recent play (artist photos need a network call). */
function artThumb(history: { track: Track }[], artistId: string) {
  return history.find((p) => p.track.artists[0]?.id === artistId)?.track.thumb;
}

function QuickPicks({ tracks, personal, loading, kicker, span }: { tracks: Track[]; personal: boolean; loading: boolean; kicker: string; span: number }) {
  const cur = usePlayer((s) => currentTrack(s)?.id);
  const playing = usePlayer((s) => s.playing);
  // The first few quick picks are the likeliest next play: resolve them while the page is idle.
  useEffect(() => {
    const t = setTimeout(() => tracks.slice(0, 4).forEach((x) => warm(x.id)), 600);
    return () => clearTimeout(t);
  }, [tracks]);
  if (!loading && !tracks.length) return null;
  return (
    <Tile span={span} md={12} kicker={kicker} title={personal ? 'Quick picks' : 'Start here'} sub={personal ? 'Pick up where you left off' : 'Popular right now. Your own picks replace these as you listen.'} label="Quick picks">
      <div className="qgrid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 6 }} />)
          : tracks.map((t, i) => {
              const active = cur === t.id;
              return (
                <button key={t.id} className={`q${active ? ' active' : ''}`} onClick={() => usePlayer.getState().play(tracks, i, { source: 'home-quick' })} title={`${t.title} — ${artistNames(t.artists)}`} {...warmProps(t.id)}>
                  <Cover src={t.thumb} size={40} radius={4} />
                  <div className="grow tx">
                    <div className="clamp1 t">{t.title}</div>
                    <div className="clamp1 s">{artistNames(t.artists)}</div>
                  </div>
                  <span className="go">
                    <Icon name={active && playing ? 'pause' : 'play'} size={12} />
                  </span>
                </button>
              );
            })}
      </div>
      <style jsx>{`
        .qgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(232px, 100%), 1fr)); gap: var(--sp-2); }
        .q { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; width: 100%; height: 56px; padding: 0 var(--sp-3) 0 var(--sp-2); border-radius: 8px; border: 1px solid transparent; background: var(--hover); text-align: left; transition: background .15s var(--ease), border-color .15s, transform .2s var(--spring); }
        .q:hover { background: var(--active); border-color: var(--border-2); }
        .q:active { transform: scale(.99); }
        .q.active { border-color: color-mix(in srgb, var(--signal) 60%, transparent); background: var(--signal-soft); }
        .tx { min-width: 0; }
        .t { font-weight: 500; font-size: 13px; color: var(--ink); }
        .q.active .t { color: var(--peri-t); }
        .s { color: var(--muted); font-size: 12px; }
        .go { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; background: var(--signal); color: #fff; opacity: 0; transform: scale(.85); transition: opacity .15s, transform .25s var(--spring); flex: none; }
        .q:hover .go, .q.active .go { opacity: 1; transform: none; }
        @media (max-width: 700px) { .qgrid { grid-template-columns: minmax(0, 1fr); } .go { display: none; } }
      `}</style>
    </Tile>
  );
}

function Moods({ moods, kicker }: { moods: { title: string; params: string; browseId: string }[]; kicker: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const m = sel != null ? moods[sel] : undefined;
  const { data, isLoading } = useMood(m?.browseId ?? '', m?.params ?? '');
  if (!moods.length) return null;
  return (
    <Tile span={4} md={12} kicker={kicker} title="Moods" sub="Jump straight into a feeling" label="Moods">
      <div className="mood-row">
        {moods.slice(0, 14).map((x, i) => (
          <button key={x.params} className={`btn sm${sel === i ? ' primary' : ''}`} onClick={() => setSel(sel === i ? null : i)} aria-pressed={sel === i}>
            {x.title}
          </button>
        ))}
      </div>
      {m && (
        <div className="mood-out">
          {isLoading && <ShelfSkeleton title={false} />}
          {data?.slice(0, 1).map((s) => (
            <div key={s.title} className="hscroll">
              {s.items.slice(0, 12).map((it) => (
                <MoodItem key={`${it.kind}:${it.id}`} item={it} siblings={s.items.filter((i): i is Track => i.kind === 'song')} />
              ))}
            </div>
          ))}
          {!isLoading && !data?.length && <p className="muted small">Nothing found for this mood right now.</p>}
        </div>
      )}
      <style jsx>{`
        .mood-row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
        .mood-out { margin-top: var(--sp-1); }
      `}</style>
    </Tile>
  );
}

function MoodItem({ item, siblings }: { item: Item; siblings: Track[] }) {
  return <ItemCard item={item} siblings={siblings.length > 1 ? siblings : undefined} />;
}
