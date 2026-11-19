'use client';
import { useEffect, useRef, useState } from 'react';
import { currentTrack, usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { artistNames, fmtTime } from '@/lib/format';
import { Cover } from './Art';
import { Icon } from './Icon';
import { DevicesButton } from './Devices';
import { useConnect, remoteDevice, sendCommand, type Device } from '@/player/connect';

type RemoteSeek = { position: number; duration: number; onSeek: (s: number) => void };

export function Seek({ compact = false, remote }: { compact?: boolean; remote?: RemoteSeek }) {
  const localPos = usePlayer((s) => s.position);
  const localDur = usePlayer((s) => s.duration || currentTrack(s)?.duration || 0);
  const position = remote ? remote.position : localPos;
  const duration = remote ? remote.duration : localDur;
  const seekTo = (v: number) => (remote ? remote.onSeek(v) : usePlayer.getState().seek(v));
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
          if (e.key === 'ArrowRight') seekTo(position + 5);
          if (e.key === 'ArrowLeft') seekTo(Math.max(0, position - 5));
        }}
        onPointerDown={(e) => {
          if (!duration) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setDrag(at(e.clientX));
        }}
        onPointerMove={(e) => drag != null && setDrag(at(e.clientX))}
        onPointerUp={(e) => {
          if (drag == null) return;
          seekTo(at(e.clientX));
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

/** Position of a remote device in seconds, advancing while it plays. */
function useRemotePosition(d: Device | null, receivedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!d?.playing) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [d?.playing]);
  if (!d) return 0;
  const dur = d.duration || Infinity;
  return Math.min(dur, (d.position ?? 0) + (d.playing ? Math.max(0, now - receivedAt) / 1000 : 0));
}

export function PlayerBar() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const remote = useConnect((s) => remoteDevice(s));
  const receivedAt = useConnect((s) => s.receivedAt);
  const rpos = useRemotePosition(remote, receivedAt);
  const shown = remote ? remote.track ?? undefined : track;
  const liked = useLibrary((s) => (shown ? !!s.liked[shown.id] : false));
  if (!shown) return null;
  const P = usePlayer.getState();
  // While steering another device the bar shows that device's song and its controls send commands.
  const isPlaying = remote ? !!remote.playing : playing;
  const cmd = (type: string) => remote && sendCommand(remote.id, { type });
  const seekEl = remote ? <Seek remote={{ position: rpos, duration: remote.duration ?? shown.duration ?? 0, onSeek: (v) => remote && sendCommand(remote.id, { type: 'seek', position: v }) }} /> : <Seek />;
  const seekCompact = remote ? <Seek compact remote={{ position: rpos, duration: remote.duration ?? shown.duration ?? 0, onSeek: (v) => remote && sendCommand(remote.id, { type: 'seek', position: v }) }} /> : <Seek compact />;
  return (
    <div className="bar">
      <button className="meta" onClick={() => !remote && P.setExpanded(true)} aria-label="Open player">
        <Cover src={shown.thumb} size={40} radius={8} />
        <div className="grow" style={{ textAlign: 'left' }}>
          <div className="t clamp1">{shown.title}</div>
          {remote ? (
            <div className="s clamp1 rem">Playing on {remote.name}</div>
          ) : (
            <div className={`s clamp1${error ? ' bad' : ''}`}>{error ?? (buffering ? 'Loading…' : artistNames(shown.artists))}</div>
          )}
        </div>
      </button>
      <button className={`icon-btn sm hide-sm${liked ? ' on' : ''}`} aria-label="Like" onClick={() => useLibrary.getState().toggleLike(shown)}>
        <Icon name={liked ? 'heartFill' : 'heart'} size={17} />
      </button>
      <div className="center">
        <div className="ctrls">
          <button className="icon-btn hide-sm" aria-label="Previous" onClick={() => (remote ? cmd('prev') : P.prev())}>
            <Icon name="prev" size={18} />
          </button>
          <button className="play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => (remote ? cmd('toggle') : P.toggle())}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => (remote ? cmd('next') : P.next())}>
            <Icon name="next" size={18} />
          </button>
        </div>
        <div className="seekrow hide-sm">{seekEl}</div>
      </div>
      <div className="right hide-sm">
        <DevicesButton />
        {!remote && <button className="icon-btn" aria-label="Lyrics" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'lyrics' }))}>
          <Icon name="lyrics" size={18} />
        </button>}
        {!remote && <button className="icon-btn" aria-label="Queue" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'queue' }))}>
          <Icon name="queue" size={18} />
        </button>}
      </div>
      <div className="mobile-progress">{seekCompact}</div>
      <style jsx>{`
        .bar { position: fixed; z-index: 50; bottom: 14px; left: calc(var(--side-w) + 16px); right: 16px; height: 66px; border-radius: 24px; box-shadow: var(--lift-hi); display: flex; align-items: center; gap: 12px; padding: 0 20px; background: var(--glass); backdrop-filter: blur(30px) saturate(1.8); -webkit-backdrop-filter: blur(30px) saturate(1.8); border: .5px solid var(--border); animation: rise .4s var(--ease-out) both; }
        .meta { display: flex; align-items: center; gap: 12px; min-width: 0; width: 300px; }
        .t { font-weight: 600; font-size: 14px; letter-spacing: -.02em; }
        .s { color: var(--muted); font-size: 12.5px; margin-top: 1px; }
        .s.bad { color: var(--red-t); }
        .s.rem { color: var(--signal); font-weight: 500; }
        .center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
        .ctrls { display: flex; align-items: center; gap: 8px; }
        .play { width: 40px; height: 40px; border-radius: 50%; background: transparent; color: var(--text); display: grid; place-items: center; transition: transform .3s var(--spring), background .2s; }
        .play:hover { background: var(--surface-2); }
        .play:active { transform: scale(.93); }
        .seekrow { width: min(560px, 100%); }
        .right { display: flex; align-items: center; gap: 2px; width: 160px; justify-content: flex-end; }
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
