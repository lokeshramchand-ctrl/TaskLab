'use client';
import type { Track } from '@/lib/types';
import { Cover } from './Art';

export function Mosaic({ tracks, size = 168 }: { tracks: Track[]; size?: number }) {
  const thumbs = [...new Set(tracks.map((t) => t.thumb).filter(Boolean))].slice(0, 4) as string[];
  if (thumbs.length < 4) return <Cover src={thumbs[0]} size={size} />;
  return (
    <div className="cover" style={{ width: size, height: size, display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: 6 }}>
      {thumbs.map((t) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t} src={t} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
      ))}
    </div>
  );
}
