import { sample, validateModel, type Model } from './model';
export type Revision = {
  id: string;
  parentId: string | null;
  createdAt: string;
  prompt: string;
  model: Model;
};
export const initialRevision: Revision = {
  id: 'initial',
  parentId: null,
  createdAt: '',
  prompt: 'Sample tray',
  model: sample,
};
export const STORAGE_KEY = 'form-workshop-revisions-v1';
export function parseHistory(raw: string): Revision[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 500)
    throw new Error('Invalid revision history.');
  const ids = new Set<string>();
  for (const r of parsed) {
    if (
      !r ||
      typeof r.id !== 'string' ||
      ids.has(r.id) ||
      typeof r.prompt !== 'string' ||
      typeof r.createdAt !== 'string' ||
      (r.parentId !== null && !ids.has(r.parentId))
    )
      throw new Error('Invalid revision relationship.');
    validateModel(r.model);
    ids.add(r.id);
  }
  return parsed;
}
