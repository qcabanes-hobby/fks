import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import {
  useCreateGame,
  useDeleteGame,
  useGames,
  useGroup,
  useSubscribe,
  useTriggerSignal,
  useUnsubscribe,
} from '../lib/queries';
import type { Game } from '../lib/types';

export function GamesPage() {
  const games = useGames();
  const group = useGroup();
  const navigate = useNavigate();
  const toast = useToast();
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();
  const create = useCreateGame();
  const del = useDeleteGame();
  const trigger = useTriggerSignal();

  const [addOpen, setAddOpen] = useState(false);
  const [confirmGame, setConfirmGame] = useState<Game | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

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

  return (
    <div className="min-h-full p-4 max-w-2xl mx-auto w-full pb-32">
      <header className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-2xl font-bold">{group.data?.name || 'Your group'}</h1>
          {group.data?.code && (
            <p className="text-xs text-slate-500 font-mono tracking-widest">CODE {group.data.code}</p>
          )}
        </div>
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
              onDelete={async () => {
                if (!confirm(`Delete ${g.name}?`)) return;
                try {
                  await del.mutateAsync(g.id);
                  setMenuOpen(null);
                } catch (err) {
                  toast.show((err as Error).message || 'Could not delete', 'error');
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-4xl mb-2">🎮</div>
          <p className="text-slate-400">No games yet. Add one to send your first signal.</p>
        </div>
      )}

      <button onClick={() => setAddOpen(true)} className="fixed bottom-6 right-6 btn-primary rounded-full px-6 py-4 text-lg shadow-2xl">
        + Add game
      </button>

      <Modal open={!!confirmGame} onClose={() => setConfirmGame(null)} title="Send the kebab signal?">
        {confirmGame && (
          <div className="space-y-4">
            <p className="text-slate-300">
              Everyone subscribed to <span className="font-semibold text-signal-400">{confirmGame.name}</span> will get a
              push notification.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setConfirmGame(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={onConfirmTrigger} disabled={trigger.isPending} className="btn-primary">
                {trigger.isPending ? 'Sending…' : "Send signal 🥙"}
              </button>
            </div>
          </div>
        )}
      </Modal>

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
  onDelete: () => void;
}

function GameCard({ game, onTap, onToggle, menuOpen, setMenuOpen, onDelete }: GameCardProps) {
  return (
    <div className="relative card hover:border-signal-600 active:scale-[0.99] transition cursor-pointer overflow-hidden" onClick={onTap}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
          {game.imageUrl ? (
            <img src={game.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl">🎮</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{game.name}</div>
          <div className="text-xs text-slate-500">Tap to send signal</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          aria-label={game.subscribed ? 'Unsubscribe' : 'Subscribe'}
          className={`p-2 rounded-lg text-xl ${game.subscribed ? 'text-signal-500' : 'text-slate-600'}`}
        >
          🔔
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          aria-label="More"
          className="p-2 rounded-lg text-slate-400 hover:bg-slate-800"
        >
          ⋮
        </button>
      </div>
      {menuOpen && (
        <div
          className="absolute top-2 right-2 mt-10 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-xl z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onDelete}
            className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
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
