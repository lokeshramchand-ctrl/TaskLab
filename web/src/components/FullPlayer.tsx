'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { currentTrack, usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { useLyrics } from '@/lib/api';
import { artistNames } from '@/lib/format';
import type { Track } from '@/lib/types';
import { Cover } from './Art';
import { Icon } from './Icon';
import { Seek } from './PlayerBar';
import { Bars } from './Cards';
import { useMenu } from './Menu';

export function FullPlayer() {
  const expanded = usePlayer((s) => s.expanded);
  const track = usePlayer(currentTrack);
  const playing = usePlayer((s) => s.playing);
  const panel = usePlayer((s) => s.panel);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const buffering = usePlayer((s) => s.buffering);
  const liked = useLibrary((s) => (track ? !!s.liked[track.id] : false));
  const P = usePlayer.getState();

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && P.setExpanded(false);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded, P]);

  if (!track) return null;
  return (
    <div className={`fp${expanded ? ' open' : ''}`} aria-hidden={!expanded} role="dialog" aria-label="Now playing">
      <div className="ambient" aria-hidden style={track.thumb ? { backgroundImage: `url(${track.thumb})` } : undefined} />
      <header className="top">
        <button className="icon-btn bordered" aria-label="Close player" onClick={() => P.setExpanded(false)}>
          <Icon name="down" />
        </button>
        <div className="eyebrow">Now playing</div>
        <button className="icon-btn bordered" aria-label="More" onClick={(e) => useMenu.getState().open(track, e)}>
          <Icon name="more" />
        </button>
      </header>

      <div className={`body${panel ? ' with-panel' : ''}`}>
        <div className="stage">
          <div className="art">
            <Cover src={track.thumb} size="100%" radius={20} />
          </div>

          <div className="info">
            <h1 className="title clamp2">{track.title}</h1>
            <div className="artists clamp1">
              {track.artists.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {a.id ? (
                    <Link href={`/artist/${a.id}`} onClick={() => P.setExpanded(false)}>
                      {a.name}
                    </Link>
                  ) : (
                    a.name
                  )}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 22 }}>
              <Seek />
            </div>
            <div className="controls">
              <button className={`icon-btn${shuffle ? ' on' : ''}`} aria-label="Shuffle" aria-pressed={shuffle} onClick={() => P.toggleShuffle()}>
                <Icon name="shuffle" size={20} />
              </button>
              <button className="icon-btn" aria-label="Previous" onClick={() => P.prev()}>
                <Icon name="prev" size={24} />
              </button>
              <button className="playbig" aria-label={playing ? 'Pause' : 'Play'} onClick={() => P.toggle()}>
                {buffering ? <span className="spinner" /> : <Icon name={playing ? 'pause' : 'play'} size={26} />}
              </button>
              <button className="icon-btn" aria-label="Next" onClick={() => P.next()}>
                <Icon name="next" size={24} />
              </button>
              <button className={`icon-btn${repeat !== 'off' ? ' on' : ''}`} aria-label={`Repeat ${repeat}`} onClick={() => P.cycleRepeat()}>
                <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={20} />
              </button>
            </div>
            <div className="chips" style={{ marginTop: 22 }}>
              <button className={liked ? 'on' : ''} onClick={() => useLibrary.getState().toggleLike(track)}>
                {liked ? 'Liked' : 'Like'}
              </button>
              <button className={panel === 'lyrics' ? 'on' : ''} onClick={() => P.setPanel('lyrics')}>
                Lyrics
              </button>
              <button className={panel === 'queue' ? 'on' : ''} onClick={() => P.setPanel('queue')}>
                Up next
              </button>
            </div>
          </div>
        </div>

        {panel && <aside className="panel card fade-in">{panel === 'lyrics' ? <Lyrics track={track} /> : <Queue />}</aside>}
      </div>

      <style jsx>{`
        .fp { overflow: hidden; position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; background: var(--bg); transform: translateY(102%); transition: transform .5s var(--ease-out); visibility: hidden; }
        .fp.open { transform: none; visibility: visible; }
        .ambient { position: absolute; inset: -10%; z-index: 0; background-size: cover; background-position: center; filter: blur(70px) saturate(1.4); opacity: .2; transform: scale(1.1); pointer-events: none; transition: background-image .6s; }
        .top, .body { position: relative; z-index: 1; }
        .top { display: flex; align-items: center; justify-content: space-between; padding: 14px var(--gutter); height: var(--top-h); border-bottom: 1px solid var(--border); }
        .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr; gap: 28px; padding: 28px var(--gutter) 32px; overflow-y: auto; }
        .body.with-panel { grid-template-columns: minmax(0, 1.2fr) minmax(320px, .9fr); }
        .stage { display: flex; align-items: center; justify-content: center; gap: 56px; min-height: 0; }
        .art { width: min(46vh, 420px); aspect-ratio: 1; flex: none; box-shadow: var(--lift-hi); border-radius: 8px; }
        .info { width: min(480px, 100%); min-width: 0; }
        .title { font-size: clamp(1.4rem, 2.6vw, 2rem); font-weight: 500; line-height: 1.2; letter-spacing: -.012em; }
        .artists { margin-top: 6px; font-size: 14px; color: var(--muted); font-weight: 400; }
        .artists :global(a:hover) { color: var(--text); text-decoration: underline; }
        .controls { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; max-width: 420px; }
        .on { color: var(--signal) !important; }
        .playbig { width: 44px; height: 44px; border-radius: 8px; display: grid; place-items: center; background: var(--signal); color: #fff; transition: transform .3s var(--spring); }
        .playbig:active { transform: scale(.93); }
        .spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, .3); border-top-color: #fff; animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .panel { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
        .body.with-panel .stage { flex-direction: column; gap: 26px; }
        .body.with-panel .art { width: min(28vh, 260px); }
        @media (max-width: 900px) {
          .body, .body.with-panel { grid-template-columns: 1fr; padding: 18px var(--gutter) 26px; }
          .stage, .body.with-panel .stage { flex-direction: column; gap: 22px; justify-content: flex-start; }
          .art, .body.with-panel .art { width: min(78vw, 40vh); }
          .body.with-panel .stage { display: none; }
          .panel { position: fixed; inset: calc(var(--top-h) + 8px) 10px 10px; z-index: 2; }
        }
      `}</style>
    </div>
  );
}

function Lyrics({ track }: { track: Track }) {
  const { data, isLoading } = useLyrics(track);
  const position = usePlayer((s) => s.position);
  const box = useRef<HTMLDivElement>(null);
  const ms = position * 1000 + 250;
  const synced = !!data?.synced;
  const activeIdx = synced ? Math.max(0, (data?.lines ?? []).findLastIndex((l) => l.t <= ms)) : -1;

  useEffect(() => {
    if (!synced || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-i="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx, synced]);

  return (
    <>
      <div className="ph">
        <span className="eyebrow">Lyrics</span>
        <button className="icon-btn sm" aria-label="Close" onClick={() => usePlayer.getState().setPanel('lyrics')}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="lyr" ref={box}>
        {isLoading && <p className="muted msg">Finding lyrics…</p>}
        {!isLoading && !data && <p className="muted msg">No lyrics found for this song.</p>}
        {data?.lines.map((l, i) => (
          <p
            key={i}
            data-i={i}
            className={synced ? (i === activeIdx ? 'cur' : i < activeIdx ? 'past' : '') : 'plain'}
            onClick={() => synced && l.t >= 0 && usePlayer.getState().seek(l.t / 1000)}
          >
            {l.text || ' '}
          </p>
        ))}
        {data && <p className="src">Lyrics · {data.source}</p>}
      </div>
      <style jsx>{`
        .ph { display: flex; align-items: center; justify-content: space-between; padding: 14px 14px 6px 22px; border-bottom: 1px solid var(--border); }
        .lyr { flex: 1; overflow-y: auto; padding: 18px 24px 40vh; scrollbar-width: thin; }
        p { margin: 0 0 14px; font-size: 24px; line-height: 1.25; font-weight: 600; letter-spacing: -.03em; color: var(--border-2); transition: color .3s var(--ease); cursor: pointer; }
        p.cur { color: var(--text); }
        p.past { color: var(--muted); opacity: .7; }
        p.plain { color: var(--text); font-size: 17px; font-weight: 500; cursor: default; margin-bottom: 6px; letter-spacing: -.012em; }
        p.src { font-size: 12px; font-weight: 500; color: var(--muted); margin-top: 28px; letter-spacing: 0; cursor: default; }
        p.msg { font-size: 14px; font-weight: 400; letter-spacing: 0; color: var(--muted); cursor: default; }
      `}</style>
    </>
  );
}

function Queue() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const autoplay = usePlayer((s) => s.autoplay);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('.q.cur')?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <>
      <div className="ph">
        <span className="eyebrow">Up next · {Math.max(0, queue.length - index - 1)}</span>
        <div className="row" style={{ gap: 4 }}>
          <button className={`btn sm${autoplay ? ' primary' : ''}`} onClick={() => usePlayer.setState({ autoplay: !autoplay })}>
            Autoplay {autoplay ? 'on' : 'off'}
          </button>
          <button className="icon-btn sm" aria-label="Close" onClick={() => usePlayer.getState().setPanel('queue')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
      <div className="list" ref={listRef}>
        {queue.map((t, i) => (
          <div key={`${t.id}-${i}`} className={`q${i === index ? ' cur' : ''}${i < index ? ' past' : ''}`} onClick={() => usePlayer.getState().jump(i)}>
            <Cover src={t.thumb} size={40} radius={8} />
            <div className="grow">
              <div className="clamp1" style={{ fontWeight: 500, fontSize: 13.5 }}>{t.title}</div>
              <div className="clamp1 muted" style={{ fontSize: 12.5 }}>{artistNames(t.artists)}</div>
            </div>
            {i === index ? (
              playing ? <Bars /> : null
            ) : (
              <button
                className="icon-btn sm x"
                aria-label="Remove from queue"
                onClick={(e) => {
                  e.stopPropagation();
                  usePlayer.getState().removeAt(i);
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <style jsx>{`
        .ph { display: flex; align-items: center; justify-content: space-between; padding: 12px 12px 10px 22px; border-bottom: 1px solid var(--border); }
        .list { flex: 1; overflow-y: auto; padding: 8px 10px 20px; }
        .q { display: flex; align-items: center; gap: 12px; padding: 6px 10px; border-radius: 12px; cursor: pointer; transition: background .2s; }
        .q:hover { background: var(--surface-2); }
        .q.cur { background: var(--signal-soft); }
        .q.past { opacity: .5; }
        .x { opacity: 0; }
        .q:hover .x { opacity: 1; }
      `}</style>
    </>
  );
}
