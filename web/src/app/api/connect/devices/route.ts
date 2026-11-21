import { gate } from '@/server/auth';
import { snapshot } from '@/server/connect';
import { hubConnect } from '@/server/hub';

export const dynamic = 'force-dynamic';

/** One-shot list of online devices (the live version arrives on the events stream). */
export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  const viaHub = await hubConnect('devices');
  if (viaHub?.ok) return Response.json(await viaHub.json(), { headers: { 'cache-control': 'no-store' } });
  return Response.json(snapshot(), { headers: { 'cache-control': 'no-store' } });
}
