'use client';
import type { useWorkshop } from '@/lib/projects/use-workshop';
import {
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
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
    setHiddenProposal,
    setMode,
    showProposal,
    geometry,
    setComparisonSelection,
    review,
    setSetup,
    status,
    conversation,
    input,
    revisionNumber,
    send,
  } = state;
  const role = workspace.project?.role;
  const footnote =
    role === 'viewer'
      ? 'View only'
      : workspace.branch?.canEdit === false
        ? 'Your edits start your own branch'
        : workspace.branch && workspace.branch.headRevisionId !== selected
          ? `Edits branch from V${revisionNumber}`
          : '';
  return (
    <aside className="chat-panel" aria-label="Design assistant">
      <div
        className="conversation"
        ref={conversation}
        role="log"
        aria-label="Design conversation"
        aria-live="polite"
      >
        {workspace.project?.messageCursor != null && (
          <button
            className="quiet earlier"
            disabled={workspace.loadingMessages}
            onClick={() => void workspace.loadOlderMessages()}
          >
            {workspace.loadingMessages ? 'Loading…' : 'Earlier messages'}
          </button>
        )}
        {messages.length === 0 ? (
          <div className="intro">
            <h2>What are we making?</h2>
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
              </button>
            ))}
            {status && !status.configured && (
              <button className="quiet line" onClick={() => setSetup(true)}>
                Connect AI
              </button>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              {m.content}
              {m.proposalId && (
                <span className="tag">
                  Proposal{' '}
                  {workspace.project?.proposals.find(
                    (p) => p.id === m.proposalId,
                  )?.status ?? 'history'}
                </span>
              )}
              {m.updated && (
                <span className="tag ok">
                  <Check size={12} /> Updated
                </span>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="message pending">
            <LoaderCircle size={14} className="spin" />
            {phase}…
          </div>
        )}
      </div>
      {proposal && (
        <section className="review" aria-label="Review proposed changes">
          <button
            disabled={busy || loadingRevision || !workspace.branch?.canEdit}
            className="quiet primary"
            onClick={() => void review('accept')}
          >
            Accept
          </button>
          <button
            disabled={busy || loadingRevision || !workspace.branch?.canEdit}
            className="quiet"
            onClick={() => void review('discard')}
          >
            Discard
          </button>
          <button
            disabled={busy || loadingRevision || role === 'viewer'}
            className="quiet"
            onClick={() => {
              setPrompt('Refine this proposal: ');
              input.current?.focus();
            }}
          >
            Refine
          </button>
          <span className="grow" />
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
          <button
            disabled={busy || loadingRevision}
            className="quiet icon"
            aria-label={showProposal ? 'Show accepted model' : 'Show proposal'}
            title={showProposal ? 'Show accepted model' : 'Show proposal'}
            onClick={() => {
              setHiddenProposal(showProposal ? proposal.id : null);
            }}
          >
            {showProposal ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </section>
      )}
      {storageWarning && (
        <p className="note pad" role="status">
          {storageWarning}
        </p>
      )}
      {error && (
        <p className="pad" role="alert">
          {error}
        </p>
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
          disabled={busy || loadingRevision || role === 'viewer'}
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
            proposal ? 'Refine or ask…' : 'Describe a part or a change'
          }
        />
        <div className="composer-bottom">
          <select
            aria-label="AI changes"
            title="How AI changes are saved"
            value={workspace.project?.approvalMode ?? 'review'}
            disabled={busy || loadingRevision || role !== 'owner'}
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
            <option value="review">Review first</option>
            <option value="auto">Auto-apply</option>
          </select>
          <span>
            {footnote ||
              (status?.configured
                ? `${status.model}${status.remainingToday != null ? ` · ${status.remainingToday} left` : ''}`
                : '')}
          </span>
          {busy ? (
            <button
              type="button"
              className="send"
              aria-label="Cancel generation"
              onClick={chat.cancel}
            >
              <Square size={12} />
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              disabled={
                role === 'viewer' ||
                !prompt.trim() ||
                !geometry ||
                loadingRevision ||
                !workspace.project
              }
              aria-label="Send message"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </form>
    </aside>
  );
}
