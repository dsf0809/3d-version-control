'use client';
import ProjectTeam from './project-team';
import BranchMerge from './branch-merge';
import { useState } from 'react';
import { GitBranch, GitBranchPlus, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select';
import type { useProjects } from '@/lib/projects/client';
export default function ProjectControls({
  workspace,
  busy,
}: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<'new' | 'edit'>('edit'),
    [name, setName] = useState(''),
    [brief, setBrief] = useState(''),
    [requirements, setRequirements] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const { project } = workspace;
  const locked = editing === 'edit' && project?.role !== 'owner';
  const form = (mode: 'new' | 'edit') => {
    setEditing(mode);
    setName(mode === 'edit' ? project?.name || '' : '');
    setBrief(mode === 'edit' ? project?.brief || '' : '');
    setRequirements(mode === 'edit' ? project?.requirements || '' : '');
    setError('');
  };
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (editing === 'new')
        await workspace.create({ name, brief, requirements });
      else
        await workspace.mutate({ action: 'update', name, brief, requirements });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save project.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <div className="project-controls">
        <button
          className="quiet project-name"
          disabled={busy || workspace.loading}
          title={project ? 'Project details' : undefined}
          onClick={() => {
            setOpen(true);
            form(project ? 'edit' : 'new');
          }}
        >
          {project ? project.name : 'New project'}
        </button>
        {project && (
          <>
            <Select
              value={project.activeBranchId}
              disabled={busy || workspace.loading}
              onValueChange={(v) => {
                if (v)
                  void workspace
                    .mutate({ action: 'select', branchId: v })
                    .catch(() => {});
              }}
            >
              <SelectTrigger
                aria-label="Design branch"
                className="branch-picker"
              >
                <GitBranch size={14} />
                <SelectValue>{workspace.branch?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {project.branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className="quiet icon"
              disabled={busy || workspace.loading || project.role === 'viewer'}
              aria-label="New branch"
              title="New branch from this revision"
              onClick={() =>
                void workspace
                  .mutate({
                    action: 'fork',
                    branchId: project.activeBranchId,
                    revisionId: project.selectedRevisionId,
                  })
                  .catch(() => {})
              }
            >
              <GitBranchPlus size={15} />
            </button>
            <BranchMerge workspace={workspace} busy={busy} />
            <button
              className="quiet icon not-phone"
              disabled={busy || workspace.loading}
              aria-label="Refresh branch"
              title="Refresh branch"
              onClick={() =>
                void workspace
                  .mutate({
                    action: 'select',
                    branchId: project.activeBranchId,
                  })
                  .catch(() => {})
              }
            >
              <RefreshCw size={14} />
            </button>
          </>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent className="dialog sm:max-w-lg">
          <DialogTitle>
            {editing === 'new' ? 'New project' : 'Project'}
          </DialogTitle>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label>
              Name
              <input
                readOnly={locked}
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Brief
              <textarea
                readOnly={locked}
                rows={3}
                maxLength={4000}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What are you making, and who is it for?"
              />
            </label>
            <label>
              Requirements
              <textarea
                readOnly={locked}
                rows={3}
                maxLength={8000}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Dimensions, material, clearances…"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            {!locked && (
              <div className="row end">
                <button
                  className="quiet"
                  disabled={saving}
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="quiet primary"
                  disabled={saving || !name.trim()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </form>
          {project && editing === 'edit' && (
            <ProjectTeam
              key={project.id}
              projectId={project.id}
              owner={project.role === 'owner'}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
