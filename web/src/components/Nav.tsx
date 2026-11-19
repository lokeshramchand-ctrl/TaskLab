'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { useSettings, type Theme } from '@/player/settings';
import { useLibrary } from '@/player/library';
import { useAuth } from '@/player/sync';

type Tab = { href: string; icon: IconName; label: string; flag?: 'explore' };
const TABS: Tab[] = [
  { href: '/', icon: 'home', label: 'Home' },
  { href: '/search', icon: 'search', label: 'Search' },
  { href: '/explore', icon: 'compass', label: 'Explore', flag: 'explore' },
  { href: '/library', icon: 'library', label: 'Library' },
];

function useTabs() {
  const dev = useSettings((s) => s.dev);
  return TABS.filter((t) => !t.flag || dev[t.flag]);
}
const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

/** Small wordmark: the mark is a flat ink square, no big logo. */
export function Brand({ mini }: { mini?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="LoMu home">
      <span className="mark" aria-hidden>
        <Icon name="waveform" size={16} />
      </span>
      {!mini && <span className="word">LoMu</span>}
      <style jsx>{`
        :global(.brand) { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
        .mark { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; background: linear-gradient(180deg, #5ac8fa, var(--signal)); color: #fff; flex: none; }
        .word { font-family: var(--font-display); font-size: 19px; font-weight: 700; letter-spacing: .01em; }
      `}</style>
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const tabs = useTabs();
  const mini = useSettings((s) => s.sideMini);
  const setMini = useSettings((s) => s.setSideMini);
  const theme = useSettings((s) => s.theme);
  const playlists = useLibrary((s) => s.playlists);
  const { user, sync, logout } = useAuth();
  const themes: { id: Theme; icon: IconName; label: string }[] = [
    { id: 'system', icon: 'system', label: 'System' },
    { id: 'light', icon: 'sun', label: 'Light' },
    { id: 'dark', icon: 'moon', label: 'Dark' },
  ];

  return (
    <aside className={`side${mini ? ' mini' : ''}`} aria-label="Main">
      <div className="top">
        <Brand mini={mini} />
        <button className="icon-btn sm hide-mini" aria-label="Collapse sidebar" onClick={() => setMini(true)}>
          <Icon name="left" size={15} />
        </button>
      </div>
      {mini && (
        <button className="icon-btn sm expand" aria-label="Expand sidebar" onClick={() => setMini(false)}>
          <Icon name="right" size={15} />
        </button>
      )}

      <nav className="nav">
        <div className="label">Listen</div>
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`link${isActive(path, t.href) ? ' active' : ''}`} title={t.label}>
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </Link>
        ))}

        {playlists.length > 0 && (
          <>
            <div className="label">Playlists</div>
            {playlists.slice(0, 8).map((p) => (
              <Link key={p.id} href={`/library/playlist/${p.id}`} className={`link sub${path === `/library/playlist/${p.id}` ? ' active' : ''}`} title={p.name}>
                <Icon name="playlist" size={18} />
                <span className="clamp1">{p.name}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="foot">
        <Link href="/settings" className={`link${path.startsWith('/settings') ? ' active' : ''}`} title="Settings">
          <Icon name="settings" size={18} />
          <span>Settings</span>
        </Link>
        <div className="themes hide-mini" role="group" aria-label="Theme">
          {themes.map((t) => (
            <button key={t.id} className={theme === t.id ? 'on' : ''} aria-label={t.label} title={t.label} onClick={() => useSettings.getState().setTheme(t.id)}>
              <Icon name={t.icon} size={15} />
            </button>
          ))}
        </div>
        {user && (
          <div className="user hide-mini">
            <span className="av">{user[0]?.toUpperCase()}</span>
            <div className="grow">
              <div className="clamp1 who">{user}</div>
              <div className="st">
                <i className={`dot ${sync}`} />
                {sync === 'live' ? 'Synced' : sync === 'syncing' ? 'Syncing…' : sync === 'error' ? 'Offline' : 'Local'}
              </div>
            </div>
            <button className="icon-btn sm" aria-label="Sign out" title="Sign out" onClick={() => logout()}>
              <Icon name="logout" size={15} />
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .side { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; background: var(--side-bg); border-right: .5px solid var(--border); z-index: 40; overflow: hidden; }
        .top { height: var(--top-h); display: flex; align-items: center; justify-content: space-between; padding: 0 16px 0 20px; flex: none; }
        .expand { margin: 8px auto 0; }
        .nav { flex: 1; overflow-y: auto; padding: 12px; scrollbar-width: thin; }
        .label { font-size: 12.5px; font-weight: 600; color: var(--muted); padding: 16px 12px 6px; white-space: nowrap; }
        .nav .label:first-child { padding-top: 6px; }
        .foot { border-top: .5px solid var(--border); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
        :global(.side .link) { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; border-radius: var(--r-sm); color: var(--text); font-weight: 500; font-size: 15px; white-space: nowrap; transition: background .2s var(--ease), color .2s var(--ease); }
        :global(.side .link:hover) { background: var(--surface-2); color: var(--text); }
        :global(.side .link.active) { background: var(--surface-2); color: var(--signal); font-weight: 600; }
        :global(.side .link.sub) { height: 34px; font-size: 13.5px; }
        :global(.side .link svg) { flex: none; }
        .themes { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface-2); }
        .themes button { flex: 1; height: 28px; border-radius: 9px; display: grid; place-items: center; color: var(--muted); transition: all .2s; }
        .themes button.on { background: var(--bg); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .18); }
        .user { display: flex; align-items: center; gap: 10px; padding: 4px 2px 0; }
        .av { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #c3b1f5, #6f7bd9); color: #fff; font-weight: 600; font-size: 13px; flex: none; }
        .who { font-size: 13px; font-weight: 500; }
        .st { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-2); }
        .dot.live { background: var(--green); }
        .dot.syncing { background: var(--peri); }
        .dot.error { background: var(--red); }
        .mini { align-items: stretch; }
        .mini :global(.link span), .mini .label, .mini .hide-mini { display: none; }
        .mini :global(.link) { justify-content: center; padding: 0; }
        .mini .top { justify-content: center; padding: 0; }
        @media (max-width: 900px) { .side { display: none; } }
      `}</style>
    </aside>
  );
}

/** Sticky top bar: search that jumps to /search, quick sync state on small screens. */
export function Topbar() {
  const router = useRouter();
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');

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

  return (
    <header className="top">
      <div className="mobile-brand">
        <Brand />
      </div>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Icon name="search" size={16} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, artists, albums" aria-label="Search" />
        <kbd>/</kbd>
      </form>
      <style jsx>{`
        .top { position: sticky; top: 0; z-index: 30; height: var(--top-h); display: flex; align-items: center; gap: 16px; padding: 0 var(--gutter); background: var(--glass); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); border-bottom: .5px solid var(--border); }
        .mobile-brand { display: none; }
        .search { display: flex; align-items: center; gap: 10px; height: 38px; width: min(420px, 100%); padding: 0 14px; border-radius: 999px; background: var(--surface-2); border: 0; color: var(--muted); transition: box-shadow .2s; }
        .search:focus-within { box-shadow: 0 0 0 3px var(--signal-soft); color: var(--text); }
        .search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 14px; }
        .search input::placeholder { color: var(--muted); }
        kbd { font: inherit; font-size: 11px; font-weight: 600; color: var(--muted); border: 1px solid var(--border-2); border-radius: 6px; padding: 0 6px; line-height: 18px; }
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
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={isActive(path, t.href) ? 'on' : ''} aria-label={t.label}>
          <Icon name={t.icon} size={22} />
          <span>{t.label}</span>
        </Link>
      ))}
      <style jsx>{`
        .tabs { display: none; }
        @media (max-width: 900px) {
          .tabs { display: flex; gap: 2px; position: fixed; left: 14px; right: 14px; bottom: calc(8px + env(safe-area-inset-bottom)); z-index: 45; height: 62px; padding: 4px; border-radius: 36px; background: color-mix(in srgb, var(--bg) 95%, transparent); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); box-shadow: var(--lift-hi); border: .5px solid var(--border); }
          .tabs :global(a) { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--text); font-size: 10px; font-weight: 700; border-radius: 30px; transition: background .25s var(--ease), color .25s var(--ease); }
          .tabs :global(a.on) { color: var(--signal); background: var(--surface-2); }
        }
      `}</style>
    </nav>
  );
}
