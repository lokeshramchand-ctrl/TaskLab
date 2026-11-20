'use client';
import { artistNames } from '@/lib/format';
import { dismissRemote, resumeRemote, useRemoteQueue } from '@/player/queue-sync';

/** "Continue listening": offered when another device (phone, desktop) was playing more recently than this one. */
export function ContinueBanner() {
  const q = useRemoteQueue((s) => s.q);
  if (!q) return null;
  const t = q.tracks[q.index];
  return (
    <div className="cont fade-in" role="status">
      <div className="txt">
        <b>Continue on this device?</b>
        <span>
          {t.title} · {artistNames(t.artists)} · from {q.device}
        </span>
      </div>
      <button className="go" onClick={resumeRemote}>Continue</button>
      <button className="no" onClick={dismissRemote} aria-label="Dismiss">Not now</button>
      <style jsx>{`
        .cont { position: fixed; left: 50%; bottom: calc(var(--player-h) + 40px); transform: translateX(-50%); z-index: 90; display: flex; align-items: center; gap: 10px; max-width: min(560px, calc(100vw - 24px)); background: var(--surface); color: var(--text); border: 1px solid var(--border-2); padding: 8px 10px 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: var(--lift-hi); }
        .txt { display: flex; flex-direction: column; min-width: 0; }
        .txt b { font-weight: 500; }
        .txt span { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        button { height: 28px; padding: 0 10px; border-radius: 5px; border: 0; font: inherit; cursor: pointer; white-space: nowrap; }
        .go { background: var(--signal); color: #fff; }
        .no { background: transparent; color: var(--muted); }
        @media (max-width: 900px) { .cont { bottom: calc(var(--player-h) + 118px); } }
      `}</style>
    </div>
  );
}
