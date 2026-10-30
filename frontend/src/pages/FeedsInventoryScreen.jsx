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
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
import { buildFeedDonePayload } from '../utils/markDonePayloads.js';
import { getUserCacheKey, readCache, writeCache } from '../utils/cache.js';
import { formatLocalDate, formatLocalTime } from '../utils/dates.js';
// ────────────────────────────────────────────────────────────────

// Helpers
const getFeedTypeForAge = (day) => {
  if (day <= 21) return 'starter';
  if (day <= 49) return 'grower';
  return 'finisher';
};

const getFeedTypeName = (feedType) => {
  const names = {
    starter: 'Starter Mash',
    grower: 'Grower Pellet',
    finisher: 'Finisher',
  };
  return names[feedType];
};

const getDaysUntilFeedChange = (day) => {
  if (day <= 21) return 22 - day;
  if (day <= 49) return 50 - day;
  return null;
};

const getDailyFeedPerPig = (day) => {
  if (day <= 7) return 0.3;
  if (day <= 14) return 0.5;
  if (day <= 21) return 0.8;
  if (day <= 35) return 1.5;
  if (day <= 49) return 2.2;
  return 2.8;
};

const FEED_TYPE_MAP = {
  starter: 'Starter Mash',
  grower: 'Grower Pellet',
  finisher: 'Finisher',
};

const InlineFieldError = ({ id, message }) => message ? (
  <p id={id} className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700" role="alert">
    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    {message}
  </p>
) : null;

export default function FeedsInventoryScreen() {
  const navigate = useNavigate();

  const [isOnline] = useState(true);
  const [pendingSync] = useState(0);
  const [showRecordUsage, setShowRecordUsage] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showEditPrice, setShowEditPrice] = useState(false);
  const [editingFeed, setEditingFeed] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [showBatchMenu, setShowBatchMenu] = useState(false);
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

  // Fetch functions
  const fetchBatches = async () => {
    const cacheKey = `batches:${getUserCacheKey()}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) {
      setBatches(cached);
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/all?limit=100`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        const mapped = json.data.map((batch) => {
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
            name: batch.batch_code || `Batch ${batch.id}`,
            day: day,
            pigCount: batch.pig_count || 0,
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
      let url = `${API_BASE}/feeds/all?limit=100`;
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
      const mappedBatches = (overview.batches || []).map((batch) => {
        const sourceDate = batch.date_acquired || batch.created_at;
        const day = sourceDate
          ? (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((new Date() - new Date(sourceDate)) / (1000 * 60 * 60 * 24)))
          : 0;
        return { id: batch.id, name: batch.batch_code || `Batch ${batch.id}`, day, pigCount: batch.pig_count || 0, breed: batch.breed || 'Unknown', age_on_acquisition: batch.age_on_acquisition || 0 };
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
    if (selectedBatch === 'all') return;
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
    if (!purchaseForm.feedType) errors.feedType = 'Feed type is required';
    if (!String(purchaseForm.quantity).trim()) errors.quantity = 'Quantity is required';
    if (!purchaseForm.date) errors.date = 'Date is required';
    setPurchaseErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const feedType = FEED_TYPE_MAP[purchaseForm.feedType];
    if (!feedType) {
      setPurchaseErrors({ feedType: 'Select a valid feed type' });
      return;
    }
    const quantity = parseFloat(purchaseForm.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setPurchaseErrors({ quantity: 'Enter a quantity greater than 0' });
      return;
    }
    const unitCost = purchaseForm.unitCost.trim() === '' ? null : Number(purchaseForm.unitCost);
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
      if (!res.ok) throw new Error('Failed to update stock');
      const json = await res.json();
      if (json.success) {
        alert('Stock updated successfully!');
        setShowAddPurchase(false);
        setPurchaseForm({
          feedType: '',
          quantity: '',
          unitCost: '',
          date: formatLocalDate(),
        });
        fetchFeedStock();
        window.dispatchEvent(new Event('prepapig:financial-data-changed'));
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error restocking: ' + err.message);
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
        alert('Price updated successfully!');
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
  const getBatchName = (batchId) => {
    const batch = batches.find((b) => b.id === batchId);
    return batch ? batch.name : 'Unknown';
  };

  const calculateBatchFeedExpense = (batchId) => {
    const filtered =
      batchId === 'all' ? feedRecords : feedRecords.filter((r) => r.batch_id === batchId);
    let total = 0;
    for (const rec of filtered) {
      const rawPrice = feedStocks.find((stock) => stock.feed_type === rec.feed_type)?.unit_price;
      if (rawPrice == null || rawPrice === '' || !Number.isFinite(Number(rawPrice)) || rec.quantity_kg == null || !Number.isFinite(Number(rec.quantity_kg))) return null;
      total += Number(rec.quantity_kg) * Number(rawPrice);
    }
    return total;
  };

  const selectedBatchData = batches.find((b) => String(b.id) === String(selectedBatch));
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
    const selectedRecords = selectedBatch !== 'all'
      ? feedRecords.filter((r) => String(r.batch_id) === String(selectedBatch))
      : [];
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
    const actual = feedRecords.map((r) => ({
      date: new Date(r.feeding_date).toLocaleDateString(),
      actual: Number(r.quantity_kg),
    }));
    const forecast = (feedForecast?.forecast || []).map((row) => ({
      date: new Date(`${row.date}T00:00:00`).toLocaleDateString(),
      forecast: row.predictedKg,
      lower: row.lowerKg,
      upper: row.upperKg,
    }));
    return [...actual.slice(-30), ...forecast];
  }, [feedRecords, feedForecast]);

  // ----- Today's date for checking existing feedings -----
  const todayStr = formatLocalDate();

  return (
    <div className="mobile-screen-shell min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="mobile-screen-layer relative z-10 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-9 h-9 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Feeds Inventory</h1>
          </div>
          <div className="feeds-header-actions flex items-center gap-2">
                      <button onClick={() => setShowRecordUsage(true)} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-[#6C63FF] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#6C63FF]/25">
                        <Plus className="w-4 h-4" /> Record Feed Usage
                      </button>
                      <button onClick={() => setShowAddPurchase(true)} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-white/65 px-4 py-2.5 text-xs font-bold text-emerald-700 border border-white/70 shadow-lg">
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
          <div className="relative z-50 isolate bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-3 shadow-lg">
            <button
              type="button"
              aria-expanded={showBatchMenu}
              onClick={() => setShowBatchMenu((open) => !open)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-sm shadow-lg"
            >
              <span>
                {selectedBatch === 'all'
                  ? 'All Batches'
                  : `${selectedBatchData?.name || 'Selected Batch'} · ${selectedBatchData?.pigCount ?? 0} pigs`}
              </span>
              <span className="ml-3 text-base">{showBatchMenu ? '▴' : '▾'}</span>
            </button>
            {showBatchMenu && (
              <div className="absolute z-[100] left-3 right-3 top-full mt-2 max-h-64 overflow-y-auto rounded-xl bg-white/90 backdrop-blur-lg border border-white/50 p-2 shadow-xl">
                <button
                  type="button"
                  onClick={() => { setSelectedBatch('all'); setShowBatchMenu(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-emerald-100/70"
                >
                  All Batches
                </button>
                {batches.map((batch) => (
                  <button
                    type="button"
                    key={batch.id}
                    onClick={() => { setSelectedBatch(String(batch.id)); setShowBatchMenu(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      String(selectedBatch) === String(batch.id)
                        ? 'bg-emerald-100/80 text-emerald-700'
                        : 'text-gray-700 hover:bg-emerald-100/70'
                    }`}
                  >
                    {batch.name} · {batch.pigCount ?? 0} pigs · Day {batch.day ?? 0} · {batch.breed || 'Unknown'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="feeds-desktop-content">
        {/* Summary Cards */}
        <div className="px-4 md:px-8 lg:px-12 mb-4">
          <div className="flex flex-nowrap overflow-x-auto gap-3 pb-2">
            <div className="feeds-summary-card flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-700 font-semibold">
                  {selectedBatch === 'all' ? 'Current Stock' : 'Feed Consumed'}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {selectedBatch === 'all' ? totalStock : totalFeedConsumed} kg
              </div>
              <div className="text-xs text-gray-600 mb-3">
                {selectedBatch === 'all'
                  ? `${feedStocks.length} feed types · ${totalStockValue == null ? 'Unavailable' : `₱${totalStockValue.toFixed(2)}`} value`
                  : `From ${selectedBatchFeedRecords.length} feeding records`}
              </div>
              <div className="h-2 bg-white/30 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  style={{
                    width:
                      selectedBatch === 'all'
                        ? Math.min(100, (totalStock / 500) * 100)
                        : Math.min(100, (totalFeedConsumed / 500) * 100),
                  }}
                />
              </div>
            </div>

            <div className="feeds-summary-card flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-100/80 rounded-xl flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-lg">₱</span>
                </div>
                <span className="text-xs text-gray-700 font-semibold">
                  {selectedBatch === 'all' ? 'All Batches' : selectedBatchData?.name}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {displayedFeedExpense == null ? 'Unavailable' : `₱${displayedFeedExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
              </div>
              <div className="text-xs text-gray-600">
                {selectedBatch === 'all' ? 'Total feed expenses' : 'Feed expenses for this batch'}
              </div>
            </div>

            {selectedBatch === 'all'
              ? feedStocks.map((feed) => {
                  const stockLevel = Math.min(100, (feed.stock_quantity / 200) * 100);
                  const isLow = feed.stock_quantity < 50;
                  return (
                    <div
                      key={feed.feed_type}
                      className="feeds-summary-card flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-700">{feed.feed_type}</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">
                        {feed.stock_quantity} kg
                      </div>
                      <div className="text-xs text-gray-600">
                        {feed.unit_price == null ? 'Unavailable' : `₱${Number(feed.unit_price).toFixed(2)}/kg`}
                      </div>
                      <div className="mt-2 h-1.5 bg-white/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isLow ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, stockLevel)}%` }}
                        />
                      </div>
                      {isLow && (
                        <div className="mt-1 text-xs text-red-600 font-semibold">Low stock</div>
                      )}
                    </div>
                  );
                })
              : Object.entries(consumptionByFeedType).map(([feedType, totalKg]) => {
                  const maxConsumption = 200;
                  const level = Math.min(100, (totalKg / maxConsumption) * 100);
                  return (
                    <div
                      key={feedType}
                      className="feeds-summary-card flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-700">{feedType}</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">{totalKg} kg</div>
                      <div className="text-xs text-gray-600">Consumed</div>
                      <div className="mt-2 h-1.5 bg-white/30 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500"
                          style={{ width: `${Math.min(100, level)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* Main Content */}
        <div className="feeds-main-content flex-1 min-h-0 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-600">Loading...</div>
            </div>
          ) : error ? (
            <div className="bg-red-100/20 border border-red-300/50 rounded-xl p-4 text-red-700">
              <p>Error: {error}</p>
              <button onClick={fetchFeedRecords} className="mt-2 underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-4">
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
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No stock data available
                      </div>
                    ) : (
                      feedStocks.map((feed) => (
                        <div
                          key={feed.feed_type}
                          className={`p-4 flex items-center justify-between ${
                            feed.stock_quantity < 50 ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{feed.feed_type}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-600">
                                {feed.unit_price == null ? 'Unavailable' : `₱${Number(feed.unit_price).toFixed(2)}/kg`} ·{' '}
                                {feed.last_updated || 'N/A'}
                              </span>
                              <button
                                onClick={() => handleEditPrice(feed.feed_type, feed.unit_price || 0)}
                                className="w-6 h-6 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center hover:bg-white/60 transition-all"
                              >
                                <Edit className="w-3 h-3 text-gray-700" />
                              </button>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`font-bold ${
                                feed.stock_quantity < 50 ? 'text-orange-600' : 'text-emerald-600'
                              }`}
                            >
                              {feed.stock_quantity} kg
                            </div>
                          </div>
                        </div>
                      ))
                    )
                  ) : Object.keys(consumptionByFeedType).length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No feed consumption records for this batch
                    </div>
                  ) : (
                    Object.entries(consumptionByFeedType).map(([feedType, totalKg]) => (
                      <div key={feedType} className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{feedType}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-orange-600">{totalKg} kg</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="feeds-action-buttons grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <button
                  onClick={() => setShowRecordUsage(true)}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(16,185,129,0.3),-6px_-6px_12px_rgba(255,255,255,0.5)] active:shadow-[inset_3px_3px_6px_rgba(5,150,105,0.4),inset_-3px_-3px_6px_rgba(110,231,183,0.4)] transition-all"
                >
                  Record Feed Usage
                </button>
                <button
                  onClick={() => setShowAddPurchase(true)}
                  className="bg-white/30 backdrop-blur-lg border border-white/40 text-emerald-700 font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.8)] transition-all"
                >
                  Add Feed Purchase
                </button>
              </div>

              {/* Chart */}
                            <div className="feeds-chart-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Feed Consumption & Forecast</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={chartData}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fill: '#4B5563', fontSize: 10 }} />
                    <YAxis
                      tick={{ fill: '#4B5563', fontSize: 10 }}
                      label={{ value: 'kg', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#10B981"
                      strokeWidth={3}
                      dot={{ fill: '#10B981', r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#7C3AED"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={{ fill: '#7C3AED', r: 3 }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-600">
                  <span className="text-emerald-700">● Actual feed consumption</span>
                  <span className="text-violet-700">● 7-day forecast</span>
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

              {/* Automated Feeding Schedule */}
                            <div className="feeds-schedule-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">
                    Automated Feeding Schedule
                    {selectedBatch !== 'all' && ` - ${selectedBatchData?.name}`}
                  </h3>
                  <div className="px-2 py-1 bg-green-100/80 border border-green-300/50 rounded-full text-xs text-green-700 font-semibold flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    Auto
                  </div>
                </div>

                <div className="space-y-3">
                  {batches
                    .filter((batch) => (selectedBatch === 'all' ? true : String(batch.id) === String(selectedBatch)))
                    .map((batch, index) => {
                      const feedType = getFeedTypeForAge(batch.day);
                      const feedName = getFeedTypeName(feedType);
                      const dailyAmount = Math.round(getDailyFeedPerPig(batch.day) * batch.pigCount);
                      const daysUntilChange = getDaysUntilFeedChange(batch.day);

                      // Check if a feeding for today already exists for this batch
                      const existingToday = feedRecords.some(
                        (r) => r.batch_id === batch.id && r.feeding_date === todayStr
                      );
                      const isPending = Boolean(pendingDone[batch.id]);
                      const isDone = existingToday || isPending;

                      const status = isPending ? 'saving' : isDone ? 'completed' : 'pending';
                      const scheduleTime =
                        index === 0
                          ? 'Today, 5:00 PM'
                          : index === 1
                          ? 'Tomorrow, 7:00 AM'
                          : 'Tomorrow, 6:00 PM';

                      return (
                        <div
                          key={batch.id}
                          className="bg-white/30 backdrop-blur-sm rounded-xl p-3 border border-white/30"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 text-sm">
                                {batch.name} – {batch.pigCount ?? 0} pigs · Day {batch.day}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {isPending ? 'Saving...' : isDone ? 'Completed today' : `Next feeding: ${scheduleTime}`}
                              </div>
                              <div className="text-xs text-gray-600">
                                {feedName}, {dailyAmount} kg
                              </div>
                              {daysUntilChange !== null && daysUntilChange <= 5 && (
                                <div className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                                  <span>🔄</span>
                                  Feed change in {daysUntilChange} day
                                  {daysUntilChange !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                isDone
                                  ? 'bg-green-100/80 border border-green-300/50 text-green-700'
                                  : 'bg-yellow-100/80 border border-yellow-300/50 text-yellow-700'
                              }`}
                            >
                              {isPending ? 'Saving...' : isDone ? 'Completed' : 'Pending'}
                            </span>
                          </div>

                          {!isDone && (
                            <button
                              onClick={() => {
                                handleDirectMarkAsDone(batch.id, feedName, dailyAmount);
                              }}
                              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold py-2 rounded-lg shadow-lg active:scale-95 transition-all"
                            >
                              Mark as Done
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>

              </div>

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
                    <div className="p-8 text-center text-gray-500 text-sm">
                      No feed records for this batch yet
                    </div>
                  ) : (
                    filteredRecords.slice(0, 10).map((record) => (
                      <div key={record.id} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 text-sm">
                              {record.batch_name || getBatchName(record.batch_id)}
                            </div>
                            <div className="text-xs text-gray-700 mt-1">
                              {record.feed_type} · {record.quantity_kg} kg
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(record.feeding_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </div>
                            {record.notes && (
                              <div className="text-xs text-gray-600 mt-1 italic">
                                "{record.notes}"
                              </div>
                            )}
                          </div>
                          <span className="px-2 py-1 bg-green-100/80 border border-green-300/50 rounded-full text-xs text-green-700 font-semibold">
                            {record.batch_id}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Modals */}
        {/* Record Feed Usage Modal */}
        {showRecordUsage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Record Feed Consumption</h2>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Record Feed Purchase</h2>
                <button
                  onClick={() => {
                    setShowAddPurchase(false);
                    setPurchaseForm({
                      feedType: '',
                      quantity: '',
                      unitCost: '',
                      date: formatLocalDate(),
                    });
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Feed Type</label>
                  <select
                    value={purchaseForm.feedType}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, feedType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  >
                    <option value="">Select feed type...</option>
                    <option value="starter">Starter Mash</option>
                    <option value="grower">Grower Pellet</option>
                    <option value="finisher">Finisher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Quantity (kg)</label>
                  <input
                    type="number"
                    value={purchaseForm.quantity}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                    placeholder="250"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Unit Cost (₱ per kg)</label>
                  <input
                    type="number"
                    value={purchaseForm.unitCost}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, unitCost: e.target.value })}
                    placeholder="28.50"
                    step="0.01"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date of Purchase</label>
                  <input
                    type="date"
                    value={purchaseForm.date}
                    onChange={(e) => setPurchaseForm({ ...purchaseForm, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
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