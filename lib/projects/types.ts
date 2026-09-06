import type { Model } from '../cad/model';
import type { Revision } from '../cad/history';
export type SavedRevision = Revision & {
  branchId: string;
  ordinal: number;
  answer: string;
  summary?: { added: number; removed: number; unchanged: number };
};
export type SavedMessage = {
  turnId: string | null;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  updated: boolean;
  revisionId: string;
};
export type Branch = {
  id: string;
  name: string;
  headRevisionId: string;
  parentBranchId: string | null;
  forkRevisionId: string | null;
  conversationReady: boolean;
};
export type ProjectSummary = {
  id: string;
  name: string;
  brief: string;
  requirements: string;
  activeBranchId: string;
  selectedRevisionId: string;
  updatedAt: string;
};
export type ProjectDetail = ProjectSummary & {
  branches: Branch[];
  revisions: SavedRevision[];
  messages: SavedMessage[];
};
export type TurnInput = {
  projectId: string;
  branchId: string;
  revisionId: string;
  requestId: string;
  message: string;
};
export type TurnResult = {
  message: string;
  model: Model | null;
  revisionId: string;
  branchId: string;
};
export function lineage(revisions: SavedRevision[], headId: string) {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const result: SavedRevision[] = [];
  const seen = new Set<string>();
  let id: string | null = headId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const r = byId.get(id);
    if (!r) break;
    result.unshift(r);
    id = r.parentId;
  }
  return result;
}
