import { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './pages/LoginPage.jsx';
const DashboardScreen = lazy(() => import('./pages/DashboardScreen.jsx'));
const FeedsInventoryScreen = lazy(() => import('./pages/FeedsInventoryScreen.jsx'));
const AnalyticsReportsScreen = lazy(() => import('./pages/AnalyticsReportScreen.jsx'));
const VaccinationScreen = lazy(() => import('./pages/VaccinationScreen.jsx'));
const BatchPigsScreen = lazy(() => import('./pages/BatchPigsScreen.jsx'));
import { registerFcmToken } from './api.js';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token && token !== 'null' && token !== 'undefined') {
        setIsLoggedIn(true);
      } else {
        localStorage.removeItem('token');
        setIsLoggedIn(false);
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    const setup = async () => {
      const token = localStorage.getItem('token');
      if (!token || token === 'null' || token === 'undefined') return;

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
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/feeds"
          element={
            <ProtectedRoute>
              <FeedsInventoryScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AnalyticsReportsScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vaccination"
          element={
            <ProtectedRoute>
              <VaccinationScreen />
            </ProtectedRoute>
          }
        />
        {/* ✅ New route – make sure it's INSIDE <Routes> */}
        <Route
          path="/batch/:batchId/pigs"
          element={
            <ProtectedRoute>
              <BatchPigsScreen />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;