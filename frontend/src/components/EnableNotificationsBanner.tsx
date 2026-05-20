import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ensurePushSubscription } from '../lib/push';
import { usePushStatus } from '../lib/queries';
import { useToast } from './Toast';

function readPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function EnableNotificationsBanner({ enabled }: { enabled: boolean }) {
  const status = usePushStatus(enabled);
  const qc = useQueryClient();
  const toast = useToast();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => readPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setPermission(readPermission());
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  if (!enabled) return null;
  if (permission === 'unsupported') return null;
  if (permission === 'denied') return null;
  if (status.isLoading) return null;
  if (status.data?.subscribed) return null;

  const onEnable = async () => {
    setBusy(true);
    try {
      const ok = await ensurePushSubscription({ promptIfNeeded: true });
      setPermission(readPermission());
      if (ok) {
        await qc.invalidateQueries({ queryKey: ['push', 'status'] });
        toast.show('Notifications enabled', 'info');
      } else {
        toast.show("Couldn't enable notifications", 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-signal-600/40 bg-signal-600/10 p-3 flex items-center gap-3">
      <div className="text-2xl" aria-hidden>
        🔔
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Turn on notifications</p>
        <p className="text-xs text-slate-400">So you don't miss your friends' kebab signals.</p>
      </div>
      <button
        type="button"
        onClick={onEnable}
        disabled={busy}
        className="btn-primary text-sm px-3 py-1.5 flex-shrink-0"
      >
        {busy ? 'Enabling…' : 'Enable'}
      </button>
    </div>
  );
}
