import { sample, validateModel } from '../cad/model';
import { parseHistory, type Revision } from '../cad/history';
import { HttpError } from './http';
import {
  lineage,
  type ProjectDetail,
  type ProjectSummary,
  type SavedMessage,
  type SavedRevision,
  type TurnInput,
  type TurnResult,
} from './types';

type Row = {
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
  role: 'user' | 'assistant';
  content: string;
  updated: number;
  revision_id: string;
  turn_id: string | null;
  base_revision_id: string;
  status: string;
  result_json: string;
  cutoff: number | null;
};
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
function field(value: unknown, name: string, max: number) {
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
  if (!message) throw new HttpError(400, 'Enter a message.');
  return { ...b, message } as TurnInput;
}
function summary(r: Row): ProjectSummary {
  return {
    id: r.id,
    name: r.name,
    brief: r.brief,
    requirements: r.requirements,
    activeBranchId: r.active_branch_id,
    selectedRevisionId: r.selected_revision_id,
    updatedAt: r.updated_at,
  };
}
function revision(r: Row): SavedRevision {
  return {
    id: r.id,
    parentId: r.parent_id,
    branchId: r.branch_id,
    ordinal: r.ordinal,
    model: validateModel(JSON.parse(r.model_json)),
    prompt: r.prompt,
    answer: r.answer,
    createdAt: r.created_at,
    summary: r.summary_json ? JSON.parse(r.summary_json) : undefined,
  };
}
export class ProjectStore {
  constructor(public db: D1Database) {}
  stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async own(owner: string, projectId: string) {
    const p = await this.stmt(
      'SELECT * FROM projects WHERE id=? AND owner_id=?',
      projectId,
      owner,
    ).first<Row>();
    if (!p) throw new HttpError(404, 'Project not found.');
    return p;
  }
  async list(owner: string) {
    const r = await this.stmt(
      'SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC,id',
      owner,
    ).all<Row>();
    return r.results.map(summary);
  }
  async detail(owner: string, projectId: string): Promise<ProjectDetail> {
    const p = await this.own(owner, projectId);
    const [bs, rs, ms] = await this.db.batch<Row>([
      this.stmt(
        'SELECT * FROM branches WHERE project_id=? ORDER BY created_at,id',
        projectId,
      ),
      this.stmt(
        'SELECT * FROM revisions WHERE project_id=? ORDER BY ordinal',
        projectId,
      ),
      this.stmt(
        'SELECT * FROM messages WHERE branch_id=? ORDER BY ordinal',
        p.active_branch_id,
      ),
    ]);
    return {
      ...summary(p),
      branches: bs.results.map((b) => ({
        id: b.id,
        name: b.name,
        headRevisionId: b.head_revision_id,
        parentBranchId: b.parent_branch_id,
        forkRevisionId: b.fork_revision_id,
        conversationReady: !!b.conversation_id,
      })),
      revisions: rs.results.map(revision),
      messages: ms.results.map(
        (m) =>
          ({
            id: m.id,
            role: m.role,
            content: m.content,
            updated: !!m.updated,
            revisionId: m.revision_id,
            turnId: m.turn_id,
          }) as SavedMessage,
      ),
    };
  }
  async create(
    owner: string,
    input: unknown,
    legacy?: unknown,
    importKey?: string,
  ) {
    const data = validateProject(input);
    if (importKey) {
      const old = await this.stmt(
        'SELECT id FROM projects WHERE owner_id=? AND import_key=?',
        owner,
        importKey,
      ).first<Row>();
      if (old) return this.detail(owner, old.id);
    }
    let history: Revision[];
    try {
      history = legacy
        ? parseHistory(JSON.stringify(legacy))
        : [
            {
              id: 'initial',
              parentId: null,
              createdAt: '',
              prompt: 'Sample tray',
              model: sample,
            },
          ];
    } catch {
      throw new HttpError(
        400,
        'The browser revision history could not be imported.',
      );
    }
    if (history.length > 200)
      throw new HttpError(
        400,
        'Import supports up to 200 revisions at a time. The browser backup has been preserved.',
      );
    const projectId = id(),
      rootId = id(),
      date = now(),
      map = new Map(history.map((r) => [r.id, id()]));
    // Reconstruct forks from parent links without changing the original model history.
    const branchRows: {
      id: string;
      name: string;
      parent: string | null;
      fork: string | undefined | null;
      head: string | undefined;
    }[] = [
      {
        id: rootId,
        name: 'Main',
        parent: null,
        fork: null,
        head: map.get(history[0].id),
      },
    ];
    const branchFor = new Map<string, string>();
    history.forEach((r, i) => {
      let branch = branchRows[0];
      if (i && r.parentId) {
        const parentBranch = branchRows.find(
          (b) => b.id === branchFor.get(r.parentId!),
        )!;
        if (parentBranch?.head === map.get(r.parentId)) branch = parentBranch;
        else {
          branch = {
            id: id(),
            name: `Branch ${branchRows.length + 1}`,
            parent: parentBranch?.id ?? rootId,
            fork: map.get(r.parentId),
            head: map.get(r.id),
          };
          branchRows.push(branch);
        }
      } else if (i) {
        branch = {
          id: id(),
          name: `Branch ${branchRows.length + 1}`,
          parent: null,
          fork: null,
          head: map.get(r.id),
        };
        branchRows.push(branch);
      }
      branch.head = map.get(r.id);
      branchFor.set(r.id, branch.id);
    });
    const last = history.at(-1)!;
    const stmts = [
      this.stmt(
        'INSERT INTO projects (id,owner_id,name,brief,requirements,active_branch_id,selected_revision_id,import_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        projectId,
        owner,
        data.name,
        data.brief,
        data.requirements,
        branchFor.get(last.id),
        map.get(last.id),
        importKey ?? null,
        date,
        date,
      ),
    ];
    for (const b of branchRows)
      stmts.push(
        this.stmt(
          'INSERT INTO branches (id,project_id,name,parent_branch_id,fork_revision_id,head_revision_id,created_at) VALUES (?,?,?,?,?,?,?)',
          b.id,
          projectId,
          b.name,
          b.parent,
          b.fork,
          b.head,
          date,
        ),
      );
    history.forEach((r, i) =>
      stmts.push(
        this.stmt(
          'INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          map.get(r.id),
          projectId,
          branchFor.get(r.id),
          r.parentId ? map.get(r.parentId) : null,
          i,
          JSON.stringify(validateModel(r.model)),
          r.prompt,
          legacy ? 'Imported from browser history.' : '',
          r.createdAt || date,
        ),
      ),
    );
    try {
      await this.db.batch(stmts);
    } catch (e) {
      if (importKey) {
        const existing = await this.stmt(
          'SELECT id FROM projects WHERE owner_id=? AND import_key=?',
          owner,
          importKey,
        ).first<Row>();
        if (existing) return this.detail(owner, existing.id);
      }
      throw e;
    }
    return this.detail(owner, projectId);
  }
  async update(owner: string, projectId: string, input: unknown) {
    await this.own(owner, projectId);
    const p = validateProject(input);
    await this.stmt(
      'UPDATE projects SET name=?,brief=?,requirements=?,updated_at=? WHERE id=? AND owner_id=?',
      p.name,
      p.brief,
      p.requirements,
      now(),
      projectId,
      owner,
    ).run();
    return this.detail(owner, projectId);
  }
  async select(
    owner: string,
    projectId: string,
    branchId: string,
    revisionId?: string,
  ) {
    const detail = await this.detail(owner, projectId);
    const b = detail.branches.find((b) => b.id === branchId);
    if (!b) throw new HttpError(404, 'Branch not found.');
    const target = revisionId ?? b.headRevisionId;
    if (
      !lineage(detail.revisions, b.headRevisionId).some((r) => r.id === target)
    )
      throw new HttpError(400, 'Revision does not belong to this branch.');
    await this.stmt(
      'UPDATE projects SET active_branch_id=?,selected_revision_id=? WHERE id=? AND owner_id=?',
      branchId,
      target,
      projectId,
      owner,
    ).run();
    return this.detail(owner, projectId);
  }
  async fork(
    owner: string,
    projectId: string,
    branchId: string,
    revisionId: string,
  ) {
    const detail = await this.detail(owner, projectId);
    const b = detail.branches.find((b) => b.id === branchId);
    if (
      !b ||
      !lineage(detail.revisions, b.headRevisionId).some(
        (r) => r.id === revisionId,
      )
    )
      throw new HttpError(400, 'Choose a revision in this branch.');
    const newId = id(),
      date = now();
    const cutoff = await this.stmt(
      'SELECT MAX(ordinal) AS cutoff FROM messages WHERE branch_id=? AND revision_id=?',
      branchId,
      revisionId,
    ).first<Row>();
    const ms =
      cutoff?.cutoff == null
        ? []
        : (
            await this.stmt(
              'SELECT * FROM messages WHERE branch_id=? AND ordinal<=? ORDER BY ordinal',
              branchId,
              cutoff.cutoff,
            ).all<Row>()
          ).results;
    const stmts = [
      this.stmt(
        'INSERT INTO branches (id,project_id,name,parent_branch_id,fork_revision_id,head_revision_id,created_at) VALUES (?,?,?,?,?,?,?)',
        newId,
        projectId,
        `Branch ${detail.branches.length + 1}`,
        branchId,
        revisionId,
        revisionId,
        date,
      ),
    ];
    ms.forEach((m) =>
      stmts.push(
        this.stmt(
          'INSERT INTO messages (id,project_id,branch_id,turn_id,ordinal,role,content,revision_id,updated,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          id(),
          projectId,
          newId,
          null,
          m.ordinal,
          m.role,
          m.content,
          m.revision_id,
          m.updated,
          m.created_at,
        ),
      ),
    );
    stmts.push(
      this.stmt(
        'UPDATE projects SET active_branch_id=?,selected_revision_id=?,updated_at=? WHERE id=? AND owner_id=?',
        newId,
        revisionId,
        date,
        projectId,
        owner,
      ),
    );
    await this.db.batch(stmts);
    return this.detail(owner, projectId);
  }
  async begin(owner: string, input: TurnInput) {
    const p = await this.own(owner, input.projectId);
    const old = await this.stmt(
      'SELECT * FROM turns WHERE id=?',
      input.requestId,
    ).first<Row>();
    if (old) {
      if (
        old.project_id !== input.projectId ||
        old.branch_id !== input.branchId ||
        old.base_revision_id !== input.revisionId ||
        old.prompt !== input.message
      )
        throw new HttpError(409, 'This request identifier was already used.');
      if (old.status === 'completed')
        return { cached: JSON.parse(old.result_json) as TurnResult };
      if (old.status === 'pending')
        throw new HttpError(
          409,
          'This request is still running. Reopen the project shortly to check its result.',
        );
      throw new HttpError(
        409,
        'This request did not complete. Send it again as a new request.',
      );
    }
    const time = Date.now();
    const b = await this.stmt(
      'UPDATE branches SET conversation_id=CASE WHEN lock_token IS NOT NULL THEN NULL ELSE conversation_id END,lock_token=?,lock_until=? WHERE id=? AND project_id=? AND head_revision_id=? AND lock_until<? RETURNING *',
      input.requestId,
      time + 180000,
      input.branchId,
      input.projectId,
      input.revisionId,
      time,
    ).first<Row>();
    if (!b)
      throw new HttpError(
        409,
        'This branch changed or has a request in progress. Reload the project before continuing.',
      );
    try {
      await this.db.batch([
        this.stmt(
          "UPDATE turns SET status='failed',error='The previous request expired.' WHERE branch_id=? AND status='pending'",
          input.branchId,
        ),
        this.stmt(
          "INSERT INTO turns (id,project_id,branch_id,base_revision_id,prompt,status,created_at) VALUES (?,?,?,?,?,'pending',?)",
          input.requestId,
          input.projectId,
          input.branchId,
          input.revisionId,
          input.message,
          now(),
        ),
      ]);
    } catch (error) {
      await this.stmt(
        'UPDATE branches SET lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
        input.branchId,
        input.requestId,
      ).run();
      throw error;
    }
    const r = await this.stmt(
      'SELECT * FROM revisions WHERE id=? AND project_id=?',
      input.revisionId,
      input.projectId,
    ).first<Row>();
    if (!r) {
      await this.fail(input, 'Selected revision missing.');
      throw new HttpError(404, 'Revision not found.');
    }
    return { project: p, branch: b, revision: revision(r) };
  }
  async setConversation(input: TurnInput, conversationId: string) {
    const r = await this.stmt(
      'UPDATE branches SET conversation_id=? WHERE id=? AND lock_token=?',
      conversationId,
      input.branchId,
      input.requestId,
    ).run();
    if (!r.meta.changes)
      throw new HttpError(409, 'The request was cancelled or superseded.');
  }
  async history(branchId: string) {
    return (
      await this.stmt(
        'SELECT role,content FROM messages WHERE branch_id=? ORDER BY ordinal',
        branchId,
      ).all<{ role: 'user' | 'assistant'; content: string }>()
    ).results;
  }
  async commit(input: TurnInput, result: TurnResult, volumeSummary: unknown) {
    const date = now(),
      newRevision = result.model ? result.revisionId : input.revisionId;
    const guard =
      'EXISTS (SELECT 1 FROM branches WHERE id=? AND lock_token=? AND head_revision_id=?)';
    const args = [input.branchId, input.requestId, input.revisionId];
    const stmts: D1PreparedStatement[] = [];
    if (result.model)
      stmts.push(
        this.stmt(
          `INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,summary_json,created_at) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM revisions WHERE project_id=?),?,?,?,?,? WHERE ${guard}`,
          newRevision,
          input.projectId,
          input.branchId,
          input.revisionId,
          input.projectId,
          JSON.stringify(result.model),
          input.message,
          result.message,
          JSON.stringify(volumeSummary),
          date,
          ...args,
        ),
      );
    for (const [role, content, updated] of [
      ['user', input.message, 0],
      ['assistant', result.message, result.model ? 1 : 0],
    ])
      stmts.push(
        this.stmt(
          `INSERT INTO messages (id,project_id,branch_id,turn_id,ordinal,role,content,revision_id,updated,created_at) SELECT ?,?,?,?,(SELECT COALESCE(MAX(ordinal),-1)+1 FROM messages WHERE branch_id=?),?,?,?,?,? WHERE ${guard}`,
          id(),
          input.projectId,
          input.branchId,
          input.requestId,
          input.branchId,
          role,
          content,
          newRevision,
          updated,
          date,
          ...args,
        ),
      );
    stmts.push(
      this.stmt(
        `UPDATE turns SET status='completed',result_json=? WHERE id=? AND ${guard}`,
        JSON.stringify(result),
        input.requestId,
        ...args,
      ),
    );
    stmts.push(
      this.stmt(
        `UPDATE projects SET selected_revision_id=CASE WHEN active_branch_id=? AND selected_revision_id=? THEN ? ELSE selected_revision_id END,updated_at=? WHERE id=? AND ${guard}`,
        input.branchId,
        input.revisionId,
        newRevision,
        date,
        input.projectId,
        ...args,
      ),
    );
    stmts.push(
      this.stmt(
        'UPDATE branches SET head_revision_id=?,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=? AND head_revision_id=?',
        newRevision,
        ...args,
      ),
    );
    const outcome = await this.db.batch(stmts);
    if (!outcome.at(-1)?.meta.changes)
      throw new HttpError(
        409,
        'The request was cancelled or superseded; no model was saved.',
      );
  }
  async fail(input: TurnInput, message: string, cancelled = false) {
    await this.db.batch([
      this.stmt(
        "UPDATE turns SET status=?,error=? WHERE id=? AND project_id=? AND status='pending'",
        cancelled ? 'cancelled' : 'failed',
        message,
        input.requestId,
        input.projectId,
      ),
      this.stmt(
        'UPDATE branches SET conversation_id=NULL,lock_token=NULL,lock_until=0 WHERE id=? AND lock_token=?',
        input.branchId,
        input.requestId,
      ),
    ]);
  }
  async cancel(owner: string, raw: unknown) {
    const input = validateTurn(raw);
    await this.own(owner, input.projectId);
    const branch = await this.stmt(
      'SELECT id FROM branches WHERE id=? AND project_id=?',
      input.branchId,
      input.projectId,
    ).first();
    if (!branch) throw new HttpError(404, 'Branch not found.');
    // Record cancellation even if the generation request has not reached begin yet.
    await this.stmt(
      "INSERT INTO turns (id,project_id,branch_id,base_revision_id,prompt,status,created_at) VALUES (?,?,?,?,?,'cancelled',?) ON CONFLICT(id) DO NOTHING",
      input.requestId,
      input.projectId,
      input.branchId,
      input.revisionId,
      input.message,
      now(),
    ).run();
    const t = await this.stmt(
      'SELECT * FROM turns WHERE id=? AND project_id=?',
      input.requestId,
      input.projectId,
    ).first<Row>();
    if (
      !t ||
      t.branch_id !== input.branchId ||
      t.base_revision_id !== input.revisionId ||
      t.prompt !== input.message
    )
      throw new HttpError(409, 'This request identifier was already used.');
    if (t.status === 'pending') await this.fail(input, 'Cancelled.', true);
    const current = await this.stmt(
      'SELECT status FROM turns WHERE id=?',
      input.requestId,
    ).first<Row>();
    return { status: current?.status };
  }
}
