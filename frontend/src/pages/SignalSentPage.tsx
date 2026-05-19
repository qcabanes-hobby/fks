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
  const [liveCount, setLiveCount] = useState<number | null>(null);
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
        const data = JSON.parse(ev.data) as { acceptedCount?: number };
        if (typeof data.acceptedCount === 'number') {
          setLiveCount(data.acceptedCount);
        }
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

  const count = liveCount ?? signal.data?.acceptedCount ?? 1;
  const gameName = signal.data?.gameName ?? 'your game';

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
        <div className="text-5xl font-bold text-signal-400">{count}</div>
        <div className="text-slate-400 text-sm mt-1">
          {count === 1 ? 'person is in!' : 'people are in!'}
        </div>
      </div>
      <button onClick={onDone} disabled={close.isPending} className="btn-secondary mt-8 px-8">
        {close.isPending ? 'Closing…' : 'Done'}
      </button>
    </div>
  );
}
