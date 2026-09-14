import { env } from 'cloudflare:workers';
import type { GenerationJob } from '../../workers/app';
import { HttpError } from './http';
export function jobFor(owner: string, requestId: string) {
  const jobs = (
    env as unknown as {
      GENERATION_JOBS?: DurableObjectNamespace<GenerationJob>;
    }
  ).GENERATION_JOBS;
  if (!jobs)
    throw new HttpError(
      503,
      'Background jobs are not configured. Start the app with its Durable Object binding.',
    );
  return jobs.get(jobs.idFromName(owner + ':' + requestId));
}
