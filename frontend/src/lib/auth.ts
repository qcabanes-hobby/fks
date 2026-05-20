import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const STORAGE_KEY = 'fks.authToken';
const ACTIVE_SIGNAL_KEY = 'fks.activeSignal';
const JOINED_SIGNAL_KEY = 'fks.joinedSignal';
const JOINED_SIGNAL_EVENT = 'fks.joinedSignal.change';

export function getActiveSignal(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SIGNAL_KEY);
  } catch {
    return null;
  }
}

export function setActiveSignal(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SIGNAL_KEY, id);
  } catch {}
}

export function clearActiveSignal(): void {
  try {
    localStorage.removeItem(ACTIVE_SIGNAL_KEY);
  } catch {}
}

export function getJoinedSignal(): string | null {
  try {
    return localStorage.getItem(JOINED_SIGNAL_KEY);
  } catch {
    return null;
  }
}

export function setJoinedSignal(id: string): void {
  try {
    localStorage.setItem(JOINED_SIGNAL_KEY, id);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(JOINED_SIGNAL_EVENT));
  } catch {}
}

export function clearJoinedSignal(): void {
  try {
    localStorage.removeItem(JOINED_SIGNAL_KEY);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(JOINED_SIGNAL_EVENT));
  } catch {}
}

export function subscribeJoinedSignal(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(JOINED_SIGNAL_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(JOINED_SIGNAL_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

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
  const local = getToken();
  try {
    const remembered = await idbGet<string>(STORAGE_KEY);
    if (!local && remembered) {
      try {
        localStorage.setItem(STORAGE_KEY, remembered);
      } catch {}
      return;
    }
    if (local && remembered !== local) {
      await idbSet(STORAGE_KEY, local);
    }
  } catch {}
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {}
}
