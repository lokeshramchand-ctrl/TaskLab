'use client';
import { useMemo, useState } from 'react';
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
  const [tab, setTab] = useState<Tab>('liked');
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
      <PageHeader eyebrow="Library" title="Your library" sub="Everything you have liked, saved and played. Synced to your other devices." actions={<Link href="/import" className="btn"><Icon name="download" size={16} /> Import</Link>} />

      <Tile span={3} md={6} sm={6} onClick={() => pick('liked')} title="Liked songs" label="Liked songs">
        <div className="big"><span className="n">{likedAll.length}</span></div>
      </Tile>
      <Tile span={3} md={6} sm={6} onClick={() => pick('playlists')} title="Playlists" label="Playlists">
        <div className="big"><span className="n">{playlists.length + savedCount}</span></div>
      </Tile>
      <Tile span={3} md={6} sm={6} onClick={() => pick('albums')} title="Albums saved" label="Albums saved">
        <div className="big"><span className="n">{Object.keys(albums).length}</span></div>
      </Tile>
      <Tile span={3} md={6} sm={6} onClick={() => pick('history')} title="Plays logged" label="Plays logged">
        <div className="big"><span className="n">{history.length}</span></div>
      </Tile>

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
          <Tile span={4} md={12} tone="glow" label="Liked songs collection">
            <div className="hero">
              <Cover src={likedAll[0]?.thumb} size={96} radius={8} />
              <div className="grow">
                <div className="eyebrow">Collection</div>
                <h2 className="ht">Liked songs</h2>
                <div className="muted small">{likedAll.length} songs{q ? ` · ${likedTracks.length} match` : ''}</div>
              </div>
            </div>
            <div className="row">
              <button className="btn primary lg" disabled={!likedTracks.length} onClick={() => usePlayer.getState().play(likedTracks, 0, { source: 'liked' })}>
                <Icon name="play" size={12} /> Play
              </button>
              <button className="btn lg" disabled={!likedTracks.length} onClick={() => usePlayer.getState().play(likedTracks, 0, { source: 'liked', shuffle: true })}>
                <Icon name="shuffle" size={14} /> Shuffle
              </button>
            </div>
          </Tile>
          <Tile span={8} md={12} flush kicker="01" title="Songs" sub={`${likedTracks.length} shown`} label="Liked songs">
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
        .filter { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px 0 10px; border-radius: 5px; border: 1px solid var(--border-2); background: var(--surface); color: var(--muted); flex: 1; min-width: 180px; max-width: 320px; }
        .filter:focus-within { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-soft); color: var(--text); }
        .filter input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13px; color: var(--text); }
        .sort { height: 28px; padding: 0 10px; border-radius: 5px; border: 1px solid var(--border-2); background: var(--surface); font-size: 13px; font-weight: 500; }
        .nameinp { width: 100%; height: 28px; padding: 0 10px; border-radius: 5px; border: 1px solid var(--border-2); background: var(--surface); outline: 0; }
        .nameinp:focus { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-soft); }
        .hero { display: flex; align-items: center; gap: var(--sp-4); }
        .ht { font-size: 20px; font-weight: 500; letter-spacing: -.01em; line-height: 1.1; margin: 4px 0; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: var(--sp-4); }
        .newpl { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 12px; aspect-ratio: 1; font-weight: 500; transition: box-shadow .25s var(--ease), transform .3s var(--spring); }
        .newpl:hover { box-shadow: var(--lift-hi); transform: translateY(-2px); }
        :global(.pl) { display: block; }
        .t { font-weight: 600; font-size: 13.5px; margin-top: 10px; }
        .s { font-size: 12.5px; margin-top: 2px; }
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
