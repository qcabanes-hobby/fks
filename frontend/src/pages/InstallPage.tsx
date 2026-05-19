import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { promptInstall, useInstallState } from '../lib/pwa';

export function InstallPage() {
  const state = useInstallState();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const code = params.get('code');
    if (code) {
      try {
        sessionStorage.setItem('fks.pendingGroupCode', code.toUpperCase());
      } catch {}
    }
  }, [params]);

  useEffect(() => {
    if (state.isInstalled) navigate('/onboarding', { replace: true });
  }, [state.isInstalled, navigate]);

  const handleInstall = async () => {
    const r = await promptInstall();
    if (r === 'accepted') navigate('/onboarding', { replace: true });
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="text-7xl mb-4 animate-kebab-beat">🥙</div>
      <h1 className="text-3xl font-bold">Fake Kebab Signal</h1>
      <p className="text-slate-400 mt-2 mb-8 max-w-sm">
        Summon your friends to play. One tap launches the signal — they get a push notification and reply with one tap.
      </p>

      {state.canPromptInstall ? (
        <>
          <button className="btn-primary text-lg px-8 py-4" onClick={handleInstall}>
            Install the app
          </button>
          <p className="text-xs text-slate-500 mt-4 max-w-sm">
            iOS users: this button only works on iPhones inside Safari. If you don't see it, follow the instructions
            below.
          </p>
        </>
      ) : state.isIOS ? (
        <IOSInstructions />
      ) : state.isMacSafari ? (
        <MacSafariInstructions />
      ) : state.isFirefox ? (
        <FirefoxInstructions />
      ) : (
        <GenericInstructions />
      )}
    </div>
  );
}

function IOSInstructions() {
  return (
    <div className="card max-w-sm text-left space-y-3">
      <h2 className="font-semibold text-signal-400">Install on iPhone or iPad</h2>
      <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
        <li>
          Make sure you're in <span className="font-semibold">Safari</span> (Chrome / Firefox on iOS can't install
          web apps).
        </li>
        <li>
          Tap the <span className="font-semibold">Share</span> button — the square with an up-arrow at the bottom of
          the screen on iPhone, or in the top-right toolbar on iPad.
        </li>
        <li>Scroll down in the share sheet.</li>
        <li>
          Tap <span className="font-semibold">"Add to Home Screen"</span>, then tap{' '}
          <span className="font-semibold">Add</span> in the top-right.
        </li>
        <li>Close Safari and open Fake Kebab Signal from your Home Screen.</li>
      </ol>
      <p className="text-xs text-slate-500">
        iOS only delivers push notifications after the app is installed via Add to Home Screen. Requires iOS 16.4 or
        later.
      </p>
    </div>
  );
}

function MacSafariInstructions() {
  return (
    <div className="card max-w-sm text-left space-y-3">
      <h2 className="font-semibold text-signal-400">Install on Mac (Safari)</h2>
      <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
        <li>
          In Safari's menu bar, open <span className="font-semibold">File</span>.
        </li>
        <li>
          Choose <span className="font-semibold">"Add to Dock…"</span>.
        </li>
        <li>
          Confirm the name and click <span className="font-semibold">Add</span>.
        </li>
        <li>Launch Fake Kebab Signal from the Dock or Launchpad.</li>
      </ol>
      <p className="text-xs text-slate-500">
        Requires Safari 17 on macOS Sonoma (14) or later. Older Safari versions can't install web apps — use Chrome,
        Edge, Brave, or Arc instead.
      </p>
    </div>
  );
}

function FirefoxInstructions() {
  const onAndroid = useInstallState().isAndroid;
  if (onAndroid) {
    return (
      <div className="card max-w-sm text-left space-y-3">
        <h2 className="font-semibold text-signal-400">Install on Firefox for Android</h2>
        <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
          <li>
            Tap the <span className="font-semibold">⋮</span> menu at the bottom-right of Firefox.
          </li>
          <li>
            Choose <span className="font-semibold">"Add to Home screen"</span> (or{' '}
            <span className="font-semibold">"Install"</span> on newer versions).
          </li>
          <li>
            Confirm by tapping <span className="font-semibold">Add</span>.
          </li>
          <li>Launch Fake Kebab Signal from your home screen.</li>
        </ol>
        <p className="text-xs text-slate-500">
          Firefox for Android installs web apps as standalone shortcuts. Push notifications work, but if you run
          into issues, Chrome / Edge / Samsung Internet are the most thoroughly tested.
        </p>
      </div>
    );
  }

  return (
    <div className="card max-w-sm text-left space-y-3">
      <h2 className="font-semibold text-signal-400">Desktop Firefox doesn't install web apps</h2>
      <p className="text-sm text-slate-300">
        Mozilla hasn't shipped web-app install support in desktop Firefox. To install Fake Kebab Signal, open this
        page in one of these browsers:
      </p>
      <ul className="list-disc list-inside space-y-1 text-slate-300 text-sm">
        <li>
          <span className="font-semibold">macOS / Windows / Linux</span>: Chrome, Edge, Brave, Arc, Vivaldi, or
          Opera — they'll show a one-tap install button.
        </li>
        <li>
          <span className="font-semibold">macOS</span>: Safari 17+ also works (File menu → Add to Dock).
        </li>
        <li>
          <span className="font-semibold">iPhone / iPad</span>: open in Safari and use Share → Add to Home Screen
          (Firefox for iOS uses WebKit and can't install either).
        </li>
        <li>
          <span className="font-semibold">Android</span>: Firefox for Android <em>does</em> support install — open
          this page in Firefox on your phone instead.
        </li>
      </ul>
      <p className="text-xs text-slate-500">
        Advanced: the third-party "PWAsForFirefox" extension can install Firefox web apps on desktop, but it
        requires a system-level helper and isn't recommended for end users.
      </p>
    </div>
  );
}

function GenericInstructions() {
  return (
    <div className="card max-w-sm text-left space-y-3">
      <h2 className="font-semibold text-signal-400">Install</h2>
      <p className="text-sm text-slate-300">
        Your browser supports installing web apps, but didn't surface the prompt automatically. Look for an{' '}
        <span className="font-semibold">install icon</span> in the address bar (a screen with a down-arrow), or open
        the browser menu and choose <span className="font-semibold">"Install app"</span> /{' '}
        <span className="font-semibold">"Add to Home Screen"</span>.
      </p>
      <p className="text-xs text-slate-500">
        After installing, reopen Fake Kebab Signal from your applications list or home screen.
      </p>
    </div>
  );
}
