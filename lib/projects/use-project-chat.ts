'use client';
import { useState, useRef, useEffect } from 'react';
import { api, readProject, ApiError, type useProjects } from './client';
import type { ProjectDetail, TurnInput, TurnResult } from './types';
import type { TurnStatus } from './turn-status';
export function useProjectChat(workspace: ReturnType<typeof useProjects>) {
  const [prompt, setPrompt] = useState(''),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState('');
  const busyRef = useRef(false),
    controller = useRef<AbortController | null>(null),
    retry = useRef<TurnInput | null>(null);
  const explicitlyCancelled = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const pendingKey = `form-pending-turn:${workspace.project?.id || ''}:${workspace.branch?.id || ''}`;
  useEffect(() => {
    if (!workspace.project || workspace.loading || busyRef.current) return;
    let saved: TurnInput | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    } catch {}
    if (
      !saved ||
      saved.projectId !== workspace.project.id ||
      saved.branchId !== workspace.branch?.id
    )
      return;
    const input = saved,
      abort = new AbortController();
    controller.current = abort;
    busyRef.current = true;
    setBusy(true);
    const poll = async () => {
      try {
        for (;;) {
          const status = await api<TurnStatus>(
            `/api/projects/${input.projectId}/turns/${input.requestId}`,
            {
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(15000),
              ]),
            },
          );
          if (status.status !== 'pending') {
            sessionStorage.removeItem(pendingKey);
            if (status.status === 'completed' && status.result) {
              await workspace.apply(
                await readProject(input.projectId, abort.signal, {
                  branchId: input.branchId,
                  revisionId: status.result.revisionId,
                }),
                abort.signal,
              );
              await workspace.refreshList();
              workspace.setWarning('Recovered the saved AI response.');
            } else {
              workspace.setError(
                status.error ||
                  'The request stopped. Your accepted model is unchanged.',
              );
              setPrompt(input.message);
            }
            break;
          }
          setPhase(phaseLabel(status.phase));
          await new Promise<void>((resolve, reject) => {
            const stop = () => {
              clearTimeout(timer);
              reject(new DOMException('Cancelled', 'AbortError'));
            };
            const timer = setTimeout(() => {
              abort.signal.removeEventListener('abort', stop);
              resolve();
            }, 2000);
            abort.signal.addEventListener('abort', stop, { once: true });
          });
        }
      } catch (e) {
        if (!abort.signal.aborted)
          workspace.setError(
            e instanceof Error
              ? e.message
              : 'Could not recover request status.',
          );
        if (e instanceof ApiError && e.status === 404)
          try {
            sessionStorage.removeItem(pendingKey);
          } catch {}
      } finally {
        busyRef.current = false;
        setBusy(false);
        setPhase('');
        controller.current = null;
      }
    };
    void poll();
    return () => abort.abort();
  }, [workspace.project?.id, workspace.branch?.id, workspace.loading]);
  const send = async () => {
    const text = prompt.trim();
    if (
      workspace.project?.role === 'viewer' ||
      !text ||
      busyRef.current ||
      workspace.loading ||
      !workspace.project
    )
      return;
    busyRef.current = true;
    setBusy(true);
    explicitlyCancelled.current = false;
    setPhase('Continuing your design');
    workspace.setError('');
    setPrompt('');
    const abort = new AbortController();
    controller.current = abort;
    let input: TurnInput | null = null;
    try {
      let p = workspace.project;
      const b = p.branches.find((b) => b.id === p.activeBranchId)!;
      if (b.canEdit === false || b.headRevisionId !== p.selectedRevisionId) {
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
        (retry.current.proposalId ?? null) ===
          (p.proposals.find((q) => q.status === 'pending')?.id ?? null) &&
        retry.current.message === text
          ? retry.current
          : {
              projectId: p.id,
              branchId: p.activeBranchId,
              revisionId: p.selectedRevisionId,
              message: text,
              requestId: crypto.randomUUID(),
              proposalId:
                p.proposals.find((q) => q.status === 'pending')?.id ?? null,
            };
      retry.current = input;
      try {
        sessionStorage.setItem(
          `form-pending-turn:${input.projectId}:${input.branchId}`,
          JSON.stringify(input),
        );
      } catch {}
      setPhase('Designing your part');
      const submission = await api<TurnResult | { queued: true }>('/api/chat', {
        method: 'POST',
        signal: abort.signal,
        body: JSON.stringify(input),
      });
      let result: TurnResult;
      if ('queued' in submission) {
        for (;;) {
          const status = await api<TurnStatus>(
            `/api/projects/${input.projectId}/turns/${input.requestId}`,
            { signal: abort.signal },
          );
          if (status.status === 'completed' && status.result) {
            result = status.result;
            break;
          }
          if (status.status !== 'pending')
            throw new Error(status.error || 'Generation stopped.');
          setPhase(phaseLabel(status.phase));
          await new Promise<void>((resolve, reject) => {
            const stop = () => {
              clearTimeout(timer);
              reject(new DOMException('Cancelled', 'AbortError'));
            };
            const timer = setTimeout(() => {
              abort.signal.removeEventListener('abort', stop);
              resolve();
            }, 1500);
            abort.signal.addEventListener('abort', stop, { once: true });
          });
        }
      } else result = submission;
      setPhase('Opening saved revision');
      await workspace.apply(
        await readProject(p.id, abort.signal, {
          branchId: input.branchId,
          revisionId: result.revisionId,
        }),
        abort.signal,
      );
      await workspace.refreshList();
      retry.current = null;
      try {
        sessionStorage.removeItem(
          `form-pending-turn:${input.projectId}:${input.branchId}`,
        );
      } catch {}
      return result;
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Generation failed.';
      if (abort.signal.aborted && input && explicitlyCancelled.current) {
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
        let saved = await readProject(input?.projectId || workspace.project.id);
        const completed =
          input &&
          saved.messages.find(
            (m) =>
              m.role === 'assistant' &&
              m.turnId === input?.requestId &&
              m.updated,
          );
        if (completed)
          saved = await readProject(saved.id, undefined, {
            branchId: input!.branchId,
            revisionId: completed.revisionId,
          });
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
    cancel: () => {
      explicitlyCancelled.current = true;
      controller.current?.abort();
      try {
        const input = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
        if (input)
          void api('/api/chat/cancel', {
            method: 'POST',
            body: JSON.stringify(input),
          })
            .then(() => sessionStorage.removeItem(pendingKey))
            .catch(() =>
              workspace.setError(
                'Cancellation could not be confirmed. Reopen this project to check.',
              ),
            );
      } catch {}
    },
  };
}

export function phaseLabel(phase: string) {
  return (
    (
      {
        queued: 'Queued for generation',
        context: 'Restoring project context',
        generating: 'Designing your part',
        validating: 'Checking geometry and dimension locks',
        saving: 'Saving your changes',
      } as Record<string, string>
    )[phase] || 'Checking saved request'
  );
}
