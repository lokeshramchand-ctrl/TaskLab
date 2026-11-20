'use client';
import { useEffect, useRef, useState } from 'react';
import { useConnect, transferTo, startConnect, stopConnect, type Device } from '@/player/connect';
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
  const { devices, active, self, online, target } = useConnect();
  const ref = useRef<HTMLDivElement>(null);
  const others = devices.filter((d) => d.id !== self);
  const remote = devices.find((d) => d.id === target);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className={`wrap${down ? ' down' : ''}`}>
      <button className={`${className}${remote ? ' on' : ''}`} aria-label="Devices" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="devices" size={18} />
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Connect to a device">
          <h4>Connect to a device</h4>
          {!online && <p className="hint">Offline. Reconnecting…</p>}
          {devices.map((d) => (
            <button key={d.id} className={`dev${d.id === (target ?? self) ? ' act' : ''}`} onClick={() => (transferTo(d.id), setOpen(false))}>
              <Icon name={glyph(d)} size={16} />
              <span className="grow">
                <span className="n">{d.id === self ? 'This device' : d.name}</span>
                <span className="s">
                  {d.id === self ? d.name : d.playing ? 'Playing' : d.track ? 'Paused' : 'Idle'}
                  {d.id !== self && d.track ? ` · ${d.track.title}` : ''}
                </span>
              </span>
              {d.playing && <Icon name="volume" size={14} />}
            </button>
          ))}
          {!others.length && <p className="hint">Open LoMu on your phone and sign in to see it here.</p>}
        </div>
      )}
      <style jsx>{`
        .wrap { position: relative; display: inline-flex; }
        .pop { position: absolute; right: 0; bottom: calc(100% + 14px); width: 300px; max-width: calc(100vw - 28px); z-index: 80; background: var(--surface); border: 1px solid var(--border-2); border-radius: 6px; box-shadow: var(--lift-hi); padding: 4px; animation: rise .15s var(--ease-out) both; }
        .wrap.down .pop { bottom: auto; top: calc(100% + 6px); }
        h4 { font-size: 12px; font-weight: 500; color: var(--muted); padding: 6px 8px 6px; }
        .hint { color: var(--muted); font-size: 12px; padding: 6px 8px 8px; }
        .s { color: var(--muted); font-size: 12px; }
        .dev { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 6px 8px; border-radius: 4px; }
        .dev:hover { background: var(--active); }
        .dev.act { color: var(--peri-t); }
        .n { display: block; font-weight: 500; font-size: 13px; }
        .dev .s { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
      `}</style>
    </div>
  );
}
