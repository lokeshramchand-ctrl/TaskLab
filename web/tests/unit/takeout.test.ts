import { describe, expect, it } from 'vitest';
import { parseCsv, parseTakeoutFile } from '@/lib/takeout';

describe('Google Takeout import parsing', () => {
  it('parses a liked-videos export with quoted commas and CRLF', () => {
    const csv = 'Video ID,Song Title,Artist Name 1\r\nabcdefghijk,"Hello, World",Someone\r\nzzzzzzzzzzz,"Say ""Hi""",Other\r\n';
    expect(parseCsv(csv)[1][1]).toBe('Hello, World');
    const list = parseTakeoutFile('Liked videos.csv', csv)!;
    expect(list.liked).toBe(true);
    expect(list.refs).toHaveLength(2);
    expect(list.refs[1].title).toBe('Say "Hi"');
  });

  it('parses a playlist export that has only video ids', () => {
    const list = parseTakeoutFile('Road Trip-videos.csv', 'Video ID,Playlist Video Creation Timestamp\nabcdefghijk,2024-01-01\n')!;
    expect(list.name).toBe('Road Trip');
    expect(list.liked).toBe(false);
    expect(list.refs[0]).toEqual({ id: 'abcdefghijk', title: undefined, artist: undefined });
  });

  it('skips files that hold no songs (playlists.csv, empty files)', () => {
    expect(parseTakeoutFile('playlists.csv', 'Playlist ID,Title\nPL1,Mine\n')).toBeNull();
    expect(parseTakeoutFile('empty.csv', 'Video ID\n')).toBeNull();
  });
});
