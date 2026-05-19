import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getToken, syncTokenToIdb } from './lib/auth';
import { isStandalone } from './lib/pwa';
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
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('SW registration error', error);
    },
  });

  useEffect(() => {
    void syncTokenToIdb();
  }, []);

  useEffect(() => {
    if (needRefresh) {
      toast.show('App updated', 'info', {
        label: 'Reload',
        onClick: () => updateServiceWorker(true),
      });
    }
  }, [needRefresh, updateServiceWorker, toast]);

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
  const groupQuery = useGroup(!!token);

  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '') return;
    if (!standalone) {
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
    navigate('/games', { replace: true });
  }, [location.pathname, standalone, token, groupQuery.isLoading, groupQuery.isError, groupQuery.data, navigate]);

  if (!standalone) return <Navigate to="/install" replace />;
  if (!token) return <Navigate to="/onboarding" replace />;
  return (
    <div className="min-h-full flex items-center justify-center">
      <div className="text-slate-500">Loading…</div>
    </div>
  );
}
