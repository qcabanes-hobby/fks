import { useEffect, useState } from 'react';
import {
  clearJoinedSignal,
  getJoinedSignal,
  getToken,
  subscribeJoinedSignal,
} from '../lib/auth';
import { useSignal } from '../lib/queries';

const AUTO_DISMISS_MS = 12_000;

export function JoinedSignalBanner() {
  const [signalId, setSignalId] = useState<string | null>(() => getJoinedSignal());

  useEffect(() => {
    return subscribeJoinedSignal(() => setSignalId(getJoinedSignal()));
  }, []);

  if (!signalId) return null;
  return <Inner signalId={signalId} />;
}

function Inner({ signalId }: { signalId: string }) {
  const [liveAccepted, setLiveAccepted] = useState<number | null>(null);
  const [liveRejected, setLiveRejected] = useState<number | null>(null);
  const [liveClosed, setLiveClosed] = useState<boolean | null>(null);
  const signal = useSignal(signalId, { refetchInterval: 5000 });

  useEffect(() => {
    setLiveAccepted(null);
    setLiveRejected(null);
    setLiveClosed(null);
  }, [signalId]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const url = `/sse/signals/${signalId}?token=${encodeURIComponent(token)}`;
    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as {
          acceptedCount?: number;
          rejectedCount?: number;
          closed?: boolean;
        };
        if (typeof data.acceptedCount === 'number') setLiveAccepted(data.acceptedCount);
        if (typeof data.rejectedCount === 'number') setLiveRejected(data.rejectedCount);
        if (typeof data.closed === 'boolean') setLiveClosed(data.closed);
      } catch {}
    };
    es.onerror = () => es?.close();
    return () => {
      es?.close();
    };
  }, [signalId]);

  const data = signal.data;
  const accepted = liveAccepted ?? data?.acceptedCount ?? 0;
  const rejected = liveRejected ?? data?.rejectedCount ?? 0;
  const closed = liveClosed ?? !!data?.closedAt;
  const min = data?.minAccepts;
  const totalSubscribers = data?.totalSubscribers;
  const gameName = data?.gameName ?? 'your game';
  const crewAssembled = typeof min === 'number' && accepted >= min;
  const everyoneResponded =
    typeof totalSubscribers === 'number' && accepted + rejected >= totalSubscribers;

  useEffect(() => {
    if (!closed) return;
    const t = setTimeout(() => clearJoinedSignal(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [closed]);

  useEffect(() => {
    if (signal.isError) clearJoinedSignal();
  }, [signal.isError]);

  useEffect(() => {
    if (data?.userResponse && data.userResponse !== 'accept') clearJoinedSignal();
  }, [data?.userResponse]);

  if (!data) return null;
  if (data.userResponse && data.userResponse !== 'accept') return null;

  const onDismiss = () => clearJoinedSignal();

  if (closed) {
    if (crewAssembled) {
      return (
        <BannerShell
          tone="success"
          emoji="🎉"
          title={`Crew assembled for ${gameName}!`}
          body={`${accepted} are in. It's on!`}
          onDismiss={onDismiss}
        />
      );
    }
    const target = typeof min === 'number' ? `${accepted}/${min}` : `${accepted}`;
    if (everyoneResponded) {
      return (
        <BannerShell
          tone="failure"
          emoji="😕"
          title="Crew couldn't be reached"
          body={`Everyone answered, but only ${target} were in.`}
          onDismiss={onDismiss}
        />
      );
    }
    return (
      <BannerShell
        tone="failure"
        emoji="👋"
        title="Signal stopped"
        body={`Only ${target} joined before it was called off.`}
        onDismiss={onDismiss}
      />
    );
  }

  const progress = typeof min === 'number' ? `${accepted}/${min} in` : `${accepted} in`;
  return (
    <BannerShell
      tone="active"
      emoji="🥙"
      title={`You're in for ${gameName}`}
      body={`${progress} — waiting for the rest of the crew…`}
      onDismiss={onDismiss}
    />
  );
}

interface BannerShellProps {
  tone: 'active' | 'success' | 'failure';
  emoji: string;
  title: string;
  body: string;
  onDismiss: () => void;
}

function BannerShell({ tone, emoji, title, body, onDismiss }: BannerShellProps) {
  const toneClasses =
    tone === 'success'
      ? 'border-emerald-500/50 bg-emerald-500/10'
      : tone === 'failure'
      ? 'border-slate-700 bg-slate-800/70'
      : 'border-signal-600/40 bg-signal-600/10';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-xl border p-3 flex items-center gap-3 ${toneClasses}`}
    >
      <div className="text-2xl" aria-hidden>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-slate-400 truncate">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-800/60 flex-shrink-0"
      >
        ×
      </button>
    </div>
  );
}
