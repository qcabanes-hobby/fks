import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const STORAGE_KEY = 'fks.authToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {}
  void idbSet(STORAGE_KEY, token).catch(() => {});
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  void idbDel(STORAGE_KEY).catch(() => {});
}

export async function syncTokenToIdb(): Promise<void> {
  const t = getToken();
  if (!t) return;
  try {
    const existing = await idbGet<string>(STORAGE_KEY);
    if (existing !== t) {
      await idbSet(STORAGE_KEY, t);
    }
  } catch {}
}
