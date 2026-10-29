import { useState, useEffect, useRef } from 'react';

import { useNavigate } from 'react-router-dom';
import {
  Home,
  TrendingUp,
  Tag,
  Syringe,
  Bell,
  X,
  Plus,
  Scale,
  User,
  LogOut,
  Trash2,
  Pencil,
  Users,
  AlertTriangle,
} from 'lucide-react';
import pigImage from '../../src/assets/Gemini_Generated_Image_92oun292oun292ou-removebg-preview (1).webp';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
import { formatCurrency } from '../utils/formatters.js';
import { getUserCacheKey } from '../utils/cache.js';
import { PIG_BREEDS } from '../utils/breeds.js';
// ────────────────────────────────────────────────────────────────

const DEFAULT_ESTIMATED_PRICE_PER_KG = 170;

const FeedSack = ({ className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 4h8" />
    <path d="M9 4.5c.2 1.1.8 1.8 1.8 2.2h2.4c1-.4 1.6-1.1 1.8-2.2" />
    <path d="M7.5 7.2c-.7 1.7-1.2 4.2-1.2 7.2 0 3.1 1.6 5.2 5.7 5.2s5.7-2.1 5.7-5.2c0-3-.5-5.5-1.2-7.2" fill="currentColor" fillOpacity="0.18" />
    <path d="M9 11h6M9.3 14h5.4M9.8 17h4.4" />
  </svg>
);

const FieldError = ({ id, message }) => message ? (
  <p id={id} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700" role="alert">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {message}
  </p>
) : null;

const getCachedDashboardBatches = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(`prepapig:batches:${getUserCacheKey()}`) || 'null');
    return Array.isArray(cached) ? cached : [];
  } catch {
    return [];
  }
};
const getDateAcquiredFromAge = (ageDays) => {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, Number.parseInt(ageDays, 10) || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Calculate profit in pesos
const calculateProfit = (weight, pricePerKg, expenses) => {
  if (expenses === undefined || expenses === null) return null;
  if (!weight || !pricePerKg || weight === 0 || pricePerKg === 0) return 0;
  const revenue = weight * pricePerKg;
  const profit = revenue - expenses;
  return Math.round(profit);
};


// Calculate pig size based on age (day)

// Decode JWT to get user info
const getUserFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name || payload.email,
    };
  } catch {
    return null;
  }
};

export default function DashboardScreen() {
  const navigate = useNavigate();

  const [batches, setBatches] = useState(getCachedDashboardBatches);
  const [loading, setLoading] = useState(() => getCachedDashboardBatches().length === 0);
  const [error, setError] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [showBreedOptions, setShowBreedOptions] = useState(false);
  const [batchFieldErrors, setBatchFieldErrors] = useState({});
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const batchRenderFrame = useRef(null);


  // Edit pig count state
  const [showEditPigModal, setShowEditPigModal] = useState(false);
  const [editBatchId, setEditBatchId] = useState(null);
  const [editPigCount, setEditPigCount] = useState('');

  const [notifications, setNotifications] = useState([]);

  const [newBatch, setNewBatch] = useState({
    pig_count: '',
    breed: '',
    age_on_acquisition: '',
    start_weight: '',
    date_acquired: '',
    status: 'Active',
  });

  const currentBatch = batches[currentBatchIndex];

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartX.current === null || touchStartY.current === null || batches.length < 2) return;
    const touch = event.changedTouches[0];
    const endX = touch?.clientX;
    const endY = touch?.clientY;
    const deltaX = endX - touchStartX.current;
    const deltaY = endY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || Math.abs(deltaX) < 50 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    setCurrentBatchIndex((previous) =>
      deltaX < 0
        ? (previous + 1) % batches.length
        : (previous - 1 + batches.length) % batches.length
    );
  };

  const handleTouchCancel = () => {
    touchStartX.current = null;
    touchStartY.current = null;
  };
  const user = getUserFromToken();


  // Helper functions for feed scheduling
  const getFeedTypeForAge = (day) => {
    if (day <= 21) return 'starter';
    if (day <= 49) return 'grower';
    return 'finisher';
  };

  const getFeedTypeName = (feedType) => {
    const names = { starter: 'Starter Mash', grower: 'Grower Pellet', finisher: 'Finisher' };
    return names[feedType];
  };

  const getDaysUntilFeedChange = (day) => {
    if (day <= 21) return 22 - day;
    if (day <= 49) return 50 - day;
    return null;
  };

  // Vaccination scheduling
  const vaccinationSchedule = [
    { vaccine: 'Swine Fever', minDay: 7, maxDay: 10 },
    { vaccine: 'E. Coli', minDay: 14, maxDay: 21 },
    { vaccine: 'PRRS', minDay: 28, maxDay: 35 },
    { vaccine: 'Porcine Circovirus', minDay: 42, maxDay: 49 },
  ];

  const getNextVaccination = (day) => {
    for (const vax of vaccinationSchedule) {
      if (day < vax.maxDay) return vax;
    }
    return null;
  };

  const isVaccinationDue = (day, vaccine) => {
    return day >= vaccine.minDay && day <= vaccine.maxDay;
  };

  const isVaccinationOverdue = (day, vaccine) => {
    return day > vaccine.maxDay;
  };

  // ---------- Generate unique batch code ----------
  const generateBatchCode = () => {
    const codes = batches.map((b) => b.batch_code).filter(Boolean);
    if (codes.length === 0) return 'BATCH-001';
    let maxNum = 0;
    codes.forEach((code) => {
      const parts = code.split('-');
      if (parts.length === 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `BATCH-${String(nextNum).padStart(3, '0')}`;
  };

  // ---------- Fetch notifications ----------
  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/all?limit=20`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    }
  };

  // ---------- Mark all as read ----------
  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    try {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });
      await fetchNotifications();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // ---------- Fetch batches ----------
  const fetchBatches = async () => {
    if (batches.length === 0) setLoading(true);
    setError(null);
    const cacheKey = `prepapig:batches:${user?.id || 'current'}`;
    let renderedCache = false;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (Array.isArray(cached) && cached.length > 0) {
        const savedPrice = Number(localStorage.getItem(`prepapig:${getUserCacheKey()}:selected-price-per-kg`));
        const cachedWithEstimate = cached.map((batch) => ({
          ...batch,
          pricePerKg: Number(batch.pricePerKg) > 0
            ? batch.pricePerKg
            : savedPrice > 0
              ? savedPrice
              : DEFAULT_ESTIMATED_PRICE_PER_KG,
          expenses: batch.expenses ?? null,
        }));
        setCurrentBatchIndex(0);
        setBatches(cachedWithEstimate);
        setLoading(false);
        renderedCache = true;
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }
    try {
      // Render the core batch data as soon as it arrives. Financial details are
      // supplementary and must not block the dashboard shell.
      const res = await fetch(`${API_BASE}/pigs/all?limit=20`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch batches');
      const json = await res.json();
      if (json.success) {
        const mapBatches = (financialByBatch = new Map()) => json.data.map((batch) => {
          const acquired = new Date(batch.date_acquired);
          const now = new Date();
          const ageAtAcquisition = Number(batch.age_on_acquisition) || 0;
          const day = ageAtAcquisition + Math.max(0, Math.floor((now - acquired) / (1000 * 60 * 60 * 24)));
          const name = batch.batch_code || `Batch ${batch.id}`;
          const growth = Math.min(100, Math.floor(day / 0.5));
          const vaccination = Math.min(100, Math.floor((day / 50) * 100));
          const health = 80;
          const feed = Math.max(0, 100 - Math.floor(day / 1.2));
          const savedPrice = Number(localStorage.getItem(`prepapig:${getUserCacheKey()}:selected-price-per-kg`));
          const recordedPrice = Number(batch.sale_price_per_kg);
          const financial = financialByBatch.get(batch.id);
          const estimatedPrice = recordedPrice > 0
            ? recordedPrice
            : savedPrice > 0
              ? savedPrice
              : DEFAULT_ESTIMATED_PRICE_PER_KG;
          return {
            id: batch.id,
            name,
            batch_code: batch.batch_code,
            pigCount: batch.pig_count || 0,
            ageOnAcquisition: ageAtAcquisition,
            day,
            growth,
            vaccination,
            health,
            feed,
            weight: batch.current_weight || batch.start_weight || 0,
            recordedPricePerKg: recordedPrice > 0 ? recordedPrice : null,
            pricePerKg: estimatedPrice,
            expenses: financial?.total_expenses ?? null,
          };
        });

        const mapped = mapBatches();
        if (batchRenderFrame.current) cancelAnimationFrame(batchRenderFrame.current);
        setCurrentBatchIndex(0);
        setBatches(mapped.slice(0, 1));
        setLoading(false);
        renderedCache = true;
        localStorage.setItem(cacheKey, JSON.stringify(mapped));
        let nextBatchIndex = 1;
        const renderNextBatch = () => {
          if (nextBatchIndex >= mapped.length) return;
          const nextBatch = mapped[nextBatchIndex];
          nextBatchIndex += 1;
          setBatches((current) => [...current, nextBatch]);
          batchRenderFrame.current = requestAnimationFrame(renderNextBatch);
        };
        batchRenderFrame.current = requestAnimationFrame(renderNextBatch);

        // Load financial summaries after the dashboard is already usable.
        fetch(`${API_BASE}/pigs/financial-summary`, { headers: getAuthHeaders() })
          .then((financialRes) => (financialRes.ok ? financialRes.json() : { data: [] }))
          .then((financialJson) => {
            const financialByBatch = new Map((financialJson.data || []).map((item) => [item.batch_id, item]));
            const enriched = mapBatches(financialByBatch);
            localStorage.setItem(cacheKey, JSON.stringify(enriched));
            setBatches(enriched);
          })
          .catch(() => {
            // Financial details are optional; keep the already-rendered batches.
          });
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError(err.message);
      if (!renderedCache) setBatches([]);
    } finally {
      if (!renderedCache) setLoading(false);
    }
  };

  // ---------- Delete batch ----------
  const handleDeleteBatch = async (batchId, batchName) => {
    if (!window.confirm(`Are you sure you want to delete "${batchName}"? This will also delete all its pigs.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/${batchId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete batch');
      const json = await res.json();
      if (json.success) {
        await fetchBatches();
        if (currentBatchIndex >= batches.length - 1 && currentBatchIndex > 0) {
          setCurrentBatchIndex(currentBatchIndex - 1);
        } else if (batches.length === 1) {
          setCurrentBatchIndex(0);
        }
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error deleting batch: ' + err.message);
    }
  };

  // ---------- Open edit pig modal ----------
  const handleOpenEditPig = (batchId, currentCount) => {
    setEditBatchId(batchId);
    setEditPigCount(String(currentCount));
    setShowEditPigModal(true);
  };

  // ---------- Update pig count ----------
  const handleUpdatePigCount = async () => {
    const newCount = parseInt(editPigCount);
    if (isNaN(newCount) || newCount < 0) {
      alert('Please enter a valid number');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/${editBatchId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ pig_count: newCount }),
      });
      if (!res.ok) throw new Error('Failed to update pig count');
      const json = await res.json();
      if (json.success) {
        await fetchBatches();
        setShowEditPigModal(false);
        setEditBatchId(null);
        setEditPigCount('');
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error updating pig count: ' + err.message);
    }
  };

  // ---------- Load data ----------
  useEffect(() => {
    fetchBatches();
    return () => {
      if (batchRenderFrame.current) cancelAnimationFrame(batchRenderFrame.current);
    };
  }, []);

  useEffect(() => {
    const refreshFinancials = () => fetchBatches();
    window.addEventListener('prepapig:financial-data-changed', refreshFinancials);
    return () => window.removeEventListener('prepapig:financial-data-changed', refreshFinancials);
  }, []);

  useEffect(() => {
    const applySelectedPrice = (event) => {
      const selectedPrice = Number(event.detail?.pricePerKg);
      if (!Number.isFinite(selectedPrice) || selectedPrice <= 0) return;
      setBatches((current) => current.map((batch) => ({
        ...batch,
        pricePerKg: Number(batch.recordedPricePerKg) > 0
          ? batch.recordedPricePerKg
          : selectedPrice,
      })));
    };

    window.addEventListener('prepapig:price-selection-changed', applySelectedPrice);
    return () => window.removeEventListener('prepapig:price-selection-changed', applySelectedPrice);
  }, []);

  // ---------- Logout ----------
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  // ---------- Render "no batches" state ----------
  if (!loading && batches.length === 0) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
        <div className="absolute inset-0">
          <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="bg-white/30 backdrop-blur-lg p-8 rounded-2xl shadow-lg text-center">
            <p className="text-gray-700">No batches available</p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button onClick={fetchBatches} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-xl shadow-lg">
              Retry
            </button>
            <button
              onClick={() => setShowAddBatch(true)}
              className="mt-2 ml-2 px-4 py-2 bg-blue-500 text-white rounded-xl shadow-lg"
            >
              Add Batch
            </button>
          </div>
        </div>
        <BottomNav active="Home" />
      </div>
    );
  }

  // ---------- Handle adding a batch ----------
  const validateBatchFields = () => {
    const errors = {};
    if (!String(newBatch.pig_count).trim()) errors.pig_count = 'Number of pigs is required';
    if (!String(newBatch.breed).trim()) errors.breed = 'Breed is required';
    if (newBatch.age_on_acquisition === '') errors.age_on_acquisition = 'Pig age is required';
    if (!String(newBatch.start_weight).trim()) errors.start_weight = 'Start weight is required';
    setBatchFieldErrors(errors);
    return errors;
  };

  const handleAddBatch = async () => {
    if (Object.keys(validateBatchFields()).length > 0) return;

    const dateAcquired = newBatch.date_acquired || getDateAcquiredFromAge(newBatch.age_on_acquisition);

    const batchCode = generateBatchCode();

    setIsAddingBatch(true);
    try {
      const res = await fetch(`${API_BASE}/pigs/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          batch_code: batchCode,
          pig_count: parseInt(newBatch.pig_count),
          breed: newBatch.breed || 'Unknown',
          start_weight: parseFloat(newBatch.start_weight),
          current_weight: parseFloat(newBatch.start_weight),
          age_on_acquisition: parseInt(newBatch.age_on_acquisition, 10) || 0,
          date_acquired: dateAcquired,
          status: 'Active',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || json.details || `Failed to create batch (${res.status})`);
      }
      if (json.success) {
        setShowAddBatch(false);
        setShowBreedOptions(false);
        setBatchFieldErrors({});
        setNewBatch({ pig_count: '', breed: '', age_on_acquisition: '', start_weight: '', date_acquired: '', status: 'Active' });
        void fetchBatches();
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error adding batch: ' + err.message);
    } finally {
      setIsAddingBatch(false);
    }
  };


  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="dashboard-screen mobile-screen-shell w-full relative overflow-hidden flex flex-col">
        <div className="absolute inset-0">
          <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
        </div>
        <div className="dashboard-background-overlay absolute inset-0" />

        <div className="mobile-screen-layer relative z-10 flex flex-col flex-1 min-h-0">
          <div className="dashboard-header px-4 md:px-8 lg:px-12 pt-3 pb-3">
            <div className="flex items-center justify-between animate-pulse">
              <div className="h-7 w-32 rounded-lg bg-white/65" />
              <div className="flex gap-2">
                <div className="h-8 w-8 rounded-full bg-white/65" />
                <div className="h-8 w-8 rounded-full bg-white/65" />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24">
            <div className="dashboard-summary-grid grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 animate-pulse">
              <div className="h-24 sm:col-span-2 rounded-2xl bg-white/65 border border-white/60" />
              <div className="h-20 rounded-2xl bg-white/65 border border-white/60" />
              <div className="h-20 rounded-2xl bg-white/65 border border-white/60" />
            </div>

            <div className="dashboard-progress-stack space-y-2 mb-4 animate-pulse">
              <div className="h-20 rounded-xl bg-white/65 border border-white/60" />
              <div className="h-20 rounded-xl bg-white/65 border border-white/60" />
              <div className="h-20 rounded-xl bg-white/65 border border-white/60" />
            </div>

            <div className="dashboard-pig-hero flex items-center justify-center min-h-[8rem] mb-4 animate-pulse">
              <div className="w-44 h-32 rounded-[40%] bg-white/55 border border-white/60" />
            </div>
          </div>
        </div>
        <BottomNav active="Home" />
      </div>
    );
  }

  // ---------- Notification style helper ----------
  const getNotificationStyle = (type) => {
    switch (type) {
      case 'vaccination':
        return { icon: '💉', bg: 'bg-blue-100/80' };
      case 'vaccination_reminder':
        return { icon: '💉', bg: 'bg-yellow-100/80' };
      case 'vaccination_overdue':
        return { icon: '⚠️', bg: 'bg-red-100/80' };
      case 'feed_reminder':
        return { icon: '🐖', bg: 'bg-green-100/80' };
      case 'feed':
        return { icon: '🐖', bg: 'bg-green-100/80' };
      default:
        return { icon: '📢', bg: 'bg-gray-100/80' };
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="dashboard-screen mobile-screen-shell w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="mobile-screen-layer relative z-10 flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="dashboard-header px-4 md:px-8 lg:px-12 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Prep<span className="text-pink-500">A</span>Pig
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const opening = !showNotifications;
                  setShowNotifications(opening);
                  if (opening) void fetchNotifications();
                }}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all relative"
              >
                <Bell className="w-4 h-4 text-gray-700" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <span className="text-pink-500 text-sm">👤</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
        >
          {batches.length > 0 && currentBatch && (
            <>
              <>
                <div
                  key={currentBatch.id}




                  className="dashboard-summary-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4"
                >
                  <div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg border border-white/30 p-3 relative">
                    <div className="text-xs text-gray-700 mb-1 font-medium">
                      {currentBatch.name}: {currentBatch.pigCount} Pigs
                      <button
                        onClick={() => handleOpenEditPig(currentBatch.id, currentBatch.pigCount)}
                        className="ml-1 inline-flex items-center text-blue-500 hover:text-blue-700 transition-colors"
                        title="Edit pig count"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-sm font-bold text-gray-900">Day {currentBatch.day}</div>
                    <button
                      onClick={() => navigate(`/batch/${currentBatch.id}/pigs`)}
                      className="absolute bottom-2 left-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-lg shadow-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      <Users className="w-3 h-3" />
                      View Pigs
                    </button>
                    <button
                      onClick={() => handleDeleteBatch(currentBatch.id, currentBatch.name)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100/80 flex items-center justify-center hover:bg-red-200 transition-all"
                      title="Delete batch"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </button>
                  </div>
                  <div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg border border-white/30 p-3">
                    <div className="text-xs text-gray-700 mb-1 font-medium">Pig Age</div>
                    <div className="text-sm font-bold text-gray-900">{currentBatch.ageOnAcquisition ?? 0} days at acquisition</div>
                    <div className="text-xs text-gray-600 mt-1">Current: Day {currentBatch.day}</div>
                  </div>
                  <div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg border border-white/30 p-3">
                    <div className="text-xs text-gray-700 mb-1 font-medium">Estimated Profit</div>
                    <div className="text-sm font-bold text-green-600">
                      {currentBatch?.pricePerKg > 0
                        ? formatCurrency(
                            calculateProfit(
                              currentBatch.weight,
                              currentBatch.pricePerKg,
                              currentBatch.expenses
                            )
                          )
                        : 'Unavailable'}
                    </div>
                  </div>
                </div>
              </>

              <>
                <div
                  key={`progress-${currentBatch.id}`}




                  className="dashboard-progress-stack space-y-2 mb-4"
                >
                  {/* Vaccination */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">Vaccination</span>
                      <span className="text-xs font-bold text-blue-600">
                        {Math.round(currentBatch.vaccination / 25)}/4 shots
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((shot) => (
                        <div
                          key={`vac-${shot}`}



                        >
                          <Syringe
                            className={`w-5 h-5 ${
                              currentBatch.vaccination >= shot * 25
                                ? 'text-blue-500 fill-blue-500'
                                : 'text-gray-800/30'
                            } transition-colors duration-300`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Avg Weight */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">Avg Weight</span>
                      <span className="text-xs font-bold text-purple-600">
                        {Math.round(currentBatch.weight / currentBatch.pigCount)} kg/pig
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((level) => {
                        const avgWeight = currentBatch.weight / currentBatch.pigCount;
                        const targetWeight =
                          currentBatch.day <= 21 ? 30 : currentBatch.day <= 49 ? 60 : 90;
                        const weightProgress = Math.min(100, (avgWeight / targetWeight) * 100);
                        return (
                          <div
                            key={`weight-${level}`}



                          >
                            <Scale
                              className={`w-5 h-5 ${
                                weightProgress >= level * 25
                                  ? 'text-purple-500 fill-purple-500'
                                  : 'text-gray-800/30'
                              } transition-colors duration-300`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feed Level */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">
                        Feed: {getFeedTypeName(getFeedTypeForAge(currentBatch.day))}
                      </span>
                      <span className="text-xs font-bold text-orange-600">{currentBatch.feed}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((bag) => (
                        <div
                          key={`feed-${bag}`}



                        >
                          <FeedSack
                            className={`w-5 h-5 ${
                              currentBatch.feed >= bag * 25
                                ? 'text-orange-500 fill-orange-500'
                                : 'text-gray-800/30'
                            } transition-colors duration-300`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>

              {/* Pig Character */}
              <div className="dashboard-pig-hero flex items-center justify-center py-8 mb-4 relative min-h-[200px] md:min-h-[240px] lg:min-h-[288px]">
                <>
                  <div
                    key={currentBatch.id}









                    className="relative w-64 h-48 md:w-80 md:h-60 lg:w-96 lg:h-72 cursor-grab active:cursor-grabbing"
                  >
                    <img
                      src={pigImage}
                      alt="Pig Character"
                      className="w-full h-full object-cover pointer-events-none pig-head-tilt"


                    />
                  </div>
                </>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2">
                  {batches.map((batch, index) => (
                    <button
                      key={batch.id}
                      onClick={() => {
                        setCurrentBatchIndex(index);
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentBatchIndex ? 'bg-white w-6 shadow-lg' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Floating Add Button */}
        <button
          onClick={() => setShowAddBatch(true)}
          className="floating-action-button w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-[8px_8px_16px_rgba(0,0,0,0.3),-8px_-8px_16px_rgba(255,255,255,0.1)] active:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.3),inset_-4px_-4px_8px_rgba(255,255,255,0.1)] transition-all z-40"
        >
          <Plus className="w-7 h-7 text-white" />
        </button>

        {/* Add Batch Modal */}
        {showAddBatch && (
          <div className="add-batch-modal-overlay fixed inset-0 z-[60] flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="add-batch-modal responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="add-batch-modal-header flex items-center justify-between p-5 border-b border-white/30">
                <div>
                  <h2 className="add-batch-modal-title text-xl font-bold text-gray-950">Add New Batch</h2>
                  <p className="text-sm text-gray-700 mt-1">Enter the starting details for your pigs.</p>
                </div>
                <button
                  onClick={() => {
                    setShowAddBatch(false);
                    setShowBreedOptions(false);
                    setBatchFieldErrors({});
                    setNewBatch({
                      pig_count: '',
                      breed: '',
                      age_on_acquisition: '',
                      start_weight: '',
                      date_acquired: '',
                      status: 'Active',
                    });
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="add-batch-modal-content p-5 space-y-4">
                <div className="text-xs text-gray-700 mb-2">
                  Batch code will be auto-generated:{' '}
                  <span className="font-mono font-semibold text-gray-800">
                    {generateBatchCode()}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Number of Pigs <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newBatch.pig_count}
                      onChange={(e) => {
                        setNewBatch({ ...newBatch, pig_count: e.target.value });
                        setBatchFieldErrors((current) => ({ ...current, pig_count: '' }));
                      }}
                      placeholder="12"
                      aria-required="true"
                      aria-invalid={Boolean(batchFieldErrors.pig_count)}
                      aria-describedby={batchFieldErrors.pig_count ? 'pig-count-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${batchFieldErrors.pig_count ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {batchFieldErrors.pig_count && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <FieldError id="pig-count-error" message={batchFieldErrors.pig_count} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Breed <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={showBreedOptions}
                      aria-required="true"
                      aria-invalid={Boolean(batchFieldErrors.breed)}
                      aria-describedby={batchFieldErrors.breed ? 'breed-error' : undefined}
                      onClick={() => setShowBreedOptions((open) => !open)}
                      className={`add-batch-breed-select w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 text-left focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${batchFieldErrors.breed ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    >
                      {newBatch.breed || 'Select breed...'}
                    </button>
                    {batchFieldErrors.breed && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                    {showBreedOptions && (
                      <div className="add-batch-breed-options absolute left-0 right-0 top-full mt-2 z-30 rounded-xl p-1">
                        <button
                          type="button"
                          role="option"
                          aria-selected={!newBatch.breed}
                          onClick={() => {
                            setNewBatch((current) => ({ ...current, breed: '' }));
                            setBatchFieldErrors((current) => ({ ...current, breed: '' }));
                            setShowBreedOptions(false);
                          }}
                          className="add-batch-breed-option w-full text-left px-3 py-2 rounded-lg text-sm"
                        >
                          Select breed...
                        </button>
                        {PIG_BREEDS.map((breed) => (
                          <button
                            type="button"
                            role="option"
                            aria-selected={newBatch.breed === breed}
                            key={breed}
                            onClick={() => {
                              setNewBatch((current) => ({ ...current, breed }));
                              setBatchFieldErrors((current) => ({ ...current, breed: '' }));
                              setShowBreedOptions(false);
                            }}
                            className="add-batch-breed-option w-full text-left px-3 py-2 rounded-lg text-sm"
                          >
                            {breed}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <FieldError id="breed-error" message={batchFieldErrors.breed} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Pig Age (days) <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={newBatch.age_on_acquisition}
                      onChange={(e) => {
                        const age = e.target.value;
                        setNewBatch((current) => ({
                          ...current,
                          age_on_acquisition: age,
                          date_acquired: age === '' ? '' : getDateAcquiredFromAge(age),
                        }));
                        setBatchFieldErrors((current) => ({ ...current, age_on_acquisition: '' }));
                      }}
                      placeholder="e.g. 30"
                      aria-required="true"
                      aria-invalid={Boolean(batchFieldErrors.age_on_acquisition)}
                      aria-describedby={batchFieldErrors.age_on_acquisition ? 'age-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${batchFieldErrors.age_on_acquisition ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {batchFieldErrors.age_on_acquisition && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <FieldError id="age-error" message={batchFieldErrors.age_on_acquisition} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Start Weight (kg) <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newBatch.start_weight}
                      onChange={(e) => {
                        setNewBatch({ ...newBatch, start_weight: e.target.value });
                        setBatchFieldErrors((current) => ({ ...current, start_weight: '' }));
                      }}
                      placeholder="15"
                      step="0.1"
                      aria-required="true"
                      aria-invalid={Boolean(batchFieldErrors.start_weight)}
                      aria-describedby={batchFieldErrors.start_weight ? 'start-weight-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${batchFieldErrors.start_weight ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {batchFieldErrors.start_weight && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <FieldError id="start-weight-error" message={batchFieldErrors.start_weight} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Date Acquired
                  </label>
                  <input
                    type="date"
                    value={newBatch.date_acquired}
                    readOnly
                    aria-describedby="date-acquired-help"
                    className="w-full px-4 py-3 rounded-xl bg-white/55 backdrop-blur-lg border border-white/70 text-gray-950 font-semibold focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                  <p id="date-acquired-help" className="text-xs text-gray-700 mt-2">
                    Automatically calculated from pig age.
                  </p>
                </div>

                <button
                  onClick={handleAddBatch}
                  disabled={isAddingBatch}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform disabled:cursor-wait disabled:opacity-70"
                >
                  {isAddingBatch ? 'Saving batch…' : 'Add Batch'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Pig Count Modal */}
        {showEditPigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Edit Pig Count</h2>
                <button
                  onClick={() => {
                    setShowEditPigModal(false);
                    setEditBatchId(null);
                    setEditPigCount('');
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Number of Pigs
                  </label>
                  <input
                    type="number"
                    value={editPigCount}
                    onChange={(e) => setEditPigCount(e.target.value)}
                    placeholder="12"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={handleUpdatePigCount}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Profile</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-pink-100/80 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-pink-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{user?.name || 'User'}</div>
                    <div className="text-sm text-gray-600">{user?.email || 'No email'}</div>
                  </div>
                </div>

                <div className="border-t border-white/30 pt-4">
                  <button onClick={() => navigate('/settings')} className="w-full bg-white/40 rounded-xl py-3 mb-3 font-semibold text-purple-700">Profile, farm settings & backup</button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-transform"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Panel */}
        {showNotifications && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-[90%] md:w-[70%] lg:w-[50%] max-h-[70%] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No notifications</p>
                ) : (
                  notifications.map((notif) => {
                    const style = getNotificationStyle(notif.type);
                    return (
                      <div
                        key={notif.id}
                        className={`bg-white/20 backdrop-blur-lg rounded-2xl p-4 shadow-lg border border-white/30 ${
                          !notif.is_read ? 'border-l-4 border-l-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 ${style.bg} rounded-full flex items-center justify-center flex-shrink-0`}
                          >
                            <span className="text-xl">{style.icon}</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-sm text-gray-900">{notif.title}</h3>
                            <p className="text-xs text-gray-700">{notif.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(notif.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <BottomNav active="Home" />
      </div>
    </div>
  );
}
