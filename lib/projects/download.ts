/** Reject failed or empty responses before creating a browser download. */
export async function exportBlob(url: string, fetcher: typeof fetch = fetch): Promise<Blob> {
  const response = await fetcher(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(data?.error || `Export failed (${response.status}). Please try again.`);
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error('The export was empty. Please try again.');
  if (blob.type.includes('text/html')) throw new Error('Please sign in again before exporting.');
  if (new URL(url, 'https://local.invalid').searchParams.get('format') === '3mf') {
    const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4)
      throw new Error('The server did not return a valid 3MF file. Please try again.');
  }
  return blob;
}
export async function saveExport(url: string, filename: string) {
  const blob = await exportBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow browser download managers time to consume the object URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}
