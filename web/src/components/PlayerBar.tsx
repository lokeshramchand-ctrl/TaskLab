'use client';
import { useRef, useState } from 'react';
import { currentTrack, usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { artistNames, fmtTime } from '@/lib/format';
import { Cover } from './Art';
import { Icon } from './Icon';
import { DevicesButton } from './Devices';

export function Seek({ compact = false }: { compact?: boolean }) {
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration || currentTrack(s)?.duration || 0);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const shown = drag ?? position;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;

  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  return (
    <div className={`seek${compact ? ' compact' : ''}`}>
      {!compact && <span className="time">{fmtTime(shown)}</span>}
      <div
        ref={ref}
        className="track"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') usePlayer.getState().seek(position + 5);
          if (e.key === 'ArrowLeft') usePlayer.getState().seek(Math.max(0, position - 5));
        }}
        onPointerDown={(e) => {
          if (!duration) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={(e) => {
          if (drag == null) return;
          usePlayer.getState().seek(at(e.clientX));
          setDrag(null);
        }}
      >
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="knob" style={{ left: `${pct}%` }} />
      </div>
      {!compact && <span className="time r">{fmtTime(duration)}</span>}
      <style jsx>{`
        .seek { display: flex; align-items: center; gap: 12px; width: 100%; }
        .time { font-size: 12px; color: var(--muted); width: 38px; }
        .time.r { text-align: right; }
        .track { position: relative; flex: 1; height: 4px; border-radius: 99px; background: var(--surface-2); cursor: pointer; touch-action: none; }
        .track::before { content: ''; position: absolute; inset: -10px 0; }
        .fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--ink); }
        .knob { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; background: var(--ink); transform: translate(-50%, -50%) scale(0); transition: transform .3s var(--spring); }
        .track:hover .knob, .track:active .knob, .track:focus-visible .knob { transform: translate(-50%, -50%) scale(1); }
        .compact .knob { display: none; }
        .compact .track { height: 3px; box-shadow: none; }
      `}</style>
    </div>
  );
}

export function PlayerBar() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const liked = useLibrary((s) => (track ? !!s.liked[track.id] : false));
  if (!track) return null;
  const P = usePlayer.getState();
  return (
    <div className="bar">
      <button className="meta" onClick={() => P.setExpanded(true)} aria-label="Open player">
        <Cover src={track.thumb} size={40} radius={8} />
        <div className="grow" style={{ textAlign: 'left' }}>
          <div className="t clamp1">{track.title}</div>
          <div className={`s clamp1${error ? ' bad' : ''}`}>{error ?? (buffering ? 'Loading…' : artistNames(track.artists))}</div>
        </div>
      </button>
      <button className={`icon-btn sm hide-sm${liked ? ' on' : ''}`} aria-label="Like" onClick={() => useLibrary.getState().toggleLike(track)}>
        <Icon name={liked ? 'heartFill' : 'heart'} size={17} />
      </button>
      <div className="center">
        <div className="ctrls">
          <button className="icon-btn hide-sm" aria-label="Previous" onClick={() => P.prev()}>
            <Icon name="prev" size={18} />
          </button>
          <button className="play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => P.toggle()}>
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => P.next()}>
            <Icon name="next" size={18} />
          </button>
        </div>
        <div className="seekrow hide-sm">
          <Seek />
        </div>
      </div>
      <div className="right hide-sm">
        <DevicesButton />
        <button className="icon-btn" aria-label="Lyrics" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'lyrics' }))}>
          <Icon name="lyrics" size={18} />
        </button>
        <button className="icon-btn" aria-label="Queue" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'queue' }))}>
          <Icon name="queue" size={18} />
        </button>
      </div>
      <div className="mobile-progress">
        <Seek compact />
      </div>
      <style jsx>{`
        .bar { position: fixed; z-index: 50; bottom: 14px; left: calc(var(--side-w) + 16px); right: 16px; height: 66px; border-radius: 24px; box-shadow: var(--lift-hi); display: flex; align-items: center; gap: 12px; padding: 0 20px; background: var(--glass); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); border: .5px solid var(--border); animation: rise .4s var(--ease-out) both; }
        .meta { display: flex; align-items: center; gap: 12px; min-width: 0; width: 300px; }
        .t { font-weight: 600; font-size: 14px; letter-spacing: -.02em; }
        .s { color: var(--muted); font-size: 12.5px; margin-top: 1px; }
        .s.bad { color: var(--red-t); }
        .center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
        .ctrls { display: flex; align-items: center; gap: 8px; }
        .play { width: 40px; height: 40px; border-radius: 50%; background: transparent; color: var(--text); display: grid; place-items: center; transition: transform .3s var(--spring), background .2s; }
        .play:hover { background: var(--surface-2); }
        .play:active { transform: scale(.93); }
        .seekrow { width: min(560px, 100%); }
        .right { display: flex; gap: 2px; width: 160px; justify-content: flex-end; }
        .mobile-progress { display: none; }
        @media (max-width: 900px) {
          .bar { left: 14px; right: 14px; bottom: calc(78px + env(safe-area-inset-bottom)); height: 54px; border: .5px solid var(--border); border-radius: 32px; background: color-mix(in srgb, var(--bg) 95%, transparent); box-shadow: var(--lift-hi); padding: 0 6px 0 9px; gap: 4px; }
          .meta { flex: 1; width: auto; }
          .center { flex: none; }
          :global(.hide-sm) { display: none !important; }
          .mobile-progress { display: none; }
          .play { width: 36px; height: 36px; }
        }
      `}</style>
    </div>
  );
}
