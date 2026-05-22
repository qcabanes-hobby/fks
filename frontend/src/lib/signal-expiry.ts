import { useEffect, useState } from 'react';

export const SIGNAL_TIMEOUT_MS = 5 * 60 * 1000;

export function useSignalExpiry(triggeredAt: string | undefined, closed: boolean): {
  msLeft: number;
  label: string;
} | null {
  const expiresAt = triggeredAt ? new Date(triggeredAt).getTime() + SIGNAL_TIMEOUT_MS : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt || closed) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt, closed]);

  if (!expiresAt || closed) return null;
  const msLeft = Math.max(expiresAt - now, 0);
  const totalSec = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { msLeft, label: `${m}:${s.toString().padStart(2, '0')}` };
}
