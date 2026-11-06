import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Check,
  Syringe,
  TrendingUp,
  Plus,
  Home,
  X,
  AlertTriangle,
  Edit,
  Search,
  ChevronDown,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
import { buildFeedDonePayload } from '../utils/markDonePayloads.js';
import { getUserCacheKey, readCache, writeCache } from '../utils/cache.js';
import { formatLocalDate, formatLocalTime } from '../utils/dates.js';
import { buildBatchDisplayNames } from '../utils/batchNames.js';
import useOfflineStatus from '../hooks/useOfflineStatus.js';
// ────────────────────────────────────────────────────────────────

// Helpers
const getFeedTypeForAge = (day) => {
  if (day <= 70) return 'starter';
  if (day <= 105) return 'grower';
  return 'finisher';
};

const getFeedTypeName = (feedType) => {
  const names = {
    starter: 'Starter Mash',
    grower: 'Grower Pellet',
    finisher: 'Finisher',
  };
  return names[String(feedType).toLowerCase()] || String(feedType || 'Unknown Feed')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const kgQuantityFormatter = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 });
const formatKgQuantity = (value) => {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? kgQuantityFormatter.format(quantity) : '0';
};

const getDaysUntilFeedChange = (day) => {
  if (day < 71) return 71 - day;
  if (day < 106) return 106 - day;
  return null;
};

const getDailyFeedForBatch = (day) => {
  if (day <= 7) return 0.3;
  if (day <= 14) return 0.5;
  if (day <= 21) return 0.8;
  if (day <= 35) return 1.5;
  if (day <= 49) return 2.2;
  return 2.8;
};

const DAILY_FEEDING_RECORDS_REQUIRED = 2;
const FEED_REMINDER_TIMES = ['8:00 AM', '5:00 PM'];

const FEED_TYPE_MAP = {
  starter: 'Starter Mash',
  grower: 'Grower Pellet',
  finisher: 'Finisher',
};

const SYNTHETIC_FORECAST_DEMO_NOTE = 'synthetic forecast demo data; sample feed log only; no stock or weight mutation.';
const shouldDisplayFeedNote = (notes) => {
  const normalized = String(notes || '').trim().replace(/^['"]|['"]$/g, '').trim().toLowerCase();
  return Boolean(normalized) && normalized !== SYNTHETIC_FORECAST_DEMO_NOTE;
};

const InlineFieldError = ({ id, message }) => message ? (
  <p id={id} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700" role="alert">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {message}
  </p>
) : null;

export default function FeedsInventoryScreen() {
  const navigate = useNavigate();

  const { isOnline, pendingSync } = useOfflineStatus();
  const [showRecordUsage, setShowRecordUsage] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [editingFeed, setEditingFeed] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [showBatchMenu, setShowBatchMenu] = useState(false);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [debouncedBatchSearchTerm, setDebouncedBatchSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [feedRecords, setFeedRecords] = useState([]);
  const [batches, setBatches] = useState([]);
  const [feedStocks, setFeedStocks] = useState([]);
  const [feedExpenses, setFeedExpenses] = useState([]);
  const [feedForecast, setFeedForecast] = useState(null);
  const [feedForecastError, setFeedForecastError] = useState(null);
  const [pendingDone, setPendingDone] = useState({});
  const [usageErrors, setUsageErrors] = useState({});
  const [purchaseErrors, setPurchaseErrors] = useState({});

  const [usageForm, setUsageForm] = useState({
    batch: '',
    feedType: '',
    amount: '',
    date: formatLocalDate(),
    time: formatLocalTime(),
    notes: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    feedType: '',
    quantity: '',
    unitCost: '',
    date: formatLocalDate(),
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedBatchSearchTerm(batchSearchTerm.trim().toLocaleLowerCase());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [batchSearchTerm]);

  // Fetch functions
  const fetchBatches = async () => {
    const cacheKey = `batches:${getUserCacheKey()}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      setBatches(cached);
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/all?all=true&available=true`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        const displayNames = buildBatchDisplayNames(json.data);
        const mapped = json.data.filter((batch) => !batch.status || String(batch.status).toLowerCase() === 'active').map((batch) => {
          let day = 0;
          if (batch.date_acquired) {
            const acquired = new Date(batch.date_acquired);
            const now = new Date();
            day = (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((now - acquired) / (1000 * 60 * 60 * 24)));
          } else if (batch.created_at) {
            const created = new Date(batch.created_at);
            const now = new Date();
            day = (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
          }
          return {
            id: batch.id,
            batch_code: batch.batch_code,
            name: displayNames.get(String(batch.id)) || 'Batch',
            day: day,
            pigCount: batch.pig_count || 0,
            dateAcquired: batch.date_acquired || '',
          };
        });
        setBatches(mapped);
        writeCache(cacheKey, mapped);

      } else {
        throw new Error('No batches found');
      }
    } catch (err) {
      console.warn('Could not fetch batches:', err.message);

      setBatches([]);
    }
  };

  const fetchFeedRecords = async () => {
    setLoading(true);
    setError(null);
    const cacheKey = `feed-records:${getUserCacheKey()}:${selectedBatch}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached)) {
      setFeedRecords(cached);
      setLoading(false);
    }
    try {
      let url = `${API_BASE}/feeds/all?all=true`;
      if (selectedBatch !== 'all') {
        url = `${API_BASE}/feeds/batch/${selectedBatch}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const records = json.data || [];
        setFeedRecords(records);
        writeCache(cacheKey, records);

      } else {
        throw new Error(json.message || 'No records');
      }
    } catch (err) {
      console.warn('Could not fetch feed records:', err.message);

      setFeedRecords([]);
      setError('Unable to load feed records. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedForecast = async () => {
    try {
      const query = new URLSearchParams({ batch_id: selectedBatch, horizon_days: '7', window_days: '28' });
      const res = await fetch(`${API_BASE}/feeds/forecast?${query}`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Feed forecast unavailable');
      setFeedForecast(json);
      setFeedForecastError(null);
    } catch (err) {
      console.warn('Could not fetch feed forecast:', err.message);
      setFeedForecast(null);
      setFeedForecastError(err.message || 'Feed forecast unavailable');
    }
  };

  const fetchFeedStock = async () => {
    const cacheKey = `feed-stock:${getUserCacheKey()}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached)) setFeedStocks(cached);
    try {
      const res = await fetch(`${API_BASE}/feeds/stock`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stock');
      const json = await res.json();
      if (json.success) {
        const stocks = json.data || [];
        setFeedStocks(stocks);
        writeCache(cacheKey, stocks);

      }
    } catch (err) {
      console.warn('Could not fetch feed stock:', err.message);
      setFeedStocks([]);

    }
  };

  const fetchFeedOverview = async () => {
    const userKey = getUserCacheKey();
    const cachedBatches = readCache(`batches:${userKey}`);
    const cachedRecords = readCache(`feed-records:${userKey}:all`);
    const cachedStock = readCache(`feed-stock:${userKey}`);
    const cachedExpenses = readCache(`feed-expenses:${userKey}`);
    const hasCachedOverview = Array.isArray(cachedBatches) || Array.isArray(cachedRecords) || Array.isArray(cachedStock) || Array.isArray(cachedExpenses);

    if (Array.isArray(cachedBatches)) setBatches(cachedBatches);
    if (Array.isArray(cachedRecords)) setFeedRecords(cachedRecords);
    if (Array.isArray(cachedStock)) setFeedStocks(cachedStock);
    if (Array.isArray(cachedExpenses)) setFeedExpenses(cachedExpenses);
    if (hasCachedOverview) setLoading(false);

    try {
      const res = await fetch(`${API_BASE}/feeds/overview`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load feed overview');
      const overview = json.data || {};
      const displayNames = buildBatchDisplayNames(overview.batches || []);
      const mappedBatches = (overview.batches || []).filter((batch) => !batch.status || String(batch.status).toLowerCase() === 'active').map((batch) => {
        const sourceDate = batch.date_acquired || batch.created_at;
        const day = sourceDate
          ? (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((new Date() - new Date(sourceDate)) / (1000 * 60 * 60 * 24)))
          : 0;
        return { id: batch.id, batch_code: batch.batch_code, name: displayNames.get(String(batch.id)) || 'Batch', day, pigCount: batch.pig_count || 0, breed: batch.breed || 'Unknown', age_on_acquisition: batch.age_on_acquisition || 0 };
      });
      setBatches(mappedBatches);
      setFeedRecords(overview.records || []);
      setFeedStocks(overview.stock || []);
      setFeedExpenses(overview.expenses || []);
      writeCache(`batches:${userKey}`, mappedBatches);
      writeCache(`feed-records:${userKey}:all`, overview.records || []);
      writeCache(`feed-stock:${userKey}`, overview.stock || []);
      writeCache(`feed-expenses:${userKey}`, overview.expenses || []);
      setLoading(false);
    } catch (err) {
      console.warn('Could not fetch feed overview:', err.message);
      void Promise.all([fetchBatches(), fetchFeedStock(), fetchFeedRecords()]);
    }
  };

  useEffect(() => {
    fetchFeedOverview();
  }, []);

  useEffect(() => {
    const refreshAfterSync = () => { void fetchFeedOverview(); };
    window.addEventListener('prepapig:offline-sync-complete', refreshAfterSync);
    return () => window.removeEventListener('prepapig:offline-sync-complete', refreshAfterSync);
  }, []);

  useEffect(() => {
    fetchFeedRecords();
  }, [selectedBatch]);

  useEffect(() => {
    void fetchFeedForecast();
  }, [selectedBatch]);

  // ----- Core: Save feed usage -----
  const handleSaveFeedUsage = async (formData) => {
    try {
      console.log('📤 Saving feed usage:', formData);
      const res = await fetch(`${API_BASE}/feeds/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Server error: ${res.status} - ${errorText}`);
      }

      const json = await res.json();
      if (json.success) {
        const savedRecord = Array.isArray(json.data) ? json.data[0] : json.data;
        if (savedRecord && (selectedBatch === 'all' || String(savedRecord.batch_id) === String(selectedBatch))) {
          setFeedRecords((records) => {
            const updatedRecords = [savedRecord, ...records];
            writeCache(`feed-records:${getUserCacheKey()}:${selectedBatch}`, updatedRecords);
            return updatedRecords;
          });
        }
        setShowRecordUsage(false);
        setUsageErrors({});
        setUsageForm({
          batch: '',
          feedType: '',
          amount: '',
          date: formatLocalDate(),
          time: formatLocalTime(),
          notes: '',
        });
        void fetchFeedStock();
        window.dispatchEvent(new Event('prepapig:financial-data-changed'));
        return true;
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      console.error('❌ Error saving feed usage:', err);
      alert('Error saving feed usage: ' + err.message);
      return false;
    }
  };

  // ----- Direct Mark as Done -----
  const handleDirectMarkAsDone = async (batchId, feedType, amount) => {
    setPendingDone((current) => ({ ...current, [batchId]: true }));
    const payload = buildFeedDonePayload({
      batchId,
      feedType,
      amount,
    });
    const saved = await handleSaveFeedUsage(payload);
    if (!saved) {
      setPendingDone((current) => {
        const next = { ...current };
        delete next[batchId];
        return next;
      });
    } else {
      setPendingDone((current) => {
        const next = { ...current };
        delete next[batchId];
        return next;
      });
    }
  };

  // ----- Modal submit -----
  const handleUsageSubmit = () => {
    const errors = {};
    if (!usageForm.batch) errors.batch = 'Batch is required';
    if (!usageForm.feedType) errors.feedType = 'Feed type is required';
    if (!String(usageForm.amount).trim()) errors.amount = 'Amount is required';
    if (!usageForm.date) errors.date = 'Date is required';
    if (!usageForm.time) errors.time = 'Time is required';
    setUsageErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const feedTypeName = FEED_TYPE_MAP[usageForm.feedType] || usageForm.feedType;
    if (!feedTypeName) {
      setUsageErrors({ feedType: 'Select a valid feed type' });
      return;
    }
    const payload = {
      batch_id: usageForm.batch,
      feed_type: feedTypeName,
      quantity_kg: parseFloat(usageForm.amount) || 0,
      feeding_date: usageForm.date,
      feeding_time: usageForm.time,
      notes: usageForm.notes,
    };
    handleSaveFeedUsage(payload);
  };

  // ----- Restock -----
  const handleAddPurchase = async () => {
    const errors = {};
    const feedType = FEED_TYPE_MAP[purchaseForm.feedType];
    const quantityText = String(purchaseForm.quantity).trim();
    const quantity = quantityText ? Number(purchaseForm.quantity) : null;
    const unitCostText = String(purchaseForm.unitCost).trim();
    const unitCost = unitCostText ? Number(purchaseForm.unitCost) : null;

    if (!feedType) errors.feedType = 'Feed type is required';
    if (!quantityText) errors.quantity = 'Quantity is required';
    else if (!Number.isFinite(quantity) || quantity <= 0) errors.quantity = 'Enter a quantity greater than 0';
    if (!purchaseForm.date) errors.date = 'Date is required';
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) errors.unitCost = 'Enter a valid non-negative cost';
    setPurchaseErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const res = await fetch(`${API_BASE}/feeds/stock/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          feed_type: feedType,
          stock_quantity: quantity,
          ...(unitCost === null ? {} : { unit_price: unitCost }),
          last_updated: purchaseForm.date,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed to update stock (HTTP ${res.status})`);
      }

      setPurchaseErrors({});
      alert(json.needsReview ? 'The save outcome is unclear. Check feed stock on the server before retrying.' : json.queued ? 'Feed purchase saved on this device; waiting to sync.' : 'Stock updated successfully!');
      setShowAddPurchase(false);
      setPurchaseForm({ feedType: '', quantity: '', unitCost: '', date: formatLocalDate() });
      void fetchFeedStock();
      window.dispatchEvent(new Event('prepapig:financial-data-changed'));
    } catch (err) {
      setPurchaseErrors((current) => ({ ...current, form: err.message || 'Unable to save the feed purchase. Please try again.' }));
    }
  };

  // ----- Edit price -----
  const handleEditPrice = (feedType, currentPrice) => {
    setEditingFeed(feedType);
    setNewPrice(currentPrice.toString());
    setShowEditPrice(true);
  };

  const handleSavePrice = async () => {
    if (!editingFeed || !newPrice) return;
    try {
      const res = await fetch(`${API_BASE}/feeds/stock/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          feed_type: editingFeed,
          unit_price: parseFloat(newPrice),
        }),
      });
      if (!res.ok) throw new Error('Failed to update price');
      const json = await res.json();
      if (json.success) {
        alert(json.needsReview ? 'The save outcome is unclear. Check the feed price on the server before retrying.' : json.queued ? 'Feed price saved on this device; waiting to sync.' : 'Price updated successfully!');
        setShowEditPrice(false);
        setEditingFeed(null);
        setNewPrice('');
        fetchFeedStock();
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error updating price: ' + err.message);
    }
  };

  // ----- Computed -----
  const getBatchName = (batchId, fallbackName = '') => {
    const batch = batches.find((b) => String(b.id) === String(batchId));
    const name = String(batch?.name || fallbackName || '').trim();
    return name && name.toLowerCase() !== 'unknown' ? name : '';
  };

  const calculateBatchFeedExpense = (batchId) => {
    const filtered = batchId === 'all'
      ? feedRecords
      : feedRecords.filter((r) => r.batch_id === batchId);
    let total = 0;
    for (const rec of filtered) {
      const priceAtUsage = Number(rec.unit_price_at_usage);
      const quantity = Number(rec.quantity_kg);
      if (!Number.isFinite(priceAtUsage) || priceAtUsage < 0 || !Number.isFinite(quantity) || quantity < 0) return null;
      total += quantity * priceAtUsage;
    }
    return total;
  };

  const selectedBatchData = batches.find((b) => String(b.id) === String(selectedBatch));
  const filteredBatchOptions = useMemo(() => {
    if (!debouncedBatchSearchTerm) return batches;
    return batches.filter((batch) => [batch.name, batch.batch_code, batch.pigCount, batch.dateAcquired]
      .join(' ')
      .toLocaleLowerCase()
      .includes(debouncedBatchSearchTerm));
  }, [batches, debouncedBatchSearchTerm]);
  const showAllBatchesOption = !debouncedBatchSearchTerm || 'all batches'.includes(debouncedBatchSearchTerm);
  const batchSelectorValue = selectedBatch === 'all' ? 'All Batches' : selectedBatchData?.name || 'Select a batch';
  const batchOptionDetails = (batch) => `${batch.pigCount ?? 0} pigs${batch.dateAcquired ? ` · Acquired ${String(batch.dateAcquired).slice(0, 10)}` : ''}`;
  const batchExpense = useMemo(() => calculateBatchFeedExpense(selectedBatch), [selectedBatch, feedRecords, feedStocks]);
  const recordedFeedExpense = useMemo(() => {
    const relevant = feedExpenses.filter((expense) => {
      const type = String(expense.expense_type || '').toLowerCase();
      const matchesFeed = type.includes('feed');
      const matchesBatch = selectedBatch === 'all' || String(expense.batch_id) === String(selectedBatch);
      return matchesFeed && matchesBatch;
    });
    return relevant.length > 0
      ? relevant.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)
      : null;
  }, [feedExpenses, selectedBatch]);
  const displayedFeedExpense = recordedFeedExpense ?? batchExpense;
  const filteredRecords = feedRecords;

  const { totalStock, totalStockValue, selectedBatchFeedRecords, totalFeedConsumed, consumptionByFeedType } = useMemo(() => {
    const selectedRecords = selectedBatch === 'all'
      ? feedRecords
      : feedRecords.filter((r) => String(r.batch_id) === String(selectedBatch));
    const byType = selectedRecords.reduce((acc, r) => {
      const type = r.feed_type;
      acc[type] = (acc[type] || 0) + (Number(r.quantity_kg) || 0);
      return acc;
    }, {});
    return {
      totalStock: feedStocks.reduce((sum, s) => sum + (Number(s.stock_quantity) || 0), 0),
      totalStockValue: feedStocks.some((stock) => stock.unit_price == null) ? null : feedStocks.reduce((sum, s) => sum + ((Number(s.stock_quantity) || 0) * (Number(s.unit_price) || 0)), 0),
      selectedBatchFeedRecords: selectedRecords,
      totalFeedConsumed: selectedRecords.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0),
      consumptionByFeedType: byType,
    };
  }, [feedRecords, feedStocks, selectedBatch]);

  const chartData = useMemo(() => {
    const actualByDate = new Map();
    feedRecords.forEach((record) => {
      const date = String(record.feeding_date || '').slice(0, 10);
      const quantity = Number(record.quantity_kg);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(quantity) || quantity < 0) return;
      actualByDate.set(date, (actualByDate.get(date) || 0) + quantity);
    });
    const actual = [...actualByDate.entries()]
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-30)
      .map(([date, quantity]) => ({ date, actual: Number(quantity.toFixed(3)) }));
    const lastActualDate = actual.at(-1)?.date;
    const forecast = (feedForecast?.forecast || [])
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || '')) && (!lastActualDate || row.date > lastActualDate))
      .map((row) => ({ date: row.date, forecast: row.predictedKg, lower: row.lowerKg, upper: row.upperKg }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return [...actual, ...forecast];
  }, [feedRecords, feedForecast]);

  // ----- Today's date for checking existing feedings -----
  const todayStr = formatLocalDate();

  return (
    <div className="dashboard-theme mobile-screen-shell min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover saturate-[0.65] brightness-[0.9] blur-[2px]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-[#F4F7F5]/80 via-[#EDF3EF]/72 to-[#DCE9E1]/76" />

      <div className="mobile-screen-layer relative z-10 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="md:hidden w-9 h-9 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">Feeds Inventory</h1>
              <p className="hidden text-sm text-gray-600 lg:block">Monitor and manage feed stock across all batches</p>
            </div>
          </div>
          <div className="feeds-header-actions flex items-center gap-2">
            <button onClick={() => setShowRecordUsage(true)} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-[#ff2f72] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#ff2f72]/25">
              <Plus className="w-4 h-4" /> Record Feed Usage
            </button>
            <button onClick={() => { setPurchaseErrors({}); setShowAddPurchase(true); }} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-white/65 px-4 py-2.5 text-xs font-bold text-emerald-700 border border-white/70 shadow-lg">
              <Plus className="w-4 h-4" /> Add Feed Purchase
            </button>
            <button className="relative w-9 h-9 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all">
              {isOnline ? (
                <>
                  <Cloud className="w-5 h-5 text-green-600" />
                  <Check className="w-3 h-3 text-green-600 absolute top-0 right-0" />
                </>
              ) : (
                <CloudOff className="w-5 h-5 text-gray-500" />
              )}
              {pendingSync > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingSync}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Batch Selector */}
        <div className="px-4 md:px-8 lg:px-12 mb-4">
          <div
            className="feeds-batch-selector relative z-50 isolate rounded-2xl border border-white/30 bg-white/20 p-3 shadow-lg backdrop-blur-lg"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setShowBatchMenu(false);
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search"
                role="combobox"
                aria-label="Search or select a batch"
                aria-autocomplete="list"
                aria-expanded={showBatchMenu}
                aria-controls="feeds-batch-options"
                value={showBatchMenu ? batchSearchTerm : batchSelectorValue}
                onFocus={() => {
                  if (!showBatchMenu) setBatchSearchTerm('');
                  setShowBatchMenu(true);
                }}
                onChange={(event) => {
                  setBatchSearchTerm(event.target.value);
                  setShowBatchMenu(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowBatchMenu(false);
                  if (event.key === 'ArrowDown') setShowBatchMenu(true);
                }}
                placeholder="Search batches..."
                className="min-h-11 w-full rounded-xl border border-white/60 bg-white/55 py-2 pl-10 pr-11 text-base font-semibold text-gray-800 outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-200"
              />
              <button
                type="button"
                aria-label={showBatchMenu ? 'Close batch options' : 'Open batch options'}
                onClick={() => {
                  if (!showBatchMenu) setBatchSearchTerm('');
                  setShowBatchMenu((open) => !open);
                }}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-600 hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pink-500"
              >
                <ChevronDown size={18} className={showBatchMenu ? 'rotate-180 transition-transform' : 'transition-transform'} aria-hidden="true" />
              </button>
            </div>
            {showBatchMenu && (
              <div
                id="feeds-batch-options"
                role="listbox"
                aria-label="Batch options"
                className="absolute left-3 right-3 top-full mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/70 bg-white/95 p-1 shadow-2xl backdrop-blur-xl"
              >
                {showAllBatchesOption && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedBatch === 'all'}
                    onClick={() => {
                      setSelectedBatch('all');
                      setBatchSearchTerm('');
                      setShowBatchMenu(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${selectedBatch === 'all' ? 'bg-pink-100 text-pink-800' : 'text-gray-800 hover:bg-gray-100'}`}
                  >
                    <span>All Batches</span>
                    {selectedBatch === 'all' && <Check size={16} aria-hidden="true" />}
                  </button>
                )}
                {filteredBatchOptions.map((batch) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={String(selectedBatch) === String(batch.id)}
                    key={batch.id}
                    onClick={() => {
                      setSelectedBatch(String(batch.id));
                      setBatchSearchTerm('');
                      setShowBatchMenu(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${String(selectedBatch) === String(batch.id) ? 'bg-pink-100 text-pink-800' : 'text-gray-800 hover:bg-gray-100'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{batch.name}</span>
                      <span className="block truncate text-xs text-gray-500">{batchOptionDetails(batch)}</span>
                    </span>
                    {String(selectedBatch) === String(batch.id) && <Check size={16} className="shrink-0" aria-hidden="true" />}
                  </button>
                ))}
                {!showAllBatchesOption && filteredBatchOptions.length === 0 && (
                  <p className="px-3 py-3 text-sm text-gray-600">No matching batches.</p>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-gray-600">Search and select a batch to filter feed records and stock summaries.</p>
          </div>
        </div>

        <div className={`feeds-desktop-content ${selectedBatch === 'all' ? 'feeds-all-batches' : 'feeds-selected-batch'} flex-1 min-h-0 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24`}>
          {loading || error ? (
            <div className="feeds-layout-columns">
              <div className="feeds-left-stack">
                <div className="feeds-summary-cards grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                  <div className="feeds-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                    <div className="feeds-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">
                      {selectedBatch === 'all' ? 'Current Stock' : 'Feed Consumed'}
                    </div>
                    <div className="feeds-hero-number mb-1 font-extrabold text-gray-900">
                      {formatKgQuantity(selectedBatch === 'all' ? totalStock : totalFeedConsumed)} <span className="whitespace-nowrap">kg</span>
                    </div>
                    <div className="feeds-summary-caption mt-2 text-xs text-gray-600 font-semibold">
                      {selectedBatch === 'all'
                        ? `${feedStocks.length} feed types · ${totalStockValue == null ? 'Unavailable' : `₱${totalStockValue.toFixed(2)}`} value`
                        : `From ${selectedBatchFeedRecords.length} feeding records`}
                    </div>
                  </div>
                  <div className="feeds-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                    <div className="feeds-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">
                      {selectedBatch === 'all' ? 'Total Feed Expenses' : selectedBatchData?.name || 'Unknown'}
                    </div>
                    <div className="feeds-hero-number mb-1 font-extrabold text-gray-900">
                      {displayedFeedExpense == null ? 'Unavailable' : `₱${displayedFeedExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                    </div>
                    <div className="feeds-summary-caption mt-2 text-xs text-gray-600">
                      {selectedBatch === 'all' ? 'Across all batches' : 'Feed expenses for this batch'}
                    </div>
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="feeds-state-message flex items-center justify-center h-40">
                  <div className="text-gray-600">Loading...</div>
                </div>
              ) : (
                <div className="feeds-state-message bg-red-100/20 border border-red-300/50 rounded-xl p-4 text-red-700">
                  <p>Error: {error}</p>
                  <button onClick={fetchFeedRecords} className="mt-2 underline">Retry</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="feeds-layout-columns">
                <div className="feeds-left-stack">
                  {/* Summary Cards */}
                  <div className="feeds-summary-cards grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                    <div className="feeds-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                      <div className="feeds-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">
                        {selectedBatch === 'all' ? 'Current Stock' : 'Feed Consumed'}
                      </div>
                      <div className="feeds-hero-number mb-1 font-extrabold text-gray-900">
                        {formatKgQuantity(selectedBatch === 'all' ? totalStock : totalFeedConsumed)} <span className="whitespace-nowrap">kg</span>
                      </div>
                      <div className="feeds-summary-caption mt-2 text-xs text-gray-600 font-semibold">
                        {selectedBatch === 'all'
                          ? `${feedStocks.length} feed types · ${totalStockValue == null ? 'Unavailable' : `₱${totalStockValue.toFixed(2)}`} value`
                          : `From ${selectedBatchFeedRecords.length} feeding records`}
                      </div>
                    </div>

                    <div className="feeds-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                      <div className="feeds-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">
                        {selectedBatch === 'all' ? 'Total Feed Expenses' : selectedBatchData?.name || 'Unknown'}
                      </div>
                      <div className="feeds-hero-number mb-1 font-extrabold text-gray-900">
                        {displayedFeedExpense == null ? 'Unavailable' : `₱${displayedFeedExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                      </div>
                      <div className="feeds-summary-caption mt-2 text-xs text-gray-600">
                        {selectedBatch === 'all' ? 'Across all batches' : 'Feed expenses for this batch'}
                      </div>
                    </div>
                  </div>

                  {/* Feed Schedule & Reminders */}
                  <div className="feeds-schedule-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-gray-900">
                        Feed Schedule & Reminders
                        {selectedBatch !== 'all' && ` - ${selectedBatchData?.name}`}
                      </h3>
                      <div className="shrink-0 rounded-full border border-green-300/50 bg-green-100/80 px-2 py-1 text-xs font-semibold text-green-700">
                        {FEED_REMINDER_TIMES.join(' · ')}
                      </div>
                    </div>
                    <p className="mb-3 text-xs text-gray-600">Reminders are sent at these times whether or not a feeding has been recorded.</p>
                    <div className="space-y-3">
                      {batches
                        .filter((batch) => (selectedBatch === 'all' ? true : String(batch.id) === String(selectedBatch)))
                        .map((batch) => {
                          const feedType = getFeedTypeForAge(batch.day);
                          const feedName = getFeedTypeName(feedType);
                          const dailyAmount = getDailyFeedForBatch(batch.day);
                          const daysUntilChange = getDaysUntilFeedChange(batch.day);
                          const recordedFeedingsToday = feedRecords.filter((record) =>
                            String(record.batch_id) === String(batch.id)
                            && String(record.feeding_date || '').slice(0, 10) === todayStr
                          ).length;
                          const completedFeedingsToday = Math.min(recordedFeedingsToday, DAILY_FEEDING_RECORDS_REQUIRED);
                          const isPending = Boolean(pendingDone[batch.id]);
                          const isDone = recordedFeedingsToday >= DAILY_FEEDING_RECORDS_REQUIRED;

                          return (
                            <div key={batch.id} className="bg-white/30 backdrop-blur-sm rounded-xl p-3 border border-white/30">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-900 text-sm">
                                    {batch.name} – {batch.pigCount ?? 0} pigs · Day {batch.day}
                                  </div>
                                  <div className="text-xs text-gray-600 mt-1">
                                    {isPending ? 'Saving...' : `${completedFeedingsToday} of ${DAILY_FEEDING_RECORDS_REQUIRED} feedings recorded today`}
                                  </div>
                                  <div className="text-xs text-gray-600">{feedName}, {dailyAmount} kg</div>
                                  {recordedFeedingsToday === 1 && !isPending && (
                                    <div className="mt-1 text-xs text-gray-600">Record the other feeding using Record Feed Usage.</div>
                                  )}
                                  {daysUntilChange !== null && daysUntilChange <= 5 && (
                                    <div className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                                      <span>🔄</span>
                                      Feed change in {daysUntilChange} day{daysUntilChange !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isDone ? 'bg-green-100/80 border border-green-300/50 text-green-700' : 'bg-yellow-100/80 border border-yellow-300/50 text-yellow-700'}`}>
                                  {isPending ? 'Saving...' : isDone ? 'Completed' : `${completedFeedingsToday}/${DAILY_FEEDING_RECORDS_REQUIRED}`}
                                </span>
                              </div>
                              {!isDone && recordedFeedingsToday === 0 && (
                                <button
                                  disabled={isPending}
                                  onClick={() => handleDirectMarkAsDone(batch.id, feedName, dailyAmount)}
                                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold py-2 rounded-lg shadow-lg active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {isPending ? 'Saving...' : 'Mark as Done'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="feeds-chart-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
                    <h3 className="font-semibold text-gray-900 mb-2">Feed Consumption & Forecast</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="date" tick={{ fill: '#4B5563', fontSize: 10 }} tickFormatter={(value) => new Date(`${value}T12:00:00`).toLocaleDateString()} />
                        <YAxis tick={{ fill: '#4B5563', fontSize: 10 }} label={{ value: 'kg', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="actual" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', r: 4 }} />
                        <Line type="monotone" dataKey="forecast" stroke="#f5125d" strokeWidth={2} strokeDasharray="6 4" dot={{ fill: '#f5125d', r: 3 }} connectNulls={false} />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-600">
                      <span className="text-emerald-700">● Actual feed consumption</span>
                      <span className="text-pink-700">● 7-day forecast</span>
                    </div>
                    {feedForecast?.status === 'forecasted' && (
                      <p className="text-[10px] text-gray-500 text-center mt-1">
                        Forecast uses {feedForecast.historyDays} recorded days · holdout MAE {feedForecast.evaluation?.meanAbsoluteErrorKg ?? '—'} kg/day
                      </p>
                    )}
                    {feedForecast?.status === 'insufficient_data' && (
                      <p className="text-[10px] text-amber-700 text-center mt-1">
                        Feed forecast needs at least {feedForecast.requiredHistoryDays} recorded days; currently {feedForecast.historyDays} available.
                      </p>
                    )}
                    {feedForecastError && <p className="text-[10px] text-red-600 text-center mt-1">{feedForecastError}</p>}
                  </div>
                </div>

                <div className="feeds-right-stack">
                  {/* Stock / Consumption Table */}
                  <div className="feeds-stock-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-white/20">
                      <h3 className="font-semibold text-gray-900">
                        {selectedBatch === 'all' ? 'Feed Stock by Type' : 'Feed Consumption by Type'}
                      </h3>
                    </div>
                    <div className="divide-y divide-white/20">
                      {selectedBatch === 'all' ? (
                        feedStocks.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-sm">No stock data available</div>
                        ) : (
                          feedStocks.map((feed) => (
                            <div key={feed.feed_type} className={`p-4 flex items-center justify-between ${feed.stock_quantity < 50 ? 'bg-orange-50/40' : ''}`}>
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{getFeedTypeName(feed.feed_type)}</div>
                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-600">
                                    {feed.unit_price == null ? 'Unavailable' : `₱${Number(feed.unit_price).toFixed(2)}/kg`} · {feed.last_updated || 'N/A'}
                                  </span>
                                  {feed.stock_quantity < 50 && (
                                    <span className="px-2 py-1 bg-orange-100/80 border border-orange-300/50 rounded-full text-xs text-orange-700 font-semibold">Low stock</span>
                                  )}
                                  <button onClick={() => handleEditPrice(feed.feed_type, feed.unit_price || 0)} className="w-6 h-6 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-all">
                                    <Edit className="w-3 h-3 text-gray-700" />
                                  </button>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`font-bold ${feed.stock_quantity < 50 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                  {formatKgQuantity(feed.stock_quantity)} <span className="whitespace-nowrap">kg</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )
                      ) : Object.keys(consumptionByFeedType).length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">No feed consumption records for this batch</div>
                      ) : (
                        Object.entries(consumptionByFeedType).map(([feedType, totalKg]) => (
                          <div key={feedType} className="p-4 flex items-center justify-between">
                            <div className="flex-1"><div className="font-medium text-gray-900">{feedType}</div></div>
                            <div className="text-right"><div className="font-bold text-orange-600">{formatKgQuantity(totalKg)} <span className="whitespace-nowrap">kg</span></div></div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {selectedBatch === 'all' && (
                    <div className="feeds-history-type-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg">
                      <div className="p-4 border-b border-white/20"><h3 className="font-semibold text-gray-900">Feed Consumption History by Type</h3></div>
                      <div className="divide-y divide-white/20">
                        {Object.keys(consumptionByFeedType).length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-sm">No feed consumption records</div>
                        ) : (
                          Object.entries(consumptionByFeedType).map(([feedType, totalKg]) => (
                            <div key={feedType} className="p-4 flex items-center justify-between">
                              <div className="font-medium text-gray-900">{getFeedTypeName(feedType)}</div>
                              <div className="font-bold text-orange-600">{formatKgQuantity(totalKg)} kg consumed</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* History */}
                  <div className="feeds-history-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-white/20">
                      <h3 className="font-semibold text-gray-900">
                        Feed Consumption History
                        {selectedBatch !== 'all' && ` - ${selectedBatchData?.name}`}
                      </h3>
                    </div>
                    <div className="divide-y divide-white/20">
                      {filteredRecords.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">No feed records for this batch yet</div>
                      ) : (
                        filteredRecords.slice(0, 10).map((record) => (
                          <div key={record.id} className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                {getBatchName(record.batch_id, record.batch_name) && (
                                  <div className="font-medium text-gray-900 text-sm">{getBatchName(record.batch_id, record.batch_name)}</div>
                                )}
                                <div className="text-xs text-gray-700 mt-1">{record.feed_type} · {record.quantity_kg} kg</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {new Date(record.feeding_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                                {shouldDisplayFeedNote(record.notes) && <div className="text-xs text-gray-600 mt-1 italic">"{record.notes}"</div>}
                              </div>
                              {getBatchName(record.batch_id, record.batch_name) && (
                                <span className="max-w-[45%] truncate whitespace-nowrap px-2 py-1 bg-green-100/80 border border-green-300/50 rounded-full text-xs text-green-700 font-semibold" title={getBatchName(record.batch_id, record.batch_name)}>
                                  {getBatchName(record.batch_id, record.batch_name)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="feeds-action-buttons grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button onClick={() => setShowRecordUsage(true)} className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(16,185,129,0.3),-6px_-6px_12px_rgba(255,255,255,0.5)] active:shadow-[inset_3px_3px_6px_rgba(5,150,105,0.4),inset_-3px_-3px_6px_rgba(110,231,183,0.4)] transition-all">
                  Record Feed Usage
                </button>
                <button onClick={() => { setPurchaseErrors({}); setShowAddPurchase(true); }} className="bg-white/30 backdrop-blur-lg border border-white/40 text-emerald-700 font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.8)] transition-all">
                  Add Feed Purchase
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        {/* Record Feed Usage Modal */}
        {showRecordUsage && (
          <div className="feed-usage-modal-overlay fixed inset-0 z-[60] flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="feed-usage-modal responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="feed-usage-modal-header flex items-center justify-between p-5 border-b border-white/30">
                <div>
                  <h2 className="feed-usage-modal-title text-xl font-bold text-gray-950">Record Feed Consumption</h2>
                  <p className="text-sm text-gray-700 mt-1">Log the feed given to a batch.</p>
                </div>
                <button
                  onClick={() => {
                    setShowRecordUsage(false);
                    setUsageErrors({});
                    setUsageForm({
                      batch: '',
                      feedType: '',
                      amount: '',
                      date: formatLocalDate(),
                      time: formatLocalTime(),
                      notes: '',
                    });
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Batch <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <select
                      value={usageForm.batch}
                      onChange={(e) => {
                        setUsageForm({ ...usageForm, batch: e.target.value });
                        setUsageErrors((current) => ({ ...current, batch: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(usageErrors.batch)}
                      aria-describedby={usageErrors.batch ? 'usage-batch-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${usageErrors.batch ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    >
                    <option value="">Select batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {usageErrors.batch && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="usage-batch-error" message={usageErrors.batch} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Feed Type <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <select
                      value={usageForm.feedType}
                      onChange={(e) => {
                        setUsageForm({ ...usageForm, feedType: e.target.value });
                        setUsageErrors((current) => ({ ...current, feedType: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(usageErrors.feedType)}
                      aria-describedby={usageErrors.feedType ? 'usage-feed-type-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${usageErrors.feedType ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    >
                    <option value="">Select feed type...</option>
                    <option value="starter">Starter Mash</option>
                    <option value="grower">Grower Pellet</option>
                    <option value="finisher">Finisher</option>
                  </select>
                  {usageErrors.feedType && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="usage-feed-type-error" message={usageErrors.feedType} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Amount (kg) <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <input
                      type="number"
                      value={usageForm.amount}
                      onChange={(e) => {
                        setUsageForm({ ...usageForm, amount: e.target.value });
                        setUsageErrors((current) => ({ ...current, amount: '' }));
                      }}
                      placeholder="48"
                      aria-required="true"
                      aria-invalid={Boolean(usageErrors.amount)}
                      aria-describedby={usageErrors.amount ? 'usage-amount-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${usageErrors.amount ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {usageErrors.amount && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="usage-amount-error" message={usageErrors.amount} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <input
                      type="date"
                      value={usageForm.date}
                      onChange={(e) => {
                        setUsageForm({ ...usageForm, date: e.target.value });
                        setUsageErrors((current) => ({ ...current, date: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(usageErrors.date)}
                      aria-describedby={usageErrors.date ? 'usage-date-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${usageErrors.date ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {usageErrors.date && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="usage-date-error" message={usageErrors.date} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Time <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <input
                      type="time"
                      value={usageForm.time}
                      onChange={(e) => {
                        setUsageForm({ ...usageForm, time: e.target.value });
                        setUsageErrors((current) => ({ ...current, time: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(usageErrors.time)}
                      aria-describedby={usageErrors.time ? 'usage-time-error' : undefined}
                      className={`w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all pr-11 ${usageErrors.time ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {usageErrors.time && <AlertTriangle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="usage-time-error" message={usageErrors.time} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Notes (Optional)</label>
                  <textarea
                    value={usageForm.notes}
                    onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                    placeholder="Add any observations..."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                  />
                </div>

                {!isOnline && (
                  <p className="text-xs text-gray-600 bg-yellow-50/50 p-2 rounded-lg">
                    Saved locally if offline – will sync later
                  </p>
                )}

                <button
                  onClick={handleUsageSubmit}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Save Usage
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Purchase Modal */}
        {showAddPurchase && (
          <div className="feed-purchase-modal-overlay fixed inset-0 z-[60] flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="feed-purchase-modal responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="feed-purchase-modal-header flex items-center justify-between p-5 border-b border-white/30">
                <div>
                  <h2 className="feed-purchase-modal-title text-xl font-bold text-gray-950">Record Feed Purchase</h2>
                  <p className="text-sm text-gray-700 mt-1">Add purchased feed to your inventory.</p>
                </div>
                <button
                  onClick={() => {
                    setShowAddPurchase(false);
                    setPurchaseErrors({});
                    setPurchaseForm({ feedType: '', quantity: '', unitCost: '', date: formatLocalDate() });
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {purchaseErrors.form && <p className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50/80 p-3 text-sm font-semibold text-red-700" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{purchaseErrors.form}</p>}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Feed Type <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <select
                      value={purchaseForm.feedType}
                      onChange={(e) => {
                        setPurchaseForm({ ...purchaseForm, feedType: e.target.value });
                        setPurchaseErrors((current) => ({ ...current, feedType: '', form: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(purchaseErrors.feedType)}
                      aria-describedby={purchaseErrors.feedType ? 'purchase-feed-type-error' : undefined}
                      className={`w-full px-4 py-3 pr-11 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all ${purchaseErrors.feedType ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    >
                      <option value="">Select feed type...</option>
                      <option value="starter">Starter Mash</option>
                      <option value="grower">Grower Pellet</option>
                      <option value="finisher">Finisher</option>
                    </select>
                    {purchaseErrors.feedType && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="purchase-feed-type-error" message={purchaseErrors.feedType} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Quantity (kg) <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={purchaseForm.quantity}
                      onChange={(e) => {
                        setPurchaseForm({ ...purchaseForm, quantity: e.target.value });
                        setPurchaseErrors((current) => ({ ...current, quantity: '', form: '' }));
                      }}
                      placeholder="250"
                      aria-required="true"
                      aria-invalid={Boolean(purchaseErrors.quantity)}
                      aria-describedby={purchaseErrors.quantity ? 'purchase-quantity-error' : undefined}
                      className={`w-full px-4 py-3 pr-11 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all ${purchaseErrors.quantity ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {purchaseErrors.quantity && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="purchase-quantity-error" message={purchaseErrors.quantity} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Unit Cost (₱ per kg) <span className="text-gray-600 font-normal">(Optional)</span></label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={purchaseForm.unitCost}
                      onChange={(e) => {
                        setPurchaseForm({ ...purchaseForm, unitCost: e.target.value });
                        setPurchaseErrors((current) => ({ ...current, unitCost: '', form: '' }));
                      }}
                      placeholder="28.50"
                      aria-invalid={Boolean(purchaseErrors.unitCost)}
                      aria-describedby={purchaseErrors.unitCost ? 'purchase-unit-cost-error' : undefined}
                      className={`w-full px-4 py-3 pr-11 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all ${purchaseErrors.unitCost ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {purchaseErrors.unitCost && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="purchase-unit-cost-error" message={purchaseErrors.unitCost} />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date of Purchase <span className="text-red-700" aria-hidden="true">*</span></label>
                  <div className="relative">
                    <input
                      type="date"
                      value={purchaseForm.date}
                      onChange={(e) => {
                        setPurchaseForm({ ...purchaseForm, date: e.target.value });
                        setPurchaseErrors((current) => ({ ...current, date: '', form: '' }));
                      }}
                      aria-required="true"
                      aria-invalid={Boolean(purchaseErrors.date)}
                      aria-describedby={purchaseErrors.date ? 'purchase-date-error' : undefined}
                      className={`w-full px-4 py-3 pr-11 rounded-xl bg-white/40 backdrop-blur-lg border text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all ${purchaseErrors.date ? 'border-red-500 ring-1 ring-red-400/60' : 'border-white/50'}`}
                    />
                    {purchaseErrors.date && <AlertTriangle className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-red-600" aria-hidden="true" />}
                  </div>
                  <InlineFieldError id="purchase-date-error" message={purchaseErrors.date} />
                </div>

                <button
                  onClick={handleAddPurchase}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Record Purchase
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Price Modal */}
        {showEditPrice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Edit Feed Price</h2>
                <button
                  onClick={() => {
                    setShowEditPrice(false);
                    setEditingFeed(null);
                    setNewPrice('');
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Feed Type</label>
                  <input
                    type="text"
                    value={editingFeed || ''}
                    disabled
                    className="w-full px-4 py-3 rounded-xl bg-white/20 backdrop-blur-lg border border-white/50 text-gray-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Price per kg (₱)</label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="28.50"
                    step="0.01"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={handleSavePrice}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Save Price
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav active="Feeds" />
      </div>
    </div>
  );
}