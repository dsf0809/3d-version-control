export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function ownerOf(request: Request) {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) throw new HttpError(401, 'Sign in to access your projects.');
  return owner;
}
export async function readBody(request: Request, maxBytes = 100000) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, 'Cross-origin requests are not accepted.');
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'Use application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'A JSON request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function failure(error: unknown) {
  return json(
    {
      error:
        error instanceof HttpError
          ? error.message
          : 'The project could not be saved or loaded. Please try again.',
    },
    error instanceof HttpError ? error.status : 500,
  );
}
