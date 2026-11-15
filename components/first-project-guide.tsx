'use client';
import { useRef, useState } from 'react';
import { MoveUpRight, PackageOpen, PanelsTopLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  createTemplate,
  templates,
  type TemplateId,
  type TemplateDimensions,
} from '@/lib/cad/templates';
import type { useProjects } from '@/lib/projects/client';

const choices = [
  { id: 'tray', icon: PanelsTopLeft },
  { id: 'enclosure', icon: PackageOpen },
  { id: 'bracket', icon: MoveUpRight },
] as const;
const labels = {
  width: 'Width',
  depth: 'Depth',
  height: 'Height',
  wall: 'Wall',
};
const titles = ['Pick a shape', 'Set the size', 'Name it', 'Saved as V0'];

export default function FirstProjectGuide({
  workspace,
  open,
  onOpenChange,
  onOpenTool,
}: {
  workspace: ReturnType<typeof useProjects>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTool: (tool: 'edit' | 'export') => void;
}) {
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId>('tray');
  const [dimensions, setDimensions] = useState<TemplateDimensions>({
    ...templates.tray.dimensions,
  });
  const [name, setName] = useState('My first organizer tray');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  let validation = '';
  try {
    createTemplate(template, dimensions);
  } catch (e) {
    validation = e instanceof Error ? e.message : 'Check your dimensions.';
  }
  const close = () => {
    onOpenChange(false);
    setStep(0);
    setError('');
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (submitting.current) return;
        if (value) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="dialog sm:max-w-md" showCloseButton={!saving}>
        <DialogTitle>{titles[step]}</DialogTitle>
        <form
          className="form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting.current) return;
            if (step < 2) {
              if (step === 1 && validation) return;
              setStep(step + 1);
              return;
            }
            if (step !== 2 || validation || !name.trim()) return;
            submitting.current = true;
            setSaving(true);
            setError('');
            try {
              await workspace.create({
                name: name.trim(),
                brief: `A ${templates[template].name.toLowerCase()} created with the first-project guide.`,
                requirements: '',
                startingModel: createTemplate(template, dimensions),
              });
              setStep(3);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : 'Could not save your project. Try again.',
              );
            } finally {
              submitting.current = false;
              setSaving(false);
            }
          }}
        >
          {step === 0 && (
            <div
              className="choices"
              role="group"
              aria-label="Choose your first part"
            >
              {choices.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={template === id}
                  className="choice"
                  onClick={() => {
                    setTemplate(id);
                    setDimensions({ ...templates[id].dimensions });
                    setName(`My first ${templates[id].name.toLowerCase()}`);
                  }}
                >
                  <Icon size={22} />
                  <strong>{templates[id].name}</strong>
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <>
              <div className="fields four">
                {(Object.keys(labels) as (keyof TemplateDimensions)[]).map(
                  (key) => (
                    <label key={key}>
                      {labels[key]} · mm
                      <input
                        required
                        type="number"
                        min="0.2"
                        max="500"
                        step="0.1"
                        value={
                          Number.isNaN(dimensions[key]) ? '' : dimensions[key]
                        }
                        onChange={(e) =>
                          setDimensions({
                            ...dimensions,
                            [key]: e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              {validation && <p role="alert">{validation}</p>}
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Project name
                <input
                  autoFocus
                  required
                  maxLength={120}
                  disabled={saving}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p className="note">
                {templates[template].name} · {dimensions.width} ×{' '}
                {dimensions.depth} × {dimensions.height} mm
              </p>
            </>
          )}
          {step === 3 && (
            <div className="choices two">
              <button
                type="button"
                className="choice"
                onClick={() => {
                  close();
                  onOpenTool('edit');
                }}
              >
                <strong>Edit it</strong>
                <span>Change a dimension</span>
              </button>
              <button
                type="button"
                className="choice"
                onClick={() => {
                  close();
                  onOpenTool('export');
                }}
              >
                <strong>Print it</strong>
                <span>Export 3MF or STL</span>
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="row">
            {step < 3 && (
              <span className="steps" aria-label={`Step ${step + 1} of 3`}>
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i === step ? 'on' : ''} />
                ))}
              </span>
            )}
            <span className="grow" />
            {step === 1 && (
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  setDimensions({ ...templates[template].dimensions })
                }
              >
                Reset
              </button>
            )}
            {step > 0 && step < 3 && (
              <button
                type="button"
                className="quiet"
                disabled={saving}
                onClick={() => {
                  setError('');
                  setStep(step - 1);
                }}
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                className="quiet primary"
                disabled={
                  saving ||
                  (step === 1 && !!validation) ||
                  (step === 2 && (!name.trim() || !!validation))
                }
              >
                {saving ? 'Creating…' : step === 2 ? 'Create' : 'Continue'}
              </button>
            ) : (
              <button type="button" className="quiet primary" onClick={close}>
                Done
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
