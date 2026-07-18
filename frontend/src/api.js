// src/api.js

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

// Helper to get the auth token from localStorage
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');

  return token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    : {
        'Content-Type': 'application/json',
      };
};

export const api = {
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) throw new Error('Login failed');

    return res.json();
  },
};

// FCM token registration
export const registerFcmToken = async (token) => {
  const res = await fetch(`${API_BASE}/notifications/register-token`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || 'Failed to register token');
  }

  return res.json();
};