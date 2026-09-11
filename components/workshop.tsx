'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  ArrowUp,
  Download,
  Settings2,
  Sparkles,
  ArrowUpRight,
  LoaderCircle,
  Check,
  Square,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SavedRevision } from '@/lib/projects/types';
import { useProjects, useProjectChat } from '@/lib/projects/client';
import ProjectControls from '@/components/project-controls';
import ProjectSidebar from '@/components/project-sidebar';
import DesignAccess from '@/components/design-access';
import SlicerHandoff from '@/components/slicer-handoff';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ModelViewer from '@/components/model-viewer';
import FeatureInspector from '@/components/feature-inspector';
import { featureChanges } from '@/lib/cad/changes';
import { compileComparison, type Comparison } from '@/lib/cad/compile';
const suggestions = [
  'Make a 120 × 80 mm desk organizer',
  'Add two drain holes to this tray',
  'Make the tray 40 mm tall',
];
export default function Workshop() {
  const [focusModel, setFocusModel] = useState(false);
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
  const [hiddenProposal, setHiddenProposal] = useState<string | null>(null);
  const showProposal = !!proposal && hiddenProposal !== proposal.id;
  const model = showProposal ? proposal.model : acceptedModel;
  const geometry = showProposal ? proposalGeometry : acceptedGeometry;
  const comparisonScope = `${workspace.project?.id}:${selected}:${proposal?.id ?? ''}`;
  const [comparisonSelection, setComparisonSelection] = useState<{
    scope: string;
    from: string;
    to: string;
  } | null>(null);
  const allVersions = workspace.project?.revisions ?? [];
  const customPair =
    comparisonSelection?.scope === comparisonScope ? comparisonSelection : null;
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
  const comparisonLabel = `V${comparisonBase?.ordinal ?? '—'} → ${toId === 'proposal' ? 'Proposal' : `V${allVersions.find((r) => r.id === toId)?.ordinal ?? '—'}`}`;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const changes =
    comparisonBase && comparisonTarget
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
  const [tool, setTool] = useState<
    'edit' | 'locks' | 'export' | 'sharing' | null
  >(null);
  const [status, setStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [mode, setMode] = useState<'original' | 'comparison'>('original');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [diffError, setDiffError] = useState('');
  const conversation = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const edited = !!revision?.parentId;
  const revisionNumber = revision?.ordinal ?? 0;
  const refreshStatus = () => {
    setStatusError(false);
    fetch('/api/status')
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
      !comparisonBase ||
      !comparisonTarget ||
      loadingRevision
    ) {
      setComparing(false);
      return;
    }
    const abort = new AbortController();
    setComparing(true);
    compileComparison(comparisonBase.model, comparisonTarget, abort.signal)
      .then(setComparison)
      .catch((e) => {
        if (e.name !== 'AbortError') setDiffError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setComparing(false);
      });
    return () => abort.abort();
  }, [mode, selected, comparisonTarget, comparisonBase, loadingRevision]);
  const selectRevision = async (r: SavedRevision) => {
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
  }, [messages, busy]);
  const send = async () => {
    if (!prompt.trim() || busy || loadingRevision) return;
    if (!status?.configured) {
      setSetup(true);
      return;
    }
    const result = await chat.send();
    if (result?.model) setMode('comparison');
    input.current?.focus();
  };
  const [exportFormat, setExportFormat] = useState<'stl' | '3mf'>('3mf');
  const download = () => {
    if (!workspace.project || !revision) return;
    const a = document.createElement('a');
    a.href = `/api/projects/${workspace.project.id}/export?revision=${revision.id}&format=${exportFormat}`;
    a.download = `${acceptedModel.name}-v${revisionNumber}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <div className="project-shell">
      <ProjectSidebar workspace={workspace} busy={busy} />
      <main className="studio">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Form home">
            <Box size={25} />
            <strong>
              form<span>.</span>
            </strong>
          </a>
          <ProjectControls workspace={workspace} busy={busy} />
          <button className="quiet" onClick={() => setSetup(true)}>
            <span
              className={`status-dot ${status?.configured ? 'ready' : ''}`}
            />
            <Settings2 size={15} /> AI connection
          </button>
        </header>
        <nav className="workflow-tools" aria-label="Design tools">
          <span>Design workspace</span>
          <button
            className="quiet"
            disabled={!revision}
            onClick={() => setTool('edit')}
          >
            Edit dimensions
          </button>
          <button
            className="quiet"
            disabled={!revision}
            onClick={() => setTool('locks')}
          >
            Dimension locks{' '}
            {workspace.project?.dimensionLocks.length
              ? `(${workspace.project.dimensionLocks.length})`
              : ''}
          </button>
          <button
            className="quiet"
            disabled={!revision}
            onClick={() => setTool('export')}
          >
            Export & print
          </button>
          <button
            className="quiet"
            disabled={!revision}
            onClick={() => setTool('sharing')}
          >
            Share revision
          </button>
        </nav>
        <div className="workspace">
          <section className={`viewer-panel ${focusModel ? 'model-focused' : ''}`} aria-label="3D visualization">
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
                <TabsList
                  aria-label="Visualization mode"
                  className="view-mode-list"
                >
                  <TabsTrigger value="original">Model Original</TabsTrigger>
                  <TabsTrigger value="comparison">
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
                        V{r.ordinal} · {r.model.name}
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
                        V{r.ordinal} · {r.model.name}
                      </option>
                    ))}
                    {proposal && (
                      <option value="proposal">Pending proposal</option>
                    )}
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
                    <span>
                      <i className="legend-dot removed" />
                      Removed
                    </span>
                    <span>
                      <i className="legend-dot added" />
                      Added
                    </span>
                    <span>
                      <i className="legend-dot unchanged" />
                      Unchanged
                    </span>
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
              focusMode={focusModel}
              highlight={
                mode === 'comparison'
                  ? (changes.find((c) => c.id === highlightId) ?? null)
                  : null
              }
              geometry={geometry}
              comparison={mode === 'comparison' ? comparison : null}
            />
            </div>
            <div className="revision-strip">
              <div className="revision-strip-label">
                REVISIONS <span>Saved in this project</span>
                {workspace.branch &&
                  workspace.branch.headRevisionId !== selected && (
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
                {revisions.map((r) => (
                  <button
                    key={r.id}
                    className={`revision-button ${selected === r.id ? 'selected' : ''}`}
                    disabled={busy || loadingRevision}
                    aria-pressed={selected === r.id}
                    title={`${r.prompt}${r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleString() : ''}`}
                    onClick={() => void selectRevision(r)}
                  >
                    V{r.ordinal}
                    <span>{r.parentId ? r.model.name : 'Sample'}</span>
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
                onChange={(e) =>
                  setExportFormat(e.target.value as 'stl' | '3mf')
                }
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
          <aside className="chat-panel">
            <div className="chat-heading">
              <div className="ai-icon">
                <Sparkles size={19} />
              </div>
              <div>
                <h1>Design assistant</h1>
                <p>
                  {workspace.branch?.name || 'Your project'} · Saved
                  conversation
                </p>
              </div>
            </div>
            <div
              className="conversation"
              ref={conversation}
              role="log"
              aria-label="Design conversation"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="intro">
                  <span className="eyebrow">LET’S MAKE SOMETHING</span>
                  <h2>
                    A little idea.
                    <br />A real-world object.
                  </h2>
                  <p>
                    Describe your part, add dimensions, and refine it together.
                  </p>
                  <div className="suggestions">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        className="suggestion"
                        onClick={() => {
                          setPrompt(s);
                          input.current?.focus();
                        }}
                      >
                        {s}
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                  {!status?.configured && (
                    <div className="setup-note">
                      {statusError
                        ? 'Connection status unavailable.'
                        : status
                          ? 'The sample is ready to explore. Connect your API to start designing.'
                          : 'Checking AI connection…'}{' '}
                      <button onClick={() => setSetup(true)}>Set up AI</button>
                    </div>
                  )}
                  <p className="limits">
                    Built for simple solid parts. Check dimensions and slicing
                    before printing.
                  </p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    {m.role === 'assistant' && (
                      <div className="author">
                        <Sparkles size={13} /> FORM
                      </div>
                    )}
                    {m.content}
                    {m.proposalId && (
                      <div className="proposal-message-status">
                        Proposal{' '}
                        {workspace.project?.proposals.find(
                          (p) => p.id === m.proposalId,
                        )?.status ?? 'history'}
                      </div>
                    )}
                    {m.updated && (
                      <div>
                        <span className="update-tag">
                          <Check size={13} /> Model updated
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
              {busy && (
                <div className="message pending">
                  <LoaderCircle size={14} className="spin inline mr-2" />
                  {phase}…
                </div>
              )}
            </div>
            {mode === 'comparison' && comparisonBase && (
              <section
                className="change-explanations"
                aria-label="Measured changes"
              >
                <strong>Measured changes</strong>
                <p>
                  Values come from the model. Click a feature to outline its
                  before (red) and after (green) bounds, including subtraction
                  tools.
                </p>
                {changes.length === 0 && <p>No feature changes.</p>}
                {changes.map((change) => (
                  <button
                    key={change.id}
                    type="button"
                    aria-pressed={highlightId === change.id}
                    onClick={() =>
                      setHighlightId(
                        highlightId === change.id ? null : change.id,
                      )
                    }
                  >
                    <strong>{change.name}</strong>
                    {change.details.map((detail) => (
                      <span key={detail}>{detail}</span>
                    ))}
                  </button>
                ))}
              </section>
            )}
            {proposal && (
              <section
                className="proposal-review"
                aria-label="Review proposed changes"
              >
                <strong>Proposed changes — not yet accepted</strong>
                <p>
                  Based on V{revisionNumber}. Downloads use the accepted model.
                </p>
                <div className="proposal-actions">
                  <button
                    disabled={busy || loadingRevision}
                    className="quiet"
                    onClick={() => {
                      setHiddenProposal(showProposal ? proposal.id : null);
                    }}
                  >
                    {showProposal ? 'Show accepted model' : 'Show proposal'}
                  </button>
                  <button
                    disabled={busy || loadingRevision}
                    className="quiet"
                    onClick={() => {
                      setHiddenProposal(null);
                      setComparisonSelection(null);
                      setMode('comparison');
                    }}
                  >
                    Compare
                  </button>
                </div>
                <div className="proposal-actions">
                  <button
                    disabled={busy || loadingRevision}
                    className="quiet accept-proposal"
                    onClick={() => void review('accept')}
                  >
                    Accept changes
                  </button>
                  <button
                    disabled={busy || loadingRevision}
                    className="quiet"
                    onClick={() => void review('discard')}
                  >
                    Discard
                  </button>
                  <button
                    disabled={busy || loadingRevision}
                    className="quiet"
                    onClick={() => {
                      setPrompt('Refine this proposal: ');
                      input.current?.focus();
                    }}
                  >
                    Refine
                  </button>
                </div>
              </section>
            )}
            {storageWarning && (
              <div className="storage-warning" role="status">
                {storageWarning}
              </div>
            )}
            {loadingRevision && (
              <div className="storage-warning" role="status">
                Loading revision…
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={input}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy || loadingRevision}
                maxLength={8000}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
                aria-label="Describe your part"
                placeholder={
                  proposal
                    ? 'Ask a question or refine this proposal…'
                    : 'Describe a part, or ask for a change…'
                }
              />
              <div className="composer-bottom">
                <span>
                  {status?.configured ? status.model : 'API not connected'}
                </span>
                {busy ? (
                  <button
                    type="button"
                    className="send cancel"
                    aria-label="Cancel generation"
                    onClick={chat.cancel}
                  >
                    <Square size={13} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="send"
                    disabled={
                      !prompt.trim() ||
                      !geometry ||
                      loadingRevision ||
                      !workspace.project
                    }
                    aria-label="Send message"
                  >
                    <ArrowUp size={19} />
                  </button>
                )}
              </div>
            </form>
            <p className="chat-footnote">
              {workspace.branch && workspace.branch.headRevisionId !== selected
                ? `Your next edit starts a new branch from V${revisionNumber}.`
                : 'Review AI proposals before accepting a new revision.'}
            </p>
          </aside>
        </div>
        <Dialog
          open={tool !== null}
          onOpenChange={(open) => {
            if (!open) setTool(null);
          }}
        >
          <DialogContent className="organized-tools sm:max-w-xl p-7 max-h-[85dvh] overflow-y-auto">
            <DialogTitle>
              {tool === 'edit'
                ? 'Edit dimensions'
                : tool === 'locks'
                  ? 'Dimension locks'
                  : tool === 'export'
                    ? 'Export & print'
                    : 'Share revision'}
            </DialogTitle>
            <DialogDescription>
              {tool === 'edit'
                ? 'Choose a feature and preview a manual edit before accepting it.'
                : tool === 'locks'
                  ? 'Preserve accepted feature dimensions across project branches.'
                  : tool === 'export'
                    ? `Download accepted V${revisionNumber} for editing or slicing.`
                    : `Create or manage read-only links to accepted V${revisionNumber}.`}
            </DialogDescription>
            {tool === 'edit' && (
              <>
                <FeatureInspector
                  key={`${workspace.project?.id}:${revision?.id}:${showProposal ? proposal?.id : 'accepted'}`}
                  model={model}
                  disabled={
                    busy ||
                    loadingRevision ||
                    !revision ||
                    (!!proposal && !showProposal) ||
                    workspace.project?.branches.find(
                      (b) => b.id === workspace.project?.activeBranchId,
                    )?.headRevisionId !== revision?.id
                  }
                  submit={async (featureId, size, position) => {
                    await workspace.mutate({
                      action: 'edit-feature',
                      branchId: workspace.project!.activeBranchId,
                      revisionId: revision!.id,
                      proposalId: proposal?.id ?? null,
                      featureId,
                      size,
                      position,
                    });
                    setHiddenProposal(null);
                    setMode('comparison');
                    setTool(null);
                  }}
                />
                {proposal && !showProposal && (
                  <p>Show the proposal in the viewer to edit its dimensions.</p>
                )}
                {workspace.branch?.headRevisionId !== revision?.id && (
                  <p>Restore this revision or create a branch to edit it.</p>
                )}
              </>
            )}
            {(tool === 'locks' || tool === 'sharing') && (
              <DesignAccess
                key={`${workspace.project?.id}:${tool}`}
                workspace={workspace}
                busy={busy}
                section={tool}
              />
            )}
            {tool === 'export' && workspace.project && revision && (
              <>
                <div className="export-options">
                  <a
                    href={`/api/projects/${workspace.project.id}/export?revision=${revision.id}&format=3mf`}
                  >
                    <strong>3MF · Print model</strong>
                    <span>Millimeter units and display color</span>
                  </a>
                  <a
                    href={`/api/projects/${workspace.project.id}/export?revision=${revision.id}&format=stl`}
                  >
                    <strong>STL · Universal mesh</strong>
                    <span>Import as millimeters in your slicer</span>
                  </a>
                  <a
                    href={`/api/projects/${workspace.project.id}/export?revision=${revision.id}&format=json`}
                  >
                    <strong>JSON · Editable source</strong>
                    <span>Re-import from the project sidebar</span>
                  </a>
                </div>
                {proposal && (
                  <p>
                    Pending proposals are excluded from downloads. Accept the
                    proposal first to export its changes.
                  </p>
                )}
                <SlicerHandoff />
              </>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={setup} onOpenChange={setSetup}>
          <DialogContent className="sm:max-w-lg p-7">
            <DialogTitle>Connect your design assistant</DialogTitle>
            <DialogDescription>
              The connection uses a server-side OpenAI API key.
            </DialogDescription>
            <div className="setup-content">
              <ol>
                <li>
                  Create an API key in your{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OpenAI account
                  </a>
                  .
                </li>
                <li>
                  For the local app, fill in the project’s <strong>.env</strong>{' '}
                  file:
                  <code>
                    OPENAI_API_KEY=your-key-here{'\n'}OPENAI_MODEL=gpt-6-astra
                  </code>
                  Use a model your API account can access.
                </li>
                <li>Restart the local app, then check the connection below.</li>
              </ol>
              <p>
                For the hosted app, add these values as server environment
                variables in Sites. A local .env file does not configure the
                hosted app.
              </p>
              <p>
                Your key is never entered into this page or sent to the browser.
                Project context and models are sent to OpenAI when you chat.
                Each branch uses a saved OpenAI conversation.
              </p>
              <button className="quiet" onClick={refreshStatus}>
                <Settings2 size={15} /> Check connection
              </button>
              <div className="live-status" role="status">
                {statusError
                  ? 'Could not check the connection. Try again.'
                  : status?.configured
                    ? 'API key configured. A successful message will verify model access.'
                    : 'API key not configured.'}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
