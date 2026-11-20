'use client';
import { use, useState } from 'react';
import { useArtist } from '@/lib/api';
import { PageError, PageSkeleton } from '@/components/Collection';
import { ShelfTile, TrackRow } from '@/components/Cards';
import { Avatar } from '@/components/Art';
import { Bento, Tile } from '@/components/Bento';
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
  const facts: [string, string][] = [
    ['Genre', data.genre],
    ['Origin', data.origin],
    ['Active since', data.since ? String(data.since) : ''],
    ['Audience', data.subscribers],
  ].filter(([, v]) => !!v) as [string, string][];
  const hasAbout = !!data.description || facts.length > 0;
  let n = 0;
  const k = () => String(++n).padStart(2, '0');

  return (
    <Bento className="fade-in">
      <Tile span={12} tone="glow" className="hd" label="Artist header">
        <div className="ph-head">
          <div className="ph-art round">
            <Avatar src={photo} size="100%" alt={data.name} />
          </div>
          <div className="ph-info">
            <div className="ph-kind">Artist</div>
            <h1 className="ph-title clamp2">{data.name}</h1>
            {data.subscribers && <div className="ph-sub">{data.subscribers}</div>}
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
        </div>
      </Tile>

      {data.topSongs.length > 0 && (
        <Tile
          span={hasAbout ? 8 : 12}
          md={12}
          flush
          kicker={k()}
          title="Top songs"
          sub={`${data.topSongs.length} songs`}
          label="Top songs"
          action={
            data.topSongs.length > 5 ? (
              <button className="btn ghost sm" onClick={() => setAllSongs(!allSongs)}>
                {allSongs ? 'Show less' : `Show all ${data.topSongs.length}`}
              </button>
            ) : undefined
          }
        >
          <div className="list">
            {(allSongs ? data.topSongs : data.topSongs.slice(0, 5)).map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} list={data.topSongs} showIndex />
            ))}
          </div>
        </Tile>
      )}

      {hasAbout && (
        <Tile span={data.topSongs.length > 0 ? 4 : 12} md={12} kicker={k()} title="About" label="About">
          {data.description && (
            <div>
              <p className={`bio${bioOpen ? '' : ' clamp4'}`}>{data.description}</p>
              <button className="ph-more" onClick={() => setBioOpen(!bioOpen)}>
                {bioOpen ? 'Show less' : 'Read more'}
              </button>
            </div>
          )}
          {facts.length > 0 && (
            <dl className="facts">
              {facts.map(([key, v]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {data.bioSource && <div className="small muted">Source · {data.bioSource}</div>}
        </Tile>
      )}

      {data.shelves.map((s) => (
        <ShelfTile key={s.title} shelf={s} kicker={k()} />
      ))}

      <style jsx global>{`
        .bio { margin: 0; line-height: 1.55; color: var(--text); font-size: 13px; white-space: pre-line; }
      `}</style>
    </Bento>
  );
}
