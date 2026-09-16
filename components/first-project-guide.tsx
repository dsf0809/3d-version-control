'use client';
import { useRef, useState } from 'react';
import { PackageOpen, PanelsTopLeft, MoveUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { createTemplate, templates, type TemplateId, type TemplateDimensions } from '@/lib/cad/templates';
import type { useProjects } from '@/lib/projects/client';

const choices = [
  { id: 'tray', icon: PanelsTopLeft, description: 'A divided home for small desk essentials.' },
  { id: 'enclosure', icon: PackageOpen, description: 'An open box for a small component or collection.' },
  { id: 'bracket', icon: MoveUpRight, description: 'A simple right-angle part with a base and upright.' },
] as const;
const labels = { width: 'Width', depth: 'Depth', height: 'Height', wall: 'Wall thickness' };

export default function FirstProjectGuide({ workspace, busy, onOpenTool }: {
  workspace: ReturnType<typeof useProjects>;
  busy: boolean;
  onOpenTool: (tool: 'edit' | 'export') => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState<TemplateId>('tray');
  const [dimensions, setDimensions] = useState<TemplateDimensions>({ ...templates.tray.dimensions });
  const [name, setName] = useState('My first organizer tray');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  let validation = '';
  try { createTemplate(template, dimensions); }
  catch (e) { validation = e instanceof Error ? e.message : 'Check your dimensions.'; }
  const close = () => setOpen(false);
  return <>
    <button className="quiet guided-launch" disabled={busy || workspace.loading || saving} onClick={() => {
      setStep(0); setError(''); setOpen(true);
    }}>Guided first project</button>
    <Dialog open={open} onOpenChange={(value) => { if (!submitting.current) setOpen(value); }}>
      <DialogContent className="first-project-guide sm:max-w-xl max-h-[85dvh] overflow-y-auto" showCloseButton={!saving}>
        <div className="guide-eyebrow">{step < 3 ? `STEP ${step + 1} OF 3 · YOUR FIRST PART` : 'READY TO EXPLORE'}</div>
        <DialogTitle>{['What would you like to make?', 'Make it your size', 'Give your project a name', 'Your first model is saved.'][step]}</DialogTitle>
        <DialogDescription>{[
          'Start with a simple shape you can change later. No AI key needed.',
          'All dimensions are in millimeters. Keep the suggested sizes, or measure the space your part should fit.',
          'We’ll open your model in the workshop and save its starting version as V0.',
          'Drag the model to look around and scroll to zoom. Your project is available in Projects whenever you return.',
        ][step]}</DialogDescription>
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          if (step < 2) { if (step === 1 && validation) return; setStep(step + 1); return; }
          if (step !== 2 || validation || !name.trim()) return;
          submitting.current = true; setSaving(true); setError('');
          try {
            await workspace.create({ name: name.trim(), brief: `A ${templates[template].name.toLowerCase()} created with the first-project guide.`, requirements: '', startingModel: createTemplate(template, dimensions) });
            setStep(3);
          } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your project. Try again.'); }
          finally { submitting.current = false; setSaving(false); }
        }}>
          {step === 0 && <div className="guide-choices" role="group" aria-label="Choose your first part">
            {choices.map(({ id, icon: Icon, description }) => <button key={id} type="button" aria-pressed={template === id} className="guide-choice" onClick={() => {
              setTemplate(id); setDimensions({ ...templates[id].dimensions }); setName(`My first ${templates[id].name.toLowerCase()}`);
            }}><Icon size={24} /><strong>{templates[id].name}</strong><span>{description}</span></button>)}
          </div>}
          {step === 1 && <>
            <div className="guide-dimensions">{(Object.keys(labels) as (keyof TemplateDimensions)[]).map((key) => <label key={key}>{labels[key]} (mm)
              <input required type="number" min="0.2" max="500" step="0.1" value={Number.isNaN(dimensions[key]) ? '' : dimensions[key]} onChange={(e) => setDimensions({ ...dimensions, [key]: e.target.valueAsNumber })} />
            </label>)}</div>
            <p className="guide-hint">Width and depth describe the footprint; height is measured from the base. Each outside dimension must be more than twice the wall thickness.</p>
            {validation && <p role="alert" className="guide-error">{validation}</p>}
            <button type="button" className="quiet" onClick={() => setDimensions({ ...templates[template].dimensions })}>Use suggested dimensions</button>
          </>}
          {step === 2 && <>
            <label className="guide-name">Project name<input required maxLength={120} disabled={saving} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="guide-summary"><strong>{templates[template].name}</strong><span>{dimensions.width} × {dimensions.depth} × {dimensions.height} mm</span><span>{dimensions.wall} mm walls · Editable starting model</span></div>
            <p className="guide-hint">You can edit dimensions after creating it. Review and accept later edits to add new saved versions.</p>
          </>}
          {step === 3 && <div className="guide-next">
            <button type="button" onClick={() => { close(); onOpenTool('edit'); }}><strong>1. Try a small edit</strong><span>Change a feature, preview it, then accept to save V1.</span></button>
            <button type="button" onClick={() => { close(); onOpenTool('export'); }}><strong>2. Prepare for printing</strong><span>Export a 3MF or STL and check it in your slicer.</span></button>
          </div>}
          {error && <p role="alert" className="guide-error">{error}</p>}
          <div className="guide-footer">
            {step > 0 && step < 3 && <button type="button" className="quiet" disabled={saving} onClick={() => { setError(''); setStep(step - 1); }}>Back</button>}
            {step < 3 ? <button className="guide-primary" disabled={saving || (step === 1 && !!validation) || (step === 2 && (!name.trim() || !!validation))}>{saving ? 'Creating your project…' : step === 2 ? 'Create my project' : 'Continue'}</button> : <button type="button" className="guide-primary" onClick={close}>Explore my model</button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
