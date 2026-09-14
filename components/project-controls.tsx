'use client';
import ProjectTeam from './project-team';
import BranchMerge from './branch-merge';
import { useState } from 'react';
import { FolderOpen, Plus, GitBranch, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
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
    [editing, setEditing] = useState<'new' | 'edit' | null>(null),
    [name, setName] = useState(''),
    [brief, setBrief] = useState(''),
    [requirements, setRequirements] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const { project } = workspace;
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
      setEditing(null);
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
          className="quiet project-picker"
          disabled={busy || workspace.loading}
          onClick={() => {
            setOpen(true);
            form(project ? 'edit' : 'new');
          }}
        >
          <FolderOpen size={16} />
          {project ? 'Project details' : 'New project'}
        </button>
        {project && (
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
            <SelectTrigger aria-label="Design branch" className="branch-picker">
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
        )}
        {project && (
          <button
            className="quiet"
            disabled={busy || workspace.loading || project.role === 'viewer'}
            title="Create a branch from this revision"
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
            <GitBranch size={15} />
            <span className="branch-label">New branch</span>
          </button>
        )}
        {project && (
          <button
            className="quiet"
            disabled={busy || workspace.loading}
            title="Load the latest accepted revision and proposals on this branch"
            onClick={() =>
              void workspace
                .mutate({ action: 'select', branchId: project.activeBranchId })
                .catch(() => {})
            }
          >
            Refresh branch
          </button>
        )}
        <BranchMerge workspace={workspace} busy={busy} />
      </div>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-xl p-7 max-h-[85dvh] overflow-y-auto">
          <DialogTitle>
            {editing === 'new'
              ? 'New project'
              : editing === 'edit'
                ? 'Project details'
                : 'Your projects'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'The design assistant receives this brief and these requirements with every request.'
              : 'Reopen a saved design with its conversations and model revisions.'}
          </DialogDescription>
          {project && editing === 'edit' && (
            <ProjectTeam
              key={project.id}
              projectId={project.id}
              owner={project.role === 'owner'}
            />
          )}
          {editing ? (
            <form
              className="project-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label>
                Project name
                <input
                  readOnly={editing === 'edit' && project?.role !== 'owner'}
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Design brief
                <textarea
                  readOnly={editing === 'edit' && project?.role !== 'owner'}
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
                  readOnly={editing === 'edit' && project?.role !== 'owner'}
                  rows={4}
                  maxLength={8000}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder="Dimensions, material, clearances, and constraints to preserve…"
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <div className="project-actions">
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
                  disabled={
                    saving ||
                    !name.trim() ||
                    (editing === 'edit' && project?.role !== 'owner')
                  }
                >
                  {saving ? 'Saving…' : 'Save project'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="project-actions">
                <button className="quiet" onClick={() => form('new')}>
                  <Plus size={15} />
                  New project
                </button>
                {project && (
                  <button className="quiet" onClick={() => form('edit')}>
                    <Pencil size={14} />
                    Edit details
                  </button>
                )}
              </div>
              <div className="project-list">
                {workspace.projects.map((p) => (
                  <button
                    key={p.id}
                    className={p.id === project?.id ? 'selected' : ''}
                    onClick={() => {
                      void workspace.load(p.id);
                      setOpen(false);
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span>{p.brief || 'No design brief yet'}</span>
                    <small>
                      Updated {new Date(p.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
