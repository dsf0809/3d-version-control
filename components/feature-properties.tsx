'use client';
import { useState } from 'react';
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
  return (
    <details className="feature-inspector feature-properties">
      <summary>Appearance & dimension links</summary>
      <form
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
        <fieldset disabled={disabled || saving}>
          <label>
            Feature
            <select
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
          </label>
          <label>
            Model color
            <input
              type="color"
              aria-label="Feature color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
          <p>
            Links keep a target value equal to a source value × scale + offset.
            Cycles and conflicts with dimension locks are rejected.
          </p>
          <div className="feature-fields">
            <label>
              Target
              <select
                value={field}
                onChange={(e) => setField(e.target.value as typeof field)}
              >
                <option value="size">Dimension</option>
                <option value="position">Position</option>
              </select>
            </label>
            <label>
              Target axis
              <select
                value={axis}
                onChange={(e) => setAxis(Number(e.target.value))}
              >
                {['X', 'Y', 'Z'].map((a, i) => (
                  <option key={a} value={i}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source feature
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {model.operations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select
                value={sourceField}
                onChange={(e) =>
                  setSourceField(e.target.value as typeof sourceField)
                }
              >
                <option value="size">Dimension</option>
                <option value="position">Position</option>
              </select>
            </label>
            <label>
              Source axis
              <select
                value={sourceAxis}
                onChange={(e) => setSourceAxis(Number(e.target.value))}
              >
                {['X', 'Y', 'Z'].map((a, i) => (
                  <option key={a} value={i}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scale
              <input
                type="number"
                step="any"
                value={factor}
                onChange={(e) => setFactor(Number(e.target.value))}
              />
            </label>
            <label>
              Offset · mm
              <input
                type="number"
                step="any"
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
              />
            </label>
          </div>
          <button
            type="button"
            className="quiet"
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
            Add / replace link
          </button>
          {links.map((l, i) => (
            <p key={i}>
              {model.operations.find((o) => o.id === l.target.featureId)?.name}{' '}
              {l.target.field}[{l.target.axis}] ←{' '}
              {model.operations.find((o) => o.id === l.source.featureId)?.name}{' '}
              {l.source.field}[{l.source.axis}] × {l.factor} + {l.offset}{' '}
              <button
                type="button"
                className="quiet"
                aria-label={`Remove dimension link ${i + 1}`}
                onClick={() => setLinks(links.filter((_, j) => i !== j))}
              >
                Remove
              </button>
            </p>
          ))}
          <button className="quiet" type="submit">
            {saving ? 'Saving…' : 'Preview property changes'}
          </button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
