import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyAll();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyAll();
  });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  try {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notifyAll();
    return choice.outcome;
  } catch {
    deferredPrompt = null;
    notifyAll();
    return 'dismissed';
  }
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

export interface InstallState {
  canPromptInstall: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMacSafari: boolean;
  isFirefox: boolean;
}

export function useInstallState(): InstallState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const onChange = () => force((n) => n + 1);
    const queries = STANDALONE_DISPLAY_MODES.map((m) => window.matchMedia(`(display-mode: ${m})`));
    queries.forEach((q) => q.addEventListener?.('change', onChange));
    return () => {
      listeners.delete(l);
      queries.forEach((q) => q.removeEventListener?.('change', onChange));
    };
  }, []);
  return {
    canPromptInstall: deferredPrompt !== null,
    isInstalled: isStandalone(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isMacSafari: isMacSafari(),
    isFirefox: isFirefox(),
  };
}
