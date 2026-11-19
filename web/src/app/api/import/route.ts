import { resolveImport, type ImportRef } from '@/server/catalog';
import { json } from '@/server/http';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { items?: ImportRef[] };
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).map((i) => ({
    id: typeof i?.id === 'string' ? i.id.slice(0, 20) : undefined,
    title: typeof i?.title === 'string' ? i.title.slice(0, 200) : undefined,
    artist: typeof i?.artist === 'string' ? i.artist.slice(0, 200) : undefined,
  }));
  return json(async () => ({ tracks: await resolveImport(items) }));
};
