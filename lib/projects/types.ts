import type { Model } from '../cad/model';
import type { Revision } from '../cad/history';
export type SavedRevision = Revision & {
  authorId?: string | null;
  mergeParentId?: string | null;
  branchId: string;
  ordinal: number;
  answer: string;
  summary?: { added: number; removed: number; unchanged: number };
};
export type SavedMessage = {
  proposalId?: string | null;
  turnId: string | null;
  id: string;
  role: 'user' | 'assistant';
  content: string;
  updated: boolean;
  revisionId: string;
};
export type Branch = {
  createdBy?: string;
  canEdit?: boolean;
  id: string;
  name: string;
  headRevisionId: string;
  parentBranchId: string | null;
  forkRevisionId: string | null;
  conversationReady: boolean;
};
export type ProjectSummary = {
  role?: 'owner' | 'editor' | 'viewer';
  approvalMode: 'review' | 'auto';
  archived: boolean;
  id: string;
  name: string;
  brief: string;
  requirements: string;
  activeBranchId: string;
  selectedRevisionId: string;
  updatedAt: string;
};
export type ProjectDetail = ProjectSummary & {
  messageCursor?: number | null;
  revisionIndex?: import('./revisions').RevisionSummary[];
  revisionCursor?: number | null;
  dimensionLocks: import('./locks').DimensionLock[];
  proposals: Proposal[];
  branches: Branch[];
  revisions: SavedRevision[];
  messages: SavedMessage[];
};
export type TurnInput = {
  proposalId?: string | null;
  projectId: string;
  branchId: string;
  revisionId: string;
  requestId: string;
  message: string;
};
export type TurnResult = {
  mergeParentId?: string;
  proposalId?: string;
  message: string;
  model: Model | null;
  revisionId: string;
  branchId: string;
};
export type Proposal = {
  authorId?: string | null;
  mergeParentId?: string | null;
  id: string;
  branchId: string;
  baseRevisionId: string;
  parentProposalId: string | null;
  status: 'pending' | 'accepted' | 'discarded' | 'superseded';
  model: Model;
  prompt: string;
  answer: string;
  createdAt: string;
  acceptedRevisionId: string | null;
  summary: { added: number; removed: number; unchanged: number };
};
export function lineage<T extends { id: string; parentId: string | null }>(
  revisions: T[],
  headId: string,
) {
  const byId = new Map(revisions.map((r) => [r.id, r]));
  const result: T[] = [];
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
