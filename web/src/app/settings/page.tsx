'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/player/library';
import { usePlayer } from '@/player/store';
import { HOME_SECTIONS, useSettings, type Theme } from '@/player/settings';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader, Toggle } from '@/components/ui';
import { toast } from '@/components/Toast';
import { useAuth } from '@/player/sync';

export default function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const dev = useSettings((s) => s.dev);
  const setDev = useSettings((s) => s.setDev);
  const autoplay = usePlayer((s) => s.autoplay);
  const { user, sync, lastSync, logout } = useAuth();
  const [confirmClear, setConfirmClear] = useState(false);
  const exportLibrary = () => {
    const { liked, history, playlists, albums, artists, savedPlaylists, recentSearches } = useLibrary.getState();
    const blob = new Blob([JSON.stringify({ app: 'lomu', exportedAt: new Date().toISOString(), liked, history, playlists, albums, artists, savedPlaylists, recentSearches }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lomu-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Library exported');
  };
  const themes: { id: Theme; icon: IconName; label: string }[] = [
    { id: 'system', icon: 'system', label: 'System' },
    { id: 'light', icon: 'sun', label: 'Light' },
    { id: 'dark', icon: 'moon', label: 'Dark' },
  ];

  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" sub="Account, appearance, playback and the things you can turn on or off." />
      <div className="stack">
        <Group title="Account" sub="One owner account. It syncs likes, playlists and history to your other devices.">
          <Row
            icon="user"
            label={user ? `Signed in as ${user}` : 'Not signed in'}
            hint={`Sync: ${sync === 'live' ? 'up to date' : sync}${lastSync ? ` · ${new Date(lastSync).toLocaleTimeString()}` : ''}`}
          >
            <button className="btn" onClick={() => logout()}>
              <Icon name="logout" size={16} /> Sign out
            </button>
          </Row>
        </Group>

        <Group title="Appearance">
          <Row icon="sun" label="Theme" hint="Follow the system, or force light or dark.">
            <div className="chips">
              {themes.map((t) => (
                <button key={t.id} className={theme === t.id ? 'on' : ''} onClick={() => useSettings.getState().setTheme(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </Row>
        </Group>

        <Group title="Home" sub="Pick what the home page shows. The Customise button on Home does the same.">
          {HOME_SECTIONS.map((s) => (
            <HomeToggle key={s.id} id={s.id} label={s.label} hint={s.hint} />
          ))}
        </Group>

        <Group title="Playback">
          <Row icon="radio" label="Autoplay" hint="When the queue ends, keep going with songs picked for you.">
            <Switch on={autoplay} label="Autoplay" onChange={(v) => usePlayer.setState({ autoplay: v })} />
          </Row>
          <Row icon="waveform" label="Audio quality" hint="Always the best stream YouTube offers without Premium: Opus around 160 kbps, AAC as a fallback.">
            <span className="badge">Best</span>
          </Row>
        </Group>

        <Group title="Library">
          <Row icon="download" label="Export library" hint="Download your likes, playlists, saved albums, artists and history as a JSON file.">
            <button className="btn" onClick={exportLibrary}>
              Export
            </button>
          </Row>
          <Row icon="download" label="Import from Google Takeout" hint="Bring in your YouTube Music playlists and likes from a Takeout export.">
            <Link href="/import" className="btn">Import</Link>
          </Row>
          <Row icon="history" label="Clear listening history" hint="Recommendations start learning again from scratch.">
            {confirmClear ? (
              <span className="row" style={{ gap: 8 }}>
                <button className="btn sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    useLibrary.setState({ history: [] });
                    setConfirmClear(false);
                    toast('History cleared');
                  }}
                >
                  Yes, clear it
                </button>
              </span>
            ) : (
              <button className="btn" onClick={() => setConfirmClear(true)}>
                Clear
              </button>
            )}
          </Row>
        </Group>

        <Group title="Developer">
          <Row icon="compass" label="Explore" hint="Show the Explore tab (charts, new releases, moods).">
            <Switch on={dev.explore} label="Explore" onChange={(v) => setDev('explore', v)} />
          </Row>
          <Row icon="user" label="Artist enrichment" hint="Sharper artist photos, banners and bios from TheAudioDB and Wikipedia.">
            <Switch on={dev.artistEnrichment} label="Artist enrichment" onChange={(v) => setDev('artistEnrichment', v)} />
          </Row>
          <Row icon="info" label="Stream info" hint="Show codec, bitrate and source client in the player.">
            <Switch on={dev.streamInfo} label="Stream info" onChange={(v) => setDev('streamInfo', v)} />
          </Row>
        </Group>
        <Group title="About">
          <Row icon="info" label="LoMu web player" hint={`Connected to ${typeof window !== 'undefined' ? window.location.host : 'this server'}. Press / anywhere to search and Esc to close the full player.`}>
            <span className="badge">v1.0</span>
          </Row>
        </Group>
      </div>


      <style jsx>{`
        .stack { display: flex; flex-direction: column; gap: 20px; max-width: 860px; }
      `}</style>
    </>
  );
}

function HomeToggle({ id, label, hint }: { id: (typeof HOME_SECTIONS)[number]['id']; label: string; hint: string }) {
  const on = useSettings((s) => s.home[id]);
  return (
    <div className="hp">
      <Toggle on={on} label={label} hint={hint} onChange={(v) => useSettings.getState().setHome(id, v)} />
      <style jsx>{`
        .hp { padding: 0 20px; }
        .hp + .hp { border-top: 1px solid var(--border); }
        .hp :global(.tg) { border-bottom: 0; }
      `}</style>
    </div>
  );
}

function Group({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="fade-in">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
      </div>
      <div className="card box">{children}</div>
      <style jsx>{`
        .box { padding: 0; overflow: hidden; }
      `}</style>
    </section>
  );
}

function Row({ icon, label, hint, children }: { icon: IconName; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="r">
      <span className="chip-ic">
        <Icon name={icon} size={16} />
      </span>
      <div className="grow">
        <div className="l">{label}</div>
        {hint && <div className="h">{hint}</div>}
      </div>
      {children}
      <style jsx>{`
        .r { display: flex; align-items: center; gap: 14px; padding: 16px 20px; }
        .r + .r { border-top: 1px solid var(--border); }
        .l { font-weight: 500; font-size: 14px; }
        .h { color: var(--muted); font-size: 12.5px; margin-top: 2px; line-height: 1.4; }
        @media (max-width: 600px) { .r { flex-wrap: wrap; } }
      `}</style>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`sw${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <i />
      <style jsx>{`
        .sw { position: relative; width: 44px; height: 24px; border-radius: 999px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--border-2); flex: none; transition: background .25s var(--ease); }
        .sw i { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); transition: transform .35s var(--spring), background .25s; }
        .sw.on { background: var(--ink); box-shadow: none; }
        .sw.on i { transform: translateX(20px); background: var(--on-ink); }
      `}</style>
    </button>
  );
}
