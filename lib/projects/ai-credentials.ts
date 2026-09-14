import type { ProjectStore } from './store';
import { HttpError } from './http';
const enc = new TextEncoder();
async function cipher(secret: string) {
  if (secret.length < 32) throw new HttpError(503, 'Secure key storage is not configured by the website owner yet.');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function saveCredential(store: ProjectStore, owner: string, key: string, secret: string) {
  key = key.trim();
  if (!key.startsWith('sk-') || key.length < 20 || key.length > 512 || /\s/.test(key)) throw new HttpError(400, 'Enter a valid OpenAI API key.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:enc.encode(owner)}, await cipher(secret), enc.encode(key));
  const value = JSON.stringify({iv:Array.from(iv), data:Array.from(new Uint8Array(encrypted))});
  await store.stmt('INSERT INTO ai_credentials(owner_id, encrypted_key) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET encrypted_key=excluded.encrypted_key', owner, value).run();
}
export async function hasCredential(store: ProjectStore, owner: string) {
  return !!await store.stmt('SELECT owner_id FROM ai_credentials WHERE owner_id=?', owner).first();
}
export async function readCredential(store: ProjectStore, owner: string, secret: string, fallback = '') {
  const row = await store.stmt('SELECT encrypted_key FROM ai_credentials WHERE owner_id=?', owner).first<{encrypted_key:string}>();
  if (!row) return fallback;
  try {
    const value = JSON.parse(row.encrypted_key);
    const decoded = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(value.iv), additionalData:enc.encode(owner)}, await cipher(secret), new Uint8Array(value.data));
    return new TextDecoder().decode(decoded);
  } catch { throw new HttpError(503, 'Your saved AI connection could not be opened. Please apply your key again.'); }
}
