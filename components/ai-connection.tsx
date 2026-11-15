'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';

export type ProviderOption = {
  id: string;
  label: string;
  defaultModel: string;
  modelHint: string;
  keyRequired: boolean;
  keyHint: string;
  customUrl: boolean;
  baseUrl: string;
};
type Current = {
  provider: string;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
} | null;
type Overview = {
  providers: ProviderOption[];
  personal: Current;
  shared: { provider: string; model: string; dailyLimit: number } | null;
  canSetEndpoint: boolean;
};
export type AIStatus = {
  configured: boolean;
  model: string;
  provider?: string;
  source?: 'personal' | 'server' | null;
  remainingToday?: number | null;
};

/** Provider, model, key and (where allowed) endpoint fields for one connection. */
export function ConnectionForm({
  providers,
  current,
  canSetEndpoint,
  submitLabel,
  onSave,
  onRemove,
}: {
  providers: ProviderOption[];
  current: Current;
  canSetEndpoint: boolean;
  submitLabel: string;
  onSave: (body: {
    provider: string;
    model: string;
    key: string;
    baseUrl: string;
  }) => Promise<unknown>;
  onRemove?: () => Promise<unknown>;
}) {
  const [provider, setProvider] = useState(
    current?.provider ?? providers[0]?.id ?? 'openai',
  );
  const [model, setModel] = useState(current?.model ?? '');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? '');
  const [saving, setSaving] = useState(false);
  const info = providers.find((p) => p.id === provider) ?? providers[0];
  const keeping = current?.provider === provider && current.hasKey;
  const endpoint = info?.customUrl && canSetEndpoint;
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSave({
            provider,
            model,
            key,
            baseUrl: endpoint ? baseUrl : '',
          });
          setKey('');
        } finally {
          setSaving(false);
        }
      }}
    >
      <label>
        Provider
        <select
          value={provider}
          disabled={saving}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel(e.target.value === current?.provider ? current.model : '');
          }}
        >
          {providers
            .filter((p) => !p.customUrl || canSetEndpoint)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
        </select>
      </label>
      <label>
        Model
        <input
          value={model}
          disabled={saving}
          onChange={(e) => setModel(e.target.value)}
          placeholder={
            info?.defaultModel
              ? `${info.defaultModel} (default)`
              : info?.modelHint
          }
          required={!info?.defaultModel}
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      {endpoint && (
        <label>
          Endpoint URL
          <input
            value={baseUrl}
            disabled={saving}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={info.baseUrl || 'https://host/v1'}
            required={!info.baseUrl}
            type="url"
          />
        </label>
      )}
      <label>
        API key{info?.keyRequired ? '' : ' · optional'}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          value={key}
          disabled={saving}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keeping ? 'Saved — leave empty to keep' : info?.keyHint}
          required={!!info?.keyRequired && !keeping}
        />
      </label>
      <div className="row end">
        <button className="quiet primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onRemove && (
          <button
            className="quiet"
            type="button"
            disabled={saving}
            onClick={() => void onRemove()}
          >
            Remove
          </button>
        )}
      </div>
    </form>
  );
}

export default function AIConnection({
  open,
  onOpenChange,
  status,
  refresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: AIStatus | null;
  statusError: boolean;
  refresh: () => Promise<unknown>;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async () => {
    const r = await fetch('/api/ai-connection');
    const data = await r.json();
    if (!r.ok)
      throw new Error(data.error || 'Could not load the AI connection.');
    setOverview(data);
  };
  useEffect(() => {
    if (open) load().catch((e: Error) => setError(e.message));
  }, [open]);
  const change = (next: boolean) => {
    if (!next) {
      setError('');
      setNotice('');
    }
    onOpenChange(next);
  };
  const send = async (method: 'POST' | 'DELETE', body?: unknown) => {
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/ai-connection', {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(data.error || 'Could not save the connection.');
      setNotice(
        method === 'POST'
          ? 'Saved. Your next AI request will use it.'
          : 'Your personal connection was removed.',
      );
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not save the connection.',
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="dialog sm:max-w-md">
        <DialogTitle>AI connection</DialogTitle>
        {overview?.shared && (
          <p className="note">
            Shared · {overview.shared.provider} · {overview.shared.model}
            {status?.remainingToday != null
              ? ` · ${status.remainingToday} of ${overview.shared.dailyLimit} left today`
              : ''}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        {notice && (
          <p role="status" className="note">
            {notice}
          </p>
        )}
        {overview && (
          <ConnectionForm
            key={overview.personal?.provider ?? 'none'}
            providers={overview.providers}
            current={overview.personal}
            canSetEndpoint={overview.canSetEndpoint}
            submitLabel={overview.personal ? 'Update' : 'Connect'}
            onSave={(body) => send('POST', body)}
            onRemove={overview.personal ? () => send('DELETE') : undefined}
          />
        )}
        <p className="note">Your key is stored encrypted, for you only.</p>
      </DialogContent>
    </Dialog>
  );
}
