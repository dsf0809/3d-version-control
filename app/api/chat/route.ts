import { generateReply, validateChat } from '@/lib/ai';
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: 'Cross-origin requests are not accepted.' },
      { status: 403 },
    );
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json({ error: 'Use application/json.' }, { status: 415 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 100000)
      return Response.json({ error: 'Request too large.' }, { status: 413 });
    body = JSON.parse(raw);
    validateChat(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid request.' },
      { status: 400 },
    );
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          'Connect an OpenAI API key on the server to start chatting. Open AI connection for setup instructions.',
      },
      { status: 503 },
    );
  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(120000),
    ]);
    return Response.json(
      await generateReply(
        body,
        key,
        process.env.OPENAI_MODEL || 'gpt-6-astra',
        signal,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'The AI took too long. Try again with a simpler request.'
            : error instanceof Error
              ? error.message
              : 'Generation failed.',
      },
      { status: 502 },
    );
  }
}
