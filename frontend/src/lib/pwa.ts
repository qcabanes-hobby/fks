import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface RelatedApp {
  id?: string;
  platform: string;
  url?: string;
}

const INSTALL_ATTEMPTED_KEY = 'fks.installAttemptedAt';
const SKIP_INSTALL_KEY = 'fks.skipInstall';
// "Looks like install didn't take" only fires after this many ms post-accept
// without us observing standalone mode or a related-app entry.
const FAILED_INSTALL_GRACE_MS = 30_000;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let relatedAppsCount = 0;
let appInstalledFired = false;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((l) => l());
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}

async function refreshRelatedApps(): Promise<void> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<RelatedApp[]> };
  if (typeof nav.getInstalledRelatedApps !== 'function') return;
  try {
    const apps = await nav.getInstalledRelatedApps();
    relatedAppsCount = apps.length;
    notifyAll();
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyAll();
  });
  window.addEventListener('appinstalled', () => {
    appInstalledFired = true;
    deferredPrompt = null;
    safeRemove(INSTALL_ATTEMPTED_KEY);
    safeRemove(SKIP_INSTALL_KEY);
    void refreshRelatedApps();
    notifyAll();
  });
  void refreshRelatedApps();
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === 'accepted') {
      safeSet(INSTALL_ATTEMPTED_KEY, String(Date.now()));
      // Re-check the related-apps API a few seconds later; on a real
      // WebAPK mint the entry shows up within ~5s. If it never appears
      // we surface installLikelyFailed via the grace window below.
      setTimeout(() => void refreshRelatedApps(), 4000);
      setTimeout(() => void refreshRelatedApps(), 10000);
    }
    notifyAll();
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    notifyAll();
    return 'dismissed';
  }
}

export function markSkipInstall(): void {
  safeSet(SKIP_INSTALL_KEY, String(Date.now()));
  notifyAll();
}

export function clearSkipInstall(): void {
  safeRemove(SKIP_INSTALL_KEY);
  notifyAll();
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  const isMac = /Macintosh/i.test(ua);
  const hasTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints !== undefined &&
    ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1;
  // iPad on iOS 13+ reports as Macintosh; disambiguate via touch points.
  return isAppleMobile || (isMac && hasTouch);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

export function isFirefox(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // FxiOS is Firefox on iOS (WebKit under the hood, not Gecko).
  return /Firefox\//i.test(ua) || /FxiOS\//i.test(ua);
}

function isSafariEngine(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Chrome\/|CriOS\/|EdgiOS\/|EdgA\/|Edg\/|FxiOS\/|OPR\/|OPiOS\/|Brave\//i.test(ua)) {
    return false;
  }
  return /Safari\//i.test(ua);
}

// Desktop Safari on macOS (Sonoma+ / Safari 17+ can "Add to Dock").
export function isMacSafari(): boolean {
  return isSafariEngine() && !isIOS();
}

const STANDALONE_DISPLAY_MODES = [
  'standalone',
  'minimal-ui',
  'fullscreen',
  'window-controls-overlay',
] as const;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia) {
    for (const mode of STANDALONE_DISPLAY_MODES) {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
    }
  }
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return false;
}

export function hasSkippedInstall(): boolean {
  return safeGet(SKIP_INSTALL_KEY) !== null;
}

function computeInstallLikelyFailed(installed: boolean): boolean {
  if (installed) return false;
  const ts = safeGet(INSTALL_ATTEMPTED_KEY);
  if (!ts) return false;
  const age = Date.now() - Number(ts);
  if (Number.isNaN(age) || age < FAILED_INSTALL_GRACE_MS) return false;
  // If the appinstalled event already fired (and we're somehow not in
  // standalone), the OS thinks it installed — treat as success.
  if (appInstalledFired) return false;
  // If getInstalledRelatedApps() returned an entry, OS-side install is real.
  if (relatedAppsCount > 0) return false;
  return true;
}

export interface InstallState {
  canPromptInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMacSafari: boolean;
  isFirefox: boolean;
  installLikelyFailed: boolean;
  hasSkippedInstall: boolean;
}

export function useInstallState(): InstallState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const onChange = () => force((n) => n + 1);
    const queries = STANDALONE_DISPLAY_MODES.map((m) => window.matchMedia(`(display-mode: ${m})`));
    queries.forEach((q) => q.addEventListener?.('change', onChange));
    // Re-check related apps when the tab regains focus — common path after
    // returning from the Android install dialog.
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshRelatedApps();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      listeners.delete(l);
      queries.forEach((q) => q.removeEventListener?.('change', onChange));
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  const installed = isStandalone();
  return {
    canPromptInstall: deferredPrompt !== null,
    isInstalled: installed,
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isMacSafari: isMacSafari(),
    isFirefox: isFirefox(),
    installLikelyFailed: computeInstallLikelyFailed(installed),
    hasSkippedInstall: hasSkippedInstall(),
  };
}
