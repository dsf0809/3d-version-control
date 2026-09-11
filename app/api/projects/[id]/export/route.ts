import { projectStore } from '@/lib/projects/db';
import { ownerOf, failure, HttpError } from '@/lib/projects/http';
import { buildGeometry, binarySTL } from '@/lib/cad/geometry';
import { threeMF } from '@/lib/cad/three-mf';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const project = await projectStore().detail(
      ownerOf(request),
      (await context.params).id,
    );
    const revision = project.revisions.find(
      (r) => r.id === new URL(request.url).searchParams.get('revision'),
    );
    if (!revision) throw new HttpError(404, 'Accepted revision not found.');
    if (new URL(request.url).searchParams.get('format') === 'json')
      return new Response(JSON.stringify(revision.model, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="form-model.json"',
          'Cache-Control': 'no-store',
        },
      });
    const format = new URL(request.url).searchParams.get('format') ?? 'stl';
    if (!['stl', '3mf'].includes(format))
      throw new HttpError(400, 'Choose STL, 3MF or JSON.');
    const filename = `${revision.model.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'part'}-v${revision.ordinal}.${format}`;
    const positions = buildGeometry(revision.model).positions;
    return new Response(
      format === '3mf'
        ? threeMF(positions, revision.model.name)
        : binarySTL(positions),
      {
        headers: {
          'Content-Type': format === '3mf' ? 'model/3mf' : 'model/stl',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (e) {
    return failure(e);
  }
}
