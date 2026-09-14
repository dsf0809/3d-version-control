'use client';
import type { RevisionSummary } from './revisions';
import type { SavedRevision } from './types';
import { NavigationSequence } from './workspace-state';
import {
  readSelection,
  saveSelection,
  projectViewURL,
  type EditingSelection,
} from './navigation';
import { useEffect, useRef, useState } from 'react';
import { compileModel, type Compiled } from '../cad/compile';
import { sample } from '../cad/model';
import { STORAGE_KEY, parseHistory } from '../cad/history';
import { lineage, type ProjectDetail, type ProjectSummary } from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  const r = await fetch(path, {
    ...options,
    headers,
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new ApiError(r.status, data.error || 'The request failed.');
  return data;
}
export async function readProject(
  id: string,
  signal?: AbortSignal,
  selection: Partial<EditingSelection> | undefined = readSelection(id),
) {
  return api<ProjectDetail>(projectViewURL(id, selection), { signal });
}
export function useProjects() {
  const [project, setProject] = useState<ProjectDetail | null>(null),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [geometry, setGeometry] = useState<Compiled | null>(null),
    [proposalGeometry, setProposalGeometry] = useState<Compiled | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [warning, setWarning] = useState('');
  const sequence = useRef(new NavigationSequence());
  const loadController = useRef<AbortController | null>(null);
  const refreshList = async () => {
    const list = await api<ProjectSummary[]>('/api/projects');
    setProjects(list);
    return list;
  };
  const apply = async (
    detail: ProjectDetail,
    signal?: AbortSignal,
    token = sequence.current.current(),
  ) => {
    const r = detail.revisions.find((r) => r.id === detail.selectedRevisionId);
    if (!r) throw new Error('The saved revision could not be found.');
    const pending = detail.proposals.find(
      (p) => p.status === 'pending' && p.baseRevisionId === r.id,
    );
    const [g, pg] = await Promise.all([
      compileModel(r.model, signal),
      pending ? compileModel(pending.model, signal) : Promise.resolve(null),
    ]);
    signal?.throwIfAborted();
    if (!sequence.current.isCurrent(token)) return;
    setProject((previous) => {
      if (previous?.id !== detail.id) return detail;
      const full = [
        ...detail.revisions,
        ...previous.revisions.filter(
          (r) => !detail.revisions.some((n) => n.id === r.id),
        ),
      ].slice(0, 40);
      const index = [
        ...(detail.revisionIndex || detail.revisions),
        ...(previous.revisionIndex || previous.revisions).filter(
          (r) =>
            !(detail.revisionIndex || detail.revisions).some(
              (n) => n.id === r.id,
            ),
        ),
      ];
      return { ...detail, revisions: full, revisionIndex: index };
    });
    setGeometry(g);
    setProposalGeometry(pg);
    try {
      saveSelection(detail.id, {
        branchId: detail.activeBranchId,
        revisionId: detail.selectedRevisionId,
      });
    } catch {
      /* Optional device preference. */
    }
  };
  const load = async (id: string) => {
    const token = sequence.current.next();
    loadController.current?.abort();
    const abort = new AbortController();
    loadController.current = abort;
    setLoading(true);
    setError('');
    try {
      await apply(await readProject(id, abort.signal), abort.signal, token);
    } catch (e) {
      if (
        sequence.current.isCurrent(token) &&
        e instanceof Error &&
        e.name !== 'AbortError'
      )
        setError(e.message);
    } finally {
      if (!abort.signal.aborted && sequence.current.isCurrent(token))
        setLoading(false);
    }
  };
  useEffect(() => {
    const token = sequence.current.next();
    const abort = new AbortController();
    loadController.current = abort;
    void (async () => {
      try {
        let list = await api<ProjectSummary[]>('/api/projects', {
          signal: abort.signal,
        });
        let imported: ProjectDetail | null = null;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const history = parseHistory(raw);
            const digest = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(raw),
            );
            const key =
              'browser-' +
              Array.from(new Uint8Array(digest), (v) =>
                v.toString(16).padStart(2, '0'),
              ).join('');
            if (!localStorage.getItem(key)) {
              imported = await api<ProjectDetail>('/api/projects', {
                method: 'POST',
                signal: abort.signal,
                body: JSON.stringify({
                  name: 'Imported workshop',
                  brief: 'Imported from the previous browser workspace.',
                  legacy: history,
                  importKey: key,
                }),
              });
              localStorage.setItem(key, imported.id);
              list = await api<ProjectSummary[]>('/api/projects', {
                signal: abort.signal,
              });
              setWarning(
                'Your browser revisions were imported. The original browser backup is still preserved.',
              );
            }
          }
        } catch (e) {
          if (abort.signal.aborted) throw e;
          setWarning(
            'Browser history could not be imported automatically. Its original backup is preserved.',
          );
        }
        {
          const demo = await api<ProjectDetail>('/api/projects', {
            method: 'POST',
            signal: abort.signal,
            body: JSON.stringify({
              action: 'demo',
            }),
          });
          if (!list.length) imported = demo;
          if (!list.some((p) => p.id === demo.id)) list = [...list, demo];
        }
        setProjects(list);
        let preferred = '';
        try {
          preferred =
            sessionStorage.getItem('form-active-project') ||
            localStorage.getItem('form-active-project') ||
            '';
        } catch {}
        const chosen =
          imported?.id ||
          list.find((p) => p.id === preferred)?.id ||
          list[0].id;
        await apply(
          imported?.id === chosen
            ? imported
            : await readProject(chosen, abort.signal),
          abort.signal,
          token,
        );
      } catch (e) {
        if (
          sequence.current.isCurrent(token) &&
          e instanceof Error &&
          e.name !== 'AbortError'
        )
          setError(e.message);
      } finally {
        if (!abort.signal.aborted && sequence.current.isCurrent(token))
          setLoading(false);
      }
    })();
    return () => abort.abort();
  }, []);
  const mutate = async (body: any) => {
    const token = sequence.current.next();
    if (body.action === 'select' && project) {
      loadController.current?.abort();
      const abort = new AbortController();
      loadController.current = abort;
      setLoading(true);
      setError('');
      try {
        const p = await api<ProjectDetail>(projectViewURL(project.id, body), {
          signal: abort.signal,
        });
        await apply(p, abort.signal, token);
        return p;
      } catch (e) {
        if (!abort.signal.aborted)
          setError(e instanceof Error ? e.message : 'Could not open revision.');
        throw e;
      } finally {
        if (!abort.signal.aborted && sequence.current.isCurrent(token))
          setLoading(false);
      }
    }
    if (!project) return;
    setLoading(true);
    setError('');
    try {
      const p = await api<ProjectDetail>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      let view =
        body.action === 'fork'
          ? p
          : await readProject(p.id, undefined, {
              branchId: project.activeBranchId,
              revisionId: project.selectedRevisionId,
            });
      const accepted =
        body.action === 'review' && body.decision === 'accept'
          ? p.selectedRevisionId
          : null;
      if (accepted)
        view = await readProject(p.id, undefined, {
          branchId: project.activeBranchId,
          revisionId: accepted,
        });
      await apply(view, undefined, token);
      await refreshList();
      return view;
    } catch (e) {
      if (sequence.current.isCurrent(token))
        setError(e instanceof Error ? e.message : 'Could not save project.');
      throw e;
    } finally {
      if (sequence.current.isCurrent(token)) setLoading(false);
    }
  };
  const create = async (data: {
    startingModel?: unknown;
    name: string;
    brief: string;
    requirements: string;
  }) => {
    const token = sequence.current.next();
    setLoading(true);
    setError('');
    try {
      const p = await api<ProjectDetail>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await apply(p, undefined, token);
      await refreshList();
      return p;
    } catch (e) {
      if (sequence.current.isCurrent(token))
        setError(e instanceof Error ? e.message : 'Could not create project.');
      throw e;
    } finally {
      if (sequence.current.isCurrent(token)) setLoading(false);
    }
  };
  const [loadingMessages, setLoadingMessages] = useState(false);
  const loadOlderMessages = async () => {
    if (!project || project.messageCursor == null || loadingMessages) return;
    const token = sequence.current.current(),
      snapshot = project;
    setLoadingMessages(true);
    try {
      const page = await api<{
        messages: ProjectDetail['messages'];
        messageCursor: number | null;
      }>(
        `/api/projects/${project.id}/messages?branch=${project.activeBranchId}&before=${project.messageCursor}`,
      );
      if (!sequence.current.isCurrent(token)) return;
      setProject((current) =>
        current?.id === snapshot.id &&
        current.activeBranchId === snapshot.activeBranchId
          ? {
              ...current,
              messages: [
                ...page.messages.filter(
                  (m) => !current.messages.some((c) => c.id === m.id),
                ),
                ...current.messages,
              ],
              messageCursor: page.messageCursor,
            }
          : current,
      );
    } catch (e) {
      if (sequence.current.isCurrent(token))
        setError(
          e instanceof Error ? e.message : 'Could not load earlier messages.',
        );
    } finally {
      setLoadingMessages(false);
    }
  };
  const revisionIndex: RevisionSummary[] =
    project?.revisionIndex || project?.revisions || [];
  const revisionRequests = useRef(new Map<string, Promise<SavedRevision>>());
  const ensureRevision = async (id: string) => {
    if (!project) throw new Error('Open a project first.');
    const known = project.revisions.find((r) => r.id === id);
    if (known) return known;
    const key = project.id + ':' + id;
    let pending = revisionRequests.current.get(key);
    if (!pending) {
      pending = api<SavedRevision>(
        `/api/projects/${project.id}/revisions/${id}`,
      );
      revisionRequests.current.set(key, pending);
    }
    try {
      const revision = await pending;
      setProject((current) =>
        current?.id === project.id
          ? {
              ...current,
              revisions: [
                ...current.revisions.filter(
                  (r) => r.id === current.selectedRevisionId && r.id !== id,
                ),
                ...[
                  ...current.revisions.filter(
                    (r) => r.id !== id && r.id !== current.selectedRevisionId,
                  ),
                  revision,
                ].slice(-39),
              ],
            }
          : current,
      );
      return revision;
    } finally {
      revisionRequests.current.delete(key);
    }
  };
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const loadOlderRevisions = async () => {
    if (!project || project.revisionCursor == null || loadingRevisions) return;
    const token = sequence.current.current();
    setLoadingRevisions(true);
    try {
      const page = await api<{
        revisionIndex: RevisionSummary[];
        revisionCursor: number | null;
      }>(
        `/api/projects/${project.id}/revisions?before=${project.revisionCursor}`,
      );
      if (sequence.current.isCurrent(token))
        setProject((current) =>
          current?.id === project.id
            ? {
                ...current,
                revisionIndex: [
                  ...page.revisionIndex,
                  ...(current.revisionIndex || current.revisions).filter(
                    (r) => !page.revisionIndex.some((n) => n.id === r.id),
                  ),
                ],
                revisionCursor: page.revisionCursor,
              }
            : current,
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load revision history.',
      );
    } finally {
      setLoadingRevisions(false);
    }
  };
  const branch = project?.branches.find((b) => b.id === project.activeBranchId);
  const revisions =
    project && branch ? lineage(revisionIndex, branch.headRevisionId) : [];
  const revision = project?.revisions.find(
    (r) => r.id === project.selectedRevisionId,
  );
  const parent = revisionIndex.find((r) => r.id === revision?.parentId);
  const proposal = project?.proposals.find(
    (p) => p.status === 'pending' && p.baseRevisionId === revision?.id,
  );
  return {
    project,
    projects,
    revisionIndex,
    ensureRevision,
    loadOlderRevisions,
    loadingRevisions,
    loadingMessages,
    loadOlderMessages,
    geometry,
    proposalGeometry,
    proposal,
    setGeometry,
    loading,
    error,
    setError,
    warning,
    setWarning,
    load,
    apply,
    refreshList,
    mutate,
    create,
    branch,
    revisions,
    revision,
    parent,
    model: revision?.model || sample,
    selected: revision?.id || '',
    messages: project?.messages || [],
  };
}
export { useProjectChat } from './use-project-chat';
