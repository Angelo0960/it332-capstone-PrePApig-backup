import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Check,
  Package,
  Syringe,
  DollarSign,
  TrendingUp,
  Plus,
  Home,
  X,
  AlertTriangle,
  Edit,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
// ────────────────────────────────────────────────────────────────

// Mock data
const MOCK_BATCHES = [
  { id: 'A', name: 'Batch A', day: 34, pigCount: 12 },
  { id: 'B', name: 'Batch B', day: 21, pigCount: 8 },
  { id: 'C', name: 'Batch C', day: 48, pigCount: 15 },
];

const MOCK_FEED_RECORDS = [
  {
    id: '1',
    batch_id: 'A',
    batch_name: 'Batch A',
    feed_type: 'Grower Pellet',
    quantity_kg: 48,
    feeding_date: '2026-05-11',
    notes: 'Regular feeding',
  },
  {
    id: '2',
    batch_id: 'B',
    batch_name: 'Batch B',
    feed_type: 'Starter Mash',
    quantity_kg: 32,
    feeding_date: '2026-05-10',
    notes: '',
  },
  {
    id: '3',
    batch_id: 'A',
    batch_name: 'Batch A',
    feed_type: 'Grower Pellet',
    quantity_kg: 45,
    feeding_date: '2026-05-09',
    notes: '',
  },
  {
    id: '4',
    batch_id: 'C',
    batch_name: 'Batch C',
    feed_type: 'Grower Pellet',
    quantity_kg: 60,
    feeding_date: '2026-05-08',
    notes: '',
  },
];

const MOCK_FEED_STOCKS = [
  { feed_type: 'Starter Mash', unit_price: 29.0, stock_quantity: 48, last_updated: 'May 5, 2026' },
  { feed_type: 'Grower Pellet', unit_price: 28.5, stock_quantity: 245, last_updated: 'May 1, 2026' },
  { feed_type: 'Finisher', unit_price: 27.0, stock_quantity: 120, last_updated: 'Apr 28, 2026' },
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [feedRecords, setFeedRecords] = useState(MOCK_FEED_RECORDS);
  const [batches, setBatches] = useState(MOCK_BATCHES);
  const [feedStocks, setFeedStocks] = useState(MOCK_FEED_STOCKS);

  const [usageForm, setUsageForm] = useState({
    batch: '',
    feedType: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    feedType: '',
    quantity: '',
    unitCost: '',
    date: new Date().toISOString().split('T')[0],
  });

  // Fetch functions
  const fetchBatches = async () => {
    try {
      const res = await fetch(`${API_BASE}/pigs/all`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        const mapped = json.data.map((batch) => {
          let day = 0;
          if (batch.date_acquired) {
            const acquired = new Date(batch.date_acquired);
            const now = new Date();
            day = Math.max(0, Math.floor((now - acquired) / (1000 * 60 * 60 * 24)));
          } else if (batch.created_at) {
            const created = new Date(batch.created_at);
            const now = new Date();
            day = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
          }
          return {
            id: batch.id,
            name: batch.batch_code || `Batch ${batch.id}`,
            day: day,
            pigCount: batch.pig_count || 0,
          };
        });
        setBatches(mapped);
        setUseMock(false);
      } else {
        throw new Error('No batches found');
      }
    } catch (err) {
      console.warn('Using mock batches:', err.message);
      setUseMock(true);
      setBatches(MOCK_BATCHES);
    }
  };

  const fetchFeedRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/feeds/all`;
      if (selectedBatch !== 'all') {
        url = `${API_BASE}/feeds/batch/${selectedBatch}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setFeedRecords(json.data || []);
        setUseMock(false);
      } else {
        throw new Error(json.message || 'No records');
      }
    } catch (err) {
      console.warn('Using mock feed records:', err.message);
      setUseMock(true);
      if (selectedBatch === 'all') {
        setFeedRecords(MOCK_FEED_RECORDS);
      } else {
        setFeedRecords(MOCK_FEED_RECORDS.filter((r) => r.batch_id === selectedBatch));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedStock = async () => {
    try {
      const res = await fetch(`${API_BASE}/feeds/stock`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stock');
      const json = await res.json();
      if (json.success) {
        setFeedStocks(json.data || []);
        setUseMock(false);
      }
    } catch (err) {
      console.warn('Could not fetch feed stock:', err.message);
      setFeedStocks(MOCK_FEED_STOCKS);
      setUseMock(true);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchFeedStock();
  }, []);

  useEffect(() => {
    fetchFeedRecords();
  }, [selectedBatch, refreshKey]);

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
        setRefreshKey((prev) => prev + 1);
        setShowRecordUsage(false);
        setUsageForm({
          batch: '',
          feedType: '',
          amount: '',
          date: new Date().toISOString().split('T')[0],
          notes: '',
        });
        await fetchFeedStock();
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
  const handleDirectMarkAsDone = (batchId, feedType, amount) => {
    const payload = {
      batch_id: batchId,
      feed_type: feedType,
      quantity_kg: parseFloat(amount),
      feeding_date: new Date().toISOString().split('T')[0],
      feeding_time: new Date().toLocaleTimeString(),
      notes: 'Auto‑marked as done',
    };
    handleSaveFeedUsage(payload);
  };

  // ----- Modal submit -----
  const handleUsageSubmit = () => {
    if (!usageForm.batch || !usageForm.feedType || !usageForm.amount) {
      alert('Please fill in all required fields');
      return;
    }
    const feedTypeName = FEED_TYPE_MAP[usageForm.feedType] || usageForm.feedType;
    if (!feedTypeName) {
      alert('Invalid feed type selected');
      return;
    }
    const payload = {
      batch_id: usageForm.batch,
      feed_type: feedTypeName,
      quantity_kg: parseFloat(usageForm.amount) || 0,
      feeding_date: usageForm.date,
      feeding_time: new Date().toLocaleTimeString(),
      notes: usageForm.notes,
    };
    handleSaveFeedUsage(payload);
  };

  // ----- Restock -----
  const handleAddPurchase = async () => {
    const feedType = FEED_TYPE_MAP[purchaseForm.feedType];
    if (!feedType) {
      alert('Please select a feed type');
      return;
    }
    const quantity = parseFloat(purchaseForm.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity');
      return;
    }
    const unitCost = parseFloat(purchaseForm.unitCost) || 0;
    try {
      const res = await fetch(`${API_BASE}/feeds/stock/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          feed_type: feedType,
          stock_quantity: quantity,
          unit_price: unitCost,
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
          date: new Date().toISOString().split('T')[0],
        });
        fetchFeedStock();
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
    return filtered.reduce((total, rec) => {
      const amount = Number(rec.quantity_kg) || 0;
      const price = feedStocks.find((s) => s.feed_type === rec.feed_type)?.unit_price || 0;
      return total + amount * price;
    }, 0);
  };

  const selectedBatchData = batches.find((b) => b.id === selectedBatch);
  const batchExpense = calculateBatchFeedExpense(selectedBatch);
  const filteredRecords = feedRecords;

  const totalStock = feedStocks.reduce((sum, s) => sum + (s.stock_quantity || 0), 0);
  const totalStockValue = feedStocks.reduce(
    (sum, s) => sum + ((s.stock_quantity || 0) * (s.unit_price || 0)),
    0
  );

  const selectedBatchFeedRecords =
    selectedBatch !== 'all' ? feedRecords.filter((r) => r.batch_id === selectedBatch) : [];
  const totalFeedConsumed = selectedBatchFeedRecords.reduce(
    (sum, r) => sum + (r.quantity_kg || 0),
    0
  );
  const consumptionByFeedType = selectedBatchFeedRecords.reduce((acc, r) => {
    const type = r.feed_type;
    if (!acc[type]) acc[type] = 0;
    acc[type] += r.quantity_kg || 0;
    return acc;
  }, {});

  // ----- Today's date for checking existing feedings -----
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-screen">
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
          <div className="flex items-center gap-2">
            {useMock && (
              <span className="text-xs text-yellow-600 bg-yellow-100/80 px-2 py-0.5 rounded-full">
                Offline Mode
              </span>
            )}
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
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-3 shadow-lg">
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setSelectedBatch('all')}
                className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${
                  selectedBatch === 'all'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                    : 'bg-white/30 text-gray-700'
                }`}
              >
                All Batches
              </button>
              {batches.map((batch) => (
                <button
                  key={batch.id}
                  onClick={() => setSelectedBatch(batch.id)}
                  className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${
                    selectedBatch === batch.id
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                      : 'bg-white/30 text-gray-700'
                  }`}
                >
                  {batch.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="px-4 md:px-8 lg:px-12 mb-4">
          <div className="flex flex-nowrap overflow-x-auto gap-3 pb-2">
            <div className="flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-emerald-100/80 rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-xs text-gray-700 font-semibold">
                  {selectedBatch === 'all' ? 'Current Stock' : 'Feed Consumed'}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                {selectedBatch === 'all' ? totalStock : totalFeedConsumed} kg
              </div>
              <div className="text-xs text-gray-600 mb-3">
                {selectedBatch === 'all'
                  ? `${feedStocks.length} feed types · ₱${totalStockValue.toFixed(2)} value`
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

            <div className="flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-100/80 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-xs text-gray-700 font-semibold">
                  {selectedBatch === 'all' ? 'All Batches' : selectedBatchData?.name}
                </span>
              </div>
              <div className="text-2xl font-bold text-gray-900 mb-1">
                ₱{batchExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
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
                      className="flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            isLow ? 'bg-red-100/80' : 'bg-blue-100/80'
                          }`}
                        >
                          <Package
                            className={`w-4 h-4 ${isLow ? 'text-red-600' : 'text-blue-600'}`}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">{feed.feed_type}</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">
                        {feed.stock_quantity} kg
                      </div>
                      <div className="text-xs text-gray-600">
                        ₱{feed.unit_price?.toFixed(2) || '0.00'}/kg
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
                      className="flex-shrink-0 w-64 bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-xl bg-orange-100/80 flex items-center justify-center">
                          <Package className="w-4 h-4 text-orange-600" />
                        </div>
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
        <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 pb-24">
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
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg">
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
                                ₱{feed.unit_price?.toFixed(2) || '0.00'}/kg ·{' '}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
                <h3 className="font-semibold text-gray-900 mb-2">Feed Consumption & Forecast</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={feedRecords.map((r) => ({
                      date: new Date(r.feeding_date).toLocaleDateString(),
                      actual: r.quantity_kg,
                    }))}
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
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-gray-600 text-center mt-2">Actual feed consumption</p>
              </div>

              {/* Automated Feeding Schedule */}
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg">
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
                    .filter((batch) => (selectedBatch === 'all' ? true : batch.id === selectedBatch))
                    .map((batch, index) => {
                      const feedType = getFeedTypeForAge(batch.day);
                      const feedName = getFeedTypeName(feedType);
                      const dailyAmount = Math.round(getDailyFeedPerPig(batch.day) * batch.pigCount);
                      const daysUntilChange = getDaysUntilFeedChange(batch.day);

                      // Check if a feeding for today already exists for this batch
                      const existingToday = feedRecords.some(
                        (r) => r.batch_id === batch.id && r.feeding_date === todayStr
                      );
                      const isDone = existingToday;

                      const status = isDone ? 'completed' : 'pending';
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
                                {batch.name} – Day {batch.day}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {isDone ? 'Completed today' : `Next feeding: ${scheduleTime}`}
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
                              {isDone ? 'Completed' : 'Pending'}
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

                <div className="mt-4 p-3 bg-blue-50/40 rounded-xl border border-blue-200/50">
                  <div className="flex items-start gap-2">
                    <div className="text-blue-600 text-sm">ℹ️</div>
                    <div className="flex-1">
                      <p className="text-xs text-blue-900 font-medium">
                        Feed types auto-adjust by age:
                      </p>
                      <ul className="text-xs text-blue-800 mt-1 space-y-0.5 ml-2">
                        <li>• Days 1-21: Starter Mash</li>
                        <li>• Days 22-49: Grower Pellet</li>
                        <li>• Days 50+: Finisher</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* History */}
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg">
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

        {/* Modals */}
        {/* Record Feed Usage Modal */}
        {showRecordUsage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Record Feed Consumption</h2>
                <button
                  onClick={() => {
                    setShowRecordUsage(false);
                    setUsageForm({
                      batch: '',
                      feedType: '',
                      amount: '',
                      date: new Date().toISOString().split('T')[0],
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
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Batch</label>
                  <select
                    value={usageForm.batch}
                    onChange={(e) => setUsageForm({ ...usageForm, batch: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  >
                    <option value="">Select batch...</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Feed Type</label>
                  <select
                    value={usageForm.feedType}
                    onChange={(e) => setUsageForm({ ...usageForm, feedType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  >
                    <option value="">Select feed type...</option>
                    <option value="starter">Starter Mash</option>
                    <option value="grower">Grower Pellet</option>
                    <option value="finisher">Finisher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Amount (kg)</label>
                  <input
                    type="number"
                    value={usageForm.amount}
                    onChange={(e) => setUsageForm({ ...usageForm, amount: e.target.value })}
                    placeholder="48"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date</label>
                  <input
                    type="date"
                    value={usageForm.date}
                    onChange={(e) => setUsageForm({ ...usageForm, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Record Feed Purchase</h2>
                <button
                  onClick={() => {
                    setShowAddPurchase(false);
                    setPurchaseForm({
                      feedType: '',
                      quantity: '',
                      unitCost: '',
                      date: new Date().toISOString().split('T')[0],
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
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