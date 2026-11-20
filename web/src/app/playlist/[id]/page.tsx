'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { usePlaylist } from '@/lib/api';
import { Collection, PageError, PageSkeleton } from '@/components/Collection';
import { Icon } from '@/components/Icon';
import { useLibrary } from '@/player/library';
import { toast } from '@/components/Toast';

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const { data, isLoading, error, refetch } = usePlaylist(id);
  const router = useRouter();
  const saved = useLibrary((s) => !!s.savedPlaylists[id]);
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <PageError error={error} retry={() => refetch()} />;
  return (
    <Collection
      kind="Playlist"
      title={data.title}
      thumb={data.thumb}
      meta={[data.author, data.trackCount].filter(Boolean).join(' · ')}
      description={data.description}
      tracks={data.tracks}
      source={`playlist:${id}`}
      actions={
        <>
          <button
            className={`icon-btn big${saved ? ' on' : ''}`}
            aria-label={saved ? 'Remove from library' : 'Add to library'}
            title={saved ? 'Remove from Your Library' : 'Save to Your Library'}
            onClick={() => useLibrary.getState().toggleSaved({ kind: 'playlist', id, title: data.title, subtitle: data.author, thumb: data.thumb })}
          >
            <Icon name={saved ? 'checkCircleFill' : 'plusCircle'} size={32} />
          </button>
          <button
            className="btn"
            onClick={() => {
              const newId = useLibrary.getState().createPlaylist(data.title, data.tracks);
              toast(`Imported ${data.tracks.length} songs into your library`);
              router.push(`/library/playlist/${newId}`);
            }}
          >
            <Icon name="download" size={16} /> Import
          </button>
        </>
      }
    />
  );
}
