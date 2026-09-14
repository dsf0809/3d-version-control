import { GenerationJob } from '../../dist/server/index.js';
export { GenerationJob };
export default {
  async fetch(request, env) {
    const input = await request.json();
    const job = env.GENERATION_JOBS.get(
      env.GENERATION_JOBS.idFromName('offline:' + input.requestId),
    );
    if (new URL(request.url).pathname === '/enqueue') {
      await job.enqueue('offline', input);
      return Response.json({ queued: true });
    }
    return Response.json(await job.status('offline', input.projectId));
  },
};
