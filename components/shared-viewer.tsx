'use client';
import { useEffect, useState } from 'react';
import { Box, Download } from 'lucide-react';
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
    <main className="studio shared">
      <header className="topbar">
        <a className="brand" href="/">
          <Box size={18} />
          <b>
            form<span>.</span>
          </b>
        </a>
        <strong>{data?.model.name ?? '…'}</strong>
        {data && <span className="badge">V{data.ordinal}</span>}
        <span className="grow" />
        {data?.allowExport && (
          <a
            className="quiet line"
            href={`/api/shared/${token}?export=stl`}
            referrerPolicy="no-referrer"
          >
            <Download size={15} />
            STL
          </a>
        )}
      </header>
      <section className="viewer-panel" aria-label="3D visualization">
        <div className="model-stage">
          {error ? (
            <p role="alert" className="pad">
              {error}
            </p>
          ) : (
            <ModelViewer
              model={data?.model}
              geometry={geometry}
              comparison={null}
            />
          )}
        </div>
      </section>
    </main>
  );
}
