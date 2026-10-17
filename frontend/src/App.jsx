import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginScreen from './pages/LoginPage.jsx';
const DashboardScreen = lazy(() => import('./pages/DashboardScreen.jsx'));
const FeedsInventoryScreen = lazy(() => import('./pages/FeedsInventoryScreen.jsx'));
const AnalyticsReportsScreen = lazy(() => import('./pages/AnalyticsReportScreen.jsx'));
const VaccinationScreen = lazy(() => import('./pages/VaccinationScreen.jsx'));
const BatchPigsScreen = lazy(() => import('./pages/BatchPigsScreen.jsx'));
const FarmManagementScreen = lazy(() => import('./pages/FarmManagementScreen.jsx'));
import { registerFcmToken, API_BASE, getAuthHeaders } from './api.js';
import './App.css';

const tabKeys = ['/dashboard', '/feeds', '/reports', '/vaccination'];

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

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/management/settings`, {
          headers: getAuthHeaders(),
        });

        if (response.status === 401) {
          localStorage.removeItem('token');
          setIsLoggedIn(false);
          return;
        }

        // Keep the existing session for temporary backend errors so the user
        // does not lose the app shell while the API recovers.
        setIsLoggedIn(true);
      } catch {
        // Network failures should not turn a previously authenticated session
        // into a logout; individual screens will show their error state.
        setIsLoggedIn(true);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    const setup = async () => {
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') return;

      try {
        const response = await fetch(`${API_BASE}/management/settings`, { headers: getAuthHeaders() });
        if (!response.ok) return;
        const settings = await response.json();
        if (!settings.preferences.push_enabled) return;
      } catch {
        return;
      }
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
      onMessageListener();
    };

    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(setup, { timeout: 10000 })
      : window.setTimeout(setup, 10000);

    return () => {
      if (window.cancelIdleCallback && typeof idleId === 'number') {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, []);

  const ProtectedRoute = ({ children }) => {
    return isLoggedIn ? children : <Navigate to="/" replace />;
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;
