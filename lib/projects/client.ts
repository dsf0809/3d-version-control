'use client';
import { useEffect, useRef, useState } from 'react';
import { compileModel, type Compiled } from '../cad/compile';
import { sample } from '../cad/model';
import { STORAGE_KEY, parseHistory } from '../cad/history';
import {
  lineage,
  type ProjectDetail,
  type ProjectSummary,
  type TurnInput,
  type TurnResult,
} from './types';
class ApiError extends Error {
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
export function useProjects() {
  const [project, setProject] = useState<ProjectDetail | null>(null),
    [projects, setProjects] = useState<ProjectSummary[]>([]),
    [geometry, setGeometry] = useState<Compiled | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [warning, setWarning] = useState('');
  const loadController = useRef<AbortController | null>(null);
  const refreshList = async () => {
    const list = await api<ProjectSummary[]>('/api/projects');
    setProjects(list);
    return list;
  };
  const apply = async (detail: ProjectDetail, signal?: AbortSignal) => {
    const r = detail.revisions.find((r) => r.id === detail.selectedRevisionId);
    if (!r) throw new Error('The saved revision could not be found.');
    const g = await compileModel(r.model, signal);
    signal?.throwIfAborted();
    setProject(detail);
    setGeometry(g);
    try {
      localStorage.setItem('form-active-project', detail.id);
    } catch {
      /* Optional device preference. */
    }
  };
  const load = async (id: string) => {
    loadController.current?.abort();
    const abort = new AbortController();
    loadController.current = abort;
    setLoading(true);
    setError('');
    try {
      await apply(
        await api<ProjectDetail>(`/api/projects/${id}`, {
          signal: abort.signal,
        }),
        abort.signal,
      );
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setError(e.message);
    } finally {
      if (!abort.signal.aborted) setLoading(false);
    }
  };
  useEffect(() => {
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
          preferred = localStorage.getItem('form-active-project') || '';
        } catch {}
        const chosen =
          imported?.id ||
          list.find((p) => p.id === preferred)?.id ||
          list[0].id;
        await apply(
          imported?.id === chosen
            ? imported
            : await api<ProjectDetail>(`/api/projects/${chosen}`, {
                signal: abort.signal,
              }),
          abort.signal,
        );
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') setError(e.message);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, []);
  const mutate = async (body: unknown) => {
    if (!project) return;
    setLoading(true);
    setError('');
    try {
      const p = await api<ProjectDetail>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await apply(p);
      await refreshList();
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save project.');
      throw e;
    } finally {
      setLoading(false);
    }
  };
  const create = async (data: {
    name: string;
    brief: string;
    requirements: string;
  }) => {
    setLoading(true);
    setError('');
    try {
      const p = await api<ProjectDetail>('/api/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await apply(p);
      await refreshList();
      return p;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create project.');
      throw e;
    } finally {
      setLoading(false);
    }
  };
  const branch = project?.branches.find((b) => b.id === project.activeBranchId);
  const revisions =
    project && branch ? lineage(project.revisions, branch.headRevisionId) : [];
  const revision = project?.revisions.find(
    (r) => r.id === project.selectedRevisionId,
  );
  const parent = project?.revisions.find((r) => r.id === revision?.parentId);
  return {
    project,
    projects,
    geometry,
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
export function useProjectChat(workspace: ReturnType<typeof useProjects>) {
  const [prompt, setPrompt] = useState(''),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState('');
  const busyRef = useRef(false),
    controller = useRef<AbortController | null>(null),
    retry = useRef<TurnInput | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const send = async () => {
    const text = prompt.trim();
    if (!text || busyRef.current || workspace.loading || !workspace.project)
      return;
    busyRef.current = true;
    setBusy(true);
    setPhase('Continuing your design');
    workspace.setError('');
    setPrompt('');
    const abort = new AbortController();
    controller.current = abort;
    let input: TurnInput | null = null;
    try {
      let p = workspace.project;
      const b = p.branches.find((b) => b.id === p.activeBranchId)!;
      if (b.headRevisionId !== p.selectedRevisionId) {
        setPhase('Starting a design branch');
        p = await api<ProjectDetail>(`/api/projects/${p.id}`, {
          method: 'PATCH',
          signal: abort.signal,
          body: JSON.stringify({
            action: 'fork',
            branchId: b.id,
            revisionId: p.selectedRevisionId,
          }),
        });
        await workspace.apply(p, abort.signal);
      }
      input =
        retry.current &&
        retry.current.projectId === p.id &&
        retry.current.branchId === p.activeBranchId &&
        retry.current.revisionId === p.selectedRevisionId &&
        retry.current.message === text
          ? retry.current
          : {
              projectId: p.id,
              branchId: p.activeBranchId,
              revisionId: p.selectedRevisionId,
              message: text,
              requestId: crypto.randomUUID(),
            };
      retry.current = input;
      setPhase('Designing your part');
      const result = await api<TurnResult>('/api/chat', {
        method: 'POST',
        signal: abort.signal,
        body: JSON.stringify(input),
      });
      setPhase('Opening saved revision');
      await workspace.apply(
        await api<ProjectDetail>(`/api/projects/${p.id}`, {
          signal: abort.signal,
        }),
        abort.signal,
      );
      await workspace.refreshList();
      retry.current = null;
      return result;
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Generation failed.';
      if (abort.signal.aborted && input) {
        try {
          const result = await api<{ status: string }>('/api/chat/cancel', {
            method: 'POST',
            body: JSON.stringify(input),
          });
          message =
            result.status === 'completed'
              ? 'The response finished before cancellation; the saved result has been restored.'
              : 'Generation cancelled. The previous model is preserved.';
        } catch {
          message =
            'Cancellation could not be confirmed. Reopen the project to check its saved state.';
        }
        retry.current = null;
      }
      // Reconcile an uncertain network result with the authoritative saved state.
      let restored = false;
      try {
        const saved = await api<ProjectDetail>(
          `/api/projects/${input?.projectId || workspace.project.id}`,
        );
        await workspace.apply(saved);
        restored =
          !!input &&
          saved.messages.some(
            (m) => m.role === 'assistant' && m.turnId === input?.requestId,
          );
        if (restored) {
          retry.current = null;
          message =
            'The response was saved successfully. Your project has been restored.';
        }
      } catch {}
      if (
        e instanceof ApiError ||
        /still running|already used|did not complete|changed or has/.test(
          message,
        )
      )
        retry.current = null;
      workspace.setError(message);
      setPrompt(restored ? '' : text);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase('');
      controller.current = null;
    }
  };
  return {
    prompt,
    setPrompt,
    busy,
    phase,
    send,
    cancel: () => controller.current?.abort(),
  };
}
