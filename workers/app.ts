import handler from 'vinext/server/fetch-handler';
import { DurableObject } from 'cloudflare:workers';
import { BackgroundJob } from '../lib/projects/background-job';
import { ProjectStore } from '../lib/projects/store';
export class GenerationJob extends DurableObject<{
  DB: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}> {
  private runner() {
    return new BackgroundJob(
      this.ctx.storage,
      new ProjectStore(this.env.DB),
      this.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
      this.env.OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-6-astra',
    );
  }
  async enqueue(owner: string, input: unknown) {
    return this.runner().enqueue(owner, input);
  }
  async status(owner: string, projectId: string) {
    return this.runner().status(owner, projectId);
  }
  async alarm() {
    await this.runner().alarm();
  }
}
export default handler;
