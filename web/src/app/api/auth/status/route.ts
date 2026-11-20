import { currentUser, hasOwner, isLocalMode } from '@/server/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  return Response.json({ setup: hasOwner(), user, needsCode: !hasOwner() && !!process.env.LOMU_SETUP_CODE, local: isLocalMode() });
}
