import { proxyAudio, warmAudio, type Codec } from '@/server/stream';
import { idParam } from '@/server/http';
import { gate } from '@/server/auth';
import { cachedFile, maybeFill, serveFile } from '@/server/audiocache';
export const dynamic = 'force-dynamic';
export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const denied = await gate();
  if (denied) return denied;
  const id = await idParam(ctx);
  const codec: Codec = new URL(req.url).searchParams.get('codec') === 'aac' ? 'aac' : 'opus';
  try {
    if (new URL(req.url).searchParams.get('warm')) {
      if (cachedFile(id, codec)) return new Response(null, { status: 204 });
      await warmAudio(id, codec);
      return new Response(null, { status: 204 });
    }
    // Desktop app: a song already on disk plays from the file (works offline); otherwise stream it live and
    // keep a copy once it has really been listened to.
    const file = cachedFile(id, codec);
    if (file) return serveFile(file, codec, req.headers.get('range'));
    maybeFill(id, codec);
    return await proxyAudio(id, codec, req.headers.get('range'), req.signal);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[stream]', id, message);
    return new Response(message, { status: 502 });
  }
};
