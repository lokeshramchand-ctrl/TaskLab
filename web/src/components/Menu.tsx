'use client';
import { create } from 'zustand';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Track } from '@/lib/types';
import { usePlayer } from '@/player/store';
import { useLibrary } from '@/player/library';
import { api } from '@/lib/api';
import { Icon, type IconName } from './Icon';
import { toast } from './Toast';

type MenuState = {
  track: Track | null;
  x: number;
  y: number;
  playlistId?: string;
  playlistIndex?: number;
  open: (t: Track, e: { clientX: number; clientY: number }, ctx?: { playlistId?: string; playlistIndex?: number }) => void;
  close: () => void;
};

export const useMenu = create<MenuState>((set) => ({
  track: null,
  x: 0,
  y: 0,
  open: (track, e, ctx) => set({ track, x: e.clientX, y: e.clientY, ...ctx }),
  close: () => set({ track: null, playlistId: undefined, playlistIndex: undefined }),
}));

export function TrackMenuHost() {
  const { track, x, y, close, playlistId, playlistIndex } = useMenu();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'main' | 'playlists'>('main');
  const lib = useLibrary();

  useEffect(() => {
    if (!track) return;
    setMode('main');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [track, close]);

  const [fit, setFit] = useState<number | null>(null);
  // Search results carry no album, so look it up for "Go to album".
  const [album, setAlbum] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    setAlbum(null);
    if (!track) return;
    if (track.album?.id) return setAlbum({ id: track.album.id, name: track.album.name });
    let live = true;
    api.track(track.id).then((t) => live && t?.album?.id && setAlbum({ id: t.album.id, name: t.album.name })).catch(() => {});
    return () => {
      live = false;
    };
  }, [track]);
  // Keep the whole menu on screen whatever its height (it changes with the page and the artist count).
  useLayoutEffect(() => {
    if (!track || !ref.current) return setFit(null);
    const h = ref.current.offsetHeight;
    setFit(Math.max(12, Math.min(y, window.innerHeight - h - 12)));
  }, [track, y, mode, lib.playlists.length, album]);

  if (!track) return null;
  const W = 260;
  const left = typeof window !== 'undefined' ? Math.max(12, Math.min(x, window.innerWidth - W - 12)) : x;
  const top = fit ?? y;
  const share = async () => {
    const url = `https://music.youtube.com/watch?v=${track.id}`;
    close();
    try {
      if (navigator.share) await navigator.share({ title: track.title, text: `${track.title} · ${track.artists.map((a) => a.name).join(', ')}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  const artists = track.artists.filter((a) => a.id).slice(0, 3);
  const liked = lib.isLiked(track.id);
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const Item = ({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) => (
    <button className="menu-item" onClick={onClick}>
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );

  return (
    <div ref={ref} className="menu fade-in" style={{ left, top, width: W }} role="menu">
      <div className="menu-head">
        <div className="clamp1" style={{ fontWeight: 600 }}>{track.title}</div>
        <div className="clamp1 muted" style={{ fontSize: 13 }}>{track.artists.map((a) => a.name).join(', ')}</div>
      </div>
      {mode === 'main' ? (
        <>
          <Item icon="radio" label="Start radio" onClick={() => (usePlayer.getState().playRadio(track), close())} />
          <Item icon="queue" label="Play next" onClick={() => (usePlayer.getState().playNext(track), toast('Playing next'), close())} />
          <Item icon="plus" label="Add to queue" onClick={() => (usePlayer.getState().enqueue([track]), toast('Added to queue'), close())} />
          <Item icon={liked ? 'heartFill' : 'heart'} label={liked ? 'Remove from liked' : 'Like'} onClick={() => (lib.toggleLike(track), close())} />
          <Item icon="addList" label="Add to playlist" onClick={() => setMode('playlists')} />
          {playlistId != null && playlistIndex != null && (
            <Item icon="close" label="Remove from this playlist" onClick={() => (lib.removeFromPlaylist(playlistId, playlistIndex), close())} />
          )}
          {artists.map((a) => (
            <Item key={a.id} icon="user" label={artists.length > 1 ? `Go to ${a.name}` : 'Go to artist'} onClick={() => go(`/artist/${a.id}`)} />
          ))}
          {album && <Item icon="disc" label="Go to album" onClick={() => go(`/album/${album.id}`)} />}
          <Item icon="share" label="Share" onClick={share} />
        </>
      ) : (
        <>
          <Item
            icon="plus"
            label="New playlist"
            onClick={() => {
              const name = prompt('Playlist name');
              if (name) {
                lib.createPlaylist(name, [track]);
                toast(`Added to ${name}`);
              }
              close();
            }}
          />
          {lib.playlists.map((p) => (
            <Item key={p.id} icon="playlist" label={p.name} onClick={() => (lib.addToPlaylist(p.id, [track]), toast(`Added to ${p.name}`), close())} />
          ))}
        </>
      )}
      <style jsx>{`
        .menu { position: fixed; z-index: 80; max-height: calc(100vh - 24px); overflow-y: auto; border-radius: 14px; padding: 6px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--lift-hi); }
        .menu-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
        :global(.menu-item) { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 10px; border-radius: 9px; text-align: left; font-weight: 500; font-size: 13.5px; color: var(--text); }
        :global(.menu-item:hover) { background: var(--surface-2); }
      `}</style>
    </div>
  );
}
