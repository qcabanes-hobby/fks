import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
  action?: { label: string; onClick: () => void };
}

interface ToastCtx {
  show: (msg: string, kind?: ToastItem['kind'], action?: ToastItem['action']) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback<ToastCtx['show']>((message, kind = 'info', action) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, kind, action }]);
    if (!action) {
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 4000);
    }
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(90vw,420px)]">
        {items.map((it) => (
          <ToastView key={it.id} item={it} onDismiss={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const color =
    item.kind === 'error'
      ? 'bg-red-600/90 border-red-500'
      : item.kind === 'success'
        ? 'bg-emerald-600/90 border-emerald-500'
        : 'bg-slate-800/95 border-slate-700';
  return (
    <div className={`rounded-xl border ${color} text-white px-4 py-3 shadow-lg flex items-center justify-between gap-3`}>
      <span className="text-sm">{item.message}</span>
      <div className="flex gap-2">
        {item.action && (
          <button
            className="text-sm font-semibold underline"
            onClick={() => {
              item.action!.onClick();
              onDismiss();
            }}
          >
            {item.action.label}
          </button>
        )}
        <button className="text-sm opacity-70 hover:opacity-100" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}
