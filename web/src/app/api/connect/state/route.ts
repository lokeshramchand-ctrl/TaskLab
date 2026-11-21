import { gate } from '@/server/auth';
import { report } from '@/server/connect';
import { hubConnect } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** A device tells the others what it is playing. */
export async function POST(req: Request) {
  const denied = await gate();
  if (denied) return denied;
  try {
    const text = await req.text();
    const viaHub = await hubConnect('state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text });
    if (viaHub) return new Response(await viaHub.text(), { status: viaHub.status, headers: { 'content-type': 'application/json' } });
    const { id, state } = JSON.parse(text);
    if (typeof id !== 'string') throw new Error('id required');
    // 409 = this device has no live connection (yet); the client reconnects and reports again.
    return report(id, state) ? Response.json({ ok: true }) : Response.json({ error: 'not connected' }, { status: 409 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}
