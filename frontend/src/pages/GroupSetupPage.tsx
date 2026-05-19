import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGroup } from '../lib/queries';
import { useToast } from '../components/Toast';
import type { Group } from '../lib/types';

export function GroupSetupPage() {
  const [name, setName] = useState('');
  const [created, setCreated] = useState<Group | null>(null);
  const create = useCreateGroup();
  const navigate = useNavigate();
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      const res = await create.mutateAsync({ name: n });
      setCreated(res.group);
    } catch (err) {
      toast.show((err as Error).message || 'Could not create group', 'error');
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      toast.show('Code copied', 'success');
    } catch {
      toast.show('Could not copy', 'error');
    }
  };

  const share = async () => {
    if (!created) return;
    const url = `${window.location.origin}/install?code=${created.code}`;
    const text = `Join my Fake Kebab group "${created.name}". Code: ${created.code}\n${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Fake Kebab Signal', text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Invite copied to clipboard', 'success');
    } catch {
      toast.show('Could not share', 'error');
    }
  };

  if (created) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold">{created.name} is live</h1>
        <p className="text-slate-400 mt-2">Share this code with friends so they can join.</p>
        <div className="my-8 px-6 py-4 rounded-2xl bg-signal-600/10 border-2 border-signal-600/40">
          <div className="text-5xl font-mono font-bold tracking-[0.4em] text-signal-400">{created.code}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 w-full">
          <button onClick={copy} className="btn-secondary">
            Copy code
          </button>
          <button onClick={share} className="btn-secondary">
            Share invite
          </button>
        </div>
        <button onClick={() => navigate('/games', { replace: true })} className="btn-primary mt-6 w-full">
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col p-6 max-w-md mx-auto w-full">
      <div className="pt-8 pb-6 text-center">
        <h1 className="text-2xl font-bold">Create your group</h1>
        <p className="text-slate-400 text-sm mt-1">Give it a name. You'll get a code to share.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input
          className="input"
          placeholder="e.g. The Fake Kebab"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          required
        />
        <button disabled={create.isPending} type="submit" className="btn-primary w-full text-lg">
          {create.isPending ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </div>
  );
}
