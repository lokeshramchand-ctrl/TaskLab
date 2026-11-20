'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearch, useSuggest } from '@/lib/api';
import { artistNames, hrefFor } from '@/lib/format';
import type { Item } from '@/lib/types';
import { ItemCard, ShelfRow, ShelfSkeleton, TrackRow } from '@/components/Cards';
import { Avatar, Cover } from '@/components/Art';
import { PageHeader } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useLibrary } from '@/player/library';
import { usePlayer } from '@/player/store';

const CATS: [string, string, string][] = [
  ['Top hits India', '#ff2d55', '#ff6b81'],
  ['Lo-fi beats', '#5856d6', '#8e8cf0'],
  ['Workout', '#ff9500', '#ffb84d'],
  ['Arijit Singh', '#34c759', '#7be095'],
  ['Anirudh', '#007aff', '#5aa9ff'],
  ['Chill vibes', '#af52de', '#cb84ee'],
  ['Punjabi', '#ff3b30', '#ff7a70'],
  ['90s Bollywood', '#30b0c7', '#6fd0e0'],
];

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [focused, setFocused] = useState(!q);
  const input = useRef<HTMLInputElement>(null);
  const recent = useLibrary((s) => s.recentSearches);
  const [type, setType] = useState<'all' | 'songs' | 'artists' | 'albums' | 'playlists' | 'videos'>('all');

  useEffect(() => {
    setText(q);
    setType('all');
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 160);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    if (!q) input.current?.focus();
  }, [q]);

  const sugg = useSuggest(focused ? debounced : '');
  const { data, isLoading, error } = useSearch(q);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    useLibrary.getState().rememberSearch(v);
    setFocused(false);
    input.current?.blur();
    router.push(`/search?q=${encodeURIComponent(v)}`);
  };

  return (
    <div>
      <PageHeader title="Search" sub="Songs, artists, albums and playlists from YouTube Music." />
      <form
        className="box"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Songs, artists, albums, playlists"
          aria-label="Search"
          enterKeyHint="search"
          autoComplete="off"
        />
        {text && (
          <button type="button" className="icon-btn sm" aria-label="Clear" onClick={() => (setText(''), input.current?.focus())}>
            <Icon name="close" size={16} />
          </button>
        )}
      </form>

      {focused && (text.trim().length > 1 ? sugg.data : recent.length > 0) && (
        <div className="sugg card fade-in">
          {text.trim().length > 1 ? (
            <>
              {sugg.data?.queries.map((s) => (
                <button key={s} className="srow" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(s)}>
                  <Icon name="search" size={16} />
                  <span className="clamp1">{s}</span>
                </button>
              ))}
              {sugg.data?.items.map((it) => (
                <SuggestItem key={it.kind + it.id} item={it} onDone={() => setFocused(false)} />
              ))}
            </>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between', padding: '6px 12px' }}>
                <span className="eyebrow" style={{ color: 'var(--muted)' }}>Recent</span>
                <button className="muted" style={{ fontSize: 12.5, fontWeight: 500 }} onMouseDown={(e) => e.preventDefault()} onClick={() => useLibrary.getState().clearSearches()}>
                  Clear
                </button>
              </div>
              {recent.map((s) => (
                <button key={s} className="srow" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(s)}>
                  <Icon name="history" size={16} />
                  <span className="clamp1">{s}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {q && isLoading && (
        <>
          <ShelfSkeleton />
          <ShelfSkeleton />
        </>
      )}
      {error && <div className="callout err" style={{ marginTop: 20 }}><Icon name="warn" size={18} />Search failed: {(error as Error).message}</div>}

      {data && (
        <div className="results fade-in">
          <div className="chips" role="tablist" aria-label="Result type">
            {([
              ['all', 'All', 0],
              ['songs', 'Songs', data.songs.length],
              ['artists', 'Artists', data.artists.length],
              ['albums', 'Albums', data.albums.length],
              ['playlists', 'Playlists', data.playlists.length],
              ['videos', 'Videos', data.videos.length],
            ] as const)
              .filter(([id, , n]) => id === 'all' || n > 0)
              .map(([id, label]) => (
                <button key={id} role="tab" aria-selected={type === id} className={type === id ? 'on' : ''} onClick={() => setType(id)}>
                  {label}
                </button>
              ))}
          </div>

          {type === 'all' && (
            <>
              <div className="top-grid">
                {data.top && <TopResult item={data.top} />}
                {data.songs.length > 0 && (
                  <section className="songs">
                    <div className="section-head">
                      <h2>Songs</h2>
                      {data.songs.length > 5 && (
                        <button className="btn ghost sm" onClick={() => setType('songs')}>
                          Show all {data.songs.length}
                        </button>
                      )}
                    </div>
                    {data.songs.slice(0, 5).map((t, i) => (
                      <TrackRow key={t.id} track={t} index={i} list={data.songs} />
                    ))}
                  </section>
                )}
              </div>
              {data.artists.length > 0 && <ShelfRow shelf={{ title: 'Artists', items: data.artists }} />}
              {data.albums.length > 0 && <ShelfRow shelf={{ title: 'Albums & singles', items: data.albums }} />}
              {data.playlists.length > 0 && <ShelfRow shelf={{ title: 'Playlists', items: data.playlists }} />}
              {data.videos.length > 0 && <ShelfRow shelf={{ title: 'Videos', items: data.videos }} />}
            </>
          )}

          {type === 'songs' && (
            <section>
              <div className="section-head">
                <h2>Songs</h2>
                <button className="btn primary sm" onClick={() => usePlayer.getState().play(data.songs, 0, { source: `search:${q}` })}>
                  <Icon name="play" size={13} /> Play all
                </button>
              </div>
              {data.songs.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} list={data.songs} />
              ))}
            </section>
          )}
          {type === 'artists' && <ItemGrid items={data.artists} />}
          {type === 'albums' && <ItemGrid items={data.albums} />}
          {type === 'playlists' && <ItemGrid items={data.playlists} />}
          {type === 'videos' && <ItemGrid items={data.videos} />}

          {!data.songs.length && !data.albums.length && !data.artists.length && <div className="empty"><b>Nothing found for “{q}”</b><span>Try a different spelling, or search for the artist.</span></div>}
        </div>
      )}

      {!q && (
        <div className="start fade-in">
          {recent.length > 0 && (
            <section>
              <div className="section-head">
                <h2>Recent searches</h2>
                <button className="btn ghost sm" onClick={() => useLibrary.getState().clearSearches()}>Clear</button>
              </div>
              <div className="pills">
                {recent.map((r) => (
                  <button key={r} className="pill" onClick={() => submit(r)}>
                    <Icon name="history" size={14} /> {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section>
            <div className="section-head"><h2>Browse categories</h2></div>
            <div className="cats">
              {CATS.map(([label, from, to]) => (
                <button key={label} className="cat" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} onClick={() => submit(label)}>
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .cats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
        .cat { height: 76px; padding: 12px; border-radius: 6px; color: #fff; font-family: var(--font-display); font-size: 14px; font-weight: 500; letter-spacing: -.005em; text-align: left; vertical-align: top; transition: transform .35s var(--spring), filter .2s; }
        .cat:hover { filter: brightness(1.06); }
        .cat:active { transform: scale(.97); }
        @media (max-width: 900px) { .cats { grid-template-columns: 1fr 1fr; } }
        .box { position: relative; display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 8px 0 12px; border-radius: 6px; margin-top: 4px; background: var(--surface); border: 1px solid var(--border-2); color: var(--muted); transition: box-shadow .2s; }
        .box:focus-within { border-color: var(--signal); box-shadow: 0 0 0 2px var(--signal-soft); color: var(--text); }
        .box input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 13px; font-weight: 400; color: var(--text); min-width: 0; }
        .box input::placeholder { color: var(--muted); font-weight: 400; }
        .sugg { position: absolute; z-index: 30; margin-top: 8px; width: min(640px, calc(100% - 2 * var(--gutter))); padding: 8px; box-shadow: var(--lift-hi); }
        :global(.srow) { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 10px; border-radius: 4px; text-align: left; font-weight: 400; font-size: 13px; color: var(--text); }
        :global(.srow:hover) { background: var(--surface-2); }
        .results { margin-top: 4px; display: flex; flex-direction: column; gap: 20px; }
        .start { margin-top: 18px; display: flex; flex-direction: column; gap: 22px; }
        .pills { display: flex; flex-wrap: wrap; gap: 8px; }
        .pill { display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 10px; border-radius: 5px; border: 1px solid var(--border); background: var(--surface); font-size: 12px; font-weight: 500; transition: background .2s, transform .3s var(--spring); }
        .pill:hover { background: color-mix(in srgb, var(--surface-2) 86%, var(--text)); }
        .pill:active { transform: scale(.97); }
        .results :global(.chips) { align-self: flex-start; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(164px, 1fr)); gap: 24px 20px; }
        .top-grid { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; gap: 24px; align-items: start; }
        @media (max-width: 900px) { .top-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

function SuggestItem({ item, onDone }: { item: Item; onDone: () => void }) {
  const router = useRouter();
  const sub = item.kind === 'song' ? artistNames(item.artists) : item.kind === 'album' ? item.subtitle ?? 'Album' : item.kind === 'artist' ? 'Artist' : 'Playlist';
  return (
    <button
      className="srow"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onDone();
        if (item.kind === 'song') usePlayer.getState().playRadio(item);
        else router.push(hrefFor(item)!);
      }}
    >
      {item.kind === 'song' ? <Cover src={item.thumb} size={38} radius={8} /> : item.kind === 'artist' ? <Avatar src={item.thumb} size={38} /> : <Cover src={item.thumb} size={38} radius={8} />}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="clamp1" style={{ display: 'block' }}>{item.title}</span>
        <span className="clamp1 muted" style={{ display: 'block', fontSize: 13 }}>{sub}</span>
      </span>
    </button>
  );
}

function TopResult({ item }: { item: Item }) {
  const href = hrefFor(item);
  const body = (
    <>
      {item.kind === 'artist' ? <Avatar src={item.thumb} size={120} /> : <Cover src={item.thumb} size={120} radius={14} />}
      <div className="eyebrow" style={{ marginTop: 18 }}>Top result · {item.kind === 'song' ? 'Song' : item.kind}</div>
      <div className="tt clamp2">{item.title}</div>
      <div className="muted clamp1">{item.kind === 'song' ? artistNames(item.artists) : item.kind === 'album' ? artistNames(item.artists) : item.subtitle}</div>
      <style jsx>{`
        .tt { font-size: 24px; font-weight: 600; letter-spacing: -.04em; line-height: 1.1; margin: 6px 0 4px; }
      `}</style>
    </>
  );
  const cls = 'top card';
  const style = { display: 'block', padding: 22, textAlign: 'left' as const, width: '100%' };
  return item.kind === 'song' ? (
    <button className={cls} style={style} onClick={() => usePlayer.getState().playRadio(item)}>
      {body}
    </button>
  ) : (
    <Link className={cls} style={style} href={href!}>
      {body}
    </Link>
  );
}

function ItemGrid({ items }: { items: Item[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '24px 18px' }}>
      {items.map((it) => (
        <ItemCard key={it.kind + it.id} item={it} />
      ))}
    </div>
  );
}
