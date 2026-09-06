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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ModelViewer from '@/components/model-viewer';
import { compileComparison, type Comparison } from '@/lib/cad/compile';
const suggestions = [
  'Make a 120 × 80 mm desk organizer',
  'Add two drain holes to this tray',
  'Make the tray 40 mm tall',
];
export default function Workshop() {
  const workspace = useProjects();
  const chat = useProjectChat(workspace);
  const {
    model,
    geometry,
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
  const [setup, setSetup] = useState(false);
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
  const parentNumber = parent?.ordinal ?? 0;
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
    if (mode !== 'comparison' || !parent || loadingRevision) {
      setComparing(false);
      return;
    }
    const abort = new AbortController();
    setComparing(true);
    compileComparison(parent.model, model, abort.signal)
      .then(setComparison)
      .catch((e) => {
        if (e.name !== 'AbortError') setDiffError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setComparing(false);
      });
    return () => abort.abort();
  }, [mode, selected, model, parent, loadingRevision]);
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
  const download = async () => {
    if (!geometry) return;
    try {
      const { binarySTL } = await import('@/lib/cad/geometry');
      const url = URL.createObjectURL(
        new Blob([binarySTL(geometry.positions)], { type: 'model/stl' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${model.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'part'}.stl`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('The STL export failed. Please try again.');
    }
  };
  return (
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
          <span className={`status-dot ${status?.configured ? 'ready' : ''}`} />
          <Settings2 size={15} /> AI connection
        </button>
      </header>
      <div className="workspace">
        <section className="viewer-panel" aria-label="3D visualization">
          <div className="panel-top">
            <span className="eyebrow">MODEL SPACE</span>
            <span className="unit">mm</span>
          </div>
          <div className="model-label">
            <h2>
              {model.name}
              {!edited && <span className="sample-badge">SAMPLE</span>}
            </h2>
            <p>
              {geometry
                ? geometry.dimensions
                    .map((n) => Number(n.toFixed(1)))
                    .join(' × ') + ' mm'
                : 'Preparing solid geometry…'}
            </p>
          </div>
          <ModelViewer
            geometry={geometry}
            comparison={mode === 'comparison' ? comparison : null}
          />
          <div className="view-mode">
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as 'original' | 'comparison')}
            >
              <TabsList
                aria-label="Visualization mode"
                className="view-mode-list"
              >
                <TabsTrigger value="original">Model Original</TabsTrigger>
                <TabsTrigger value="comparison">Changes Comparison</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {mode === 'comparison' && (
            <div className="comparison-caption" role="status">
              {!parent ? (
                'No previous version yet. Send a model edit to create a comparison.'
              ) : comparing ? (
                'Computing solid differences…'
              ) : diffError ? (
                `Comparison unavailable: ${diffError}`
              ) : comparison ? (
                <>
                  <span className="diff-pair">
                    V{parentNumber} → V{revisionNumber}
                  </span>
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
          <div className="revision-strip">
            <div className="revision-strip-label">
              REVISIONS <span>Saved in this project</span>
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
            <button
              className="quiet"
              onClick={download}
              disabled={!geometry || busy || loadingRevision}
            >
              <Download size={16} /> Export STL
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
                {workspace.branch?.name || 'Your project'} · Saved conversation
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
              placeholder="Describe a part, or ask for a change…"
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
              : 'Each completed model edit is saved as a new revision.'}
          </p>
        </aside>
      </div>
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
              Project context and models are sent to OpenAI when you chat. Each
              branch uses a saved OpenAI conversation.
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
  );
}
