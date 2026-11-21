import { gate } from '@/server/auth';
import { connect } from '@/server/connect';
import { hubConnect } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** Server-sent events for one device: `devices` (who is online and what they play) and `command`s sent to it. */
export async function GET(req: Request) {
  const denied = await gate();
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const id = (q.get('id') ?? '').slice(0, 64);
  if (!/^[\w-]{8,64}$/.test(id)) return Response.json({ error: 'bad device id' }, { status: 400 });
  const name = (q.get('name') ?? 'Device').slice(0, 60);
  const kind = q.get('kind') === 'android' ? 'android' : 'web';

  // Desktop app with a hub: be a device on the hub, so the phone sees this PC (and can control it).
  const viaHub = await hubConnect(`events?${q.toString()}`, { signal: req.signal, headers: { accept: 'text/event-stream' } }, true);
  if (viaHub?.ok && viaHub.body) {
    return new Response(viaHub.body, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' },
    });
  }

  const enc = new TextEncoder();
  let off = () => {};
  let ping: ReturnType<typeof setInterval>;
  const stream = new ReadableStream({
    start(c) {
      const send = (event: string, data: unknown) => {
        try {
          c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };
      off = connect(id, name, kind, send);
      ping = setInterval(() => {
        try {
          c.enqueue(enc.encode(': ping\n\n'));
        } catch {
          /* closed */
        }
      }, 20_000);
      req.signal.addEventListener('abort', () => {
        off();
        clearInterval(ping);
        try {
          c.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      off();
      clearInterval(ping);
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  });
}
