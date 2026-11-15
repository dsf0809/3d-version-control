'use client';
import { useState } from 'react';
import AIConnection from './ai-connection';
import AccountMenu, { type AccountUser } from './account-menu';
import DesignAccess from '@/components/design-access';
import FeatureInspector from '@/components/feature-inspector';
import ProjectControls from '@/components/project-controls';
import ProjectSidebar from '@/components/project-sidebar';
import SlicerHandoff from '@/components/slicer-handoff';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useWorkshop } from '@/lib/projects/use-workshop';
import FeatureProperties from './feature-properties';
import WorkspaceChat from './workspace-chat';
import WorkspaceModel from './workspace-model';
import FirstProjectGuide from './first-project-guide';

const toolTitles = {
  edit: 'Edit',
  locks: 'Locks',
  export: 'Export',
  sharing: 'Share',
};
const formats = [
  ['3mf', '3MF', 'Print'],
  ['stl', 'STL', 'Mesh'],
  ['json', 'JSON', 'Source'],
] as const;

export default function Workshop({ user }: { user: AccountUser }) {
  const state = useWorkshop();
  const [panel, setPanel] = useState<'model' | 'chat'>('model');
  const [guide, setGuide] = useState(false);
  const {
    workspace,
    proposal,
    error,
    selected,
    revision,
    loadingRevision,
    busy,
    setHiddenProposal,
    setMode,
    showProposal,
    model,
    setComparisonSelection,
    setup,
    setSetup,
    pickedFeature,
    tool,
    setTool,
    status,
    statusError,
    revisionNumber,
    refreshStatus,
    download,
  } = state;
  return (
    <div className="app">
      <ProjectSidebar
        workspace={workspace}
        busy={busy}
        onGuide={() => setGuide(true)}
      />
      <main className="studio" data-panel={panel}>
        <header className="topbar">
          <ProjectControls workspace={workspace} busy={busy} />
          <div className="topbar-end">
            <button
              className="quiet"
              aria-label="AI connection"
              title={
                status?.configured
                  ? `AI connected · ${status.model}`
                  : 'Connect AI'
              }
              onClick={() => setSetup(true)}
            >
              <span
                className={`status-dot ${status?.configured ? 'ready' : ''}`}
              />
              AI
            </button>
            <AccountMenu user={user} />
          </div>
        </header>
        <div className="panel-switch" role="group" aria-label="Workspace panel">
          <button
            type="button"
            aria-pressed={panel === 'model'}
            onClick={() => setPanel('model')}
          >
            Model
          </button>
          <button
            type="button"
            aria-pressed={panel === 'chat'}
            onClick={() => setPanel('chat')}
          >
            Chat
            {(busy || proposal) && (
              <i
                className={`status-dot ${busy ? 'busy' : 'ready'}`}
                aria-label={busy ? 'Working' : 'Review'}
              />
            )}
          </button>
        </div>
        <div className="workspace">
          <WorkspaceModel state={state} />
          <WorkspaceChat state={state} />
        </div>
        <Dialog
          open={tool !== null}
          onOpenChange={(open) => {
            if (!open) setTool(null);
          }}
        >
          <DialogContent className="dialog sm:max-w-lg">
            <DialogTitle>
              {tool ? toolTitles[tool] : ''}
              {(tool === 'export' || tool === 'sharing') && (
                <span className="title-tag">V{revisionNumber}</span>
              )}
            </DialogTitle>
            {tool === 'edit' && (
              <>
                <FeatureInspector
                  key={`${workspace.project?.id}:${revision?.id}:${showProposal ? proposal?.id : 'accepted'}`}
                  model={model}
                  initialSelected={pickedFeature}
                  disabled={
                    !workspace.branch?.canEdit ||
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
                  <p className="note">Show the proposal to edit it.</p>
                )}
                {workspace.branch?.headRevisionId !== revision?.id && (
                  <p className="note">
                    Restore this revision or branch from it to edit.
                  </p>
                )}
                <FeatureProperties
                  key={`${selected}:${proposal?.id}:${pickedFeature}`}
                  model={model}
                  selected={pickedFeature}
                  disabled={
                    busy || loadingRevision || !workspace.branch?.canEdit
                  }
                  submit={async (featureId, color, relationships) => {
                    await workspace.mutate({
                      action: 'feature-properties',
                      branchId: workspace.project!.activeBranchId,
                      revisionId: selected,
                      proposalId: proposal?.id || null,
                      featureId,
                      color,
                      relationships,
                    });
                    setMode('comparison');
                    setComparisonSelection(null);
                  }}
                />
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
                {error && <p role="alert">{error}</p>}
                <div className="choices">
                  {formats.map(([format, name, use]) => (
                    <a
                      key={format}
                      className="choice"
                      href={`/api/projects/${workspace.project!.id}/export?revision=${revision.id}&format=${format}`}
                      onClick={(event) => {
                        event.preventDefault();
                        void download(format);
                      }}
                    >
                      <strong>{name}</strong>
                      <span>{use}</span>
                    </a>
                  ))}
                </div>
                {proposal && (
                  <p className="note">The pending proposal is not included.</p>
                )}
                <SlicerHandoff />
              </>
            )}
          </DialogContent>
        </Dialog>
        <AIConnection
          open={setup}
          onOpenChange={setSetup}
          status={status}
          statusError={statusError}
          refresh={refreshStatus}
        />
        <FirstProjectGuide
          workspace={workspace}
          open={guide}
          onOpenChange={setGuide}
          onOpenTool={(next) => {
            setPanel('model');
            setTool(next);
          }}
        />
      </main>
    </div>
  );
}
