'use client';
import { useEffect } from 'react';

/* Spotify tints the top of a page with a colour taken from the artwork. The colour is the average of the artwork's
   pixels, weighted towards saturated ones and darkened a little so white text stays readable on it. Artwork hosts
   (ytimg, googleusercontent) allow cross-origin reads; if one ever does not, the neutral grey is used. */

const FALLBACK = '#404040';
const cache = new Map<string, Promise<string>>();

export function dominantColor(src: string): Promise<string> {
  let p = cache.get(src);
  if (!p) {
    p = new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const x = c.getContext('2d', { willReadFrequently: true })!;
          x.drawImage(img, 0, 0, 24, 24);
          const d = x.getImageData(0, 0, 24, 24).data;
          let r = 0, g = 0, b = 0, w = 0;
          for (let i = 0; i < d.length; i += 4) {
            const max = Math.max(d[i], d[i + 1], d[i + 2]);
            const min = Math.min(d[i], d[i + 1], d[i + 2]);
            const sat = max ? (max - min) / max : 0;
            const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
            const wt = 0.15 + sat * 2 + (lum > 0.12 && lum < 0.85 ? 0.5 : 0);
            r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
          }
          r /= w; g /= w; b /= w;
          // keep it dark enough for white text
          const k = Math.min(1, 150 / Math.max(r, g, b, 1));
          resolve(`rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`);
        } catch {
          resolve(FALLBACK);
        }
      };
      img.onerror = () => resolve(FALLBACK);
      img.src = src;
    });
    cache.set(src, p);
  }
  return p;
}

/** Sets the colour of the gradient at the top of the main panel while the page is shown. */
export function useTint(src?: string | null, fixed?: string) {
  useEffect(() => {
    const root = document.documentElement;
    let live = true;
    if (fixed) root.style.setProperty('--tint', fixed);
    else if (src) dominantColor(src).then((c) => live && root.style.setProperty('--tint', c));
    else root.style.removeProperty('--tint');
    return () => {
      live = false;
      root.style.removeProperty('--tint');
    };
  }, [src, fixed]);
}
