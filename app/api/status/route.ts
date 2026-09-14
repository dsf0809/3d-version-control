import { projectStore } from '@/lib/projects/db';
import { ownerOf, failure } from '@/lib/projects/http';
import { hasCredential } from '@/lib/projects/ai-credentials';
export async function GET(request: Request) {
  try {
    return Response.json({configured: await hasCredential(projectStore(), ownerOf(request)) || !!process.env.OPENAI_API_KEY, model:process.env.OPENAI_MODEL || 'gpt-6-astra'}, {headers:{'Cache-Control':'no-store'}});
  } catch(e) { return failure(e); }
}
