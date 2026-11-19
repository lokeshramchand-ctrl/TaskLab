'use client';
import { useEffect, useState } from 'react';

/* The dominant colour of an artwork, used to wash a page behind its cover (Apple Music style).
   Runs in the browser on a tiny canvas; if the image cannot be read (no CORS) the page keeps its neutral wash. */

const cache = new Map<string, string | null>();

function dominant(img: HTMLImageElement): string | null {
  const n = 24;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(img, 0, 0, n, n);
  let data: Uint8ClampedArray;
  try {
    data = g.getImageData(0, 0, n, n).data;
  } catch {
    return null; // tainted canvas
  }
  let r = 0, gr = 0, b = 0, w = 0;
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const sat = max ? (max - min) / max : 0;
    const light = (max + min) / 510;
    // Favour vivid, mid-tone pixels; near-black and near-white say little about the artwork's mood.
    const wt = (0.15 + sat * sat * 2) * (1 - Math.abs(light - 0.55) * 1.4);
    if (wt <= 0) continue;
    r += R * wt; gr += G * wt; b += B * wt; w += wt;
  }
  if (!w) return null;
  // Push the average away from grey so the wash reads as a colour, as in Apple Music.
  const avg = [r / w, gr / w, b / w];
  const grey = (avg[0] + avg[1] + avg[2]) / 3;
  const [R, G, B] = avg.map((v) => Math.max(0, Math.min(255, Math.round(grey + (v - grey) * 1.45))));
  return `rgb(${R}, ${G}, ${B})`;
}

export function tintOf(src: string): Promise<string | null> {
  if (cache.has(src)) return Promise.resolve(cache.get(src)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      const t = dominant(img);
      cache.set(src, t);
      resolve(t);
    };
    img.onerror = () => {
      cache.set(src, null);
      resolve(null);
    };
    img.src = src;
  });
}

export function useTint(src?: string): string | null {
  const [tint, setTint] = useState<string | null>(src && cache.has(src) ? cache.get(src)! : null);
  useEffect(() => {
    let live = true;
    if (!src) return setTint(null);
    tintOf(src).then((t) => live && setTint(t));
    return () => {
      live = false;
    };
  }, [src]);
  return tint;
}
