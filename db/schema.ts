import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    brief: text('brief').notNull().default(''),
    requirements: text('requirements').notNull().default(''),
    activeBranchId: text('active_branch_id').notNull(),
    selectedRevisionId: text('selected_revision_id').notNull(),
    importKey: text('import_key'),
    archived: integer('archived').notNull().default(0),
    dimensionLocks: text('dimension_locks').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('projects_owner_updated').on(t.ownerId, t.updatedAt),
    uniqueIndex('projects_owner_import').on(t.ownerId, t.importKey),
  ],
);
export const shares = sqliteTable('shares', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  revisionId: text('revision_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  allowExport: integer('allow_export').notNull().default(0),
  revoked: integer('revoked').notNull().default(0),
  createdAt: text('created_at').notNull(),
});
export const branches = sqliteTable(
  'branches',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    name: text('name').notNull(),
    parentBranchId: text('parent_branch_id'),
    forkRevisionId: text('fork_revision_id'),
    headRevisionId: text('head_revision_id').notNull(),
    conversationId: text('conversation_id'),
    lockToken: text('lock_token'),
    lockUntil: integer('lock_until').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('branches_project').on(t.projectId)],
);
export const revisions = sqliteTable(
  'revisions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    parentId: text('parent_id'),
    ordinal: integer('ordinal').notNull(),
    modelJson: text('model_json').notNull(),
    prompt: text('prompt').notNull(),
    answer: text('answer').notNull().default(''),
    summaryJson: text('summary_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('revisions_project_ordinal').on(t.projectId, t.ordinal)],
);
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    turnId: text('turn_id'),
    proposalId: text('proposal_id'),
    ordinal: integer('ordinal').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    revisionId: text('revision_id').notNull(),
    updated: integer('updated').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('messages_branch_ordinal').on(t.branchId, t.ordinal)],
);
export const turns = sqliteTable(
  'turns',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    baseRevisionId: text('base_revision_id').notNull(),
    proposalId: text('proposal_id'),
    prompt: text('prompt').notNull(),
    status: text('status').notNull(),
    resultJson: text('result_json'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('turns_branch').on(t.branchId)],
);
export const proposals = sqliteTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: text('branch_id')
      .notNull()
      .references(() => branches.id),
    baseRevisionId: text('base_revision_id').notNull(),
    parentProposalId: text('parent_proposal_id'),
    status: text('status').notNull(),
    modelJson: text('model_json').notNull(),
    prompt: text('prompt').notNull(),
    answer: text('answer').notNull(),
    summaryJson: text('summary_json').notNull(),
    acceptedRevisionId: text('accepted_revision_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('proposals_branch_status').on(t.branchId, t.status)],
);
