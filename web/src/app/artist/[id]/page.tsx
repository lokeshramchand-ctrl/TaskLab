'use client';
import { use, useState } from 'react';
import { useArtist } from '@/lib/api';
import { PageError, PageSkeleton } from '@/components/Collection';
import { ShelfRow, TrackRow } from '@/components/Cards';
import { Avatar } from '@/components/Art';
import { Icon } from '@/components/Icon';
import { useLibrary } from '@/player/library';
import { usePlayer } from '@/player/store';
import { useSettings } from '@/player/settings';

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent(use(params).id);
  const enrich = useSettings((s) => s.dev.artistEnrichment);
  const { data, isLoading, error, refetch } = useArtist(id, enrich);
  const following = useLibrary((s) => !!s.artists[id]);
  const [bioOpen, setBioOpen] = useState(false);
  const [allSongs, setAllSongs] = useState(false);
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <PageError error={error} retry={() => refetch()} />;

  const photo = data.image ?? data.thumb;
  const facts = [data.genre, data.origin, data.since && `since ${data.since}`, data.subscribers].filter(Boolean);
  return (
    <div className="fade-in ph-page">
      <header className="ph-head">
        <div className="ph-art round">
          <Avatar src={photo} size="100%" alt={data.name} />
        </div>
        <div className="ph-info">
          <div className="ph-kind">Artist</div>
          <h1 className="ph-title clamp2">{data.name}</h1>
          {facts.length > 0 && <div className="ph-sub">{facts.join(' · ')}</div>}
          <div className="ph-actions">
            <button className="btn primary lg" disabled={!data.topSongs.length} onClick={() => usePlayer.getState().play(data.topSongs, 0, { source: `artist:${id}` })}>
              <Icon name="play" size={12} /> Play
            </button>
            <button className="btn lg" disabled={!data.topSongs.length} onClick={() => usePlayer.getState().play(data.topSongs, 0, { source: `artist:${id}`, shuffle: true })}>
              <Icon name="shuffle" size={14} /> Shuffle
            </button>
            {data.topSongs[0] && (
              <button className="btn lg" onClick={() => usePlayer.getState().playRadio(data.topSongs[0])}>
                <Icon name="radio" size={14} /> Radio
              </button>
            )}
            <button className="btn lg" onClick={() => useLibrary.getState().toggleSaved({ kind: 'artist', id, title: data.name, thumb: photo })}>
              <Icon name={following ? 'check' : 'plus'} size={14} /> {following ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>
      </header>

      {data.topSongs.length > 0 && (
        <section className="list">
          <div className="group-head">
            <Icon name="st-progress" size={12} />
            <span className="grow">Top songs<span className="count">{data.topSongs.length}</span></span>
            {data.topSongs.length > 5 && (
              <button className="btn ghost sm" onClick={() => setAllSongs(!allSongs)}>
                {allSongs ? 'Show less' : `Show all ${data.topSongs.length}`}
              </button>
            )}
          </div>
          {(allSongs ? data.topSongs : data.topSongs.slice(0, 5)).map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} list={data.topSongs} showIndex />
          ))}
        </section>
      )}

      {data.shelves.map((s) => (
        <ShelfRow key={s.title} shelf={s} />
      ))}

      {data.description && (
        <section>
          <div className="section-head"><h2>About</h2></div>
          <div className="about card pad">
            <p className={bioOpen ? '' : 'clamp4'}>{data.description}</p>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <button className="more" onClick={() => setBioOpen(!bioOpen)}>{bioOpen ? 'Show less' : 'Read more'}</button>
              {data.bioSource && <span className="muted src">Source · {data.bioSource}</span>}
            </div>
          </div>
        </section>
      )}

      <style jsx>{`
        .fade-in { display: flex; flex-direction: column; gap: 20px; }
        .about { max-width: 860px; }
        .about p { margin: 0; line-height: 1.6; color: var(--text); white-space: pre-line; font-size: 14px; }
        .clamp4 { display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .more { font-weight: 500; font-size: 13px; color: var(--signal); }
        .src { font-size: 12px; font-weight: 500; }
      `}</style>
    </div>
  );
}
