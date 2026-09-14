import { buildGeometry } from '../cad/geometry';
import { parseHistory, type Revision } from '../cad/history';
import { sample, upgradeModel } from '../cad/model';
import { demoHistory, demoProject } from './demo';
import { HttpError } from './http';
import { getLocks } from './locks';
import { messagePage } from './messages';
import { listProposals } from './proposals';
import {
  lineage,
  type ProjectDetail,
  type SavedMessage,
  type TurnInput,
  type TurnResult,
} from './types';

import {
  id,
  now,
  revision,
  summary,
  validateProject,
  type Row,
} from './store-shared';
import * as turnTransactions from './turn-transactions';
export { validateProject, validateTurn } from './store-shared';
export class ProjectStore {
  constructor(public db: D1Database) {}
  stmt(sql: string, ...args: unknown[]) {
    return this.db.prepare(sql).bind(...args);
  }
  async own(
    owner: string,
    projectId: string,
    required: 'view' | 'edit' | 'owner' = 'edit',
  ) {
    const p = await this.stmt(
      "SELECT p.*,CASE WHEN p.owner_id=? THEN 'owner' ELSE m.role END AS access_role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.id=? AND (p.owner_id=? OR m.user_id IS NOT NULL)",
      owner,
      owner,
      projectId,
      owner,
    ).first<Row>();
    if (!p) throw new HttpError(404, 'Project not found.');
    if (
      (required === 'owner' && p.access_role !== 'owner') ||
      (required === 'edit' && p.access_role === 'viewer')
    )
      throw new HttpError(403, 'Your project role does not allow this action.');
    return p;
  }
  async assertBranchWrite(actor: string, projectId: string, branchId: string) {
    const p = await this.own(actor, projectId);
    const b = await this.stmt(
      'SELECT * FROM branches WHERE id=? AND project_id=?',
      branchId,
      projectId,
    ).first<Row>();
    if (!b) throw new HttpError(404, 'Branch not found.');
    if (
      p.access_role !== 'owner' &&
      (!b.parent_branch_id || b.created_by !== actor)
    )
      throw new HttpError(
        403,
        'Create your own contributor branch to edit this design.',
      );
    return b;
  }
  async list(owner: string) {
    const r = await this.stmt(
      "SELECT p.*,CASE WHEN p.owner_id=? THEN 'owner' ELSE m.role END AS access_role FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=? WHERE p.owner_id=? OR m.user_id IS NOT NULL ORDER BY p.updated_at DESC,p.id",
      owner,
      owner,
      owner,
    ).all<Row>();
    return r.results.map(summary);
  }
  async detail(
    owner: string,
    projectId: string,
    view?: { branchId?: string; revisionId?: string; pageMessages?: boolean },
  ): Promise<ProjectDetail> {
    const p = await this.own(owner, projectId, 'view');
    const branchId = view?.branchId || p.active_branch_id;
    const branch = await this.stmt(
      'SELECT * FROM branches WHERE id=? AND project_id=?',
      branchId,
      projectId,
    ).first<Row>();
    if (!branch) throw new HttpError(404, 'Branch not found.');
    const selectedId =
      view?.revisionId ||
      (view?.branchId ? branch.head_revision_id : p.selected_revision_id);
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
        view?.pageMessages
          ? 'SELECT * FROM messages WHERE branch_id=? AND 0'
          : 'SELECT * FROM messages WHERE branch_id=? ORDER BY ordinal',
        branchId,
      ),
    ]);
    if (
      view?.revisionId &&
      !lineage(rs.results.map(revision), branch.head_revision_id).some(
        (r) => r.id === selectedId,
      )
    )
      throw new HttpError(404, 'Revision is not in this branch history.');
    // Persist an idempotent data upgrade while preserving the original geometry.
    const upgrades = rs.results
      .filter((r) => JSON.parse(r.model_json).schemaVersion !== 2)
      .map((r) =>
        this.stmt(
          'UPDATE revisions SET model_json=? WHERE id=? AND model_json=?',
          JSON.stringify(upgradeModel(JSON.parse(r.model_json))),
          r.id,
          r.model_json,
        ),
      );
    if (upgrades.length) await this.db.batch(upgrades);
    const page = view?.pageMessages
      ? await messagePage(this, owner, projectId, branchId)
      : null;
    return {
      ...summary(p),
      activeBranchId: branchId,
      selectedRevisionId: selectedId,
      proposals: await listProposals(this, branchId),
      dimensionLocks: await getLocks(this, projectId),
      branches: bs.results.map((b) => ({
        id: b.id,
        name: b.name,
        headRevisionId: b.head_revision_id,
        parentBranchId: b.parent_branch_id,
        forkRevisionId: b.fork_revision_id,
        conversationReady: !!b.conversation_id,
        createdBy: b.created_by || p.owner_id,
        canEdit:
          p.access_role === 'owner' ||
          (p.access_role === 'editor' &&
            !!b.parent_branch_id &&
            b.created_by === owner),
      })),
      revisions: rs.results.map(revision),
      ...(page ? { messageCursor: page.messageCursor } : {}),
      messages: page
        ? page.messages
        : ms.results.map(
            (m) =>
              ({
                id: m.id,
                role: m.role,
                content: m.content,
                updated: !!m.updated,
                revisionId: m.revision_id,
                turnId: m.turn_id,
                proposalId: m.proposal_id,
              }) as SavedMessage,
          ),
    };
  }
  async demo(owner: string) {
    return this.create(
      owner,
      demoProject,
      demoHistory(),
      'built-in-tray-demo-v1',
      'demo',
    );
  }
  async create(
    owner: string,
    input: unknown,
    legacy?: unknown,
    importKey?: string,
    source: 'browser' | 'demo' = 'browser',
  ) {
    const data = validateProject(input);
    const starting = (input as { startingModel?: unknown }).startingModel;
    let startingModel;
    if (starting !== undefined) {
      try {
        startingModel = upgradeModel(starting);
        buildGeometry(startingModel);
      } catch {
        throw new HttpError(
          400,
          'Import a valid Form model JSON containing supported solid features.',
        );
      }
      if (legacy)
        throw new HttpError(
          400,
          'Choose either a starting model or revision history.',
        );
    }
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
              prompt: startingModel ? 'Imported local model' : 'Sample tray',
              model: startingModel ?? sample,
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
          'INSERT INTO branches (id,project_id,name,parent_branch_id,fork_revision_id,head_revision_id,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)',
          b.id,
          projectId,
          b.name,
          b.parent,
          b.fork,
          b.head,
          date,
          owner,
        ),
      );
    history.forEach((r, i) =>
      stmts.push(
        this.stmt(
          'INSERT INTO revisions (id,project_id,branch_id,parent_id,ordinal,model_json,prompt,answer,created_at,author_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
          map.get(r.id),
          projectId,
          branchFor.get(r.id),
          r.parentId ? map.get(r.parentId) : null,
          i,
          JSON.stringify(upgradeModel(r.model)),
          r.prompt,
          source === 'demo'
            ? r.prompt
            : legacy
              ? 'Imported from browser history.'
              : '',
          r.createdAt || date,
          owner,
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
  async archive(owner: string, projectId: string, archived: unknown) {
    await this.own(owner, projectId, 'owner');
    if (typeof archived !== 'boolean')
      throw new HttpError(400, 'Choose archive or restore.');
    await this.stmt(
      'UPDATE projects SET archived=?,updated_at=? WHERE id=? AND owner_id=?',
      Number(archived),
      new Date().toISOString(),
      projectId,
      owner,
    ).run();
    return this.detail(owner, projectId);
  }
  async update(owner: string, projectId: string, input: unknown) {
    await this.own(owner, projectId, 'owner');
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
    await this.own(owner, projectId);
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
        'INSERT INTO branches (id,project_id,name,parent_branch_id,fork_revision_id,head_revision_id,created_at,created_by) VALUES (?,?,?,?,?,?,?,?)',
        newId,
        projectId,
        `Branch ${detail.branches.length + 1}`,
        branchId,
        revisionId,
        revisionId,
        date,
        owner,
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
    return this.detail(owner, projectId, { branchId: newId });
  }
  async begin(owner: string, input: TurnInput) {
    return turnTransactions.begin.call(this, owner, input);
  }
  async setConversation(input: TurnInput, conversationId: string) {
    return turnTransactions.setConversation.call(this, input, conversationId);
  }
  async history(branchId: string) {
    return turnTransactions.history.call(this, branchId);
  }
  async setApprovalMode(owner: string, projectId: string, mode: unknown) {
    return turnTransactions.setApprovalMode.call(this, owner, projectId, mode);
  }
  async commit(
    input: TurnInput,
    result: TurnResult,
    volumeSummary: unknown,
    automatic = false,
  ) {
    return turnTransactions.commit.call(
      this,
      input,
      result,
      volumeSummary,
      automatic,
    );
  }
  async fail(input: TurnInput, message: string, cancelled = false) {
    return turnTransactions.fail.call(this, input, message, cancelled);
  }
  async cancel(owner: string, raw: unknown) {
    return turnTransactions.cancel.call(this, owner, raw);
  }
}
