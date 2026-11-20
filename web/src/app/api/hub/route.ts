import { gate } from '@/server/auth';
import { connectHub, disconnectHub, hubStatus, startHub, syncNow } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** Desktop app only: status of the connection to the sync hub (the homelab server), and sign-in / sign-out / sync-now. */
export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  startHub();
  return Response.json(hubStatus());
}

export async function POST(req: Request) {
  const denied = await gate();
  if (denied) return denied;
  if (!process.env.LOMU_LOCAL_TOKEN) return Response.json({ error: 'only available in the desktop app' }, { status: 404 });
  try {
    const b = (await req.json()) as { action?: string; url?: string; username?: string; password?: string };
    if (b.action === 'sync') syncNow();
    else await connectHub(String(b.url ?? ''), String(b.username ?? ''), String(b.password ?? ''));
    return Response.json(hubStatus());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
}

export async function DELETE() {
  const denied = await gate();
  if (denied) return denied;
  disconnectHub();
  return Response.json(hubStatus());
}
