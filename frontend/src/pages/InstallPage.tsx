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

      {state.isIOS ? (
        <div className="card max-w-sm text-left space-y-3">
          <h2 className="font-semibold text-signal-400">Install on iPhone</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
            <li>
              Tap the <span className="font-semibold">Share</span> icon at the bottom of Safari.
            </li>
            <li>Scroll down in the share sheet.</li>
            <li>
              Tap <span className="font-semibold">"Add to Home Screen"</span>.
            </li>
            <li>Open the app from your home screen.</li>
          </ol>
          <p className="text-xs text-slate-500">
            iOS only delivers push notifications after the app is installed via Add to Home Screen.
          </p>
        </div>
      ) : state.canPromptInstall ? (
        <button className="btn-primary text-lg px-8 py-4" onClick={handleInstall}>
          Install the app
        </button>
      ) : (
        <div className="card max-w-sm text-left space-y-3">
          <h2 className="font-semibold text-signal-400">Install</h2>
          <p className="text-sm text-slate-300">
            Use your browser menu to "Install app" or "Add to Home Screen", then re-open this page from your home screen.
          </p>
        </div>
      )}
    </div>
  );
}
