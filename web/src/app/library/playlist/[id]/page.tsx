'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLibrary } from '@/player/library';
import { Collection } from '@/components/Collection';
import { Mosaic } from '@/components/Mosaic';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/ui';
import { toast } from '@/components/Toast';

function length(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
}

export default function UserPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const p = useLibrary((s) => s.playlists.find((x) => x.id === id));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!p) return <div className="empty"><b>This playlist no longer exists</b></div>;

  const secs = p.tracks.reduce((n, t) => n + (t.duration ?? 0), 0);
  const save = () => {
    if (name.trim()) useLibrary.getState().renamePlaylist(p.id, name.trim());
    setRenaming(false);
  };
  return (
    <Collection
      kind="Your playlist"
      title={p.name}
      thumb={p.tracks[0]?.thumb}
      cover={<Mosaic tracks={p.tracks} size={208} />}
      meta={[`${p.tracks.length} ${p.tracks.length === 1 ? 'song' : 'songs'}`, secs > 0 && length(secs)].filter(Boolean).join(' · ')}
      tracks={p.tracks}
      source={`user:${p.id}`}
      playlistId={p.id}
      heading={
        renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            style={{ margin: '6px 0' }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
              aria-label="Playlist name"
              style={{ width: '100%', maxWidth: 520, fontSize: 'clamp(1.4rem, 2.6vw, 2rem)', fontWeight: 600, letterSpacing: '-.035em', background: 'var(--surface)', border: '1px solid var(--signal)', borderRadius: 6, padding: '4px 12px', outline: 0, boxShadow: '0 0 0 4px var(--signal-soft)' }}
            />
          </form>
        ) : undefined
      }
      empty={<EmptyState icon="playlist" title="This playlist is empty" hint="Open the ⋯ menu on any song and choose “Add to playlist”." />}
      actions={
        <>
          <button
            className="btn"
            onClick={() => {
              setName(p.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          {confirmDelete ? (
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  useLibrary.getState().deletePlaylist(p.id);
                  toast(`Deleted “${p.name}”`);
                  router.replace('/library');
                }}
              >
                <Icon name="trash" size={16} /> Yes, delete
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} /> Delete
            </button>
          )}
        </>
      }
    />
  );
}
