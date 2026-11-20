'use client';
import { use } from 'react';
import { useAlbum } from '@/lib/api';
import { Collection, PageError, PageSkeleton } from '@/components/Collection';
import { ShelfRow } from '@/components/Cards';
import { Icon } from '@/components/Icon';
import { useLibrary } from '@/player/library';

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const { data, isLoading, error, refetch } = useAlbum(id);
  const saved = useLibrary((s) => !!s.albums[id]);
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <PageError error={error} retry={() => refetch()} />;
  return (
    <>
      <Collection
        kind="Album"
        title={data.title}
        thumb={data.thumb}
        artists={data.artists}
        meta={[data.year, data.duration].filter(Boolean).join(' · ')}
        description={data.description}
        tracks={data.tracks}
        source={`album:${data.id}`}
        numbered
        actions={
          <button
            className="btn lg"
            aria-label={saved ? 'Remove from library' : 'Add to library'}
            onClick={() =>
              useLibrary.getState().toggleSaved({ kind: 'album', id: data.id, title: data.title, artists: data.artists, year: data.year, thumb: data.thumb })
            }
          >
            <Icon name={saved ? 'check' : 'plus'} size={14} /> {saved ? 'Saved' : 'Save'}
          </button>
        }
      />
      {data.more.map((s) => (
        <ShelfRow key={s.title} shelf={s} />
      ))}
    </>
  );
}
