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
import {
  initialRevision,
  parseHistory,
  STORAGE_KEY,
  type Revision,
} from '@/lib/cad/history';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ModelViewer from '@/components/model-viewer';
import { sample, validateModel, type Model, type Reply } from '@/lib/cad/model';
import {
  compileModel,
  compileComparison,
  type Compiled,
  type Comparison,
} from '@/lib/cad/compile';
import type { ChatMessage } from '@/lib/ai';
type Message = ChatMessage & { updated?: boolean };
const suggestions = [
  'Make a 120 × 80 mm desk organizer',
  'Add two drain holes to this tray',
  'Make the tray 40 mm tall',
];
export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<Model>(sample);
  const [geometry, setGeometry] = useState<Compiled | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [setup, setSetup] = useState(false);
  const [status, setStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [edited, setEdited] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([initialRevision]);
  const [selected, setSelected] = useState('initial');
  const [mode, setMode] = useState<'original' | 'comparison'>('original');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [comparing, setComparing] = useState(false);
  const [diffError, setDiffError] = useState('');
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const selectionController = useRef<AbortController | null>(null);
  const controller = useRef<AbortController | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
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
    const abort = new AbortController();
    let saved = [initialRevision];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = parseHistory(raw);
    } catch {
      setStorageWarning(
        'Saved history could not be read. New revisions will be kept in this session.',
      );
    }
    const last = saved[saved.length - 1];
    compileModel(last.model, abort.signal)
      .then((g) => {
        setGeometry(g);
        setModel(last.model);
        setRevisions(saved);
        setSelected(last.id);
        setEdited(last.id !== 'initial');
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    refreshStatus();
    return () => {
      abort.abort();
      controller.current?.abort();
      selectionController.current?.abort();
    };
  }, []);
  const revision = revisions.find((r) => r.id === selected)!;
  const parent = revisions.find((r) => r.id === revision?.parentId);
  const revisionNumber = revisions.findIndex((r) => r.id === selected);
  const parentNumber = revisions.findIndex((r) => r.id === revision?.parentId);
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
  const selectRevision = async (r: Revision) => {
    if (busyRef.current || r.id === selected) return;
    selectionController.current?.abort();
    const abort = new AbortController();
    selectionController.current = abort;
    setLoadingRevision(true);
    setError('');
    try {
      const g = await compileModel(r.model, abort.signal);
      setModel(r.model);
      setGeometry(g);
      setSelected(r.id);
      setEdited(r.id !== 'initial');
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') setError(e.message);
    } finally {
      if (!abort.signal.aborted) setLoadingRevision(false);
    }
  };
  const recordRevision = (candidate: Model, text: string) => {
    const r: Revision = {
      id: crypto.randomUUID(),
      parentId: selected,
      createdAt: new Date().toISOString(),
      prompt: text,
      model: candidate,
    };
    const next = [...revisions, r];
    setRevisions(next);
    setSelected(r.id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageWarning('');
    } catch {
      setStorageWarning(
        'Browser storage is full or unavailable. This revision is available only until you close or reload the page.',
      );
    }
  };
  useEffect(() => {
    conversation.current?.scrollTo({
      top: conversation.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, busy]);
  const send = async () => {
    const text = prompt.trim();
    if (!text || busyRef.current || loadingRevision) return;
    if (!status?.configured) {
      setSetup(true);
      return;
    }
    if (revisions.length >= 500) {
      setError(
        'This workspace has reached its 500-revision limit. Export your model before starting a new workspace.',
      );
      return;
    }
    busyRef.current = true;
    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setPrompt('');
    setError('');
    setBusy(true);
    setPhase('Designing your part');
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next
            .slice(-39)
            .map(({ role, content }) => ({ role, content })),
          model,
        }),
        signal: abort.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          (data as { error?: string }).error ||
            'Unable to reach the AI service.',
        );
      const reply = data as Reply;
      if (!reply || typeof reply.message !== 'string')
        throw new Error('The AI returned an invalid response.');
      let updated = false;
      if (reply.model !== null) {
        const candidate = validateModel(reply.model);
        setPhase('Building your model');
        const compiled = await compileModel(candidate, abort.signal);
        if (abort.signal.aborted)
          throw new DOMException('Cancelled', 'AbortError');
        setGeometry(compiled);
        setModel(candidate);
        setEdited(true);
        recordRevision(candidate, text);
        setMode('comparison');
        updated = true;
      }
      if (abort.signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      setMessages([
        ...next,
        { role: 'assistant', content: reply.message, updated },
      ]);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError')
        setError('Generation cancelled. Your model is unchanged.');
      else
        setError(
          e instanceof Error
            ? e.message
            : 'Something went wrong. Please try again.',
        );
      setMessages(messages);
      setPrompt(text);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase('');
      controller.current = null;
      input.current?.focus();
    }
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
        <div className="project-name">
          3D Workshop <span>/</span> {model.name}
        </div>
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
              REVISIONS <span>Saved in this browser</span>
            </div>
            <div className="revision-buttons" aria-label="Model revisions">
              {revisions.map((r, i) => (
                <button
                  key={r.id}
                  className={`revision-button ${selected === r.id ? 'selected' : ''}`}
                  disabled={busy || loadingRevision}
                  aria-pressed={selected === r.id}
                  title={`${r.prompt}${r.createdAt ? ' · ' + new Date(r.createdAt).toLocaleString() : ''}`}
                  onClick={() => void selectRevision(r)}
                >
                  V{i}
                  <span>{i === 0 ? 'Sample' : r.model.name}</span>
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
              <p>From a thought to a tangible thing.</p>
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
                  onClick={() => controller.current?.abort()}
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send"
                  disabled={!prompt.trim() || !geometry || loadingRevision}
                  aria-label="Send message"
                >
                  <ArrowUp size={19} />
                </button>
              )}
            </div>
          </form>
          <p className="chat-footnote">
            Each completed model edit becomes a new revision.
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
              Prompts and the current model are sent to OpenAI when you chat.
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
