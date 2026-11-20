'use client';
import { DevicesButton } from './Devices';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Cover } from './Art';
import { useSettings, type Theme } from '@/player/settings';
import { useLibrary } from '@/player/library';
import { useAuth } from '@/player/sync';

type Tab = { href: string; icon: IconName; active: IconName; label: string; flag?: 'explore' };
const TABS: Tab[] = [
  { href: '/', icon: 'home', active: 'homeFill', label: 'Home' },
  { href: '/search', icon: 'search', active: 'searchBold', label: 'Search' },
  { href: '/explore', icon: 'compass', active: 'compass', label: 'Explore', flag: 'explore' },
  { href: '/library', icon: 'library', active: 'libraryFill', label: 'Library' },
];

function useTabs() {
  const dev = useSettings((s) => s.dev);
  return TABS.filter((t) => !t.flag || dev[t.flag]);
}
const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

/** Wordmark used where a name is needed (no logo artwork). */
export function Brand({ mini }: { mini?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="LoMu home">
      <span className="word">{mini ? 'L' : 'LoMu'}</span>
      <style jsx>{`
        :global(.brand) { display: flex; align-items: center; white-space: nowrap; }
        .word { font-size: 20px; font-weight: 900; letter-spacing: -.03em; color: var(--ink); }
      `}</style>
    </Link>
  );
}

const THEMES: { id: Theme; label: string; dot: string }[] = [
  { id: 'dark', label: 'Dark', dot: '#1ed760' },
  { id: 'light', label: 'Light', dot: '#d4d4d4' },
  { id: 'system', label: 'System', dot: '#b3b3b3' },
];

/** Interface theme dropdown. */
export function ThemeSelect({ up = false }: { up?: boolean }) {
  const theme = useSettings((s) => s.theme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="ts" ref={ref}>
      <button className="cur" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="aa"><i style={{ background: cur.dot }} />Aa</span>
        <span className="nm">{cur.label}</span>
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div className={`pop${up ? ' up' : ''}`} role="listbox" aria-label="Interface theme">
          {THEMES.map((t) => (
            <button key={t.id} role="option" aria-selected={theme === t.id} className={theme === t.id ? 'on' : ''} onClick={() => (useSettings.getState().setTheme(t.id), setOpen(false))}>
              <span className="aa"><i style={{ background: t.dot }} />Aa</span>
              <span className="nm">{t.label}</span>
              {theme === t.id && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
      <style jsx>{`
        .ts { position: relative; }
        .cur { display: flex; align-items: center; gap: 8px; width: 100%; height: 36px; padding: 0 12px 0 6px; border-radius: 4px; background: var(--surface-2); color: var(--text); font-size: 14px; font-weight: 500; transition: background .15s; }
        .cur:hover { background: var(--card-hover); }
        .nm { flex: 1; text-align: left; }
        .aa { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; border-radius: 4px; background: var(--bg); font-size: 12px; font-weight: 700; color: var(--text); }
        .aa i { width: 6px; height: 6px; border-radius: 50%; }
        .pop { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 90; padding: 4px; border-radius: 4px; background: var(--card-hover); box-shadow: var(--lift-hi); animation: rise .15s var(--ease-out) both; }
        .pop.up { top: auto; bottom: calc(100% + 4px); }
        .pop button { display: flex; align-items: center; gap: 8px; width: 100%; height: 36px; padding: 0 8px; border-radius: 2px; font-size: 14px; color: var(--text); text-align: left; }
        .pop button:hover, .pop button.on { background: var(--row-hover); }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------- library list (left panel)

type LibItem = { key: string; href: string; title: string; sub: string; thumb?: string; kind: 'playlist' | 'album' | 'artist' | 'liked'; at: number };

function useLibraryItems(): LibItem[] {
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const saved = useLibrary((s) => s.savedPlaylists);
  return useMemo(() => {
    const items: LibItem[] = [];
    const likedN = Object.keys(liked).length;
    items.push({ key: 'liked', href: '/library?tab=liked', title: 'Liked Songs', sub: `Playlist • ${likedN} ${likedN === 1 ? 'song' : 'songs'}`, kind: 'liked', at: Number.MAX_SAFE_INTEGER });
    for (const p of playlists) items.push({ key: 'pl-' + p.id, href: `/library/playlist/${p.id}`, title: p.name, sub: `Playlist • ${p.tracks.length} ${p.tracks.length === 1 ? 'song' : 'songs'}`, thumb: p.tracks[0]?.thumb, kind: 'playlist', at: p.updatedAt });
    for (const [id, v] of Object.entries(saved)) items.push({ key: 'sp-' + id, href: `/playlist/${id}`, title: v.item.title, sub: 'Playlist', thumb: v.item.thumb, kind: 'playlist', at: v.at });
    for (const [id, v] of Object.entries(albums)) items.push({ key: 'al-' + id, href: `/album/${id}`, title: v.item.title, sub: `Album • ${v.item.artists.map((a) => a.name).join(', ')}`, thumb: v.item.thumb, kind: 'album', at: v.at });
    for (const [id, v] of Object.entries(artists)) items.push({ key: 'ar-' + id, href: `/artist/${id}`, title: v.item.title, sub: 'Artist', thumb: v.item.thumb, kind: 'artist', at: v.at });
    return items.sort((a, b) => b.at - a.at);
  }, [liked, playlists, albums, artists, saved]);
}

function LibArt({ it, size }: { it: LibItem; size: number }) {
  if (it.kind === 'liked') {
    return (
      <span className="lk" style={{ width: size, height: size }}>
        <Icon name="heartFill" size={Math.round(size * 0.42)} />
        <style jsx>{`
          .lk { display: grid; place-items: center; border-radius: 4px; flex: none; color: #fff; background: linear-gradient(135deg, #450af5, #8e8ee5 60%, #c4efd9); }
        `}</style>
      </span>
    );
  }
  if (it.kind === 'artist') return <Cover src={it.thumb} size={size} radius={size} />;
  if (!it.thumb) {
    return (
      <span className="ph2" style={{ width: size, height: size }}>
        <Icon name="note" size={Math.round(size * 0.42)} />
        <style jsx>{`
          .ph2 { display: grid; place-items: center; border-radius: 4px; flex: none; background: var(--surface-2); color: var(--muted); }
        `}</style>
      </span>
    );
  }
  return <Cover src={it.thumb} size={size} radius={4} />;
}

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const tabs = useTabs().filter((t) => t.href !== '/library');
  const mini = useSettings((s) => s.sideMini);
  const setMini = useSettings((s) => s.setSideMini);
  const items = useLibraryItems();
  const [kind, setKind] = useState<null | 'playlist' | 'artist' | 'album'>(null);
  const shown = kind ? items.filter((i) => i.kind === kind || (kind === 'playlist' && i.kind === 'liked')) : items;
  const create = () => {
    const n = useLibrary.getState().playlists.length + 1;
    const id = useLibrary.getState().createPlaylist(`My playlist #${n}`);
    router.push(`/library/playlist/${id}`);
  };

  return (
    <aside className={`side${mini ? ' mini' : ''}`} aria-label="Main">
      <nav className="navp">
        {tabs.map((t) => {
          const on = isActive(path, t.href);
          return (
            <Link key={t.href} href={t.href} className={`link${on ? ' active' : ''}`} title={t.label}>
              <Icon name={on ? t.active : t.icon} size={24} />
              <span className="lbl">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      <section className="lib" aria-label="Your Library">
        <header className="lh">
          <button className="ttl" onClick={() => setMini(!mini)} title={mini ? 'Expand Your Library' : 'Collapse Your Library'} aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Icon name="library" size={24} />
            <span className="lbl">Your Library</span>
          </button>
          <button className="icon-btn hide-mini" aria-label="Create playlist" title="Create playlist" onClick={create}>
            <Icon name="plus" size={18} />
          </button>
        </header>
        {!mini && (
          <div className="chips lchips">
            {(['playlist', 'artist', 'album'] as const).map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(kind === k ? null : k)}>
                {k === 'playlist' ? 'Playlists' : k === 'artist' ? 'Artists' : 'Albums'}
              </button>
            ))}
          </div>
        )}
        <div className="items">
          {shown.map((it) => {
            const on = it.key === 'liked' ? path === '/library' : path === it.href;
            return (
              <Link key={it.key} href={it.href} className={`item${on ? ' on' : ''}`} title={it.title}>
                <LibArt it={it} size={48} />
                <div className="tx hide-mini">
                  <div className="t clamp1">{it.title}</div>
                  <div className="s clamp1">{it.sub}</div>
                </div>
              </Link>
            );
          })}
          {shown.length === 0 && <div className="none hide-mini">Nothing here yet</div>}
        </div>
      </section>

      <style jsx>{`
        .side { display: flex; flex-direction: column; gap: 8px; min-height: 0; grid-column: 1; grid-row: 1; }
        .navp { background: var(--bg); border-radius: 8px; padding: 8px 12px; display: flex; flex-direction: column; flex: none; }
        :global(.side .link) { display: flex; align-items: center; gap: 20px; height: 40px; padding: 0 12px; border-radius: 4px; color: var(--muted); font-weight: 700; font-size: 16px; white-space: nowrap; transition: color .2s var(--ease); }
        :global(.side .link:hover) { color: var(--text); }
        :global(.side .link.active) { color: var(--ink); }
        :global(.side .link svg) { flex: none; }
        .lib { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); border-radius: 8px; }
        .lh { display: flex; align-items: center; gap: 4px; padding: 12px 16px 8px 20px; }
        .ttl { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; color: var(--muted); font-weight: 700; font-size: 16px; text-align: left; transition: color .2s var(--ease); }
        .ttl:hover { color: var(--text); }
        .lbl { min-width: 0; }
        .lchips { padding: 4px 16px 8px; flex: none; }
        .items { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 8px; }
        :global(.side .item) { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 6px; transition: background .15s var(--ease); }
        :global(.side .item:hover) { background: var(--surface-2); }
        :global(.side .item.on) { background: var(--active); }
        .tx { min-width: 0; flex: 1; }
        .t { font-size: 16px; font-weight: 500; color: var(--ink); }
        :global(.side .item.on) .t { color: var(--signal); }
        .s { font-size: 14px; color: var(--muted); }
        .none { padding: 16px 12px; color: var(--muted); }
        .mini .lbl, .mini .hide-mini { display: none; }
        .mini .lh { justify-content: center; padding: 12px 0 8px; }
        .mini .ttl { flex: none; }
        .mini :global(.link) { justify-content: center; padding: 0; }
        .mini :global(.item) { justify-content: center; padding: 8px 0; }
        @media (max-width: 900px) { .side { display: none; } }
      `}</style>
    </aside>
  );
}

// ---------------------------------------------------------------- top bar

/** Panel header: history arrows, Home, the search pill and the account button. */
export function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const { user, sync, local } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!path.startsWith('/search')) setQ('');
  }, [path]);
  // the bar turns solid once the page has scrolled under it
  useEffect(() => {
    const panel = bar.current?.closest('.panel');
    if (!panel) return;
    const on = () => setScrolled(panel.scrollTop > 60);
    panel.addEventListener('scroll', on, { passive: true });
    return () => panel.removeEventListener('scroll', on);
  }, []);

  const who = local ? 'This PC' : user;
  return (
    <header ref={bar} className={`top${scrolled ? ' solid' : ''}`}>
      <div className="arrows">
        <button className="round" aria-label="Go back" onClick={() => router.back()}><Icon name="chevL" size={16} /></button>
        <button className="round" aria-label="Go forward" onClick={() => window.history.forward()}><Icon name="chevR" size={16} /></button>
      </div>
      <Link href="/" className="homebtn" aria-label="Home" title="Home">
        <Icon name={path === '/' ? 'homeFill' : 'home'} size={24} />
      </Link>
      <form
        className={`search${path.startsWith('/search') ? ' gone' : ''}`}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Icon name="search" size={22} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to play?" aria-label="Search" />
        {q && (
          <button type="button" className="clr" aria-label="Clear" onClick={() => (setQ(''), input.current?.focus())}>
            <Icon name="close" size={16} />
          </button>
        )}
      </form>
      <div className="grow" />
      <DevicesButton down />
      <Link href="/settings" className="avatar" aria-label="Account and settings" title={`${who ?? 'Settings'}${sync === 'live' ? ' · synced' : sync === 'error' ? ' · offline' : ''}`}>
        <span>{(who ?? 'L')[0]?.toUpperCase()}</span>
      </Link>
      <style jsx>{`
        .top { position: sticky; top: 0; z-index: 30; height: var(--top-h); display: flex; align-items: center; gap: 8px; padding: 0 16px; background: transparent; transition: background .25s var(--ease); }
        .top.solid { background: color-mix(in srgb, var(--tint) 55%, var(--bg)); }
        .arrows { display: flex; gap: 8px; }
        .round { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: rgba(0, 0, 0, .7); color: #fff; transition: transform .15s var(--ease); }
        .round:hover { transform: scale(1.06); }
        :global(.top .homebtn) { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--ink); margin-left: 8px; transition: transform .15s var(--ease), background .15s; }
        :global(.top .homebtn:hover) { transform: scale(1.06); background: var(--card-hover); }
        .search { display: flex; align-items: center; gap: 12px; height: 48px; width: min(364px, 100%); padding: 0 16px; border-radius: 500px; background: var(--surface-2); color: var(--muted); box-shadow: 0 0 0 0 transparent; transition: background .15s, box-shadow .15s; }
        .search.gone { display: none; } /* the Search page has its own field with live suggestions */
        .search:hover { background: var(--card-hover); color: var(--text); }
        .search:focus-within { background: var(--card-hover); color: var(--text); box-shadow: 0 0 0 2px var(--ink); }
        .search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 16px; color: var(--ink); }
        .search input::placeholder { color: var(--muted); }
        .clr { color: var(--muted); display: grid; place-items: center; }
        .clr:hover { color: var(--ink); }
        :global(.top .avatar) { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: #000; transition: transform .15s var(--ease); }
        :global(.top .avatar:hover) { transform: scale(1.06); }
        .avatar span { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #535353; color: #fff; font-weight: 700; font-size: 14px; }
        @media (max-width: 900px) { .top { display: none; } }
      `}</style>
    </header>
  );
}

export function MobileTabs() {
  const path = usePathname();
  const tabs = useTabs();
  return (
    <nav className="tabs" aria-label="Main">
      {tabs.map((t) => {
        const on = isActive(path, t.href);
        return (
          <Link key={t.href} href={t.href} className={on ? 'on' : ''} aria-label={t.label}>
            <Icon name={on ? t.active : t.icon} size={24} />
            <span>{t.label}</span>
          </Link>
        );
      })}
      <style jsx>{`
        .tabs { display: none; }
        @media (max-width: 900px) {
          .tabs { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; height: calc(56px + env(safe-area-inset-bottom)); padding: 0 8px env(safe-area-inset-bottom); background: linear-gradient(180deg, rgba(0, 0, 0, .75), #000 40%); }
          .tabs :global(a) { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--muted); font-size: 11px; font-weight: 500; transition: color .15s var(--ease); }
          .tabs :global(a.on) { color: #fff; }
        }
      `}</style>
    </nav>
  );
}
