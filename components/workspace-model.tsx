'use client';
import ModelViewer from '@/components/model-viewer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { useWorkshop } from '@/lib/projects/use-workshop';
import {
  ArrowLeftRight,
  Download,
  LoaderCircle,
  Lock,
  PanelBottomClose,
  PanelBottomOpen,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
export default function WorkspaceModel({
  state,
}: {
  state: ReturnType<typeof useWorkshop>;
}) {
  const {
    workspace,
    proposal,
    revisions,
    revision,
    selected,
    loadingRevision,
    busy,
    phase,
    focusModel,
    mode,
    highlightId,
    setFocusModel,
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
    changes,
    setPickedFeature,
    setTool,
    comparison,
    comparing,
    diffError,
    edited,
    selectRevision,
  } = state;
  const owner = workspace.project?.role === 'owner';
  const locks = workspace.project?.dimensionLocks.length ?? 0;
  const versions = allVersions.map((r) => (
    <option key={r.id} value={r.id}>
      V{r.ordinal} · {r.modelName || 'Revision'}
    </option>
  ));
  const compare = (from: string, to: string) => {
    setHighlightId(null);
    setComparisonSelection({ scope: comparisonScope, from, to });
  };
  const status = !comparisonBase
    ? 'Nothing to compare yet'
    : comparing
      ? 'Comparing…'
      : diffError
        ? diffError
        : comparison &&
            comparison.volumes.added < 0.001 &&
            comparison.volumes.removed < 0.001
          ? 'No changes'
          : '';
  return (
    <section
      className={`viewer-panel ${focusModel ? 'model-focused' : ''}`}
      aria-label="3D visualization"
    >
      <header className="viewer-head">
        <div className="model-label">
          <h2>
            {model.name}
            {showProposal && mode === 'original' && (
              <span className="badge accent">Proposal</span>
            )}
            {!edited && <span className="badge">Sample</span>}
          </h2>
          <p>
            {geometry
              ? geometry.dimensions
                  .map((n) => Number(n.toFixed(1)))
                  .join(' × ') + ' mm'
              : '…'}
          </p>
        </div>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as 'original' | 'comparison')}
        >
          <TabsList aria-label="Visualization mode">
            <TabsTrigger disabled={workspace.loading} value="original">
              Model
            </TabsTrigger>
            <TabsTrigger disabled={workspace.loading} value="comparison">
              Changes
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          className={`quiet icon ${focusModel ? 'active' : ''}`}
          aria-pressed={focusModel}
          aria-label="Focus model"
          title={focusModel ? 'Show controls' : 'Hide controls'}
          onClick={() => setFocusModel((focused) => !focused)}
        >
          {focusModel ? (
            <PanelBottomOpen size={16} />
          ) : (
            <PanelBottomClose size={16} />
          )}
        </button>
      </header>
      {mode === 'comparison' && (
        <div className="compare-bar" aria-label="Choose comparison versions">
          <select
            aria-label="Compare from version"
            value={fromId}
            onChange={(e) => compare(e.target.value, toId)}
          >
            {versions}
          </select>
          <button
            className="quiet icon"
            aria-label="Swap versions"
            title="Swap"
            disabled={toId === 'proposal'}
            onClick={() => compare(toId, fromId)}
          >
            <ArrowLeftRight size={14} />
          </button>
          <select
            aria-label="Compare to version"
            value={toId}
            onChange={(e) => compare(fromId, e.target.value)}
          >
            {versions}
            {proposal && <option value="proposal">Proposal</option>}
          </select>
          <span
            role="status"
            className={diffError && comparisonBase && !comparing ? 'bad' : ''}
          >
            {status}
          </span>
        </div>
      )}
      <div className="model-stage">
        <ModelViewer
          changes={changes}
          onHighlightChange={setHighlightId}
          focusMode={focusModel}
          highlight={
            mode === 'comparison'
              ? (changes.find((c) => c.id === highlightId) ?? null)
              : null
          }
          model={model}
          onSelectFeature={(id) => {
            setPickedFeature(id);
            setTool('edit');
          }}
          geometry={geometry}
          comparison={mode === 'comparison' ? comparison : null}
        />
        {busy && (
          <div className="busy-pill" role="status">
            <LoaderCircle className="spin" size={14} />
            {phase}
          </div>
        )}
      </div>
      <footer className="viewer-foot">
        <div className="revisions" role="group" aria-label="Model revisions">
          {workspace.project?.revisionCursor != null && (
            <button
              className="chip"
              disabled={workspace.loadingRevisions}
              aria-label="Older revisions"
              title="Older revisions"
              onClick={() => void workspace.loadOlderRevisions()}
            >
              {workspace.loadingRevisions ? '…' : '‹'}
            </button>
          )}
          {revisions.map((r) => (
            <button
              key={r.id}
              className="chip"
              disabled={busy || loadingRevision}
              aria-pressed={selected === r.id}
              title={`${r.prompt}${r.authorId ? ' · By ' + r.authorId : ''}${r.mergeParentId ? ' · Merged contribution' : ''}${r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleString() : ''}`}
              onClick={() => void selectRevision(r)}
            >
              V{r.ordinal}
            </button>
          ))}
          {workspace.branch && workspace.branch.headRevisionId !== selected && (
            <button
              className="quiet"
              disabled={busy || loadingRevision}
              title="Make this version the latest"
              onClick={() =>
                void workspace
                  .mutate({
                    action: 'restore',
                    branchId: workspace.branch!.id,
                    revisionId: selected,
                  })
                  .catch(() => {})
              }
            >
              Restore
            </button>
          )}
        </div>
        <nav className="tools" aria-label="Design tools">
          <button
            className="quiet"
            disabled={!revision || !workspace.branch?.canEdit}
            onClick={() => setTool('edit')}
          >
            <SlidersHorizontal size={15} />
            <span>Edit</span>
          </button>
          <button
            className="quiet"
            disabled={!revision || !owner}
            onClick={() => setTool('locks')}
          >
            <Lock size={15} />
            <span>Locks{locks ? ` ${locks}` : ''}</span>
          </button>
          <button
            className="quiet"
            disabled={!revision || !owner}
            onClick={() => setTool('sharing')}
          >
            <Share2 size={15} />
            <span>Share</span>
          </button>
          <button
            className="quiet line"
            disabled={!revision}
            onClick={() => setTool('export')}
          >
            <Download size={15} />
            <span>Export</span>
          </button>
        </nav>
      </footer>
    </section>
  );
}
