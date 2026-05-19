import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoginByUsername } from '../lib/queries';
import { useToast } from '../components/Toast';

export function ReloginPage() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const login = useLoginByUsername();
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    try {
      await login.mutateAsync({
        username: u,
        groupCode: code.trim().toUpperCase() || undefined,
      });
      navigate('/games', { replace: true });
    } catch (err) {
      toast.show((err as Error).message || 'Login failed', 'error');
    }
  };

  return (
    <div className="min-h-full flex flex-col p-6 max-w-md mx-auto w-full">
      <div className="pt-8 pb-6 text-center">
        <div className="text-5xl mb-3">🥙</div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-slate-400 text-sm mt-1">Enter your username to reconnect this device.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input
          className="input"
          placeholder="Username"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={32}
          required
        />
        <input
          className="input tracking-[0.3em] uppercase text-center font-mono"
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder="Group code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          maxLength={5}
        />
        <button disabled={login.isPending} type="submit" className="btn-primary w-full text-lg">
          {login.isPending ? 'Reconnecting…' : 'Reconnect'}
        </button>
        <button type="button" onClick={() => navigate('/onboarding')} className="btn-ghost w-full">
          New here? Sign up
        </button>
      </form>
    </div>
  );
}
