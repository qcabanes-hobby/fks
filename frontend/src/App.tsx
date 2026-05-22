import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getActiveSignal, getToken, requestPersistentStorage, syncTokenToIdb } from './lib/auth';
import { clearPendingSignalIntent, consumePendingSignalIntent } from './lib/notification-intent';
import { ensurePushSubscription } from './lib/push';
import { hasSkippedInstall, isStandalone } from './lib/pwa';
import { fetchPendingSignal, qk, useGroup } from './lib/queries';
import { ToastProvider, useToast } from './components/Toast';
import { InstallPage } from './pages/InstallPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { GroupSetupPage } from './pages/GroupSetupPage';
import { GamesPage } from './pages/GamesPage';
import { SignalSentPage } from './pages/SignalSentPage';
import { SignalRespondPage } from './pages/SignalRespondPage';
import { ReloginPage } from './pages/ReloginPage';

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const qc = useQueryClient();
  const [bootReady, setBootReady] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    (async () => {
      await syncTokenToIdb();
      void requestPersistentStorage();
      // Consume a pending notification intent BEFORE bootReady flips so
      // RootRedirect doesn't render and bounce us to /games. This recovers
      // the closed-signal "you missed it" flow when the browser launched
      // us at start_url instead of the URL the SW passed to openWindow.
      const intent = await consumePendingSignalIntent();
      if (intent && getToken()) {
        navigate(`/signal/${intent.signalId}/respond`, { replace: true });
      }
      setBootReady(true);
      if (getToken()) {
        void ensurePushSubscription({ promptIfNeeded: false }).catch(() => {});
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (needRefresh) {
      toast.show('App updated', 'info', {
        label: 'Reload',
        onClick: () => updateServiceWorker(true),
      });
    }
  }, [needRefresh, updateServiceWorker, toast]);

  useEffect(() => {
    if (!bootReady) return;
    if (!getToken()) return;
    let cancelled = false;
    const check = async () => {
      try {
        const pending = await fetchPendingSignal();
        if (cancelled || !pending) return;
        const path = locationRef.current.pathname;
        const target = `/signal/${pending.signalId}/respond`;
        if (path === target) return;
        if (path.startsWith(`/signal/${pending.signalId}/`)) return;
        if (getActiveSignal() === pending.signalId) return;
        navigate(target);
      } catch {}
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [bootReady, navigate]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; signalId?: string } | null;
      if (!data || !data.signalId) return;
      if (data.type === 'signal-incoming' || data.type === 'signal-open') {
        // Warm-boot path: the SW already wrote the intent to IDB, but we
        // handled it here via postMessage. Clear so a later cold boot
        // doesn't replay this navigation.
        void clearPendingSignalIntent();
        navigate(`/signal/${data.signalId}/respond`);
      } else if (data.type === 'signal-cancel') {
        // Don't navigate — SignalRespondPage renders the "you missed it"
        // screen when closedAt is set. Refresh the cached signal so that
        // screen appears immediately instead of waiting for the next poll.
        void qc.invalidateQueries({ queryKey: qk.signal(data.signalId) });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate, qc]);

  if (!bootReady) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/install" element={<InstallPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/onboarding/notifications" element={<NotificationsPage />} />
      <Route path="/onboarding/group" element={<GroupSetupPage />} />
      <Route path="/games" element={<GamesPage />} />
      <Route path="/signal/:id/sent" element={<SignalSentPage />} />
      <Route path="/signal/:id/respond" element={<SignalRespondPage />} />
      <Route path="/relogin" element={<ReloginPage />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

function RootRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = getToken();
  const standalone = isStandalone();
  const allowBrowserMode = standalone || hasSkippedInstall();
  const groupQuery = useGroup(!!token);

  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '') return;
    if (!allowBrowserMode) {
      navigate('/install', { replace: true });
      return;
    }
    if (!token) {
      navigate('/onboarding', { replace: true });
      return;
    }
    if (groupQuery.isLoading) return;
    if (groupQuery.isError || !groupQuery.data || !groupQuery.data.id) {
      navigate('/onboarding/group', { replace: true });
      return;
    }
    const activeSignal = getActiveSignal();
    if (activeSignal) {
      navigate(`/signal/${activeSignal}/sent`, { replace: true });
      return;
    }
    navigate('/games', { replace: true });
  }, [location.pathname, allowBrowserMode, token, groupQuery.isLoading, groupQuery.isError, groupQuery.data, navigate]);

  if (!allowBrowserMode) return <Navigate to="/install" replace />;
  if (!token) return <Navigate to="/onboarding" replace />;
  return (
    <div className="min-h-full flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );
}
