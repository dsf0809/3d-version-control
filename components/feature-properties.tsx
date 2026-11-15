'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { Model } from '@/lib/cad/model';
import type { DimensionLink } from '@/lib/cad/relationships';
export default function FeatureProperties({
  model,
  selected,
  disabled,
  submit,
}: {
  model: Model;
  selected?: string | null;
  disabled: boolean;
  submit: (
    featureId: string,
    color: string,
    links: DimensionLink[],
  ) => Promise<void>;
}) {
  const [id, setId] = useState(selected || model.operations[0].id!);
  const feature =
    model.operations.find((o) => o.id === id) || model.operations[0];
  const [color, setColor] = useState(feature.color || '#778ee0'),
    [links, setLinks] = useState(model.relationships || []),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const [source, setSource] = useState(model.operations[0].id!),
    [axis, setAxis] = useState(0),
    [sourceAxis, setSourceAxis] = useState(0),
    [field, setField] = useState<'size' | 'position'>('size'),
    [sourceField, setSourceField] = useState<'size' | 'position'>('size'),
    [factor, setFactor] = useState(1),
    [offset, setOffset] = useState(0);
  const name = (featureId: string) =>
    model.operations.find((o) => o.id === featureId)?.name;
  return (
    <details className="more">
      <summary>Color & links</summary>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError('');
          try {
            await submit(feature.id!, color, links);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to save.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset className="form" disabled={disabled || saving}>
          <div className="row">
            <select
              className="grow"
              aria-label="Appearance feature"
              value={feature.id}
              onChange={(e) => {
                setId(e.target.value);
                setColor(
                  model.operations.find((o) => o.id === e.target.value)
                    ?.color || '#778ee0',
                );
              }}
            >
              {model.operations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <input
              type="color"
              aria-label="Feature color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div className="link-builder">
            <select
              aria-label="Link target"
              value={field}
              onChange={(e) => setField(e.target.value as typeof field)}
            >
              <option value="size">Size</option>
              <option value="position">Position</option>
            </select>
            <select
              aria-label="Link target axis"
              value={axis}
              onChange={(e) => setAxis(Number(e.target.value))}
            >
              {['X', 'Y', 'Z'].map((a, i) => (
                <option key={a} value={i}>
                  {a}
                </option>
              ))}
            </select>
            <span>=</span>
            <select
              className="grow"
              aria-label="Link source feature"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {model.operations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Link source"
              value={sourceField}
              onChange={(e) =>
                setSourceField(e.target.value as typeof sourceField)
              }
            >
              <option value="size">Size</option>
              <option value="position">Position</option>
            </select>
            <select
              aria-label="Link source axis"
              value={sourceAxis}
              onChange={(e) => setSourceAxis(Number(e.target.value))}
            >
              {['X', 'Y', 'Z'].map((a, i) => (
                <option key={a} value={i}>
                  {a}
                </option>
              ))}
            </select>
            <span>×</span>
            <input
              type="number"
              step="any"
              aria-label="Link scale"
              value={factor}
              onChange={(e) => setFactor(Number(e.target.value))}
            />
            <span>+</span>
            <input
              type="number"
              step="any"
              aria-label="Link offset in millimeters"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
            />
            <button
              type="button"
              className="quiet line"
              onClick={() =>
                setLinks([
                  ...links.filter(
                    (l) =>
                      !(
                        l.target.featureId === feature.id &&
                        l.target.field === field &&
                        l.target.axis === axis
                      ),
                  ),
                  {
                    target: {
                      featureId: feature.id!,
                      field,
                      axis: axis as 0 | 1 | 2,
                    },
                    source: {
                      featureId: source,
                      field: sourceField,
                      axis: sourceAxis as 0 | 1 | 2,
                    },
                    factor,
                    offset,
                  },
                ])
              }
            >
              Link
            </button>
          </div>
          {links.length > 0 && (
            <ul className="list">
              {links.map((l, i) => (
                <li key={i}>
                  <code>
                    {name(l.target.featureId)} {l.target.field}.
                    {'XYZ'[l.target.axis]} = {name(l.source.featureId)}{' '}
                    {l.source.field}.{'XYZ'[l.source.axis]} × {l.factor} +{' '}
                    {l.offset}
                  </code>
                  <button
                    type="button"
                    className="quiet icon"
                    aria-label={`Remove dimension link ${i + 1}`}
                    onClick={() => setLinks(links.filter((_, j) => i !== j))}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row end">
            <button className="quiet primary" type="submit">
              {saving ? 'Saving…' : 'Preview'}
            </button>
          </div>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
