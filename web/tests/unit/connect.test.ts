import { describe, expect, it } from 'vitest';
import * as c from '@/server/connect';

type Ev = { event: string; data: any };
const dev = (id: string, kind: 'web' | 'android' = 'web') => {
  const got: Ev[] = [];
  const off = c.connect(id, id, kind, (event, data) => got.push({ event, data }));
  return { got, off, cmds: () => got.filter((e) => e.event === 'command').map((e) => e.data.cmd) };
};
const track = { id: 'abc', title: 'Song' };
const state = (playing: boolean, position = 10) => ({ track, playing, position, duration: 200, volume: 1, shuffle: false, repeat: 'off' as const, queueLen: 3 });

describe('connect', () => {
  it('lists devices and marks the playing one active', () => {
    const web = dev('web-aaaaaaaa');
    const phone = dev('and-bbbbbbbb', 'android');
    expect(c.report('web-aaaaaaaa', state(true))).toBe(true);
    const snap = c.snapshot();
    expect(snap.devices.map((d) => d.id)).toEqual(expect.arrayContaining(['web-aaaaaaaa', 'and-bbbbbbbb']));
    expect(snap.active).toBe('web-aaaaaaaa');
    expect(phone.got.at(-1)?.data.active).toBe('web-aaaaaaaa'); // controllers hear about it
    web.off();
    phone.off();
  });

  it('relays commands to the target only, and rejects unknown ones', () => {
    const web = dev('web-cccccccc');
    const phone = dev('and-dddddddd', 'android');
    expect(c.command('and-dddddddd', 'web-cccccccc', { type: 'seek', position: 42 })).toBe('ok');
    expect(web.cmds()).toEqual([{ type: 'seek', position: 42 }]);
    expect(phone.cmds()).toEqual([]);
    expect(c.command('and-dddddddd', 'web-cccccccc', { type: 'rm -rf' })).toBe('invalid');
    expect(c.command('and-dddddddd', 'nobody-here', { type: 'pause' })).toBe('offline');
    web.off();
    phone.off();
  });

  it('pauses the other device when one starts playing', () => {
    const web = dev('web-eeeeeeee');
    const phone = dev('and-ffffffff', 'android');
    c.report('web-eeeeeeee', state(true));
    c.report('and-ffffffff', state(true));
    expect(web.cmds()).toContainEqual({ type: 'pause', reason: 'other-device' });
    expect(phone.cmds()).toEqual([]);
    web.off();
    phone.off();
  });

  it('extrapolates progress of a playing device', () => {
    const web = dev('web-gggggggg');
    c.report('web-gggggggg', state(true, 10));
    const d = c.snapshot().devices.find((x) => x.id === 'web-gggggggg')!;
    expect(d.position).toBeGreaterThanOrEqual(10);
    web.off();
  });
});
