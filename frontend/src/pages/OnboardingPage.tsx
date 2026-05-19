import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../lib/auth';
import { useCreateUser, useGroup, useJoinGroup } from '../lib/queries';
import { useToast } from '../components/Toast';

type Mode = 'join' | 'create';

export function OnboardingPage() {
  const [mode, setMode] = useState<Mode>('join');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const createUser = useCreateUser();
  const joinGroup = useJoinGroup();
  const hasToken = !!getToken();
  const group = useGroup(hasToken);

  useEffect(() => {
    if (!hasToken) return;
    if (group.isFetching) return;
    if (group.data && group.data.id) {
      navigate('/games', { replace: true });
    } else {
      navigate('/onboarding/group', { replace: true });
    }
  }, [hasToken, group.isFetching, group.data, navigate]);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem('fks.pendingGroupCode');
      if (pending) {
        setCode(pending);
        setMode('join');
      }
    } catch {}
  }, []);

  const busy = createUser.isPending || joinGroup.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    try {
      if (mode === 'join') {
        const c = code.trim().toUpperCase();
        if (c.length !== 5) {
          toast.show('Group code must be 5 characters', 'error');
          return;
        }
        await joinGroup.mutateAsync({ username: u, groupCode: c });
        try {
          sessionStorage.removeItem('fks.pendingGroupCode');
        } catch {}
        navigate('/onboarding/notifications', { replace: true });
      } else {
        await createUser.mutateAsync({ username: u });
        navigate('/onboarding/notifications', { replace: true });
      }
    } catch (err) {
      toast.show((err as Error).message || 'Sign up failed', 'error');
    }
  };

  return (
    <div className="min-h-full flex flex-col p-6 max-w-md mx-auto w-full">
      <div className="pt-8 pb-6 text-center">
        <div className="text-5xl mb-3">🥙</div>
        <h1 className="text-2xl font-bold">Welcome to Fake Kebab</h1>
        <p className="text-slate-400 text-sm mt-1">Pick a username to get started.</p>
      </div>

      <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6">
        <button
          type="button"
          onClick={() => setMode('join')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
            mode === 'join' ? 'bg-signal-600 text-white' : 'text-slate-400'
          }`}
        >
          I have a code
        </button>
        <button
          type="button"
          onClick={() => setMode('create')}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
            mode === 'create' ? 'bg-signal-600 text-white' : 'text-slate-400'
          }`}
        >
          Start a new group
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">Username</label>
          <input
            className="input"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="username"
            placeholder="e.g. tony"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            required
          />
        </div>
        {mode === 'join' && (
          <div>
            <label className="block text-sm text-slate-400 mb-2">Group code</label>
            <input
              className="input tracking-[0.3em] uppercase text-center font-mono"
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="ABCDE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
              maxLength={5}
              required
            />
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full text-lg">
          {busy ? 'Hold on…' : mode === 'join' ? 'Join group' : 'Create my account'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/relogin')}
          className="btn-ghost w-full"
        >
          Already have an account? Reconnect
        </button>
      </form>

      <p className="text-xs text-slate-500 text-center mt-6">
        No password, no email. Just a username for your group.
      </p>
    </div>
  );
}
