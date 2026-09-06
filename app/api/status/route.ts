export function GET() {
  return Response.json(
    {
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-6-astra',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
