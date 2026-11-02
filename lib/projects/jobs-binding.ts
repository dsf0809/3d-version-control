import { runtime } from '../server/runtime';
export function jobFor(owner: string, requestId: string) {
  return runtime().jobs.job(owner, requestId);
}
