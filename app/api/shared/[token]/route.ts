import { projectStore } from '@/lib/projects/db';
import { readShare } from '@/lib/projects/shares';
import { json, failure } from '@/lib/projects/http';
import { binarySTL, buildGeometry } from '@/lib/cad/geometry';
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const exporting = new URL(request.url).searchParams.get('export') === 'stl';
    const data = await readShare(
      projectStore(),
      (await context.params).token,
      exporting,
    );
    if (!exporting) return json(data);
    return new Response(binarySTL(buildGeometry(data.model).positions), {
      headers: {
        'Content-Type': 'model/stl',
        'Content-Disposition': 'attachment; filename="shared-model.stl"',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
