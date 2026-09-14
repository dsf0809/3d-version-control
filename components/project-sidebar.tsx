'use client';
import { useState, useEffect } from 'react';
import TemplatePicker from './template-picker';
import {
  createTemplate,
  templates,
  type TemplateId,
} from '@/lib/cad/templates';
import type { useProjects } from '@/lib/projects/client';
export default function ProjectSidebar({
  workspace,
  busy,
}: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [mode, setMode] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState<TemplateId>('tray');
  const [dimensions, setDimensions] = useState({
    ...templates.tray.dimensions,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      setCollapsed(
        window.matchMedia('(max-width: 1000px)').matches ||
          localStorage.getItem('form-sidebar-collapsed') === 'true',
      );
    } catch {}
  }, []);
  const disabled = busy || workspace.loading || saving;
  const projects = [...workspace.projects]
    .filter(
      (p) =>
        p.archived === archived &&
        p.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const perform = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError('');
    try {
      await fn();
      setMode(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update project.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <aside
      className={`project-sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="Project navigation"
    >
      <button
        className="quiet sidebar-toggle"
        aria-label={collapsed ? 'Expand projects' : 'Collapse projects'}
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed(!collapsed);
          try {
            localStorage.setItem('form-sidebar-collapsed', String(!collapsed));
          } catch {}
        }}
      >
        {collapsed ? '☰' : 'Projects ‹'}
      </button>
      {!collapsed && (
        <>
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => {
              setMode('new');
              setName('');
              setError('');
            }}
          >
            + New project
          </button>
          <label>
            Import model JSON
            <input
              type="file"
              accept=".json,application/json"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                void perform(async () => {
                  if (file.size > 1000000)
                    throw new Error('Choose a JSON file smaller than 1 MB.');
                  let startingModel;
                  try {
                    startingModel = JSON.parse(await file.text());
                  } catch {
                    throw new Error('This file is not valid model JSON.');
                  }
                  await workspace.create({
                    name:
                      file.name.replace(/\.json$/i, '').slice(0, 120) ||
                      'Imported model',
                    brief: '',
                    requirements: '',
                    startingModel,
                  });
                  setArchived(false);
                  setSearch('');
                });
              }}
            />
          </label>
          <input
            aria-label="Search projects"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="archive-filter">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{' '}
            Archived projects
          </label>
          <nav aria-label={archived ? 'Archived projects' : 'Active projects'}>
            {projects.length === 0 && (
              <p>
                {search
                  ? 'No matching projects.'
                  : archived
                    ? 'No archived projects.'
                    : 'No active projects. Create a project to begin.'}
              </p>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                disabled={disabled}
                aria-current={
                  p.id === workspace.project?.id ? 'page' : undefined
                }
                onClick={() => void perform(() => workspace.load(p.id))}
              >
                <strong>{p.name}</strong>
                <small>
                  Updated {new Date(p.updatedAt).toLocaleDateString()}
                </small>
              </button>
            ))}
          </nav>
          {workspace.project && (
            <div className="sidebar-actions">
              <small>
                Current: {workspace.project.name}
                {workspace.project.archived ? ' (archived)' : ''}
              </small>
              <button
                className="quiet"
                disabled={disabled || workspace.project?.role !== 'owner'}
                onClick={() => {
                  setMode('rename');
                  setName(workspace.project!.name);
                }}
              >
                Rename project
              </button>
              <button
                className="quiet"
                disabled={disabled || workspace.project?.role !== 'owner'}
                onClick={() =>
                  void perform(async () => {
                    const value = !workspace.project!.archived;
                    await workspace.mutate({
                      action: 'archive',
                      archived: value,
                    });
                    setArchived(value);
                  })
                }
              >
                {workspace.project.archived
                  ? 'Restore project'
                  : 'Archive project'}
              </button>
            </div>
          )}
          {mode && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  if (mode === 'new') {
                    await workspace.create({
                      startingModel: createTemplate(template, dimensions),
                      name,
                      brief: '',
                      requirements: '',
                    });
                    setArchived(false);
                    setSearch('');
                  } else
                    await workspace.mutate({
                      action: 'update',
                      name,
                      brief: workspace.project!.brief,
                      requirements: workspace.project!.requirements,
                    });
                });
              }}
            >
              <label>
                {mode === 'new' ? 'New project name' : 'Project name'}
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              {mode === 'new' && (
                <TemplatePicker
                  value={template}
                  dimensions={dimensions}
                  onChange={(id, d) => {
                    setTemplate(id);
                    setDimensions(d);
                  }}
                  disabled={disabled}
                />
              )}
              <button className="quiet" disabled={disabled || !name.trim()}>
                Save
              </button>
              <button
                className="quiet"
                type="button"
                disabled={saving}
                onClick={() => setMode(null)}
              >
                Cancel
              </button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </aside>
  );
}
