import type { SVGProps } from 'react';
import { ICONS } from './icons';
import { LINEAR } from './linear-icons';

/* Icons come from the Linear Design System where it has the glyph (navigation, search, add, close, display,
   priority and status icons), and from the Phosphor set for the rest (media controls and music-specific
   glyphs the Linear kit does not contain). Both paint with currentColor and use the same 16px optical size. */

export type IconName = keyof typeof ICONS | keyof typeof LINEAR;

/** Existing icon names that now resolve to the Linear glyph. */
const LINEAR_FOR: Partial<Record<keyof typeof ICONS, keyof typeof LINEAR>> = {
  home: 'focus',
  search: 'search',
  library: 'views',
  compass: 'roadmaps',
  playlist: 'issues',
  plus: 'add',
  addList: 'add',
  close: 'close',
  user: 'account',
  settings: 'display',
  sliders: 'display',
  bell: 'bell',
  menu: 'menu',
  grid: 'projects',
  star: 'fav',
  edit: 'edit',
};

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const key = (name in LINEAR ? name : LINEAR_FOR[name as keyof typeof ICONS]) as keyof typeof LINEAR | undefined;
  if (key && LINEAR[key]) {
    const { s, b } = LINEAR[key];
    return <svg width={size} height={size} viewBox={`0 0 ${s} ${s}`} fill="none" aria-hidden focusable="false" dangerouslySetInnerHTML={{ __html: b }} {...rest} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden focusable="false" {...rest}>
      <path d={ICONS[name as keyof typeof ICONS]} />
    </svg>
  );
}
