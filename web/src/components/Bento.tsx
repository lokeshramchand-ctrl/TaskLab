'use client';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/* Bento layout: a 12-column grid of tiles on one spacing scale (4 / 8 / 12 / 16 / 24 / 32).
   Every tile has the same 12px gap around it, 16px of padding inside and a 12px corner, so edges line up
   whatever the tile sizes are. Tiles follow the cursor with a soft glow along their border. */

export type Tone = 'default' | 'accent' | 'glow' | 'quiet';

export function Bento({ children, className = '', as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={`bento ${className}`} {...(rest as object)}>
      {children}
    </As>
  );
}

type TileProps = {
  /** Columns taken on desktop (of 12). */
  span?: number;
  /** Columns at tablet width (<= 1100px). Defaults to half or full width. */
  md?: number;
  /** Columns on phones (<= 700px). Defaults to full width. */
  sm?: number;
  /** Rows taken (each row is the grid's row unit). */
  rows?: number;
  tone?: Tone;
  title?: ReactNode;
  /** Small mono label before the title, e.g. "01". */
  kicker?: string;
  sub?: ReactNode;
  action?: ReactNode;
  /** No inner padding: for tiles that hold edge-to-edge lists. */
  flush?: boolean;
  href?: string;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
  label?: string;
  onClick?: () => void;
};

export function Tile({ span = 4, md, sm, rows, tone = 'default', title, kicker, sub, action, flush, href, className = '', children, style, label, onClick }: TileProps) {
  const cm = md ?? (span >= 8 ? 12 : span >= 4 ? 6 : 6);
  const cs = sm ?? 12;
  const vars = { ['--c' as string]: span, ['--cm' as string]: cm, ['--cs' as string]: cs, ...(rows ? { ['--r' as string]: rows } : {}), ...style } as CSSProperties;
  const move = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  const body = (
    <>
      {(title || action) && (
        <header className="tile-h">
          <div className="tile-t">
            {kicker && <span className="tile-k">{kicker}</span>}
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {action && <div className="tile-a">{action}</div>}
        </header>
      )}
      {children}
    </>
  );
  const cls = `tile tone-${tone}${flush ? ' flush' : ''}${rows ? ' tall' : ''}${className ? ` ${className}` : ''}`;
  if (href) {
    return (
      <Link href={href} className={cls} style={vars} onMouseMove={move} aria-label={label}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`${cls} clickable`} style={vars} onMouseMove={move} onClick={onClick} aria-label={label}>
        {body}
      </button>
    );
  }
  return (
    <section className={cls} style={vars} onMouseMove={move} aria-label={label}>
      {body}
    </section>
  );
}
