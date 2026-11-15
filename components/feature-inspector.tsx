'use client';
import { useState } from 'react';
import type { Model } from '@/lib/cad/model';

export default function FeatureInspector({
  model,
  initialSelected,
  disabled,
  submit,
}: {
  model: Model;
  initialSelected?: string | null;
  disabled: boolean;
  submit: (
    featureId: string,
    size: number[],
    position: number[],
  ) => Promise<void>;
}) {
  const [selected, setSelected] = useState(
    initialSelected || model.operations[0]?.id || '',
  );
  const feature =
    model.operations.find((o) => o.id === selected) ?? model.operations[0];
  return (
    <div className="form">
      <select
        aria-label="Feature"
        value={feature.id}
        disabled={disabled}
        onChange={(e) => setSelected(e.target.value)}
      >
        {model.operations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} · {o.operation} {o.kind}
          </option>
        ))}
      </select>
      <FeatureFields
        key={JSON.stringify(feature)}
        feature={feature}
        disabled={disabled}
        submit={submit}
      />
    </div>
  );
}
function FeatureFields({
  feature,
  disabled,
  submit,
}: {
  feature: Model['operations'][number];
  disabled: boolean;
  submit: (id: string, size: number[], position: number[]) => Promise<void>;
}) {
  const [size, setSize] = useState(feature.size.map(String));
  const [position, setPosition] = useState(feature.position.map(String));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unchanged =
    JSON.stringify(size.map(Number)) === JSON.stringify(feature.size) &&
    JSON.stringify(position.map(Number)) === JSON.stringify(feature.position);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
          await submit(feature.id!, size.map(Number), position.map(Number));
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not save edit.');
        } finally {
          setSaving(false);
        }
      }}
    >
      <fieldset className="form" disabled={disabled || saving}>
        <div className="fields three">
          {[
            ['Width X', 'W'],
            ['Depth Y', 'D'],
            ['Height Z', 'H'],
          ].map(([label, short], i) => (
            <label key={label}>
              {short} · mm
              <input
                aria-label={label}
                type="number"
                required
                min="0.2"
                max="500"
                step="any"
                value={size[i]}
                onChange={(e) =>
                  setSize(size.map((n, j) => (i === j ? e.target.value : n)))
                }
              />
            </label>
          ))}
        </div>
        <div className="fields three">
          {[
            ['Center X', 'X'],
            ['Center Y', 'Y'],
            ['Center Z', 'Z'],
          ].map(([label, short], i) => (
            <label key={label}>
              {short} · center
              <input
                aria-label={label}
                type="number"
                required
                min="-1000"
                max="1000"
                step="any"
                value={position[i]}
                onChange={(e) =>
                  setPosition(
                    position.map((n, j) => (i === j ? e.target.value : n)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <div className="row end">
          <button className="quiet primary" type="submit" disabled={unchanged}>
            {saving ? 'Preparing…' : 'Preview'}
          </button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
