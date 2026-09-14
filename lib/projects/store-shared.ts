import { HttpError } from './http';
import { upgradeModel } from '../cad/model';
import type { ProjectSummary, SavedRevision, TurnInput } from './types';
export type Row = {
  access_role: 'owner' | 'editor' | 'viewer';
  created_by: string | null;
  author_id: string | null;
  merge_parent_id: string | null;
  approval_mode: 'review' | 'auto';
  id: string;
  owner_id: string;
  project_id: string;
  branch_id: string;
  name: string;
  brief: string;
  requirements: string;
  active_branch_id: string;
  selected_revision_id: string;
  head_revision_id: string;
  parent_branch_id: string | null;
  fork_revision_id: string | null;
  conversation_id: string | null;
  parent_id: string | null;
  ordinal: number;
  model_json: string;
  prompt: string;
  answer: string;
  summary_json: string | null;
  created_at: string;
  updated_at: string;
  archived: number;
  role: 'user' | 'assistant';
  content: string;
  updated: number;
  revision_id: string;
  turn_id: string | null;
  base_revision_id: string;
  status: string;
  result_json: string;
  cutoff: number | null;
  proposal_id: string | null;
};
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function field(value: unknown, name: string, max: number) {
  if (typeof value !== 'string' || value.length > max)
    throw new HttpError(
      400,
      `${name} must be text of at most ${max} characters.`,
    );
  return value.trim();
}
export function validateProject(input: unknown) {
  const b = input as Record<string, unknown>;
  if (!b) throw new HttpError(400, 'Project details are required.');
  const name = field(b.name, 'Name', 120);
  if (!name) throw new HttpError(400, 'Give the project a name.');
  return {
    name,
    brief: field(b.brief ?? '', 'Design brief', 4000),
    requirements: field(b.requirements ?? '', 'Requirements', 8000),
  };
}
export function validateTurn(input: unknown): TurnInput {
  const b = input as Record<string, unknown>;
  if (!b) throw new HttpError(400, 'A request is required.');
  for (const k of ['projectId', 'branchId', 'revisionId', 'requestId'])
    if (typeof b[k] !== 'string' || !/^[\w-]{1,100}$/.test(b[k]))
      throw new HttpError(400, 'Invalid project or request identifier.');
  const message = field(b.message, 'Message', 8000);
  if (
    b.proposalId != null &&
    (typeof b.proposalId !== 'string' || !/^[\w-]{1,100}$/.test(b.proposalId))
  )
    throw new HttpError(400, 'Invalid proposal identifier.');
  if (!message) throw new HttpError(400, 'Enter a message.');
  return { ...b, message } as TurnInput;
}
export function summary(r: Row): ProjectSummary {
  return {
    role: r.access_role || 'owner',
    approvalMode: r.approval_mode === 'auto' ? 'auto' : 'review',
    archived: !!r.archived,
    id: r.id,
    name: r.name,
    brief: r.brief,
    requirements: r.requirements,
    activeBranchId: r.active_branch_id,
    selectedRevisionId: r.selected_revision_id,
    updatedAt: r.updated_at,
  };
}
export function revision(r: Row): SavedRevision {
  return {
    id: r.id,
    authorId: r.author_id,
    mergeParentId: r.merge_parent_id,
    parentId: r.parent_id,
    branchId: r.branch_id,
    ordinal: r.ordinal,
    model: upgradeModel(JSON.parse(r.model_json)),
    prompt: r.prompt,
    answer: r.answer,
    createdAt: r.created_at,
    summary: r.summary_json ? JSON.parse(r.summary_json) : undefined,
  };
}
