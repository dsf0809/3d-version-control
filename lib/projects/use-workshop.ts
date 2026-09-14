import { saveExport } from './download';
'use client';
import { useEffect, useRef, useState } from 'react';
import { featureChanges } from '../cad/changes';
import { compileComparison, type Comparison } from '../cad/compile';
import { useProjectChat, useProjects } from './client';
import { useWorkspaceView } from './use-workspace-view';
export function useWorkshop() {
  const workspace = useProjects();
  const chat = useProjectChat(workspace);
  const {
    model: acceptedModel,
    geometry: acceptedGeometry,
    proposal,
    proposalGeometry,
    messages,
    error,
    setError,
    revisions,
    selected,
    revision,
    parent,
    loading: loadingRevision,
    warning: storageWarning,
  } = workspace;
  const { prompt, setPrompt, busy, phase } = chat;
  const view = useWorkspaceView(workspace.project?.id || '');
  const {
    focus: focusModel,
    hiddenProposal,
    mode,
    highlightId,
  } = view.state.viewer;
  const setFocusModel = (fn: (value: boolean) => boolean) =>
    view.dispatch({ type: 'viewer', value: { focus: fn(focusModel) } });
  const setHiddenProposal = (value: string | null) =>
    view.dispatch({ type: 'viewer', value: { hiddenProposal: value } });
  const setMode = (value: 'original' | 'comparison') =>
    view.dispatch({ type: 'viewer', value: { mode: value } });
  const setHighlightId = (value: string | null) =>
    view.dispatch({ type: 'viewer', value: { highlightId: value } });
  const showProposal = !!proposal && hiddenProposal !== proposal.id;
  const model = showProposal ? proposal.model : acceptedModel;
  const geometry = showProposal ? proposalGeometry : acceptedGeometry;
  const comparisonScope = workspace.project?.id || '';
  const allVersions = workspace.revisionIndex.map((r) => ({
    ...r,
    model: workspace.project?.revisions.find((full) => full.id === r.id)?.model,
  }));
  const comparisonSelection = view.state.comparison;
  const setComparisonSelection = (
    value: { scope: string; from: string; to: string } | null,
  ) =>
    view.dispatch({
      type: 'comparison',
      value: value ? { from: value.from, to: value.to } : null,
    });
  const customPair =
    comparisonSelection &&
    allVersions.some((r) => r.id === comparisonSelection.from) &&
    (comparisonSelection.to === 'proposal'
      ? !!proposal
      : allVersions.some((r) => r.id === comparisonSelection.to))
      ? comparisonSelection
      : null;
  const fromId =
    customPair?.from ??
    (showProposal ? revision?.id : parent?.id) ??
    revision?.id ??
    '';
  const toId =
    customPair?.to ?? (showProposal ? 'proposal' : (revision?.id ?? ''));
  const comparisonBase = allVersions.find((r) => r.id === fromId);
  const comparisonTarget =
    toId === 'proposal'
      ? proposal?.model
      : allVersions.find((r) => r.id === toId)?.model;
  useEffect(() => {
    if (mode !== 'comparison' || loadingRevision) return;
    const abort = new AbortController();
    for (const id of new Set(
      [fromId, toId].filter((id) => id && id !== 'proposal'),
    ))
      if (!workspace.project?.revisions.some((r) => r.id === id))
        void workspace.ensureRevision(id).catch((e) => {
          if (!abort.signal.aborted) setError(e.message);
        });
    return () => abort.abort();
  }, [fromId, toId, mode, loadingRevision, workspace.project?.id]);
  const comparisonLabel = `V${comparisonBase?.ordinal ?? '—'} → ${toId === 'proposal' ? 'Proposal' : `V${allVersions.find((r) => r.id === toId)?.ordinal ?? '—'}`}`;
  const changes =
    comparisonBase?.model && comparisonTarget
      ? featureChanges(comparisonBase.model, comparisonTarget)
      : [];
  const review = async (decision: 'accept' | 'discard') => {
    if (!proposal || busy || loadingRevision) return;
    try {
      await workspace.mutate({
        action: 'review',
        proposalId: proposal.id,
        decision,
      });
      setPrompt('');
    } catch (error) {
      if (workspace.project) await workspace.load(workspace.project.id);
      setError(
        error instanceof Error
          ? error.message
          : 'Could not review the proposal.',
      );
    }
  };
  const [setup, setSetup] = useState(false);
  const [pickedFeature, setPickedFeature] = useState<string | null>(null);
  const [tool, setTool] = useState<
    'edit' | 'locks' | 'export' | 'sharing' | null
  >(null);
  const [status, setStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [diffError, setDiffError] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const edited = !!revision?.parentId;
  const revisionNumber = revision?.ordinal ?? 0;
  const refreshStatus = () => {
    setStatusError(false);
    return fetch('/api/status')
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ configured: boolean; model: string }>;
      })
      .then(setStatus)
      .catch(() => setStatusError(true));
  };
  useEffect(() => {
    refreshStatus();
  }, []);
  useEffect(() => {
    setComparison(null);
    setDiffError('');
    if (
      mode !== 'comparison' ||
      !comparisonBase?.model ||
      !comparisonTarget ||
      loadingRevision
    ) {
      setComparing(false);
      return;
    }
    const abort = new AbortController();
    setComparing(true);
    compileComparison(comparisonBase.model, comparisonTarget, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setComparison(result);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setDiffError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setComparing(false);
      });
    return () => abort.abort();
  }, [
    mode,
    selected,
    comparisonTarget,
    comparisonBase?.id,
    comparisonBase?.model,
    loadingRevision,
  ]);
  const selectRevision = async (r: { id: string }) => {
    if (busy || loadingRevision || r.id === selected || !workspace.project)
      return;
    try {
      await workspace.mutate({
        action: 'select',
        branchId: workspace.project.activeBranchId,
        revisionId: r.id,
      });
    } catch {
      /* The project hook displays the error. */
    }
  };
  useEffect(() => {
    conversation.current?.scrollTo({
      top: conversation.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.at(-1)?.id, busy]);
  const send = async () => {
    if (!prompt.trim() || busy || loadingRevision) return;
    if (!status?.configured) {
      setSetup(true);
      return;
    }
    const result = await chat.send();
    if (result?.model) {
      setComparisonSelection(null);
      setHiddenProposal(null);
      setMode('comparison');
    }
    input.current?.focus();
  };
  const [exportFormat, setExportFormat] = useState<'stl' | '3mf'>('3mf');
  const download = async (format: 'stl' | '3mf' | 'json' = exportFormat) => {
    if (!workspace.project || !revision) return;
    try {
      await saveExport(`/api/projects/${workspace.project.id}/export?revision=${revision.id}&format=${format}`, `${acceptedModel.name}-v${revisionNumber}.${format}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
  };
  return {
    workspace,
    chat,
    proposal,
    messages,
    error,
    setError,
    revisions,
    selected,
    revision,
    loadingRevision,
    storageWarning,
    prompt,
    setPrompt,
    busy,
    phase,
    focusModel,
    mode,
    highlightId,
    setFocusModel,
    setHiddenProposal,
    setMode,
    setHighlightId,
    showProposal,
    model,
    geometry,
    comparisonScope,
    allVersions,
    setComparisonSelection,
    fromId,
    toId,
    comparisonBase,
    comparisonLabel,
    changes,
    review,
    setup,
    setSetup,
    pickedFeature,
    setPickedFeature,
    tool,
    setTool,
    status,
    statusError,
    comparison,
    comparing,
    diffError,
    conversation,
    input,
    edited,
    revisionNumber,
    refreshStatus,
    selectRevision,
    send,
    exportFormat,
    setExportFormat,
    download,
  };
}
