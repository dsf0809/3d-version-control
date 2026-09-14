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
    <details className="feature-inspector" open>
      <summary>Feature inspector · dimensions & position</summary>
      <label>
        Feature
        <select
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
      </label>
      <FeatureFields
        key={JSON.stringify(feature)}
        feature={feature}
        disabled={disabled}
        submit={submit}
      />
    </details>
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
      <p>
        Dimensions follow the feature’s local axes. Position is its center in
        world coordinates. All values are millimeters.
      </p>
      <fieldset disabled={disabled || saving}>
        <legend>Dimensions (mm)</legend>
        <div className="feature-fields">
          {['Width X', 'Depth Y', 'Height Z'].map((label, i) => (
            <label key={label}>
              {label}
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
        <legend>Center position (mm)</legend>
        <div className="feature-fields">
          {['Center X', 'Center Y', 'Center Z'].map((label, i) => (
            <label key={label}>
              {label}
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
        <button className="quiet" type="submit" disabled={unchanged}>
          {saving ? 'Preparing proposal…' : 'Preview feature edit'}
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
