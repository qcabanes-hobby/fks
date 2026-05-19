import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getActiveSignal, getToken, requestPersistentStorage, syncTokenToIdb } from './lib/auth';
import { ensurePushSubscription } from './lib/push';
import { hasSkippedInstall, isStandalone } from './lib/pwa';
import { useGroup } from './lib/queries';
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
      setBootReady(true);
      if (getToken()) {
        void ensurePushSubscription({ promptIfNeeded: false }).catch(() => {});
      }
    })();
  }, []);

  useEffect(() => {
    if (needRefresh) {
      toast.show('App updated', 'info', {
        label: 'Reload',
        onClick: () => updateServiceWorker(true),
      });
    }
  }, [needRefresh, updateServiceWorker, toast]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; signalId?: string } | null;
      if (!data || !data.signalId) return;
      if (data.type === 'signal-incoming') {
        navigate(`/signal/${data.signalId}/respond`);
      } else if (data.type === 'signal-cancel') {
        const path = locationRef.current.pathname;
        if (path === `/signal/${data.signalId}/respond`) {
          navigate('/games', { replace: true });
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [navigate]);

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
