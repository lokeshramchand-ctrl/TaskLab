'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/player/library';
import { usePlayer } from '@/player/store';
import { HOME_SECTIONS, useSettings, type Theme } from '@/player/settings';
import { Icon, type IconName } from '@/components/Icon';
import { PageHeader, Toggle } from '@/components/ui';
import { ThemeSelect } from '@/components/Nav';
import { Bento, Tile } from '@/components/Bento';
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

  const nk = (() => { let i = 0; return () => String(++i).padStart(2, '0'); })();
  return (
    <Bento className="fade-in">
      <PageHeader eyebrow="Settings" title="Settings" sub="Account, appearance, playback and the things you can turn on or off." />
        <Group kicker={nk()} span={7} title="Account" sub="One owner account. It syncs likes, playlists and history to your other devices.">
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

        <Group kicker={nk()} span={5} title="Appearance">
          <Row icon="sun" label="Interface theme" hint="Select or customise your interface colour scheme.">
            <div style={{ width: 168 }}><ThemeSelect /></div>
          </Row>
        </Group>

        <Group kicker={nk()} span={6} tall title="Home" sub="Pick what the home page shows. The Customise button on Home does the same.">
          {HOME_SECTIONS.map((s) => (
            <HomeToggle key={s.id} id={s.id} label={s.label} hint={s.hint} />
          ))}
        </Group>

        <Group kicker={nk()} span={6} title="Playback">
          <Row icon="radio" label="Autoplay" hint="When the queue ends, keep going with songs picked for you.">
            <Switch on={autoplay} label="Autoplay" onChange={(v) => usePlayer.setState({ autoplay: v })} />
          </Row>
          <Row icon="waveform" label="Audio quality" hint="Always the best stream YouTube offers without Premium: Opus around 160 kbps, AAC as a fallback.">
            <span className="badge">Best</span>
          </Row>
        </Group>

        <Group kicker={nk()} span={6} title="Library">
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

        <Group kicker={nk()} span={6} title="Developer">
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
        <Group kicker={nk()} span={6} title="About">
          <Row icon="info" label="LoMu web player" hint={`Connected to ${typeof window !== 'undefined' ? window.location.host : 'this server'}. Press / anywhere to search and Esc to close the full player.`}>
            <span className="badge">v1.0</span>
          </Row>
        </Group>
    </Bento>
  );
}

function HomeToggle({ id, label, hint }: { id: (typeof HOME_SECTIONS)[number]['id']; label: string; hint: string }) {
  const on = useSettings((s) => s.home[id]);
  return (
    <div className="hp">
      <Toggle on={on} label={label} hint={hint} onChange={(v) => useSettings.getState().setHome(id, v)} />
      <style jsx>{`
        .hp { padding: 0 var(--sp-4); }
        .hp + .hp { border-top: 1px solid var(--border); }
        .hp :global(.tg) { border-bottom: 0; }
      `}</style>
    </div>
  );
}

function Group({ title, sub, kicker, span = 6, tall, children }: { title: string; sub?: string; kicker?: string; span?: number; tall?: boolean; children: React.ReactNode }) {
  return (
    <Tile span={span} md={12} flush className={tall ? 'rs2' : undefined} kicker={kicker} title={title} sub={sub} label={title}>
      <div className="grp">{children}</div>
      <style jsx>{`
        .grp { border-top: 1px solid var(--border); }
      `}</style>
    </Tile>
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
        .r { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); }
        .r + .r { border-top: 1px solid var(--border); }
        .l { font-weight: 500; font-size: 13px; color: var(--ink); }
        .h { color: var(--muted); font-size: 12px; margin-top: 2px; line-height: 1.4; }
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
                .sw { width: 28px; height: 16px; border-radius: 999px; background: var(--active); box-shadow: inset 0 0 0 1px var(--border-2); position: relative; flex: none; transition: background .2s var(--ease); }
                .sw i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--muted); transition: transform .25s var(--spring), background .2s; }
                .sw.on { background: var(--signal); box-shadow: none; }
                .sw.on i { transform: translateX(12px); background: #fff; }
      `}</style>
    </button>
  );
}
