import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Home, Wheat, Syringe, ChartNoAxesCombined, LogOut } from 'lucide-react';
import LoginScreen from './pages/LoginScreen.jsx';
const DashboardScreen = lazy(() => import('./pages/DashboardScreen.jsx'));
const FeedsInventoryScreen = lazy(() => import('./pages/FeedsInventoryScreen.jsx'));
const AnalyticsReportsScreen = lazy(() => import('./pages/AnalyticsReportScreen.jsx'));
const VaccinationScreen = lazy(() => import('./pages/VaccinationScreen.jsx'));
const BatchPigsScreen = lazy(() => import('./pages/BatchPigsScreen.jsx'));
const FarmManagementScreen = lazy(() => import('./pages/FarmManagementScreen.jsx'));
import { registerFcmToken, API_BASE, getAuthHeaders, preloadInitialData } from './api.js';
import { recoverInterruptedSync, syncOfflineQueue, getOfflineStatus, retryOfflineItem, discardOfflineItem, offlineEvents, getOwnerId, handleOfflineFetch } from './services/offlineSync.js';
import { ConfirmationProvider, useConfirmation } from './components/ConfirmationDialog.jsx';
import './App.css';

const tabKeys = ['/dashboard', '/feeds', '/reports', '/vaccination'];

function DesktopSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (paths) => paths.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const items = [
    { paths: ['/dashboard'], label: 'Overview', icon: Home, path: '/dashboard' },
    { paths: ['/feeds'], label: 'Feed inventory', icon: Wheat, path: '/feeds' },
    { paths: ['/vaccination'], label: 'Vaccinations', icon: Syringe, path: '/vaccination' },
    { paths: ['/reports'], label: 'Farm reports', icon: ChartNoAxesCombined, path: '/reports' },
  ];
  return (
    <aside className="desktop-app-sidebar" aria-label="Farm navigation">
      <div className="desktop-sidebar-brand">
        <div className="desktop-sidebar-logo"><img src="/prepapig-logo.png" alt="PrepAPig logo" /></div>
        <div><strong className="brand-wordmark">Prep<span>AP</span>ig</strong><small>FARM OS</small></div>
      </div>
      <p className="desktop-sidebar-label">Workspace</p>
      <nav className="desktop-sidebar-nav">
        {items.map(({ paths, label, icon: Icon, path }) => (
          <button key={path} className={isActive(paths) ? 'active' : ''} onClick={() => navigate(path)}>
            <Icon size={19} /> {label} {isActive(paths) && <span>•</span>}
          </button>
        ))}
      </nav>
      <div className="desktop-sidebar-footer">
        <button className="desktop-sidebar-user" onClick={() => window.dispatchEvent(new CustomEvent('prepapig:logout'))}>
          <span className="desktop-sidebar-avatar">AP</span>
          <span><strong>Farm manager</strong><small>Log out</small></span>
          <LogOut size={17} />
        </button>
      </div>
    </aside>
  );
}

function DesktopShell({ children }) {
  const location = useLocation();
  const showSidebar = location.pathname !== '/';
  return <div className="desktop-app-shell">{showSidebar && <DesktopSidebar />}<main className={showSidebar ? 'desktop-app-content' : 'desktop-login-content'}>{children}</main></div>;
}

function PersistentTabs() {
  const location = useLocation();
  const currentPath = tabKeys.includes(location.pathname) ? location.pathname : '/dashboard';
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([currentPath]));

  useEffect(() => {
    setVisitedTabs((visited) => {
      if (visited.has(currentPath)) return visited;
      return new Set([...visited, currentPath]);
    });
  }, [currentPath]);

  return (
    <>
      {tabKeys.map((path) => {
        const shouldRender = visitedTabs.has(path) || path === currentPath;
        if (!shouldRender) return null;
        const screen = {
          '/dashboard': <DashboardScreen />,
          '/feeds': <FeedsInventoryScreen />,
          '/reports': <AnalyticsReportsScreen />,
          '/vaccination': <VaccinationScreen />,
        }[path];
        return <div className={path === currentPath ? '' : 'hidden'} key={path}>{screen}</div>;
      })}
    </>
  );
}

function OfflineSyncNotice({ isLoggedIn }) {
  const confirm = useConfirmation();
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [status, setStatus] = useState({ pending: 0, failed: 0, needsReview: 0, items: [], usingCachedData: false, staleCacheCount: 0 });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setOnline(navigator.onLine !== false);
      setStatus({ pending: 0, failed: 0, needsReview: 0, items: [], usingCachedData: false, staleCacheCount: 0 });
      return undefined;
    }
    let active = true;
    const refresh = async () => {
      setOnline(navigator.onLine !== false);
      if (!getOwnerId()) {
        if (active) setStatus({ pending: 0, failed: 0, needsReview: 0, items: [] });
        return;
      }
      let next;
      try { next = await getOfflineStatus(); }
      catch { next = { pending: 0, failed: 0, needsReview: 0, items: [] }; }
      if (active) setStatus(next);
    };
    const sync = async () => {
      await refresh();
      if (navigator.onLine !== false && getOwnerId()) {
        await syncOfflineQueue({ apiBase: API_BASE }).catch(() => {});
      }
      await refresh();
    };
    const onNetwork = () => { void (navigator.onLine === false ? refresh() : sync()); };
    const onChange = () => { void refresh(); };
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);
    window.addEventListener(offlineEvents.state, onChange);
    const onServiceWorkerMessage = (event) => {
      if (event.data?.type === 'PREPAPIG_SYNC_OFFLINE_QUEUE') void sync();
    };
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    void recoverInterruptedSync().then(sync).catch(refresh);
    return () => {
      active = false;
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.removeEventListener(offlineEvents.state, onChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [isLoggedIn]);

  const discard = async (item) => {
    if (!await confirm({ title: 'Discard local change?', message: 'Permanently remove this unsynced local change? This does not delete any server record.', confirmLabel: 'Discard', destructive: true })) return;
    await discardOfflineItem(item.id);
    if (navigator.onLine !== false) await syncOfflineQueue({ apiBase: API_BASE }).catch(() => {});
    setStatus(await getOfflineStatus());
  };
  const retry = async (item) => {
    if (!await confirm({ title: 'Retry this save?', message: 'If the server already accepted it, retrying may create a duplicate. Check the server first when the outcome is unclear.', confirmLabel: 'Retry' })) return;
    if (await retryOfflineItem(item.id)) await syncOfflineQueue({ apiBase: API_BASE });
    setStatus(await getOfflineStatus());
  };

  if (online && status.items.length === 0 && !status.usingCachedData) return null;
  const label = !online
    ? 'Offline — new supported records are saved on this device.'
    : status.usingCachedData
      ? `Server unavailable — showing cached data${status.staleCacheCount > 1 ? ` from ${status.staleCacheCount} saved requests` : ''}.`
      : status.needsReview
        ? 'Some saves need review before retrying.'
        : status.failed
          ? 'Some saved changes need attention.'
          : `${status.pending} saved change${status.pending === 1 ? '' : 's'} waiting to sync.`;

  const canSync = online && status.pending > 0 && status.failed === 0 && status.needsReview === 0;

  return <section className="fixed left-1/2 z-[100] w-[calc(100%-1rem)] max-w-3xl -translate-x-1/2 rounded-2xl border border-white/70 bg-white/95 p-3 text-sm text-gray-800 shadow-xl backdrop-blur-xl" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }} aria-live="polite">
    <div className="flex items-center justify-between gap-2">
      <div><strong>{label}</strong>{canSync && <span className="ml-2 text-xs text-gray-600">Syncing in order…</span>}</div>
      <div className="flex shrink-0 gap-2">{canSync && <button type="button" className="rounded-lg bg-emerald-700 px-3 py-1 font-semibold text-white" onClick={() => { void syncOfflineQueue({ apiBase: API_BASE }).then(getOfflineStatus).then(setStatus); }}>Sync now</button>}{status.items.length > 0 && <button type="button" className="rounded-lg bg-white/70 px-3 py-1 font-semibold" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide' : `${status.items.length} details`}</button>}</div>
    </div>
    {expanded && <div className="mt-2 max-h-56 space-y-2 overflow-y-auto border-t border-gray-200 pt-2">
      {status.items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 p-2">
        <div className="min-w-0"><strong className="block">{item.method} {item.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/ig, ':record')}</strong><span className="text-xs text-gray-600">{item.status.replace('_', ' ')}{item.lastError ? ` · ${item.lastError}` : ''}</span></div>
        <div className="flex gap-2">{['failed', 'needs_review'].includes(item.status) && <button type="button" className="rounded-lg bg-emerald-700 px-2 py-1 text-xs font-semibold text-white" onClick={() => retry(item)}>Retry</button>}{item.status !== 'sending' && <button type="button" className="rounded-lg border border-gray-300 px-2 py-1 text-xs" onClick={() => discard(item)}>Discard local copy</button>}</div>
      </div>)}
    </div>}
  </section>;
}

function AppContent() {
  const confirm = useConfirmation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const logoutExpiredSession = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const interceptedFetch = async (...args) => {
      const init = args[1] || {};
      const { __prepapigSync, ...requestInit } = init;
      const fetchArgs = [args[0], Object.keys(requestInit).length ? requestInit : undefined];
      const response = __prepapigSync
        ? await originalFetch(...fetchArgs)
        : await handleOfflineFetch({ input: args[0], init: args[1], originalFetch, apiBase: API_BASE });
      if (response.status === 401 && localStorage.getItem('token')) {
        window.dispatchEvent(new CustomEvent('prepapig:auth-expired'));
      }
      return response;
    };
    window.fetch = interceptedFetch;
    const handleAuthExpired = () => logoutExpiredSession();
    const handleManualLogout = async () => {
      if (!await confirm({ title: 'Log out?', message: 'Are you sure you want to log out?', confirmLabel: 'Log out' })) return;
      try {
        await originalFetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: getAuthHeaders(),
        });
      } catch {
        // Clear the local session even if the server is unavailable.
      } finally {
        logoutExpiredSession();
      }
    };
    window.addEventListener('prepapig:auth-expired', handleAuthExpired);
    window.addEventListener('prepapig:logout', handleManualLogout);
    return () => {
      window.removeEventListener('prepapig:auth-expired', handleAuthExpired);
      window.removeEventListener('prepapig:logout', handleManualLogout);
      if (window.fetch === interceptedFetch) window.fetch = originalFetch;
    };
  }, [confirm]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || token === 'null' || token === 'undefined') return undefined;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (!payload.exp) return undefined;
      const remainingMs = (Number(payload.exp) * 1000) - Date.now();
      if (remainingMs <= 0) {
        logoutExpiredSession();
        return undefined;
      }
      const timeoutId = window.setTimeout(logoutExpiredSession, remainingMs + 50);
      return () => window.clearTimeout(timeoutId);
    } catch {
      return undefined;
    }
  }, [isLoggedIn]);

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }

      // Do not block the first screen on the settings request. Render the
      // authenticated shell immediately, then invalidate the session only if
      // the background validation explicitly returns 401.
      setIsLoggedIn(true);
      setIsLoading(false);

      try {
        const response = await fetch(`${API_BASE}/management/settings`, {
          headers: getAuthHeaders(),
        });
        if (!cancelled && response.status === 401) {
          localStorage.removeItem('token');
          setIsLoggedIn(false);
        }
      } catch {
        // Keep the cached shell available during temporary network/cold-start failures.
      }
    };
    initAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      preloadInitialData().catch((error) => {
        if (!cancelled) console.warn('Initial data preload did not complete:', error.message);
      });
    };
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(prefetch, { timeout: 8000 })
      : window.setTimeout(prefetch, 5000);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isLoggedIn]);

  useEffect(() => {
    let unsubscribeMessage = null;
    const setup = async () => {
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') return;

      let pushEnabled = true;
      try {
        const response = await fetch(`${API_BASE}/management/settings`, { headers: getAuthHeaders() });
        if (response.ok) {
          const settings = await response.json();
          pushEnabled = settings.preferences?.push_enabled !== false;
        }
      } catch (error) {
        console.warn('Notification preferences unavailable; continuing token setup:', error.message);
      }
      if (!pushEnabled) return;
      const { generateToken, onMessageListener } = await import('./services/firebase.js');
      const fcmToken = await generateToken();
      if (fcmToken) {
        try {
          await registerFcmToken(fcmToken);
          console.log('✅ Token registered with backend');
        } catch (err) {
          console.error('Failed to register token:', err);
        }
      }
      if (!cancelled) unsubscribeMessage = onMessageListener();
    };

    let cancelled = false;
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(setup, { timeout: 10000 })
      : window.setTimeout(setup, 10000);

    return () => {
      cancelled = true;
      if (typeof unsubscribeMessage === 'function') unsubscribeMessage();
      if (window.cancelIdleCallback && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [isLoggedIn]);

  const ProtectedRoute = ({ children }) => {
    return isLoggedIn ? children : <Navigate to="/" replace />;
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <DesktopShell>
      <OfflineSyncNotice isLoggedIn={isLoggedIn} />
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Routes>
        {['mortality', 'treatments', 'expenses', 'settings'].map((section) => <Route key={section} path={`/${section}`} element={<ProtectedRoute><FarmManagementScreen key={section} section={section} /></ProtectedRoute>} />)}
        <Route
          path="/"
          element={
            isLoggedIn ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginScreen onLogin={() => setIsLoggedIn(true)} />
            )
          }
        />




        <Route
          path="/batch/:batchId/pigs"
          element={
            <ProtectedRoute>
              <BatchPigsScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <PersistentTabs />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
      </DesktopShell>
    </BrowserRouter>
  );
}

export default function App() {
  return <ConfirmationProvider><AppContent /></ConfirmationProvider>;
}
