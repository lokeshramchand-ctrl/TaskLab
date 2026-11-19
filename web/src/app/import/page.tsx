'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { api as authFetch } from '@/player/sync';
import { useLibrary } from '@/player/library';
import { parseTakeoutFile, type TakeoutList } from '@/lib/takeout';
import type { Track } from '@/lib/types';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/components/ui';
import { toast } from '@/components/Toast';

const BATCH = 25;

export default function ImportPage() {
  const input = useRef<HTMLInputElement>(null);
  const [lists, setLists] = useState<TakeoutList[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState<{ songs: number; lists: number; missed: number } | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files) return;
    const out: TakeoutList[] = [];
    let skip = 0;
    for (const f of Array.from(files)) {
      if (!/\.csv$/i.test(f.name)) continue;
      const parsed = parseTakeoutFile(f.name, await f.text());
      if (parsed) out.push(parsed);
      else skip++;
    }
    setLists(out);
    setSkipped(skip);
    setDone(null);
  };

  const run = async () => {
    setBusy(true);
    let songs = 0;
    let missed = 0;
    try {
      for (const list of lists) {
        const tracks: Track[] = [];
        for (let i = 0; i < list.refs.length; i += BATCH) {
          setProgress(`${list.name}: ${Math.min(i + BATCH, list.refs.length)} of ${list.refs.length}`);
          const res = await authFetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: list.refs.slice(i, i + BATCH) }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
          const { tracks: got } = (await res.json()) as { tracks: (Track | null)[] };
          for (const t of got) (t ? tracks.push(t) : missed++);
        }
        const unique = [...new Map(tracks.map((t) => [t.id, t])).values()];
        const lib = useLibrary.getState();
        if (list.liked) {
          const now = Date.now();
          useLibrary.setState((s) => {
            const liked = { ...s.liked };
            unique.forEach((t, i) => { if (!liked[t.id]) liked[t.id] = { track: t, at: now - i }; });
            return { liked };
          });
        } else lib.createPlaylist(list.name, unique);
        songs += unique.length;
      }
      setDone({ songs, lists: lists.length, missed });
      setLists([]);
      toast(`Imported ${songs} songs`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Library" title="Import from Google Takeout" sub="Bring your YouTube and YouTube Music playlists and likes into LoMu without signing in to Google." />
      <div className="stack">
        <section className="card pad">
          <ol className="steps">
            <li>Go to <a href="https://takeout.google.com" target="_blank" rel="noreferrer">takeout.google.com</a>, choose <b>Deselect all</b>, then tick <b>YouTube and YouTube Music</b>.</li>
            <li>Under <b>All YouTube data included</b>, keep <b>playlists</b> and <b>music (library and uploads)</b>. Choose CSV format and export.</li>
            <li>Unzip the download and select the CSV files inside <code>playlists</code> and <code>music (library and uploads)</code> below. Pick as many as you like at once.</li>
          </ol>
          <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => pick(e.target.files)} />
          <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="download" size={16} /> Choose CSV files
          </button>
        </section>

        {lists.length > 0 && (
          <section className="card pad fade-in">
            <h2 className="h">Ready to import</h2>
            <ul className="lists">
              {lists.map((l, i) => (
                <li key={i}>
                  <span className="grow">{l.name}</span>
                  <span className="muted small">{l.liked ? 'Liked songs · ' : 'Playlist · '}{l.refs.length} songs</span>
                </li>
              ))}
            </ul>
            {skipped > 0 && <div className="muted small">{skipped} file{skipped > 1 ? 's' : ''} without songs were skipped.</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
              {busy && <span className="muted small">{progress}</span>}
            </div>
          </section>
        )}

        {lists.length === 0 && skipped > 0 && !done && <div className="muted">None of those files contained songs. Pick files from the playlists or music library folders.</div>}

        {done && (
          <section className="card pad fade-in">
            <h2 className="h">Done</h2>
            <p className="muted">{done.songs} songs from {done.lists} list{done.lists > 1 ? 's' : ''} are in your library.{done.missed ? ` ${done.missed} couldn't be found on YouTube Music (deleted or private).` : ''}</p>
            <Link href="/library" className="btn">Open library</Link>
          </section>
        )}
      </div>
      <style jsx>{`
        .stack { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
        .steps { margin: 0 0 16px; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; line-height: 1.5; font-size: 14px; }
        .steps a { text-decoration: underline; }
        .h { font-size: 15px; font-weight: 600; margin: 0 0 10px; }
        .lists { list-style: none; margin: 0 0 10px; padding: 0; }
        .lists li { display: flex; gap: 12px; padding: 8px 0; font-size: 14px; }
        .lists li + li { border-top: 1px solid var(--border); }
      `}</style>
    </>
  );
}
