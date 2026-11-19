export type ImportRef = { id?: string; title?: string; artist?: string };

export type TakeoutList = { name: string; liked: boolean; refs: ImportRef[] };

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') (src[i + 1] === '"' ? ((cur += '"'), i++) : (q = false));
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(cur), (cur = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** Turns one Takeout CSV into a list of songs, or null when it holds none (e.g. playlists.csv). */
export function parseTakeoutFile(fileName: string, text: string): TakeoutList | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  if (col(/^playlist id$/) >= 0) return null; // the playlist index, not a list of songs
  const idCol = col(/^video id$/);
  const titleCol = col(/^song title$|^title$/);
  const artistCol = col(/^artist name 1$|^artist$/);
  if (idCol < 0 && titleCol < 0) return null;
  const refs: ImportRef[] = rows.slice(1).flatMap((r) => {
    const id = idCol >= 0 ? r[idCol]?.trim() : undefined;
    const title = titleCol >= 0 ? r[titleCol]?.trim() : undefined;
    if (!id && !title) return [];
    return [{ id: id || undefined, title: title || undefined, artist: artistCol >= 0 ? r[artistCol]?.trim() || undefined : undefined }];
  });
  if (!refs.length) return null;
  const base = fileName.replace(/\.csv$/i, '').replace(/-videos$/i, '').trim() || 'Imported';
  const liked = /^liked (videos|music|songs)$/i.test(base);
  return { name: base, liked, refs };
}
