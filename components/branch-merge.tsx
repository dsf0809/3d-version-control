'use client';
import { useState } from 'react';
import { api, type useProjects } from '@/lib/projects/client';
import type { MergeConflict, MergeChoices } from '@/lib/cad/merge';
import { GitMerge } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
type Preview = {
  conflicts: MergeConflict[];
  sourceRevisionId: string;
  targetRevisionId: string;
  ready?: boolean;
};
export default function BranchMerge({
  workspace,
  busy,
}: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false),
    [source, setSource] = useState(''),
    [preview, setPreview] = useState<Preview | null>(null),
    [choices, setChoices] = useState<MergeChoices>({}),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const p = workspace.project;
  if (!p) return null;
  const run = async (inspect: boolean) => {
    setSaving(true);
    setError('');
    try {
      const result = await api<Preview>(`/api/projects/${p.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({
          sourceBranchId: source,
          targetBranchId: p.activeBranchId,
          preview: inspect,
          choices: inspect ? {} : choices,
          ...(!inspect && preview
            ? {
                sourceRevisionId: preview.sourceRevisionId,
                targetRevisionId: preview.targetRevisionId,
              }
            : {}),
        }),
      });
      if (result.ready) {
        await workspace.load(p.id);
        setOpen(false);
      } else setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not merge branches.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button
        className="quiet icon"
        aria-label="Merge branches"
        title="Merge a branch into this one"
        disabled={
          busy ||
          workspace.loading ||
          !workspace.branch?.canEdit ||
          p.branches.length < 2
        }
        onClick={() => {
          setSource(
            p.branches.find((b) => b.id !== p.activeBranchId)?.id || '',
          );
          setPreview(null);
          setChoices({});
          setError('');
          setOpen(true);
        }}
      >
        <GitMerge size={15} />
      </button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!saving) setOpen(v);
        }}
      >
        <DialogContent className="dialog form sm:max-w-md">
          <DialogTitle>Merge into {workspace.branch?.name}</DialogTitle>
          <label>
            From
            <select
              aria-label="Contribution branch"
              value={source}
              disabled={saving}
              onChange={(e) => {
                setSource(e.target.value);
                setPreview(null);
                setChoices({});
              }}
            >
              {p.branches
                .filter((b) => b.id !== p.activeBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.createdBy}
                  </option>
                ))}
            </select>
          </label>
          {preview?.conflicts.map((c) => (
            <div key={c.path} className="conflict">
              <strong>{c.path}</strong>
              <label>
                <input
                  type="radio"
                  name={c.path}
                  checked={choices[c.path] === 'target'}
                  onChange={() =>
                    setChoices({ ...choices, [c.path]: 'target' })
                  }
                />{' '}
                {workspace.branch?.name} <code>{JSON.stringify(c.target)}</code>
              </label>
              <label>
                <input
                  type="radio"
                  name={c.path}
                  checked={choices[c.path] === 'source'}
                  onChange={() =>
                    setChoices({ ...choices, [c.path]: 'source' })
                  }
                />{' '}
                {p.branches.find((b) => b.id === source)?.name}{' '}
                <code>{JSON.stringify(c.source)}</code>
              </label>
            </div>
          ))}
          {preview && !preview.conflicts.length && (
            <p className="note">No conflicts.</p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            className="quiet primary"
            disabled={
              saving ||
              !source ||
              (!!preview && preview.conflicts.some((c) => !choices[c.path]))
            }
            onClick={() => void run(!preview)}
          >
            {saving ? 'Preparing…' : preview ? 'Merge for review' : 'Check'}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
