'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLibrary } from '@/player/library';
import { usePlayer } from '@/player/store';
import type { Track } from '@/lib/types';
import { TrackRow, ItemCard } from '@/components/Cards';
import { Cover } from '@/components/Art';
import { Mosaic } from '@/components/Mosaic';
import { Icon, type IconName } from '@/components/Icon';
import { EmptyState, PageHeader } from '@/components/ui';
import { Bento, Tile } from '@/components/Bento';

type Tab = 'liked' | 'playlists' | 'albums' | 'artists' | 'history';
const TABS: { id: Tab; label: string }[] = [
  { id: 'liked', label: 'Liked' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'history', label: 'History' },
];

export default function Library() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>('liked');
  // the sidebar links here with ?tab=liked
  useEffect(() => {
    const t = params.get('tab') as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
  }, [params]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'recent' | 'title' | 'artist'>('recent');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const saved = useLibrary((s) => s.savedPlaylists);
  const history = useLibrary((s) => s.history);
  const savedCount = Object.keys(saved).length;

  const q = filter.trim().toLowerCase();
  const matches = (t: Track) => !q || t.title.toLowerCase().includes(q) || t.artists.some((a) => a.name.toLowerCase().includes(q));
  const likedAll: Track[] = useMemo(() => Object.values(liked).sort((a, b) => b.at - a.at).map((x) => x.track), [liked]);
  const likedTracks: Track[] = useMemo(() => {
    const list = likedAll.filter(matches);
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'artist') return [...list].sort((a, b) => (a.artists[0]?.name ?? '').localeCompare(b.artists[0]?.name ?? ''));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedAll, q, sort]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const historyTracks: Track[] = useMemo(() => history.slice(0, 300).map((p) => p.track).filter(matches), [history, q]);
  const shownPlaylists = playlists.filter((p) => !q || p.name.toLowerCase().includes(q));
  const counts: Record<Tab, number> = { liked: likedAll.length, playlists: playlists.length + savedCount, albums: Object.keys(albums).length, artists: Object.keys(artists).length, history: history.length };
  const pick = (t: Tab) => {
    setTab(t);
    setFilter('');
  };

  return (
    <Bento className="fade-in">
      <PageHeader title="Your Library" actions={<Link href="/import" className="btn"><Icon name="download" size={16} /> Import</Link>} />

      <Tile span={12} className="bar-tile" label="Library controls">
      <div className="bar">
        <div className="chips" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => pick(t.id)}>
              {t.label}
              {counts[t.id] > 0 && <span className="cnt">{counts[t.id]}</span>}
            </button>
          ))}
        </div>
        {(tab === 'liked' || tab === 'history' || tab === 'playlists') && (
          <label className="filter">
            <Icon name="search" size={15} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tab === 'playlists' ? 'Filter playlists' : 'Filter songs or artists'} aria-label="Filter" />
            {filter && (
              <button type="button" className="icon-btn sm" aria-label="Clear filter" onClick={() => setFilter('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>
        )}
        {tab === 'liked' && likedAll.length > 1 && (
          <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort liked songs">
            <option value="recent">Recently liked</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
          </select>
        )}
      </div>
      </Tile>

      {tab === 'liked' && (
        <>
          <Tile span={12} tone="glow" className="likedhead" label="Liked songs collection">
            <div className="hero">
              <span className="likeart"><Icon name="heartFill" size={64} /></span>
              <div className="grow">
                <div className="ph-kind">Playlist</div>
                <h2 className="ht">Liked Songs</h2>
                <div className="muted">{likedAll.length} songs{q ? ` · ${likedTracks.length} match` : ''}</div>
              </div>
              <button className="bigplay" aria-label="Play liked songs" disabled={!likedTracks.length} onClick={() => usePlayer.getState().play(likedTracks, 0, { source: 'liked' })}>
                <Icon name="play" size={24} />
              </button>
              <button className="icon-btn big" aria-label="Shuffle liked songs" title="Shuffle" disabled={!likedTracks.length} onClick={() => usePlayer.getState().play(likedTracks, 0, { source: 'liked', shuffle: true })}>
                <Icon name="shuffle" size={28} />
              </button>
            </div>
          </Tile>
          <Tile span={12} flush label="Liked songs">
            {likedAll.length === 0 && <EmptyState icon="heart" title="No liked songs yet" hint="Tap the heart on any song and it lands here." />}
            {likedAll.length > 0 && likedTracks.length === 0 && <EmptyState icon="search" title="No matches" hint={`Nothing in your liked songs matches “${filter}”.`} />}
            <div className="list">
              {likedTracks.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} list={likedTracks} />
              ))}
            </div>
          </Tile>
        </>
      )}

      {tab === 'playlists' && (
        <Tile span={12} kicker="01" title="Playlists" label="Playlists">
        <div className="grid">
          {naming ? (
            <form
              className="newpl card"
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) useLibrary.getState().createPlaylist(newName.trim());
                setNewName('');
                setNaming(false);
              }}
            >
              <input autoFocus className="nameinp" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Playlist name" aria-label="Playlist name" onKeyDown={(e) => e.key === 'Escape' && setNaming(false)} />
              <div className="row">
                <button type="submit" className="btn primary sm" disabled={!newName.trim()}>Create</button>
                <button type="button" className="btn sm" onClick={() => setNaming(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="newpl card" onClick={() => setNaming(true)}>
              <span className="chip-ic lg">
                <Icon name="plus" size={20} />
              </span>
              New playlist
            </button>
          )}
          {shownPlaylists.map((p) => (
            <Link key={p.id} href={`/library/playlist/${p.id}`} className="pl">
              <Mosaic tracks={p.tracks} size={164} />
              <div className="t clamp1">{p.name}</div>
              <div className="s muted">{p.tracks.length} songs</div>
            </Link>
          ))}
          {Object.values(saved)
            .sort((a, b) => b.at - a.at)
            .map((x) => (
              <ItemCard key={x.item.id} item={x.item} />
            ))}
        </div>
        </Tile>
      )}

      {tab === 'albums' && (
        <Tile span={12} kicker="01" title="Albums" label="Albums">
        <div className="grid">
          {Object.values(albums).length === 0 && <Empty icon="disc" title="No saved albums" text="Save albums with the Save button on any album page." />}
          {Object.values(albums)
            .sort((a, b) => b.at - a.at)
            .map((x) => (
              <ItemCard key={x.item.id} item={x.item} />
            ))}
        </div>
        </Tile>
      )}

      {tab === 'artists' && (
        <Tile span={12} kicker="01" title="Artists" label="Artists">
        <div className="grid">
          {Object.values(artists).length === 0 && <Empty icon="user" title="No followed artists" text="Follow artists from their page and they show up here." />}
          {Object.values(artists)
            .sort((a, b) => b.at - a.at)
            .map((x) => (
              <ItemCard key={x.item.id} item={x.item} />
            ))}
        </div>
        </Tile>
      )}

      {tab === 'history' && (
        <Tile span={12} flush kicker="01" title="History" sub={`${historyTracks.length} plays`} label="History">
          {historyTracks.length === 0 && <EmptyState icon={q ? 'search' : 'history'} title={q ? 'No matches' : 'Nothing played yet'} hint={q ? `Nothing in your history matches “${filter}”.` : 'Songs you play will appear here.'} />}
          <div className="list">
            {historyTracks.map((t, i) => (
              <TrackRow key={`${t.id}-${i}`} track={t} index={i} list={historyTracks} />
            ))}
          </div>
        </Tile>
      )}

      <style jsx>{`
                .bar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
        .cnt { margin-left: 6px; font-size: 11px; font-weight: 600; opacity: .6; }
        .filter { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 8px 0 12px; border-radius: 4px; background: var(--pill); color: var(--muted); flex: 1; min-width: 180px; max-width: 320px; }
        .filter:focus-within { box-shadow: 0 0 0 2px var(--ink); color: var(--text); }
        .filter input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 14px; color: var(--ink); }
        .sort { height: 32px; padding: 0 12px; border-radius: 4px; border: 0; background: var(--pill); color: var(--text); font-size: 14px; font-weight: 500; }
        .nameinp { width: 100%; height: 40px; padding: 0 12px; border-radius: 4px; border: 0; background: var(--surface-2); color: var(--ink); outline: 0; font-size: 16px; }
        .nameinp:focus { box-shadow: 0 0 0 2px var(--ink); }
        .hero { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
        .likeart { width: 140px; height: 140px; border-radius: 4px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #450af5, #8e8ee5 60%, #c4efd9); box-shadow: 0 4px 60px rgba(0, 0, 0, .5); flex: none; }
        .ht { font-size: clamp(32px, 4.4vw, 64px); font-weight: 900; letter-spacing: -.03em; line-height: 1.05; margin: 4px 0 8px; }
        :global(.likedhead) { background: linear-gradient(180deg, rgba(80, 56, 160, .55), transparent) !important; padding: var(--sp-5) !important; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 16px; }
        .newpl { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 12px; aspect-ratio: 1; font-weight: 700; border-radius: 8px; background: var(--surface); transition: background .3s var(--ease); }
        .newpl:hover { background: var(--card-hover); }
        :global(.pl) { display: block; padding: 12px; border-radius: 8px; background: var(--surface); transition: background .3s var(--ease); }
        :global(.pl:hover) { background: var(--card-hover); }
        .t { font-weight: 700; font-size: 16px; margin-top: 16px; }
        .s { font-size: 14px; margin-top: 4px; }
        @media (max-width: 900px) { .grid { grid-template-columns: repeat(auto-fill, minmax(138px, 1fr)); } .hero { flex-direction: column; align-items: flex-start; } }
      `}</style>
    </Bento>
  );
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <EmptyState icon={icon} title={title} hint={text} />
    </div>
  );
}
