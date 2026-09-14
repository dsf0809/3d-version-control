'use client';
import type { useWorkshop } from '@/lib/projects/use-workshop';
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Sparkles,
  Square,
} from 'lucide-react';
const suggestions = [
  'Make a 120 × 80 mm desk organizer',
  'Add two drain holes to this tray',
  'Make the tray 40 mm tall',
];
export default function WorkspaceChat({
  state,
}: {
  state: ReturnType<typeof useWorkshop>;
}) {
  const {
    workspace,
    chat,
    proposal,
    messages,
    error,
    setError,
    selected,
    loadingRevision,
    storageWarning,
    prompt,
    setPrompt,
    busy,
    phase,
    mode,
    highlightId,
    setHiddenProposal,
    setMode,
    setHighlightId,
    showProposal,
    model,
    geometry,
    setComparisonSelection,
    comparisonBase,
    changes,
    review,
    setSetup,
    status,
    statusError,
    conversation,
    input,
    revisionNumber,
    send,
  } = state;
  return (
    <aside className="chat-panel">
      <div className="chat-heading">
        <div className="ai-icon">
          <Sparkles size={19} />
        </div>
        <div>
          <h1>Design assistant</h1>
          <p>
            {workspace.branch?.name || 'Your project'} · Editing V
            {revisionNumber}
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
        {workspace.project?.messageCursor != null && (
          <button
            className="quiet"
            disabled={workspace.loadingMessages}
            onClick={() => void workspace.loadOlderMessages()}
          >
            {workspace.loadingMessages ? 'Loading…' : 'Load earlier messages'}
          </button>
        )}
        {messages.length === 0 ? (
          <div className="intro">
            <span className="eyebrow">LET’S MAKE SOMETHING</span>
            <h2>
              A little idea.
              <br />A real-world object.
            </h2>
            <p>Describe your part, add dimensions, and refine it together.</p>
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
              Built for simple solid parts. Check dimensions and slicing before
              printing.
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
      {proposal && (
        <section
          className="proposal-review"
          aria-label="Review proposed changes"
        >
          <strong>Proposed changes — not yet accepted</strong>
          <p>
            Based on V{revisionNumber}.{' '}
            {proposal.authorId && <>By {proposal.authorId}. </>}Downloads use
            the accepted model.
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
              disabled={busy || loadingRevision || !workspace.branch?.canEdit}
              className="quiet accept-proposal"
              onClick={() => void review('accept')}
            >
              Accept changes
            </button>
            <button
              disabled={busy || loadingRevision || !workspace.branch?.canEdit}
              className="quiet"
              onClick={() => void review('discard')}
            >
              Discard
            </button>
            <button
              disabled={
                busy || loadingRevision || workspace.project?.role === 'viewer'
              }
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
        <div className="approval-setting">
          <label htmlFor="ai-approval">AI changes</label>
          <select
            id="ai-approval"
            value={workspace.project?.approvalMode ?? 'review'}
            disabled={
              busy || loadingRevision || workspace.project?.role !== 'owner'
            }
            onChange={(e) => {
              void workspace
                .mutate({ action: 'approval-mode', mode: e.target.value })
                .catch((error) =>
                  setError(
                    error instanceof Error
                      ? error.message
                      : 'Unable to save approval preference.',
                  ),
                );
            }}
          >
            <option value="review">Review changes</option>
            <option value="auto">Apply automatically</option>
          </select>
          <small>
            {proposal
              ? 'This proposal still requires review.'
              : workspace.project?.approvalMode === 'auto'
                ? 'Validated edits save a new revision. Locks still apply.'
                : 'Preview and accept each AI edit before saving a revision.'}
          </small>
        </div>
        <textarea
          ref={input}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={
            busy || loadingRevision || workspace.project?.role === 'viewer'
          }
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
          <span>{status?.configured ? status.model : 'API not connected'}</span>
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
                workspace.project?.role === 'viewer' ||
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
        {workspace.project?.role === 'viewer'
          ? 'Viewer access: inspect and download accepted designs.'
          : workspace.branch?.canEdit === false
            ? 'Your next AI edit starts your own contributor branch.'
            : workspace.branch && workspace.branch.headRevisionId !== selected
              ? `Your next edit starts a new branch from V${revisionNumber}.`
              : workspace.project?.approvalMode === 'auto' && !proposal
                ? 'AI changes save automatically. You can restore an earlier revision.'
                : 'Review AI proposals before accepting a new revision.'}
      </p>
    </aside>
  );
}
