import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRespondToSignal, useSignal } from '../lib/queries';
import { useToast } from '../components/Toast';

export function SignalRespondPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const respond = useRespondToSignal();
  const [responded, setResponded] = useState<'accept' | 'reject' | null>(null);
  const signal = useSignal(id, { refetchInterval: responded ? false : 4000 });

  useEffect(() => {
    if (responded) return;
    if (signal.data?.closedAt) {
      toast.show('Signal was closed', 'info');
      navigate('/games', { replace: true });
    }
  }, [signal.data?.closedAt, responded, navigate, toast]);

  const submit = async (response: 'accept' | 'reject') => {
    if (!id) return;
    try {
      await respond.mutateAsync({ signalId: id, response });
      setResponded(response);
    } catch (err) {
      const msg = (err as Error).message || 'Could not respond';
      if (/closed/i.test(msg)) {
        toast.show('Signal was closed', 'info');
        navigate('/games', { replace: true });
        return;
      }
      toast.show(msg, 'error');
    }
  };

  if (responded) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
        <div className="text-7xl mb-6">{responded === 'accept' ? '🥙' : '👋'}</div>
        <h1 className="text-2xl font-bold">
          {responded === 'accept' ? "You're in!" : 'Maybe next time'}
        </h1>
        <p className="text-slate-400 mt-2">
          {responded === 'accept' ? "Your friends know you're joining." : "We'll let them know."}
        </p>
        <button onClick={() => navigate('/games', { replace: true })} className="btn-primary mt-8 px-8">
          Back to games
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <div className="pb-6">
        <div className="text-6xl mb-4">🥙</div>
        <h1 className="text-2xl font-bold">Kebab signal!</h1>
        {signal.data?.gameName && (
          <p className="text-signal-400 font-semibold text-xl mt-2">{signal.data.gameName}</p>
        )}
        {signal.data?.triggeredByUsername && (
          <p className="text-slate-400 mt-2">
            {signal.data.triggeredByUsername} wants to play.
          </p>
        )}
      </div>
      {signal.data?.gameImageUrl && (
        <img src={signal.data.gameImageUrl} alt="" className="w-40 h-40 object-cover rounded-2xl mb-6" />
      )}
      <div className="card w-full mb-8">
        <div className="text-4xl font-bold text-signal-400">{signal.data?.acceptedCount ?? '…'}</div>
        <div className="text-slate-400 text-sm">in so far</div>
      </div>
      <div className="w-full space-y-3">
        <button onClick={() => submit('accept')} disabled={respond.isPending} className="btn-primary w-full text-lg py-4">
          I'm in 🥙
        </button>
        <button onClick={() => submit('reject')} disabled={respond.isPending} className="btn-secondary w-full text-lg py-4">
          Not now
        </button>
      </div>
    </div>
  );
}
