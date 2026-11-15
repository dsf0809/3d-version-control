'use client';
import { useEffect, useRef, useState } from 'react';
import { Archive, Box, Ellipsis, PanelLeft, Plus } from 'lucide-react';
import TemplatePicker from './template-picker';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  createTemplate,
  templates,
  type TemplateId,
} from '@/lib/cad/templates';
import type { useProjects } from '@/lib/projects/client';

const narrow = () => window.matchMedia('(max-width: 1000px)').matches;

export default function ProjectSidebar({
  workspace,
  busy,
  onGuide,
}: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
  onGuide: () => void;
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
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Below the drawer breakpoint the list starts closed; above it, as last left.
    const media = window.matchMedia('(max-width: 1000px)');
    const sync = () => {
      try {
        setCollapsed(
          media.matches ||
            localStorage.getItem('form-sidebar-collapsed') === 'true',
        );
      } catch {}
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const disabled = busy || workspace.loading || saving;
  const owner = workspace.project?.role === 'owner';
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
  const toggle = (next: boolean) => {
    setCollapsed(next);
    if (narrow()) return;
    try {
      localStorage.setItem('form-sidebar-collapsed', String(next));
    } catch {}
  };
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
    <>
      <aside
        className={`sidebar ${collapsed ? 'collapsed' : ''}`}
        aria-label="Project navigation"
      >
        <div className="sidebar-head">
          <a className="brand" href="/" aria-label="Form">
            <Box size={18} />
            <b>
              form<span>.</span>
            </b>
          </a>
          <button
            className="quiet icon"
            aria-label={collapsed ? 'Expand projects' : 'Collapse projects'}
            title={collapsed ? 'Projects' : 'Hide projects'}
            aria-expanded={!collapsed}
            onClick={() => toggle(!collapsed)}
          >
            <PanelLeft size={16} />
          </button>
        </div>
        {!collapsed && (
          <>
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <nav
              aria-label={archived ? 'Archived projects' : 'Active projects'}
            >
              {archived && <small>Archived</small>}
              {projects.length === 0 &&
                (search || archived ? (
                  <p className="note">Nothing here.</p>
                ) : (
                  <button
                    className="quiet line"
                    disabled={disabled}
                    onClick={onGuide}
                  >
                    Start a guided project
                  </button>
                ))}
              {projects.map((p) => {
                const current = p.id === workspace.project?.id;
                return (
                  <div className="project-row" key={p.id}>
                    <button
                      disabled={disabled}
                      aria-current={current ? 'page' : undefined}
                      onClick={() =>
                        void perform(async () => {
                          await workspace.load(p.id);
                          if (narrow()) setCollapsed(true);
                        })
                      }
                    >
                      {p.name}
                    </button>
                    {current && owner && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="quiet icon"
                          aria-label="Project actions"
                          disabled={disabled}
                        >
                          <Ellipsis size={15} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={() => {
                              setMode('rename');
                              setName(workspace.project!.name);
                              setError('');
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
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
                            {p.archived ? 'Restore' : 'Archive'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </nav>
            {error && !mode && <p role="alert">{error}</p>}
            <div className="sidebar-foot">
              <DropdownMenu>
                <DropdownMenuTrigger className="quiet" disabled={disabled}>
                  <Plus size={15} /> New
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" className="w-40">
                  <DropdownMenuItem
                    onClick={() => {
                      setMode('new');
                      setName('');
                      setError('');
                    }}
                  >
                    Project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onGuide}>
                    Guided project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => file.current?.click()}>
                    Import JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                className={`quiet icon ${archived ? 'active' : ''}`}
                aria-label="Archived projects"
                title="Archived projects"
                aria-pressed={archived}
                onClick={() => setArchived(!archived)}
              >
                <Archive size={15} />
              </button>
            </div>
            <input
              ref={file}
              hidden
              type="file"
              aria-label="Import model JSON"
              accept=".json,application/json"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = '';
                if (!picked) return;
                void perform(async () => {
                  if (picked.size > 1000000)
                    throw new Error('Choose a JSON file smaller than 1 MB.');
                  let startingModel;
                  try {
                    startingModel = JSON.parse(await picked.text());
                  } catch {
                    throw new Error('This file is not valid model JSON.');
                  }
                  await workspace.create({
                    name:
                      picked.name.replace(/\.json$/i, '').slice(0, 120) ||
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
          </>
        )}
      </aside>
      {!collapsed && (
        <button
          className="sidebar-backdrop"
          aria-label="Close projects"
          tabIndex={-1}
          onClick={() => setCollapsed(true)}
        />
      )}
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setMode(null);
        }}
      >
        <DialogContent className="dialog sm:max-w-sm">
          <DialogTitle>
            {mode === 'rename' ? 'Rename project' : 'New project'}
          </DialogTitle>
          <form
            className="form"
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
              Name
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
            {error && <p role="alert">{error}</p>}
            <div className="row end">
              <button
                className="quiet"
                type="button"
                disabled={saving}
                onClick={() => setMode(null)}
              >
                Cancel
              </button>
              <button
                className="quiet primary"
                disabled={disabled || !name.trim()}
              >
                {mode === 'rename' ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
