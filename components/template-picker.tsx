'use client';
import {
  templates,
  type TemplateId,
  type TemplateDimensions,
} from '@/lib/cad/templates';

const labels = { width: 'W', depth: 'D', height: 'H', wall: 'Wall' } as const;

export default function TemplatePicker({
  value,
  dimensions,
  onChange,
  disabled,
}: {
  value: TemplateId;
  dimensions: TemplateDimensions;
  onChange: (id: TemplateId, dimensions: TemplateDimensions) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        Shape
        <select
          aria-label="Starting model"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const id = e.target.value as TemplateId;
            onChange(id, { ...templates[id].dimensions });
          }}
        >
          {Object.entries(templates).map(([id, t]) => (
            <option key={id} value={id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="fields four">
        {(['width', 'depth', 'height', 'wall'] as const).map((key) => (
          <label key={key}>
            {labels[key]} · mm
            <input
              aria-label={`Starting ${key}`}
              disabled={disabled}
              type="number"
              min="0.2"
              max="500"
              step="0.1"
              value={dimensions[key]}
              onChange={(e) =>
                onChange(value, {
                  ...dimensions,
                  [key]: Number(e.target.value),
                })
              }
            />
          </label>
        ))}
      </div>
    </>
  );
}
