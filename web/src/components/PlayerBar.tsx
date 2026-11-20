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
        .seek { display: flex; align-items: center; gap: 8px; width: 100%; }
        .time { font-size: 12px; color: var(--muted); width: 40px; }
        .time.r { text-align: left; }
        .time:first-child { text-align: right; }
        .track { position: relative; flex: 1; height: 4px; border-radius: 99px; background: rgba(255, 255, 255, .3); cursor: pointer; touch-action: none; }
        .track::before { content: ''; position: absolute; inset: -8px 0; }
        .fill { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: #fff; }
        .track:hover .fill, .track:active .fill { background: var(--signal); }
        .knob { position: absolute; top: 50%; width: 12px; height: 12px; border-radius: 50%; background: #fff; transform: translate(-50%, -50%) scale(0); transition: transform .1s var(--ease); }
        .track:hover .knob, .track:active .knob, .track:focus-visible .knob { transform: translate(-50%, -50%) scale(1); }
        .compact .knob { display: none; }
        .compact .track { height: 2px; }
        .compact .fill, .compact .track:hover .fill { background: #fff; }
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

function Volume() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const P = usePlayer.getState();
  const shown = muted ? 0 : volume;
  return (
    <div className="vol">
      <button className="icon-btn sm" aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'} onClick={() => P.toggleMute()}>
        <Icon name={muted || volume === 0 ? 'mute' : volume < 0.5 ? 'speakerLow' : 'volume'} size={18} />
      </button>
      <input type="range" min={0} max={1} step={0.01} value={shown} aria-label="Volume" onChange={(e) => P.setVolume(Number(e.target.value))} style={{ ['--v' as string]: `${shown * 100}%` }} />
      <style jsx>{`
        .vol { display: flex; align-items: center; gap: 4px; width: 128px; }
        input { flex: 1; min-width: 0; height: 4px; border-radius: 99px; appearance: none; -webkit-appearance: none; background: linear-gradient(to right, #fff var(--v), rgba(255, 255, 255, .3) var(--v)); cursor: pointer; outline-offset: 6px; }
        input:hover { background: linear-gradient(to right, var(--signal) var(--v), rgba(255, 255, 255, .3) var(--v)); }
        input::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; opacity: 0; }
        input:hover::-webkit-slider-thumb, input:focus-visible::-webkit-slider-thumb { opacity: 1; }
      `}</style>
    </div>
  );
}

export function PlayerBar() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const buffering = usePlayer((s) => s.buffering);
  const error = usePlayer((s) => s.error);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
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
      <div className="left">
        <button className="meta" onClick={() => !remote && P.setExpanded(true)} aria-label="Open player">
          <Cover src={shown.thumb} size={56} radius={4} />
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
          <Icon name={liked ? 'heartFill' : 'heart'} size={18} />
        </button>
      </div>
      <div className="center">
        <div className="ctrls">
          {!remote && (
            <button className={`icon-btn hide-sm${shuffle ? ' on' : ''}`} aria-label="Shuffle" aria-pressed={shuffle} onClick={() => P.toggleShuffle()}>
              <Icon name="shuffle" size={18} />
            </button>
          )}
          <button className="icon-btn hide-sm" aria-label="Previous" onClick={() => (remote ? cmd('prev') : P.prev())}>
            <Icon name="prev" size={20} />
          </button>
          <button className="play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={() => (remote ? cmd('toggle') : P.toggle())}>
            <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => (remote ? cmd('next') : P.next())}>
            <Icon name="next" size={20} />
          </button>
          {!remote && (
            <button className={`icon-btn hide-sm${repeat !== 'off' ? ' on' : ''}`} aria-label={`Repeat ${repeat}`} onClick={() => P.cycleRepeat()}>
              <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={18} />
            </button>
          )}
        </div>
        <div className="seekrow hide-sm">{seekEl}</div>
      </div>
      <div className="right hide-sm">
        {!remote && (
          <button className="icon-btn sm" aria-label="Lyrics" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'lyrics' }))}>
            <Icon name="lyrics" size={18} />
          </button>
        )}
        {!remote && (
          <button className="icon-btn sm" aria-label="Queue" onClick={() => (P.setExpanded(true), usePlayer.setState({ panel: 'queue' }))}>
            <Icon name="queue" size={18} />
          </button>
        )}
        <DevicesButton />
        <Volume />
        {!remote && (
          <button className="icon-btn sm" aria-label="Full screen" title="Now playing" onClick={() => P.setExpanded(true)}>
            <Icon name="fullscreen" size={18} />
          </button>
        )}
      </div>
      <div className="mobile-progress">{seekCompact}</div>
      <style jsx>{`
        .bar { grid-column: 1 / -1; grid-row: 2; height: var(--player-h); display: grid; grid-template-columns: minmax(180px, 30%) minmax(0, 40%) minmax(180px, 30%); align-items: center; gap: 16px; padding: 0 8px 0 4px; background: #000; animation: rise .3s var(--ease-out) both; }
        .left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .meta { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .t { font-weight: 500; font-size: 14px; color: var(--ink); }
        .s { color: var(--muted); font-size: 12px; margin-top: 1px; }
        .s.bad { color: var(--red-t); }
        .s.rem { color: var(--signal); font-weight: 700; }
        .center { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; max-width: 722px; width: 100%; justify-self: center; }
        .ctrls { display: flex; align-items: center; gap: 16px; }
        .play { width: 32px; height: 32px; border-radius: 50%; background: #fff; color: #000; display: grid; place-items: center; transition: transform .15s var(--ease); }
        .play:hover { transform: scale(1.06); }
        .play:active { transform: scale(.96); }
        .seekrow { width: 100%; }
        .right { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        .mobile-progress { display: none; }
        @media (max-width: 900px) {
          .bar { position: fixed; z-index: 50; left: 8px; right: 8px; bottom: calc(60px + env(safe-area-inset-bottom)); height: 56px; display: flex; gap: 4px; padding: 0 8px 0 4px; border-radius: 8px; background: #1f1f1f; }
          .left { flex: 1; }
          .center { flex: none; width: auto; }
          .meta :global(.cover) { width: 40px !important; height: 40px !important; }
          :global(.hide-sm) { display: none !important; }
          .mobile-progress { display: block; position: absolute; left: 8px; right: 8px; bottom: 0; }
        }
      `}</style>
    </div>
  );
}
