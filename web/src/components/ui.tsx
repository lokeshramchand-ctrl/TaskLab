'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from './Icon';
import { useAuth } from '@/player/sync';

/** Docs-style side panel (bottom sheet on phones). Focus goes to Close on open; Escape closes. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  sub,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-wrap">
      <div className="scrim" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div className="grow">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
            {sub && <p className="muted">{sub}</p>}
          </div>
          <button ref={closeBtn} className="icon-btn bordered" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
      <style jsx>{`
        .sheet-wrap { position: fixed; inset: 0; z-index: 110; }
        .scrim { position: absolute; inset: 0; background: var(--scrim); animation: fade .25s var(--ease) both; }
        .sheet { position: absolute; top: 0; right: 0; bottom: 0; width: min(460px, 100%); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border); box-shadow: var(--shadow-lg); animation: slide .4s var(--ease-out) both; }
        header { display: flex; align-items: flex-start; gap: 12px; padding: 22px 22px 16px; border-bottom: 1px solid var(--border); }
        h2 { font-size: 22px; font-weight: 600; margin-top: 2px; }
        header p { margin-top: 6px; font-size: 13px; }
        .body { flex: 1; overflow-y: auto; padding: 8px 22px 22px; }
        footer { padding: 14px 22px; border-top: 1px solid var(--border); display: flex; gap: 10px; justify-content: flex-end; }
        @keyframes fade { from { opacity: 0; } }
        @keyframes slide { from { transform: translateX(24px); opacity: 0; } }
        @media (max-width: 900px) {
          .sheet { top: auto; left: 0; width: 100%; max-height: 86dvh; border-left: 0; border-top: 1px solid var(--border); border-radius: 8px 8px 0 0; animation-name: up; }
          @keyframes up { from { transform: translateY(40px); opacity: 0; } }
        }
      `}</style>
    </div>
  );
}

/** One labelled on/off row. */
export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="tg">
      <div className="grow">
        <div className="l">{label}</div>
        {hint && <div className="h">{hint}</div>}
      </div>
      <button className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
        <i />
      </button>
      <style jsx>{`
        .tg { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-3) 0; border-bottom: 1px solid var(--border); }
        .tg:last-child { border-bottom: 0; }
        .l { font-weight: 500; font-size: 14px; }
        .h { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
                .sw { width: 28px; height: 16px; border-radius: 999px; background: var(--active); box-shadow: inset 0 0 0 1px var(--border-2); position: relative; flex: none; transition: background .2s var(--ease); }
                .sw i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--muted); transition: transform .25s var(--spring), background .2s; }
                .sw.on { background: var(--signal); box-shadow: none; }
                .sw.on i { transform: translateX(12px); background: #fff; }
      `}</style>
    </div>
  );
}

/** Small bar chart used inside Stat. Values are normalised to the largest one. */
export function SparkBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="sb" role="img" aria-label={label}>
      {values.map((v, i) => (
        <i key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%`, opacity: v ? 1 : 0.35, animationDelay: `${i * 40}ms` }} />
      ))}
      <style jsx>{`
        .sb { display: flex; align-items: flex-end; gap: 3px; height: 28px; }
        .sb i { flex: 1; min-width: 4px; border-radius: 3px 3px 1px 1px; background: var(--signal); transform-origin: bottom; animation: grow .7s var(--ease-out) both; }
        @keyframes grow { from { transform: scaleY(0); } }
      `}</style>
    </div>
  );
}

/** KPI card: icon chip, muted label, big value with unit, optional spark and context line. */
export function Stat({ icon, label, value, unit, sub, spark }: { icon: IconName; label: string; value: React.ReactNode; unit?: string; sub?: string; spark?: React.ReactNode }) {
  return (
    <div className="stat card">
      <div className="top">
        <span className="chip-ic">
          <Icon name={icon} size={16} />
        </span>
        <span className="lab clamp2">{label}</span>
      </div>
      <div className="val">
        <span className="n clamp1">{value}</span>
        {unit && <span className="u">{unit}</span>}
      </div>
      {(sub || spark) && (
        <div className="foot">
          {sub && <span className="sub clamp2">{sub}</span>}
          <span className="grow" />
          {spark && <span className="sp">{spark}</span>}
        </div>
      )}
      <style jsx>{`
        .stat { padding: 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .top { display: flex; align-items: center; gap: 10px; }
        .lab { font-size: 12.5px; color: var(--muted); font-weight: 500; }
        .val { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
        .n { font-size: clamp(1.5rem, 2.1vw, 2rem); font-weight: 600; letter-spacing: -.04em; line-height: 1.1; }
        .u { font-size: 13px; font-weight: 500; color: var(--muted); }
        .foot { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; min-height: 28px; }
        .sub { font-size: 12.5px; color: var(--muted); align-self: center; }
        .sp { width: 96px; flex: none; margin-left: auto; }
      `}</style>
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="chip-ic lg">
        <Icon name={icon} size={20} />
      </span>
      <b>{title}</b>
      {hint && <span style={{ maxWidth: 360 }}>{hint}</span>}
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: string; title: React.ReactNode; sub?: string; actions?: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  return (
    <header className="page-head fade-in">
      <Link href="/settings" className="avatar-link" aria-label="Account and settings">{(user ?? 'L')[0]?.toUpperCase()}</Link>
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h1">{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}
