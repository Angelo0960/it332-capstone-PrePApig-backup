import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen from './pages/LoginPage.jsx';
import DashboardScreen from './pages/DashboardScreen.jsx';
import FeedsInventoryScreen from './pages/FeedsInventoryScreen.jsx';
import AnalyticsReportsScreen from './pages/AnalyticsReportScreen.jsx';
import VaccinationScreen from './pages/VaccinationScreen.jsx';
import BatchPigsScreen from './pages/BatchPigsScreen.jsx'; // ✅ Import the new screen
import { generateToken, onMessageListener } from './services/firebase.js';
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
      const fcmToken = await generateToken();
      if (fcmToken) {
        try {
          await registerFcmToken(fcmToken);
          console.log('✅ Token registered with backend');
        } catch (err) {
          console.error('Failed to register token:', err);
        }
      }
    };
    setup();
    onMessageListener();
  }, []);

  const ProtectedRoute = ({ children }) => {
    return isLoggedIn ? children : <Navigate to="/" replace />;
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}

export default App;