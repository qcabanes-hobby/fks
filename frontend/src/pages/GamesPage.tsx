import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { getActiveSignal } from '../lib/auth';
import {
  useCreateGame,
  useDeleteGame,
  useGames,
  useGroup,
  useLeaveGroup,
  useSubscribe,
  useTriggerSignal,
  useUnsubscribe,
  useUpdateGame,
} from '../lib/queries';
import type { Game, Member } from '../lib/types';

export function GamesPage() {
  const games = useGames();
  const group = useGroup();
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

  const onSaveImage = async (imageUrl: string) => {
    if (!editImageGame) return;
    try {
      await update.mutateAsync({ id: editImageGame.id, patch: { imageUrl } });
      setEditImageGame(null);
    } catch (err) {
      toast.show((err as Error).message || 'Could not update image', 'error');
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

      {games.isLoading ? (
        <p className="text-slate-500">Loading games…</p>
      ) : games.data && games.data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {games.data.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onTap={() => setConfirmGame(g)}
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
            <p>
              Everyone subscribed to <span className="font-semibold text-signal-400">{confirmGame.name}</span> will get a
              push notification.
            </p>
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

      <EditImageModal
        game={editImageGame}
        busy={update.isPending}
        onClose={() => setEditImageGame(null)}
        onSubmit={onSaveImage}
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
  onTap: () => void;
  onToggle: () => void;
  menuOpen: boolean;
  setMenuOpen: (o: boolean) => void;
  onEditImage: () => void;
  onDelete: () => void;
}

function GameCard({ game, onTap, onToggle, menuOpen, setMenuOpen, onEditImage, onDelete }: GameCardProps) {
  return (
    <div className="relative card hover:border-signal-600 active:scale-[0.99] transition cursor-pointer" onClick={onTap}>
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
              <div className="text-xs text-slate-500">Tap to send signal</div>
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
          </div>
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
            Update image
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

interface EditImageModalProps {
  game: Game | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (imageUrl: string) => Promise<void>;
}

function EditImageModal({ game, busy, onClose, onSubmit }: EditImageModalProps) {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    setImageUrl(game?.imageUrl ?? '');
  }, [game]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(imageUrl.trim());
  };

  return (
    <Modal open={!!game} onClose={onClose} title={game ? `Update image — ${game.name}` : 'Update image'}>
      <form onSubmit={submit} className="space-y-4">
        <input
          className="input"
          placeholder="Image URL (leave blank to clear)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          autoFocus
        />
        {imageUrl && (
          <div className="rounded-xl bg-slate-800 overflow-hidden border border-slate-700 aspect-video flex items-center justify-center">
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
