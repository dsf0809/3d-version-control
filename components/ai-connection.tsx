'use client';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

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
      className="grid gap-3"
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
      <label className="grid gap-1 text-sm font-medium">
        Provider
        <select
          value={provider}
          disabled={saving}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel(e.target.value === current?.provider ? current.model : '');
          }}
          className="w-full min-w-0 rounded-lg border p-3"
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
      <label className="grid gap-1 text-sm font-medium">
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
          className="w-full min-w-0 rounded-lg border p-3"
        />
      </label>
      {endpoint && (
        <label className="grid gap-1 text-sm font-medium">
          Endpoint URL
          <input
            value={baseUrl}
            disabled={saving}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={info.baseUrl || 'https://host/v1'}
            required={!info.baseUrl}
            type="url"
            className="w-full min-w-0 rounded-lg border p-3"
          />
        </label>
      )}
      <label className="grid gap-1 text-sm font-medium">
        API key{info?.keyRequired ? '' : ' (optional)'}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          value={key}
          disabled={saving}
          onChange={(e) => setKey(e.target.value)}
          placeholder={
            keeping ? 'Leave empty to keep the saved key' : info?.keyHint
          }
          required={!!info?.keyRequired && !keeping}
          className="w-full min-w-0 rounded-lg border p-3"
        />
      </label>
      <div className="flex flex-wrap gap-2">
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
      <DialogContent className="ai-connection-dialog sm:max-w-md p-6">
        <DialogTitle>AI connection</DialogTitle>
        <DialogDescription>
          Use your own API key from any supported provider. Keys are stored
          encrypted on this server for your account only.
        </DialogDescription>
        {overview?.shared && (
          <p className="text-sm rounded-lg border p-3">
            {overview.personal
              ? 'Without a personal key you would use'
              : 'You are using'}{' '}
            the server’s shared connection ({overview.shared.provider} ·{' '}
            {overview.shared.model})
            {status?.remainingToday != null
              ? `, limited to ${overview.shared.dailyLimit} requests a day (${status.remainingToday} left today). Your own key removes the limit.`
              : '.'}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {overview && (
          <ConnectionForm
            key={overview.personal?.provider ?? 'none'}
            providers={overview.providers}
            current={overview.personal}
            canSetEndpoint={overview.canSetEndpoint}
            submitLabel={overview.personal ? 'Update my connection' : 'Apply'}
            onSave={(body) => send('POST', body)}
            onRemove={overview.personal ? () => send('DELETE') : undefined}
          />
        )}
        <p className="text-xs text-slate-500">
          Requests with your key use your provider billing. Saving does not make
          a paid test call.
        </p>
      </DialogContent>
    </Dialog>
  );
}
