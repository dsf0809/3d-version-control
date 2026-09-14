'use client';
import { useState } from 'react';
import AIConnection from './ai-connection';
import DesignAccess from '@/components/design-access';
import FeatureInspector from '@/components/feature-inspector';
import ProjectControls from '@/components/project-controls';
import ProjectSidebar from '@/components/project-sidebar';
import SlicerHandoff from '@/components/slicer-handoff';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkshop } from '@/lib/projects/use-workshop';
import { Box, Settings2 } from 'lucide-react';
import FeatureProperties from './feature-properties';
import WorkspaceChat from './workspace-chat';
import WorkspaceModel from './workspace-model';
export default function Workshop() {
  const state = useWorkshop();
  const [compactPanel, setCompactPanel] = useState<'model' | 'chat'>('model');
  const [compactTools, setCompactTools] = useState(false);
  const {
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
  } = state;
  return (
    <div className="project-shell">
      <ProjectSidebar workspace={workspace} busy={busy} />
      <main className={`studio ${compactTools ? 'compact-tools-open' : ''}`} data-compact-panel={compactPanel}>
        <header className="topbar">
          <a className="brand" href="/" aria-label="Form home">
            <Box size={25} />
            <strong>
              form<span>.</span>
            </strong>
          </a>
          <div className="project-actions"><ProjectControls workspace={workspace} busy={busy} /></div>
          <button className="quiet" onClick={() => setSetup(true)}>
            <span
              className={`status-dot ${status?.configured ? 'ready' : ''}`}
            />
            <Settings2 size={15} /> AI connection
          </button>
        </header>
        <div className="compact-navigation">
          <div role="group" aria-label="Workspace panel">
            <button type="button" aria-pressed={compactPanel === 'model'} onClick={() => setCompactPanel('model')}>Model</button>
            <button type="button" aria-pressed={compactPanel === 'chat'} onClick={() => setCompactPanel('chat')}>Chat {busy ? '· Working' : proposal ? '· Review' : ''}</button>
          </div>
          <button type="button" aria-expanded={compactTools} aria-controls="compact-design-tools" onClick={() => setCompactTools((open) => !open)}>{compactTools ? 'Close tools' : 'Project & tools'}</button>
        </div>
        <nav id="compact-design-tools" className="workflow-tools" aria-label="Design tools">
          <span>Design workspace</span>
          <button
            className="quiet"
            disabled={!revision || !workspace.branch?.canEdit}
            onClick={() => setTool('edit')}
          >
            Edit dimensions
          </button>
          <button
            className="quiet"
            disabled={!revision || workspace.project?.role !== 'owner'}
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
            disabled={!revision || workspace.project?.role !== 'owner'}
            onClick={() => setTool('sharing')}
          >
            Share revision
          </button>
        </nav>
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
        <AIConnection open={setup} onOpenChange={setSetup} status={status} statusError={statusError} refresh={refreshStatus}/>
      </main>
    </div>
  );
}
