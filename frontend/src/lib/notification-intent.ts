import { del, get, set } from 'idb-keyval';

const KEY = 'fks.pendingSignalIntent';
const MAX_AGE_MS = 60_000;

export interface PendingSignalIntent {
  signalId: string;
  ts: number;
}

export async function setPendingSignalIntent(signalId: string): Promise<void> {
  try {
    await set(KEY, { signalId, ts: Date.now() });
  } catch {}
}

export async function consumePendingSignalIntent(): Promise<PendingSignalIntent | null> {
  try {
    const intent = (await get(KEY)) as PendingSignalIntent | undefined;
    await del(KEY);
    if (!intent || !intent.signalId) return null;
    if (Date.now() - intent.ts > MAX_AGE_MS) return null;
    return intent;
  } catch {
    return null;
  }
}

export async function clearPendingSignalIntent(): Promise<void> {
  try {
    await del(KEY);
  } catch {}
}
