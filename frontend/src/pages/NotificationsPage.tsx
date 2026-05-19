import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensurePushSubscription } from '../lib/push';
import { useGroup } from '../lib/queries';
import { useToast } from '../components/Toast';

export function NotificationsPage() {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const group = useGroup();

  const proceed = () => {
    if (group.data && group.data.id) {
      navigate('/games', { replace: true });
    } else {
      navigate('/onboarding/group', { replace: true });
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await ensurePushSubscription();
      if (ok) {
        toast.show('Notifications enabled', 'success');
      } else {
        toast.show('Notifications were not enabled. You can turn them on later.', 'info');
      }
    } catch (err) {
      toast.show((err as Error).message || 'Could not enable notifications', 'error');
    } finally {
      setBusy(false);
      proceed();
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-4">🔔</div>
      <h1 className="text-2xl font-bold mb-2">Turn on notifications</h1>
      <p className="text-slate-400 max-w-sm mb-8">
        This is the whole point — when a friend sends the kebab signal, your phone lights up.
      </p>
      <div className="space-y-3 w-full max-w-xs">
        <button onClick={enable} disabled={busy} className="btn-primary w-full text-lg">
          {busy ? 'Asking…' : 'Enable notifications'}
        </button>
        <button onClick={proceed} className="btn-ghost w-full">
          Skip for now
        </button>
      </div>
    </div>
  );
}
