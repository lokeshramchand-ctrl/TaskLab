'use client';
import { useEffect, useRef, useState } from 'react';
import { useConnect, transferTo, sendCommand, startConnect, stopConnect, type Device } from '@/player/connect';
import { artistNames } from '@/lib/format';
import { Cover } from './Art';
import { Icon } from './Icon';

/** Keeps this tab registered as a device for as long as the owner is signed in. */
export function ConnectHost() {
  useEffect(() => {
    startConnect();
    return stopConnect;
  }, []);
  return null;
}

const glyph = (d: Device) => (d.kind === 'android' ? 'phone' : 'laptop');

/** Button + popover listing the devices on this account; picking one moves playback there. */
export function DevicesButton({ className = 'icon-btn', down = false }: { className?: string; down?: boolean }) {
  const [open, setOpen] = useState(false);
  const { devices, active, self, online } = useConnect();
  const ref = useRef<HTMLDivElement>(null);
  const others = devices.filter((d) => d.id !== self);
  const remote = devices.find((d) => d.id === active && d.id !== self);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={`wrap${down ? ' down' : ''}`}>
      <button className={`${className}${remote?.playing ? ' on' : ''}`} aria-label="Devices" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="devices" size={18} />
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Connect to a device">
          <h4>Connect to a device</h4>
          {!online && <p className="hint">Offline. Reconnecting…</p>}
          {remote?.track && (
            <div className="now">
              <Cover src={remote.track.thumb} size={44} radius={8} />
              <div className="grow">
                <div className="t clamp1">{remote.track.title}</div>
                <div className="s clamp1">{artistNames(remote.track.artists)}</div>
              </div>
              <button className="icon-btn sm" aria-label="Previous" onClick={() => sendCommand(remote.id, { type: 'prev' })}><Icon name="prev" size={15} /></button>
              <button className="icon-btn sm" aria-label={remote.playing ? 'Pause' : 'Play'} onClick={() => sendCommand(remote.id, { type: 'toggle' })}><Icon name={remote.playing ? 'pause' : 'play'} size={15} /></button>
              <button className="icon-btn sm" aria-label="Next" onClick={() => sendCommand(remote.id, { type: 'next' })}><Icon name="next" size={15} /></button>
            </div>
          )}
          {devices.map((d) => (
            <button key={d.id} className={`dev${d.id === active || (!active && d.id === self) ? ' act' : ''}`} onClick={() => (transferTo(d.id), setOpen(false))}>
              <Icon name={glyph(d)} size={20} />
              <span className="grow">
                <span className="n">{d.id === self ? 'This device' : d.name}</span>
                <span className="s">
                  {d.id === self ? d.name : d.playing ? 'Playing' : d.track ? 'Paused' : 'Idle'}
                  {d.id !== self && d.track ? ` · ${d.track.title}` : ''}
                </span>
              </span>
              {d.playing && <Icon name="volume" size={16} />}
            </button>
          ))}
          {!others.length && <p className="hint">Open LoMu on your phone and sign in to see it here.</p>}
        </div>
      )}
      <style jsx>{`
        .wrap { position: relative; display: inline-flex; }
        .pop { position: absolute; right: 0; bottom: calc(100% + 18px); width: 320px; max-width: calc(100vw - 28px); z-index: 80; background: var(--glass); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); border: .5px solid var(--border); border-radius: 18px; box-shadow: var(--shadow-lg); padding: 10px; }
        .wrap.down .pop { bottom: auto; top: calc(100% + 10px); }
        h4 { font-size: 15px; font-weight: 700; letter-spacing: -.02em; padding: 6px 8px 8px; }
        .hint { color: var(--muted); font-size: 12.5px; padding: 6px 8px 8px; }
        .now { display: flex; align-items: center; gap: 8px; padding: 6px 8px 10px; border-bottom: .5px solid var(--border); margin-bottom: 6px; }
        .t { font-weight: 600; font-size: 13.5px; } .s { color: var(--muted); font-size: 12px; }
        .dev { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 8px; border-radius: 12px; }
        .dev:hover { background: var(--surface-2); }
        .dev.act { color: var(--signal); }
        .n { display: block; font-weight: 600; font-size: 14px; }
        .dev .s { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
      `}</style>
    </div>
  );
}
