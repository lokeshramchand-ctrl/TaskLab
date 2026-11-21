'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/player/library';
import { useSleep } from '@/player/sleep';
import { usePlayer } from '@/player/store';
import { deepStats } from '@/lib/insights';
import { detectSleep, formatSpan, type SleepSession } from '@/lib/sleep';
import { artistNames } from '@/lib/format';
import { Bento, Tile } from '@/components/Bento';
import { Icon } from '@/components/Icon';
import { EmptyState, PageHeader } from '@/components/ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayName = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

function Bars({ values, labels, label, mark }: { values: number[]; labels: string[]; label: string; mark?: number | null }) {
  const max = Math.max(...values, 1);
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <div key={i} className={`col${mark === i ? ' hot' : ''}`} title={`${labels[i]}: ${formatSpan(v)}`}>
          <i style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
          <span>{labels[i]}</span>
        </div>
      ))}
      <style jsx>{`
        .bars { display: flex; align-items: flex-end; gap: 4px; height: 120px; }
        .col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
        .col i { width: 100%; border-radius: 4px 4px 1px 1px; background: var(--card-hover, #333); transition: height .6s var(--ease-out); }
        .col.hot i { background: var(--signal); }
        .col span { font-size: 10px; color: var(--muted, #a7a7a7); white-space: nowrap; height: 12px; }
      `}</style>
    </div>
  );
}

function Big({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="big">
      <span className="n">{value}</span>
      {unit && <span className="u">{unit}</span>}
    </div>
  );
}

export default function Insights() {
  const history = useLibrary((s) => s.history);
  const anchors = useSleep((s) => s.anchors);
  const sessions = useMemo(() => detectSleep(history, anchors), [history, anchors]);
  const stats = useMemo(() => {
    // Hours spent asleep with the queue running are not listening: keep them out of the charts and totals.
    const asleep = (p: { at: number }) => sessions.some((s) => p.at >= s.asleepFrom && p.at <= s.end);
    return deepStats(history, Date.now(), asleep);
  }, [history, sessions]);
  const withSleep = useMemo(() => deepStats(history), [history]);
  const asleepTotal = withSleep.totalMs - stats.totalMs;

  if (!history.length) {
    return (
      <>
        <PageHeader eyebrow="Insights" title="Your listening" />
        <EmptyState icon="history" title="Nothing to analyse yet" hint="Play some songs and your listening habits will show up here." />
      </>
    );
  }

  return (
    <Bento className="fade-in">
      <PageHeader eyebrow="Insights" title="Your listening" sub="Built from your play history on every device." />

      <Tile span={3} md={6} sm={6} tone="card" title="Time listened" sub="Awake, all time">
        <Big value={formatSpan(stats.totalMs)} />
        <div className="muted small">{asleepTotal > 60_000 ? `+ ${formatSpan(asleepTotal)} asleep with music on` : 'Across all your devices'}</div>
      </Tile>
      <Tile span={3} md={6} sm={6} tone="card" title="Last 30 days">
        <Big value={formatSpan(stats.monthMs)} />
        <div className="muted small">{stats.newArtistsThisMonth} new artists</div>
      </Tile>
      <Tile span={3} md={6} sm={6} tone="card" title="Daily average" sub="On days you listen">
        <Big value={formatSpan(stats.avgDayMs)} />
        <div className="muted small">{stats.activeDays} days with music</div>
      </Tile>
      <Tile span={3} md={6} sm={6} tone="card" title="Best streak">
        <Big value={String(stats.longestStreak)} unit={stats.longestStreak === 1 ? 'day' : 'days'} />
        <div className="muted small">{Math.round(stats.completionRate * 100)}% of songs finished · {Math.round(stats.skipRate * 100)}% skipped</div>
      </Tile>

      <Tile span={8} md={12} title="When you listen" sub={stats.peakHour != null ? `Busiest around ${hourLabel(stats.peakHour)}` : undefined}>
        <Bars values={stats.hourMs} labels={stats.hourMs.map((_, h) => (h % 3 === 0 ? hourLabel(h) : ''))} label="Listening time by hour of day" mark={stats.peakHour} />
      </Tile>
      <Tile span={4} md={12} title="Which days">
        <Bars values={stats.weekdayMs} labels={DAYS} label="Listening time by weekday" mark={stats.weekdayMs.indexOf(Math.max(...stats.weekdayMs))} />
      </Tile>

      <SleepTile sessions={sessions} />

      <Tile span={6} md={12} flush kicker="01" title="Top artists" sub="By time listened">
        <ol className="rank">
          {stats.topArtistsMs.slice(0, 8).map((a, i) => (
            <li key={a.name}>
              <span className="i">{i + 1}</span>
              {a.id ? <Link href={`/artist/${a.id}`} className="clamp1 grow">{a.name}</Link> : <span className="clamp1 grow">{a.name}</span>}
              <span className="muted">{formatSpan(a.ms)}</span>
            </li>
          ))}
        </ol>
      </Tile>
      <Tile span={6} md={12} flush kicker="02" title="Top songs" sub="By time listened">
        <ol className="rank">
          {stats.topTracks.slice(0, 8).map((t, i) => (
            <li key={t.track.id}>
              <span className="i">{i + 1}</span>
              <button className="clamp1 grow link" onClick={() => usePlayer.getState().play([t.track], 0, { source: 'insights' })}>
                {t.track.title} <span className="muted">· {artistNames(t.track.artists)}</span>
              </button>
              <span className="muted">{t.plays}×</span>
            </li>
          ))}
        </ol>
      </Tile>
      <style jsx global>{`
        .rank { list-style: none; margin: 0; padding: 4px 8px 12px; }
        .rank li { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 8px; font-size: 14px; }
        .rank li:hover { background: var(--card-hover); }
        .rank .i { width: 20px; text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
        .rank .grow { flex: 1; min-width: 0; text-align: left; }
        .rank .link { background: none; border: 0; color: inherit; cursor: pointer; padding: 0; font: inherit; }
      `}</style>
    </Bento>
  );
}

/* ---------------------------------------------------------------- sleep */

function SleepTile({ sessions }: { sessions: SleepSession[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const { setAnchor, clearAnchor } = useSleep();
  const recent = sessions.slice(0, 7);
  return (
    <Tile span={12} title={<span id="sleep"><Icon name="moon" size={18} /> Sleep with the queue on</span>} sub="Worked out from songs that kept playing on their own. An estimate: tell it the last song you remember and it adjusts.">
      {!recent.length && <div className="muted small">No long runs of back-to-back songs yet. When you fall asleep with the queue playing, it shows up here the next morning.</div>}
      <div className="sess">
        {recent.map((s, i) => {
          const on = open === i;
          return (
            <section key={s.start} className={`s${on ? ' on' : ''}`}>
              <button className="head" onClick={() => setOpen(on ? null : i)} aria-expanded={on}>
                <span className="when">{dayName(s.start)}</span>
                <span className="dur">~{formatSpan(s.asleepMs)} asleep</span>
                <span className="muted small hide-sm">{clock(s.asleepFrom)} – {clock(s.end)} · {s.plays.length} songs</span>
                <span className={`conf ${s.confidence}`}>{s.corrected ? 'set by you' : s.confidence === 'high' ? 'likely' : s.confidence === 'medium' ? 'maybe' : 'unsure'}</span>
              </button>
              {on && (
                <div className="body">
                  <p className="small">
                    You probably nodded off around <b>{clock(s.asleepFrom)}</b> during <b>{s.lastAwake.title}</b>. The queue then played{' '}
                    <b>{s.plays.length - s.lastAwakeIndex - 1}</b> more songs until <b>{clock(s.end)}</b>.
                  </p>
                  <p className="muted small">Tap the last song you actually remember hearing:</p>
                  <ol>
                    {s.plays.map((p, j) => (
                      <li key={p.at} className={j === s.lastAwakeIndex ? 'mark' : j > s.lastAwakeIndex ? 'dim' : ''}>
                        <span className="muted t">{clock(p.at)}</span>
                        <button className="clamp1" onClick={() => setAnchor(s.start, p.at)} title="I remember up to here">
                          {p.track.title} <span className="muted">· {artistNames(p.track.artists)}</span>
                        </button>
                        {j === s.lastAwakeIndex && <span className="flag">last awake</span>}
                      </li>
                    ))}
                  </ol>
                  {s.corrected && <button className="btn" onClick={() => clearAnchor(s.start)}>Back to automatic estimate</button>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <style jsx>{`
        .sess { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .s { border-radius: 10px; background: var(--card, #181818); }
        .head { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 14px; background: none; border: 0; color: inherit; cursor: pointer; font: inherit; text-align: left; }
        .when { width: 110px; font-weight: 600; }
        .dur { font-weight: 700; flex: 1; }
        .conf { font-size: 11px; padding: 2px 8px; border-radius: 99px; background: var(--card-hover, #333); color: var(--muted, #a7a7a7); }
        .conf.high { background: var(--signal); color: #000; }
        .body { padding: 0 14px 14px; }
        .body ol { list-style: none; margin: 8px 0; padding: 0; max-height: 280px; overflow: auto; }
        .body li { display: flex; gap: 10px; align-items: center; padding: 4px 6px; border-radius: 6px; }
        .body li button { flex: 1; min-width: 0; text-align: left; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; padding: 0; }
        .body li:hover { background: var(--card-hover, #333); }
        .body li.dim { opacity: .55; }
        .body li.mark { background: color-mix(in srgb, var(--signal) 18%, transparent); }
        .t { width: 64px; font-variant-numeric: tabular-nums; font-size: 12px; }
        .flag { font-size: 11px; color: var(--signal); font-weight: 700; }
        @media (max-width: 700px) { .hide-sm { display: none; } .when { width: 90px; } }
      `}</style>
    </Tile>
  );
}
