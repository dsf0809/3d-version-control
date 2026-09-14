import { readCredential } from '../lib/projects/ai-credentials';
import handler from 'vinext/server/fetch-handler';
import { DurableObject } from 'cloudflare:workers';
import { BackgroundJob } from '../lib/projects/background-job';
import { ProjectStore } from '../lib/projects/store';
export class GenerationJob extends DurableObject<{
  DB: D1Database;
  OPENAI_API_KEY?: string;
  AI_KEY_ENCRYPTION_SECRET?: string;
  OPENAI_MODEL?: string;
}> {
  private runner() {
    return new BackgroundJob(
      this.ctx.storage,
      new ProjectStore(this.env.DB),
      (owner) => readCredential(new ProjectStore(this.env.DB), owner, this.env.AI_KEY_ENCRYPTION_SECRET || process.env.AI_KEY_ENCRYPTION_SECRET || '', this.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''),
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
