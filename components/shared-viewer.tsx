'use client';
import { useEffect, useState } from 'react';
import ModelViewer from './model-viewer';
import { compileModel, type Compiled } from '@/lib/cad/compile';
import type { Model } from '@/lib/cad/model';
export default function SharedViewer({ token }: { token: string }) {
  const [data, setData] = useState<{
    model: Model;
    ordinal: number;
    allowExport: boolean;
  } | null>(null);
  const [geometry, setGeometry] = useState<Compiled | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/shared/${token}`, { signal: abort.signal, cache: 'no-store' })
      .then(async (r) => {
        const value = (await r.json()) as {
          model: Model;
          ordinal: number;
          allowExport: boolean;
          error?: string;
        };
        if (!r.ok) throw new Error(value.error);
        return value;
      })
      .then(async (value) => {
        const g = await compileModel(value.model, abort.signal);
        if (!abort.signal.aborted) {
          setData(value);
          setGeometry(g);
        }
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [token]);
  return (
    <main className="studio">
      <header className="topbar">
        <strong>{data?.model.name ?? 'Shared model'}</strong>
        <span>Read-only · {data ? `V${data.ordinal}` : 'Loading'}</span>
        {data?.allowExport && (
          <a
            href={`/api/shared/${token}?export=stl`}
            referrerPolicy="no-referrer"
          >
            Download STL
          </a>
        )}
      </header>
      <section className="viewer-panel" style={{ flex: 1 }}>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <ModelViewer
            model={data?.model}
            geometry={geometry}
            comparison={null}
          />
        )}
      </section>
    </main>
  );
}
