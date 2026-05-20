import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCloseSignal, useSignal } from '../lib/queries';
import { clearActiveSignal, getToken, setActiveSignal } from '../lib/auth';
import { useToast } from '../components/Toast';

export function SignalSentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [sseFailed, setSseFailed] = useState(false);
  const [liveAccepted, setLiveAccepted] = useState<number | null>(null);
  const [liveRejected, setLiveRejected] = useState<number | null>(null);
  const [liveDelivered, setLiveDelivered] = useState<number | null>(null);
  const [liveClosed, setLiveClosed] = useState<boolean | null>(null);
  const close = useCloseSignal();

  const signal = useSignal(id, {
    refetchInterval: sseFailed ? 5000 : false,
  });

  useEffect(() => {
    if (id) setActiveSignal(id);
  }, [id]);

  useEffect(() => {
    if (signal.isError) {
      clearActiveSignal();
      navigate('/games', { replace: true });
    }
  }, [signal.isError, navigate]);

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) {
      setSseFailed(true);
      return;
    }
    const url = `/sse/signals/${id}?token=${encodeURIComponent(token)}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch {
      setSseFailed(true);
      return;
    }
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          acceptedCount?: number;
          rejectedCount?: number;
          deliveredCount?: number;
          closed?: boolean;
        };
        if (typeof data.acceptedCount === 'number') setLiveAccepted(data.acceptedCount);
        if (typeof data.rejectedCount === 'number') setLiveRejected(data.rejectedCount);
        if (typeof data.deliveredCount === 'number') setLiveDelivered(data.deliveredCount);
        if (typeof data.closed === 'boolean') setLiveClosed(data.closed);
      } catch {}
    };
    es.onerror = () => {
      setSseFailed(true);
      es?.close();
    };
    return () => {
      es?.close();
    };
  }, [id]);

  const count = liveAccepted ?? signal.data?.acceptedCount ?? 1;
  const rejected = liveRejected ?? signal.data?.rejectedCount ?? 0;
  const delivered = liveDelivered ?? signal.data?.deliveredCount ?? 0;
  const totalSubscribers = signal.data?.totalSubscribers;
  const othersTotal = typeof totalSubscribers === 'number' ? Math.max(totalSubscribers - 1, 0) : null;
  const gameName = signal.data?.gameName ?? 'your game';
  const closed = liveClosed ?? !!signal.data?.closedAt;

  const onBack = () => {
    clearActiveSignal();
    navigate('/games', { replace: true });
  };

  const onDone = async () => {
    if (!id) return;
    try {
      await close.mutateAsync(id);
    } catch (err) {
      toast.show((err as Error).message || 'Could not close the signal', 'error');
      return;
    }
    clearActiveSignal();
    navigate('/games', { replace: true });
  };

  if (closed) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-7xl mb-6">🥙</div>
        <h1 className="text-3xl font-bold">Final score</h1>
        <p className="text-slate-400 mt-2 mb-8">{gameName}</p>
        <div className="card max-w-xs w-full">
          <div className="flex items-baseline justify-center gap-8">
            <div>
              <div className="text-5xl font-bold text-signal-400">{count}</div>
              <div className="text-slate-400 text-xs mt-1">in</div>
            </div>
            <div>
              <div className="text-3xl font-semibold text-slate-400">{rejected}</div>
              <div className="text-slate-500 text-xs mt-1">out</div>
            </div>
          </div>
          {othersTotal !== null && othersTotal > 0 && (
            <div className="text-slate-500 text-xs mt-3">
              ✓ {delivered}/{othersTotal} got the notification
            </div>
          )}
        </div>
        <button onClick={onBack} className="btn-primary mt-8 px-8">
          Back to games
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="relative w-48 h-48 flex items-center justify-center mb-8">
        <div className="absolute inset-0 rounded-full bg-signal-600/40 animate-pulse-ring" />
        <div className="absolute inset-0 rounded-full bg-signal-600/20 animate-pulse-ring" style={{ animationDelay: '0.6s' }} />
        <div className="relative text-8xl animate-kebab-beat">🥙</div>
      </div>
      <h1 className="text-3xl font-bold">Signal sent!</h1>
      <p className="text-slate-400 mt-2 mb-8">{gameName}</p>
      <div className="card max-w-xs w-full">
        <div className="text-5xl font-bold text-signal-400">
          {count}
          {typeof totalSubscribers === 'number' && (
            <span className="text-2xl text-slate-500 font-semibold"> / {totalSubscribers}</span>
          )}
        </div>
        <div className="text-slate-400 text-sm mt-1">
          {count === 1 ? 'person is in!' : 'people are in!'}
        </div>
        {othersTotal !== null && othersTotal > 0 && (
          <div className="text-slate-500 text-xs mt-2">
            ✓ {delivered}/{othersTotal} got the notification
          </div>
        )}
        {rejected > 0 && (
          <div className="text-slate-500 text-xs mt-1">{rejected} can't make it</div>
        )}
      </div>
      <button onClick={onDone} disabled={close.isPending} className="btn-secondary mt-8 px-8">
        {close.isPending ? 'Closing…' : 'Done'}
      </button>
    </div>
  );
}
