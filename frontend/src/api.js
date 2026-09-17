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

// Feed Program API
export const feedProgramApi = {
  // Get full 26-week feed program
  async getFullProgram() {
    const res = await fetch(`${API_BASE}/feed-program/full`);
    if (!res.ok) throw new Error('Failed to fetch feed program');
    return res.json();
  },

  // Get feed program for a specific week
  async getWeekProgram(week) {
    const res = await fetch(`${API_BASE}/feed-program/week/${week}`);
    if (!res.ok) throw new Error('Failed to fetch week program');
    return res.json();
  },

  // Get feed target for a batch based on its age
  async getBatchFeedTarget(batchId) {
    const res = await fetch(`${API_BASE}/feed-program/batch/${batchId}/target`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch batch feed target');
    return res.json();
  },

  // Get feed cost forecast for a batch
  async getBatchFeedCostForecast(batchId, weeks = 4) {
    const res = await fetch(`${API_BASE}/feed-program/batch/${batchId}/cost-forecast?weeks=${weeks}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch feed cost forecast');
    return res.json();
  },

  // Get actual vs planned feed comparison for a batch
  async getBatchActualVsPlanned(batchId, weeks = 4) {
    const res = await fetch(`${API_BASE}/feed-program/batch/${batchId}/actual-vs-planned?weeks=${weeks}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch actual vs planned');
    return res.json();
  },

  // Get ration to feed type mapping
  async getRationMap() {
    const res = await fetch(`${API_BASE}/feed-program/ration-map`);
    if (!res.ok) throw new Error('Failed to fetch ration map');
    return res.json();
  }
};

// Feed Schedule API
export const feedScheduleApi = {
  // Get complete feed schedule for a batch
  async getBatchFeedSchedule(batchId) {
    const res = await fetch(`${API_BASE}/pigs/${batchId}/feed-schedule`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch feed schedule');
    return res.json();
  },

  // Validate feed ration for a batch
  async validateBatchFeedRation(batchId, feedType, override = false) {
    const res = await fetch(`${API_BASE}/pigs/${batchId}/validate-ration`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ feed_type: feedType, override }),
    });
    if (!res.ok) throw new Error('Failed to validate feed ration');
    return res.json();
  }
};