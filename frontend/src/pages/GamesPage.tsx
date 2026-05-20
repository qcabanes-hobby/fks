import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EnableNotificationsBanner } from '../components/EnableNotificationsBanner';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { getActiveSignal } from '../lib/auth';
import {
  useCreateGame,
  useDeleteGame,
  useGames,
  useGroup,
  useLeaveGroup,
  useMe,
  useSubscribe,
  useTriggerSignal,
  useUnsubscribe,
  useUpdateGame,
} from '../lib/queries';
import type { Game, Member } from '../lib/types';

export function GamesPage() {
  const games = useGames();
  const group = useGroup();
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();
  const create = useCreateGame();
  const update = useUpdateGame();
  const del = useDeleteGame();
  const trigger = useTriggerSignal();
  const leave = useLeaveGroup();

  const [addOpen, setAddOpen] = useState(false);
  const [confirmGame, setConfirmGame] = useState<Game | null>(null);
  const [deleteGame, setDeleteGame] = useState<Game | null>(null);
  const [editImageGame, setEditImageGame] = useState<Game | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    const active = getActiveSignal();
    if (active) {
      navigate(`/signal/${active}/sent`, { replace: true });
      return;
    }
    if (group.isFetching) return;
    if (group.isError || !group.data || !group.data.id) {
      navigate('/onboarding/group', { replace: true });
    }
  }, [group.isFetching, group.isError, group.data, navigate]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpen]);

  const onToggleSubscribe = async (g: Game) => {
    try {
      if (g.subscribed) await unsubscribe.mutateAsync(g.id);
      else await subscribe.mutateAsync(g.id);
    } catch (err) {
      toast.show((err as Error).message || 'Could not update subscription', 'error');
    }
  };

  const onConfirmTrigger = async () => {
    if (!confirmGame) return;
    try {
      const res = await trigger.mutateAsync({ gameId: confirmGame.id });
      setConfirmGame(null);
      navigate(`/signal/${res.signalId}/sent`);
    } catch (err) {
      toast.show((err as Error).message || 'Could not send the signal', 'error');
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteGame) return;
    try {
      await del.mutateAsync(deleteGame.id);
      setDeleteGame(null);
      setMenuOpen(null);
    } catch (err) {
      toast.show((err as Error).message || 'Could not delete', 'error');
    }
  };

  const onSaveGame = async (patch: { imageUrl?: string; minAccepts?: number }) => {
    if (!editImageGame) return;
    try {
      await update.mutateAsync({ id: editImageGame.id, patch });
      setEditImageGame(null);
    } catch (err) {
      toast.show((err as Error).message || 'Could not update game', 'error');
    }
  };

  const onConfirmLeave = async () => {
    try {
      await leave.mutateAsync();
      setLeaveOpen(false);
      navigate('/onboarding/group', { replace: true });
    } catch (err) {
      toast.show((err as Error).message || 'Could not leave group', 'error');
    }
  };

  return (
    <div className="min-h-full p-4 max-w-2xl mx-auto w-full pb-32">
      <header className="flex items-center justify-between py-4 gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{group.data?.name || 'Your group'}</h1>
            {group.data?.members && (
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                aria-label={`${group.data.members.length} member${group.data.members.length === 1 ? '' : 's'} — tap to view`}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition flex-shrink-0"
              >
                <span aria-hidden>👥</span>
                <span>{group.data.members.length}</span>
              </button>
            )}
          </div>
          {group.data?.code && (
            <p className="text-xs text-slate-500 font-mono tracking-widest">CODE {group.data.code}</p>
          )}
        </div>
        {group.data?.id && (
          <button
            type="button"
            onClick={() => setLeaveOpen(true)}
            className="text-sm text-slate-400 hover:text-red-400 px-2 py-1 flex-shrink-0"
          >
            Leave
          </button>
        )}
      </header>

      <EnableNotificationsBanner enabled={!!group.data?.id} />

      {games.isLoading ? (
        <p className="text-slate-500">Loading games…</p>
      ) : games.data && games.data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {games.data.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              myId={me.data?.id}
              onTap={() => {
                const active = g.activeSignal;
                if (active) {
                  if (active.triggeredById === me.data?.id) {
                    navigate(`/signal/${active.id}/sent`);
                    return;
                  }
                  if (!active.userResponse) {
                    navigate(`/signal/${active.id}/respond`);
                    return;
                  }
                  toast.show(
                    active.userResponse === 'accept'
                      ? "You're already in — waiting on the rest of the crew."
                      : "You already said no — waiting for the signal to close.",
                    'info',
                  );
                  return;
                }
                if (!g.subscribed) {
                  toast.show('Subscribe to this game before sending a signal', 'info');
                  return;
                }
                if ((g.subscriberCount ?? 0) < 2) {
                  toast.show('Need at least one other subscriber to send a signal', 'info');
                  return;
                }
                setConfirmGame(g);
              }}
              onToggle={() => onToggleSubscribe(g)}
              menuOpen={menuOpen === g.id}
              setMenuOpen={(o) => setMenuOpen(o ? g.id : null)}
              onEditImage={() => {
                setMenuOpen(null);
                setEditImageGame(g);
              }}
              onDelete={() => {
                setMenuOpen(null);
                setDeleteGame(g);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-4xl mb-2">🎮</div>
          <p className="text-slate-400 mb-6">No games yet. Add one to send your first signal.</p>
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            + Add your first game
          </button>
        </div>
      )}

      <button onClick={() => setAddOpen(true)} className="fixed bottom-6 right-6 btn-primary rounded-full px-6 py-4 text-lg shadow-2xl">
        + Add game
      </button>

      <ConfirmDialog
        open={!!confirmGame}
        onClose={() => setConfirmGame(null)}
        onConfirm={onConfirmTrigger}
        title="Send the kebab signal?"
        message={
          confirmGame && (
            <div className="space-y-3">
              <p>
                Everyone subscribed to <span className="font-semibold text-signal-400">{confirmGame.name}</span> will get a
                push notification.
              </p>
              {typeof confirmGame.minAccepts === 'number' &&
                (confirmGame.subscriberCount ?? 0) < confirmGame.minAccepts && (
                  <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-200">
                    ⚠️ Crew target is {confirmGame.minAccepts}, but only {confirmGame.subscriberCount ?? 0} subscribed.
                    The signal will still go out, but the crew can't fully assemble unless more people subscribe.
                  </p>
                )}
            </div>
          )
        }
        confirmLabel="Send signal 🥙"
        busyLabel="Sending…"
        busy={trigger.isPending}
      />

      <ConfirmDialog
        open={!!deleteGame}
        onClose={() => setDeleteGame(null)}
        onConfirm={onConfirmDelete}
        title="Delete this game?"
        message={
          deleteGame && (
            <p>
              <span className="font-semibold text-slate-100">{deleteGame.name}</span> will be removed for the whole group,
              along with its history.
            </p>
          )
        }
        confirmLabel="Delete"
        busyLabel="Deleting…"
        confirmTone="danger"
        busy={del.isPending}
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={onConfirmLeave}
        title={`Leave ${group.data?.name ?? 'this group'}?`}
        message={
          <p>
            You'll stop getting signals from this group and lose your subscriptions. You can rejoin later with the
            group code.
          </p>
        }
        confirmLabel="Leave group"
        busyLabel="Leaving…"
        confirmTone="danger"
        busy={leave.isPending}
      />

      <MembersModal
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        groupName={group.data?.name}
        members={group.data?.members ?? []}
      />

      <EditGameModal
        game={editImageGame}
        busy={update.isPending}
        onClose={() => setEditImageGame(null)}
        onSubmit={onSaveGame}
      />

      <AddGameModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        busy={create.isPending}
        onSubmit={async (input) => {
          try {
            await create.mutateAsync(input);
            setAddOpen(false);
          } catch (err) {
            toast.show((err as Error).message || 'Could not add game', 'error');
          }
        }}
      />
    </div>
  );
}

interface GameCardProps {
  game: Game;
  myId?: string;
  onTap: () => void;
  onToggle: () => void;
  menuOpen: boolean;
  setMenuOpen: (o: boolean) => void;
  onEditImage: () => void;
  onDelete: () => void;
}

function GameCard({ game, myId, onTap, onToggle, menuOpen, setMenuOpen, onEditImage, onDelete }: GameCardProps) {
  const active = game.activeSignal ?? null;
  const isMine = !!active && !!myId && active.triggeredById === myId;
  const myResponse = active?.userResponse ?? null;
  const canSignal = !active && !!game.subscribed && (game.subscriberCount ?? 0) >= 2;

  let subtitle: string;
  if (active) {
    if (isMine) subtitle = 'Your signal is live — tap to view';
    else if (myResponse === 'accept') subtitle = "You're in — waiting on the crew";
    else if (myResponse === 'reject') subtitle = 'You passed — signal still open';
    else subtitle = `${active.triggeredByUsername} sent a signal — tap to respond`;
  } else if (!game.subscribed) {
    subtitle = 'Subscribe to send a signal';
  } else if ((game.subscriberCount ?? 0) < 2) {
    subtitle = 'Needs one more subscriber';
  } else {
    subtitle = 'Tap to send signal';
  }

  const interactive = !!active || canSignal;
  const tone = active
    ? isMine || myResponse === 'accept'
      ? 'border-signal-600/60 bg-signal-600/5'
      : myResponse === 'reject'
      ? 'border-slate-700'
      : 'border-amber-500/50 bg-amber-500/5'
    : '';
  return (
    <div
      className={`relative card transition cursor-pointer ${tone} ${
        interactive ? 'hover:border-signal-600 active:scale-[0.99]' : 'opacity-70'
      }`}
      onClick={onTap}
    >
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {game.imageUrl ? (
            <img src={game.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🎮</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{game.name}</div>
              <div className="text-xs text-slate-500">{subtitle}</div>
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              aria-label="More"
              className="-mt-2 -mr-2 inline-flex items-center justify-center w-11 h-11 rounded-lg text-xl text-slate-400 hover:bg-slate-800 flex-shrink-0"
            >
              ⋮
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label={game.subscribed ? 'Unsubscribe' : 'Subscribe'}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                game.subscribed
                  ? 'bg-signal-600/15 border-signal-600/50 text-signal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <span aria-hidden>{game.subscribed ? '🔔' : '🔕'}</span>
              <span>{game.subscribed ? 'Subscribed' : 'Off'}</span>
            </button>
            {typeof game.subscriberCount === 'number' && (
              <span
                aria-label={`${game.subscriberCount} subscriber${game.subscriberCount === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300"
              >
                <span aria-hidden>👥</span>
                <span>{game.subscriberCount}</span>
              </span>
            )}
            {typeof game.minAccepts === 'number' && (() => {
              const subs = game.subscriberCount ?? 0;
              const unreachable = game.minAccepts > subs;
              return (
                <span
                  aria-label={
                    unreachable
                      ? `Crew assembles at ${game.minAccepts}, but only ${subs} subscribed`
                      : `Crew assembles at ${game.minAccepts}`
                  }
                  title={
                    unreachable
                      ? `Needs ${game.minAccepts}, only ${subs} subscribed — crew can't fully assemble`
                      : undefined
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                    unreachable
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  <span aria-hidden>{unreachable ? '⚠️' : '🎯'}</span>
                  <span>{game.minAccepts}</span>
                </span>
              );
            })()}
          </div>
          {active && <ActiveSignalRow active={active} isMine={isMine} />}
        </div>
      </div>
      {menuOpen && (
        <div
          className="absolute top-2 right-2 mt-10 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-xl z-10 min-w-[10rem]"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEditImage}
            className="block w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Edit game
          </button>
          <button
            onClick={onDelete}
            className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 border-t border-slate-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

interface ActiveSignalRowProps {
  active: NonNullable<Game['activeSignal']>;
  isMine: boolean;
}

function ActiveSignalRow({ active, isMine }: ActiveSignalRowProps) {
  const { acceptedCount, rejectedCount, minAccepts, totalSubscribers, userResponse } = active;
  const progress = `${acceptedCount}/${minAccepts}`;
  let pill: { label: string; classes: string };
  if (isMine) {
    pill = { label: '🥙 Your signal', classes: 'bg-signal-600/15 border-signal-600/50 text-signal-300' };
  } else if (userResponse === 'accept') {
    pill = { label: "🥙 You're in", classes: 'bg-signal-600/15 border-signal-600/50 text-signal-300' };
  } else if (userResponse === 'reject') {
    pill = { label: '👋 You passed', classes: 'bg-slate-800 border-slate-700 text-slate-400' };
  } else {
    pill = { label: '🚨 Tap to respond', classes: 'bg-amber-500/15 border-amber-500/40 text-amber-200' };
  }
  const senderLine = isMine
    ? 'You sent this signal.'
    : `${active.triggeredByUsername} sent a signal.`;
  return (
    <div className="mt-3 border-t border-slate-800 pt-2">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold border ${pill.classes}`}
        >
          {pill.label}
        </span>
        <span className="text-slate-400">
          {progress} in
          {rejectedCount > 0 && <span className="text-slate-500"> · {rejectedCount} out</span>}
          {typeof totalSubscribers === 'number' && (
            <span className="text-slate-500"> · {totalSubscribers} subs</span>
          )}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500 truncate">{senderLine}</p>
    </div>
  );
}

interface MembersModalProps {
  open: boolean;
  onClose: () => void;
  groupName?: string;
  members: Member[];
}

function MembersModal({ open, onClose, groupName, members }: MembersModalProps) {
  const sorted = [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Members${groupName ? ` — ${groupName}` : ''} (${members.length})`}>
      <ul className="divide-y divide-slate-800 -mx-2">
        {sorted.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-2 py-3">
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center font-semibold text-slate-200 flex-shrink-0">
              {m.username.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{m.username}</div>
              <div className="text-xs text-slate-500">Joined {fmt(m.joinedAt)}</div>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

interface EditGameModalProps {
  game: Game | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (patch: { imageUrl?: string; minAccepts?: number }) => Promise<void>;
}

function EditGameModal({ game, busy, onClose, onSubmit }: EditGameModalProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [minAccepts, setMinAccepts] = useState(2);

  useEffect(() => {
    setImageUrl(game?.imageUrl ?? '');
    setMinAccepts(game?.minAccepts ?? 2);
  }, [game]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const patch: { imageUrl?: string; minAccepts?: number } = {};
    const trimmedUrl = imageUrl.trim();
    if (trimmedUrl !== (game?.imageUrl ?? '')) patch.imageUrl = trimmedUrl;
    if (minAccepts !== (game?.minAccepts ?? 2)) patch.minAccepts = minAccepts;
    await onSubmit(patch);
  };

  return (
    <Modal open={!!game} onClose={onClose} title={game ? `Edit — ${game.name}` : 'Edit game'}>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Image URL</label>
          <input
            className="input"
            placeholder="Leave blank to clear"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            autoFocus
          />
          {imageUrl && (
            <div className="mt-2 rounded-xl bg-slate-800 overflow-hidden border border-slate-700 aspect-video flex items-center justify-center">
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Crew assembles at
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMinAccepts((n) => Math.max(2, n - 1))}
              aria-label="Decrease"
              className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xl"
            >
              −
            </button>
            <input
              type="number"
              min={2}
              max={50}
              className="input text-center w-20"
              value={minAccepts}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setMinAccepts(Math.min(50, Math.max(2, Math.round(n))));
              }}
            />
            <button
              type="button"
              onClick={() => setMinAccepts((n) => Math.min(50, n + 1))}
              aria-label="Increase"
              className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xl"
            >
              +
            </button>
            <span className="text-xs text-slate-500">accepted</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            When this many people accept (including you), the signal auto-closes and the crew gets a heads-up push.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onSubmit: (input: { name: string; imageUrl?: string }) => Promise<void>;
}

function AddGameModal({ open, onClose, busy, onSubmit }: AddGameModalProps) {
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSubmit({ name: name.trim(), imageUrl: imageUrl.trim() || undefined });
    setName('');
    setImageUrl('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a game">
      <form onSubmit={submit} className="space-y-4">
        <input
          className="input"
          placeholder="Game name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          required
        />
        <input
          className="input"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
