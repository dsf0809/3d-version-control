'use client';
import { comparisonLayers, defaultComparisonVisibility, type ComparisonVisibility } from '@/lib/viewer/comparison-visibility';
import type { Model } from '@/lib/cad/model';
import { useEffect, useRef, useState, useId } from 'react';
import { createViewer } from '@/lib/viewer/engine';
import type { Compiled, Comparison } from '@/lib/cad/compile';
import { Focus, Grid2X2, Box, Maximize, Minimize, ListFilter, X } from 'lucide-react';
import type { FeatureChange } from '@/lib/cad/changes';
export default function ModelViewer({
  geometry,
  comparison,
  model,
  onSelectFeature,
  highlight,
  changes = [],
  onHighlightChange,
  focusMode = false,
}: {
  geometry: Compiled | null;
  model?: Model;
  onSelectFeature?: (id: string) => void;
  comparison: Comparison | null;
  highlight?: FeatureChange | null;
  changes?: FeatureChange[];
  onHighlightChange?: (id: string | null) => void;
  focusMode?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const detailsToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!comparison) setDetailsOpen(false); }, [comparison]);
  const mount = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(onSelectFeature);
  selectionRef.current = onSelectFeature;
  const focusRef = useRef(focusMode);
  focusRef.current = focusMode;
  const api = useRef<{
    set: (g: Compiled, c: Comparison | null) => void;
    appearance: (model: Model) => void;
    visibility: (value: ComparisonVisibility) => void;
    fit: () => void;
    grid: () => void;
    wire: () => void;
    highlight: (change: FeatureChange | null) => void;
  } | null>(null);
  const [visibility, setVisibility] = useState<ComparisonVisibility>(() => ({ ...defaultComparisonVisibility }));
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const fullscreenTarget = () =>
    mount.current?.closest<HTMLElement>('.model-stage, .viewer-panel');
  useEffect(() => {
    setFullscreenSupported(!!document.fullscreenEnabled);
    const changed = () =>
      setFullscreen(document.fullscreenElement === fullscreenTarget());
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === fullscreenTarget())
        await document.exitFullscreen();
      else await fullscreenTarget()?.requestFullscreen();
    } catch {
      setFullscreenError(
        'Fullscreen could not open. Try opening the app in a separate browser window.',
      );
    }
  };
  const [error, setError] = useState('');
  const [grid, setGrid] = useState(true);
  const [wire, setWire] = useState(false);
  useEffect(() => {
    const viewer = createViewer(
      mount.current!,
      () => focusRef.current,
      setError,
      (id) => selectionRef.current?.(id),
    );
    api.current = viewer ?? null;
    return () => {
      viewer?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (geometry) api.current?.set(geometry, comparison);
  }, [geometry, comparison]);
  useEffect(() => {
    if (model) api.current?.appearance(model);
  }, [model, geometry]);
  useEffect(() => {
    api.current?.highlight(highlight ?? null);
  }, [highlight]);
  useEffect(() => {
    api.current?.visibility(visibility);
  }, [visibility]);
  return (
    <>
      <div ref={mount} className="view-canvas" />
      {error && (
        <div role="alert" className="viewer-error">
          {error}
        </div>
      )}
      {fullscreenError && (
        <div className="fullscreen-notice" role="status">
          {fullscreenError}
        </div>
      )}
      {comparison && (
        <div className="comparison-layers" role="group" aria-label="Comparison layer visibility">
          {comparisonLayers.map((layer) => {
            const label = layer[0].toUpperCase() + layer.slice(1);
            return <button key={layer} type="button"
              aria-label={label} aria-pressed={visibility[layer]}
              title={`${visibility[layer] ? 'Hide' : 'Show'} ${label.toLowerCase()} geometry`}
              onClick={() => setVisibility((current) => ({ ...current, [layer]: !current[layer] }))}>
              <i className={`legend-dot ${layer}`} aria-hidden="true" />{label}
            </button>;
          })}
          {!Object.values(visibility).some(Boolean) && <span role="status">All layers hidden</span>}
        </div>
      )}
      {comparison && detailsOpen && (
        <section id={detailsId} className="viewer-change-details" aria-label="Change details"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setDetailsOpen(false); detailsToggle.current?.focus(); } }}>
          <header><strong>Change details</strong><button type="button" aria-label="Close change details" onClick={() => { setDetailsOpen(false); detailsToggle.current?.focus(); }}><X size={16} /></button></header>
          <p>Read-only changes between these versions. Select a feature to highlight its before and after bounds.</p>
          <div className="viewer-change-list">
            {changes.length === 0 && <p>No feature changes.</p>}
            {changes.map((change) => <button type="button" key={change.id} aria-pressed={highlight?.id === change.id}
              onClick={() => onHighlightChange?.(highlight?.id === change.id ? null : change.id)}>
              <strong>{change.name}</strong>{change.details.map((detail) => <span key={detail}>{detail}</span>)}
            </button>)}
          </div>
        </section>
      )}
      <div className="view-tools">
        <button
          className={`quiet tool ${fullscreen ? 'active' : ''}`}
          title={
            !fullscreenSupported
              ? 'Fullscreen is not supported in this browser'
              : fullscreen
                ? 'Exit fullscreen (Esc)'
                : 'Enter fullscreen'
          }
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          aria-pressed={fullscreen}
          disabled={!fullscreenSupported}
          onClick={() => void toggleFullscreen()}
        >
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
        <button
          className="quiet tool"
          title="Fit model"
          aria-label="Fit model"
          onClick={() => api.current?.fit()}
        >
          <Focus size={17} />
        </button>
        <button
          className={`quiet tool ${grid ? 'active' : ''}`}
          title="Toggle grid"
          aria-label="Toggle grid"
          aria-pressed={grid}
          onClick={() => {
            api.current?.grid();
            setGrid(!grid);
          }}
        >
          <Grid2X2 size={17} />
        </button>
        <button
          className={`quiet tool ${wire ? 'active' : ''}`}
          title="Toggle wireframe"
          aria-label="Toggle wireframe"
          aria-pressed={wire}
          onClick={() => {
            api.current?.wire();
            setWire(!wire);
          }}
        >
          <Box size={17} />
        </button>
        {comparison && <button ref={detailsToggle} type="button" className={`quiet tool ${detailsOpen ? 'active' : ''}`}
          title="Change details" aria-label="Change details" aria-expanded={detailsOpen} aria-controls={detailsOpen ? detailsId : undefined}
          onClick={() => setDetailsOpen((open) => !open)}><ListFilter size={17} /></button>}
      </div>
    </>
  );
}
