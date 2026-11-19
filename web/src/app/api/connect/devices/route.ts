import { gate } from '@/server/auth';
import { snapshot } from '@/server/connect';

export const dynamic = 'force-dynamic';

/** One-shot list of online devices (the live version arrives on the events stream). */
export async function GET() {
  const denied = await gate();
  if (denied) return denied;
  return Response.json(snapshot(), { headers: { 'cache-control': 'no-store' } });
}
