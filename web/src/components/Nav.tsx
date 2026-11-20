'use client';
import { DevicesButton } from './Devices';
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

const SWATCH = ['#5e6ad2', '#ec45e6', '#5c84ff', '#f2be00', '#4cb782'];
const swatch = (s: string) => SWATCH[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % SWATCH.length];

/** Workspace mark: a rounded square and the name, as in the Linear sidebar header. */
export function Brand({ mini }: { mini?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="LoMu home">
      <span className="mark" aria-hidden>
        <Icon name="waveform" size={12} />
      </span>
      {!mini && <span className="word">LoMu</span>}
      <style jsx>{`
        :global(.brand) { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        .mark { width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; background: linear-gradient(180deg, var(--signal-hi), var(--signal)); color: #fff; flex: none; box-shadow: 0 0 0 1px rgba(255, 255, 255, .08) inset; }
        .word { font-size: 13px; font-weight: 600; letter-spacing: -.005em; color: var(--ink); }
      `}</style>
    </Link>
  );
}

const THEMES: { id: Theme; label: string; dot: string }[] = [
  { id: 'dark', label: 'Dark', dot: '#5e6ad2' },
  { id: 'light', label: 'Light', dot: '#d4d4d4' },
  { id: 'blue', label: 'Magic blue', dot: '#575ac6' },
  { id: 'system', label: 'System', dot: '#959699' },
];

/** Interface theme dropdown (the "Aa" swatch + name from the Linear preferences page). */
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
              {theme === t.id && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
      )}
      <style jsx>{`
        .ts { position: relative; }
        .cur { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 8px 0 4px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--text); font-size: 12px; transition: background .15s, border-color .15s; }
        .cur:hover { background: var(--hover); border-color: var(--border-2); }
        .nm { flex: 1; text-align: left; }
        .aa { display: inline-flex; align-items: center; gap: 4px; height: 18px; padding: 0 5px; border-radius: 3px; background: var(--bg); box-shadow: 0 0 0 1px var(--border); font-size: 11px; font-weight: 500; color: var(--text); }
        .aa i { width: 5px; height: 5px; border-radius: 50%; }
        .pop { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 90; padding: 4px; border-radius: 6px; background: var(--surface); box-shadow: var(--lift-hi); animation: rise .15s var(--ease-out) both; }
        .pop.up { top: auto; bottom: calc(100% + 4px); }
        .pop button { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 6px; border-radius: 4px; font-size: 12px; color: var(--text); text-align: left; }
        .pop button:hover, .pop button.on { background: var(--active); }
      `}</style>
    </div>
  );
}

export function Sidebar() {
  const path = usePathname();
  const tabs = useTabs();
  const mini = useSettings((s) => s.sideMini);
  const setMini = useSettings((s) => s.setSideMini);
  const playlists = useLibrary((s) => s.playlists);
  const likedCount = useLibrary((s) => Object.keys(s.liked).length);
  const { user, sync, logout } = useAuth();
  const [lists, setLists] = useState(true);

  return (
    <aside className={`side${mini ? ' mini' : ''}`} aria-label="Main">
      <div className="top">
        <Brand mini={mini} />
        {!mini && <Icon name="down" size={12} className="chev" />}
        <div className="grow" />
        <Link href="/search" className="icon-btn sm hide-mini" aria-label="Search" title="Search">
          <Icon name="search" size={16} />
        </Link>
        <button className="icon-btn sm hide-mini" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={() => setMini(true)}>
          <Icon name="menu" size={16} />
        </button>
      </div>
      {mini && (
        <button className="icon-btn sm expand" aria-label="Expand sidebar" title="Expand sidebar" onClick={() => setMini(false)}>
          <Icon name="menu" size={16} />
        </button>
      )}

      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={`link${isActive(path, t.href) ? ' active' : ''}`} title={t.label}>
            <Icon name={t.icon} size={16} />
            <span className="lbl">{t.label}</span>
            {t.href === '/library' && likedCount > 0 && <span className="num">{likedCount}</span>}
          </Link>
        ))}

        <button className="sec hide-mini" onClick={() => setLists(!lists)} aria-expanded={lists}>
          Playlists <i className={lists ? 'open' : ''} />
        </button>
        {lists && playlists.length === 0 && <div className="none hide-mini">No playlists yet</div>}
        {lists &&
          playlists.slice(0, 12).map((p) => (
            <Link key={p.id} href={`/library/playlist/${p.id}`} className={`link${path === `/library/playlist/${p.id}` ? ' active' : ''}`} title={p.name}>
              <span className="sq" style={{ background: `color-mix(in srgb, ${swatch(p.name)} 24%, transparent)`, color: swatch(p.name), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${swatch(p.name)} 40%, transparent)` }}>
                {p.name[0]?.toUpperCase()}
              </span>
              <span className="lbl clamp1">{p.name}</span>
            </Link>
          ))}
      </nav>

      <div className="foot">
        <Link href="/settings" className={`link${path.startsWith('/settings') ? ' active' : ''}`} title="Settings">
          <Icon name="settings" size={16} />
          <span className="lbl">Settings</span>
        </Link>
        <div className="hide-mini"><ThemeSelect up /></div>
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
              <Icon name="logout" size={14} />
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .side { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; background: var(--side-bg); z-index: 40; overflow: hidden; padding: 0 8px; }
        .top { height: 48px; display: flex; align-items: center; gap: 6px; padding: 0 4px 0 6px; flex: none; }
        :global(.side .chev) { color: var(--muted); }
        .expand { margin: 4px auto 0; }
        .nav { flex: 1; overflow-y: auto; padding: 4px 0 12px; display: flex; flex-direction: column; gap: 1px; }
        :global(.side .link) { display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px; border-radius: 5px; color: var(--text); font-weight: 500; font-size: 13px; white-space: nowrap; transition: background .12s var(--ease), color .12s var(--ease); }
        :global(.side .link svg) { flex: none; color: var(--muted); transition: color .12s; }
        :global(.side .link:hover) { background: var(--hover); }
        :global(.side .link:hover svg) { color: var(--text); }
        :global(.side .link.active) { background: var(--active); color: var(--ink); }
        :global(.side .link.active svg) { color: var(--ink); }
        .lbl { flex: 1; min-width: 0; }
        .num { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 4px; display: grid; place-items: center; background: var(--surface-2); color: var(--text); font-size: 12px; font-weight: 400; }
        .sec { display: flex; align-items: center; gap: 6px; height: 28px; margin-top: 14px; padding: 0 8px; color: var(--muted); font-size: 12px; font-weight: 500; text-align: left; border-radius: 5px; }
        .sec:hover { color: var(--text); }
        .sec i { width: 0; height: 0; border-left: 4px solid currentColor; border-top: 3.5px solid transparent; border-bottom: 3.5px solid transparent; transition: transform .15s var(--ease); }
        .sec i.open { transform: rotate(90deg); }
        .none { padding: 4px 8px; font-size: 12px; color: var(--faint); }
        .sq { width: 16px; height: 16px; border-radius: 4px; display: grid; place-items: center; font-size: 10px; font-weight: 600; flex: none; }
        .foot { padding: 8px 0 8px; display: flex; flex-direction: column; gap: 6px; }
        .user { display: flex; align-items: center; gap: 8px; padding: 4px 2px 0 4px; }
        .av { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--signal); color: #fff; font-weight: 500; font-size: 11px; flex: none; }
        .who { font-size: 12px; font-weight: 500; color: var(--text); }
        .st { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--muted); }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--border-2); }
        .dot.live { background: var(--green); }
        .dot.syncing { background: var(--peri-t); }
        .dot.error { background: var(--red); }
        .mini { align-items: stretch; }
        .mini :global(.link .lbl), .mini :global(.link .num), .mini .hide-mini { display: none; }
        .mini :global(.link) { justify-content: center; padding: 0; }
        .mini .top { justify-content: center; padding: 0; }
        @media (max-width: 900px) { .side { display: none; } }
      `}</style>
    </aside>
  );
}

/** Panel header: a Linear-style filter field that jumps to /search, and the device picker. */
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
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Icon name="search" size={14} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, artists, albums" aria-label="Search" />
        <kbd>/</kbd>
      </form>
      <div className="grow" />
      <DevicesButton down />
      <style jsx>{`
        .top { position: sticky; top: 0; z-index: 30; height: var(--top-h); display: flex; align-items: center; gap: 12px; padding: 0 var(--gutter); background: var(--glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .search { display: flex; align-items: center; gap: 8px; height: 26px; width: min(360px, 100%); padding: 0 8px; border-radius: 5px; background: transparent; border: 1px solid transparent; color: var(--muted); transition: background .15s, border-color .15s; }
        .search:hover { background: var(--hover); }
        .search:focus-within { background: var(--surface); border-color: var(--border-2); color: var(--text); }
        .search input { flex: 1; min-width: 0; background: none; border: 0; outline: none; font-size: 13px; }
        .search input::placeholder { color: var(--muted); }
        kbd { font: inherit; font-size: 11px; color: var(--muted); border: 1px solid var(--border-2); border-radius: 4px; padding: 0 5px; line-height: 16px; }
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
          <Icon name={t.icon} size={18} />
          <span>{t.label}</span>
        </Link>
      ))}
      <style jsx>{`
        .tabs { display: none; }
        @media (max-width: 900px) {
          .tabs { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; height: calc(52px + env(safe-area-inset-bottom)); padding: 0 8px env(safe-area-inset-bottom); background: var(--glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-top: 1px solid var(--border); }
          .tabs :global(a) { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: var(--muted); font-size: 11px; font-weight: 500; transition: color .15s var(--ease); }
          .tabs :global(a.on) { color: var(--peri-t); }
        }
      `}</style>
    </nav>
  );
}
