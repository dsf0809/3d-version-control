'use client';
import ModelViewer from '@/components/model-viewer';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { useWorkshop } from '@/lib/projects/use-workshop';
import { Download, LoaderCircle } from 'lucide-react';
export default function WorkspaceModel({
  state,
}: {
  state: ReturnType<typeof useWorkshop>;
}) {
  const {
    workspace,
    proposal,
    revisions,
    selected,
    loadingRevision,
    prompt,
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
    comparisonLabel,
    changes,
    setPickedFeature,
    setTool,
    comparison,
    comparing,
    diffError,
    edited,
    selectRevision,
    exportFormat,
    setExportFormat,
    download,
  } = state;
  return (
    <section
      className={`viewer-panel ${focusModel ? 'model-focused' : ''}`}
      aria-label="3D visualization"
    >
      <div className="panel-top">
        <span className="eyebrow">MODEL SPACE</span>
        <span className="unit">mm</span>
      </div>
      <div className="model-label">
        <h2>
          {mode === 'comparison' ? 'Version comparison' : model.name}
          {showProposal && mode === 'original' && (
            <span className="sample-badge">PROPOSAL</span>
          )}
          {!edited && <span className="sample-badge">SAMPLE</span>}
        </h2>
        <p>
          {mode === 'comparison'
            ? comparisonLabel
            : geometry
              ? geometry.dimensions
                  .map((n) => Number(n.toFixed(1)))
                  .join(' × ') + ' mm'
              : 'Preparing solid geometry…'}
        </p>
      </div>
      <div className="view-mode">
        <button
          className="quiet focus-model-toggle"
          aria-pressed={focusModel}
          onClick={() => setFocusModel((focused) => !focused)}
          title="Expand the canvas by hiding comparison and history controls"
        >
          {focusModel ? 'Show controls' : 'Focus model'}
        </button>
        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as 'original' | 'comparison')}
        >
          <TabsList aria-label="Visualization mode" className="view-mode-list">
            <TabsTrigger disabled={workspace.loading} value="original">
              Model Original
            </TabsTrigger>
            <TabsTrigger disabled={workspace.loading} value="comparison">
              Changes Comparison
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {mode === 'comparison' && (
        <div
          className="comparison-picker"
          aria-label="Choose comparison versions"
        >
          <label>
            From
            <select
              aria-label="Compare from version"
              value={fromId}
              onChange={(e) => {
                setHighlightId(null);
                setComparisonSelection({
                  scope: comparisonScope,
                  from: e.target.value,
                  to: toId,
                });
              }}
            >
              {allVersions.map((r) => (
                <option key={r.id} value={r.id}>
                  V{r.ordinal} · {r.modelName || 'Revision'}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label>
            To
            <select
              aria-label="Compare to version"
              value={toId}
              onChange={(e) => {
                setHighlightId(null);
                setComparisonSelection({
                  scope: comparisonScope,
                  from: fromId,
                  to: e.target.value,
                });
              }}
            >
              {allVersions.map((r) => (
                <option key={r.id} value={r.id}>
                  V{r.ordinal} · {r.modelName || 'Revision'}
                </option>
              ))}
              {proposal && <option value="proposal">Pending proposal</option>}
            </select>
          </label>
          <button
            className="quiet"
            disabled={toId === 'proposal'}
            onClick={() => {
              setHighlightId(null);
              setComparisonSelection({
                scope: comparisonScope,
                from: toId,
                to: fromId,
              });
            }}
          >
            Swap
          </button>
        </div>
      )}
      {mode === 'comparison' && (
        <div className="comparison-caption" role="status">
          {!comparisonBase ? (
            'No previous version yet. Send a model edit to create a comparison.'
          ) : comparing ? (
            'Computing solid differences…'
          ) : diffError ? (
            `Comparison unavailable: ${diffError}`
          ) : comparison ? (
            <>
              <span className="diff-pair">{comparisonLabel}</span>
              {comparison.volumes.added < 0.001 &&
                comparison.volumes.removed < 0.001 && (
                  <span>No geometric changes</span>
                )}
            </>
          ) : null}
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
      </div>
      <div className="revision-strip">
        <div className="revision-strip-label">
          REVISIONS <span>Saved in this project</span>
          {workspace.branch && workspace.branch.headRevisionId !== selected && (
            <button
              className="quiet"
              disabled={busy || loadingRevision}
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
              Restore this version
            </button>
          )}
        </div>
        <div className="revision-buttons" aria-label="Model revisions">
          {workspace.project?.revisionCursor != null && (
            <button
              className="quiet"
              disabled={workspace.loadingRevisions}
              onClick={() => void workspace.loadOlderRevisions()}
            >
              {workspace.loadingRevisions ? 'Loading…' : 'Older revisions'}
            </button>
          )}
          {revisions.map((r) => (
            <button
              key={r.id}
              className={`revision-button ${selected === r.id ? 'selected' : ''}`}
              disabled={busy || loadingRevision}
              aria-pressed={selected === r.id}
              title={`${r.prompt}${r.authorId ? ' · By ' + r.authorId : ''}${r.mergeParentId ? ' · Merged contribution' : ''}${r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleString() : ''}`}
              onClick={() => void selectRevision(r)}
            >
              V{r.ordinal}
              <span>{r.parentId ? r.modelName || 'Revision' : 'Sample'}</span>
            </button>
          ))}
        </div>
      </div>
      {busy && (
        <div className="busy-pill" role="status">
          <LoaderCircle className="spin" size={15} />
          {phase}
        </div>
      )}
      <div className="viewer-bottom">
        <span>Drag to orbit · Scroll to zoom</span>
        <select
          aria-label="Export format"
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value as 'stl' | '3mf')}
        >
          <option value="3mf">3MF (mm + color)</option>
          <option value="stl">STL</option>
        </select>
        <button
          className="quiet"
          onClick={download}
          disabled={!geometry || busy || loadingRevision}
        >
          <Download size={16} />{' '}
          {`Export ${proposal ? 'accepted ' : ''}${exportFormat.toUpperCase()}`}
        </button>
      </div>
    </section>
  );
}
