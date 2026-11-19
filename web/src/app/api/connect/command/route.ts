import { gate } from '@/server/auth';
import { command } from '@/server/connect';

export const dynamic = 'force-dynamic';

/** Send a remote-control command to another device: { from, to, cmd: { type, ... } }. */
export async function POST(req: Request) {
  const denied = await gate();
  if (denied) return denied;
  try {
    const { from, to, cmd } = await req.json();
    if (typeof to !== 'string' || typeof from !== 'string' || !cmd) throw new Error('from, to and cmd are required');
    const r = command(from, to, cmd);
    if (r === 'invalid') return Response.json({ error: 'unknown or oversized command' }, { status: 400 });
    if (r === 'offline') return Response.json({ error: 'that device is offline' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
