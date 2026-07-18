import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Download,
  Share,
  Home,
  Package,
  Syringe,
  DollarSign,
  FileText,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
// ────────────────────────────────────────────────────────────────

export default function AnalyticsReportsScreen() {
  const navigate = useNavigate();
  const [isOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [batches, setBatches] = useState([]);
  const [feedRecords, setFeedRecords] = useState([]);
  const [vaccinationRecords, setVaccinationRecords] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [feedStock, setFeedStock] = useState([]);
  const [vaccineStock, setVaccineStock] = useState([]);

  // Filters
  const [dateRange, setDateRange] = useState('Last 30 days');
  const [selectedBatch, setSelectedBatch] = useState('All Batches');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);

  // --- Report modal state ---
  const [reportModal, setReportModal] = useState(null); // null or report name

  // ---------- Fetch all data ----------
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        fetch(`${API_BASE}/pigs/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/feeds/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/vaccinations/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/expenses/all`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/feeds/stock`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/vaccinations/stock`, { headers: getAuthHeaders() }),
      ]);

      const [batchesRes, feedRes, vacRes, expRes, feedStockRes, vacStockRes] = results;

      if (batchesRes.status === 'fulfilled' && batchesRes.value.ok) {
        const json = await batchesRes.value.json();
        if (json.success) setBatches(json.data || []);
      }
      if (feedRes.status === 'fulfilled' && feedRes.value.ok) {
        const json = await feedRes.value.json();
        if (json.success) setFeedRecords(json.data || []);
      }
      if (vacRes.status === 'fulfilled' && vacRes.value.ok) {
        const json = await vacRes.value.json();
        if (json.success) setVaccinationRecords(json.data || []);
      }
      if (expRes.status === 'fulfilled' && expRes.value.ok) {
        const json = await expRes.value.json();
        if (json.success) setExpenses(json.data || []);
      }
      if (feedStockRes.status === 'fulfilled' && feedStockRes.value.ok) {
        const json = await feedStockRes.value.json();
        if (json.success) setFeedStock(json.data || []);
      }
      if (vacStockRes.status === 'fulfilled' && vacStockRes.value.ok) {
        const json = await vacStockRes.value.json();
        if (json.success) setVaccineStock(json.data || []);
      }
    } catch (err) {
      setError('Failed to load some data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // ---------- Filter data by selected batch ----------
  const filterByBatch = (data, batchIdField) => {
    if (selectedBatch === 'All Batches') return data;
    const batch = batches.find((b) => b.batch_code === selectedBatch);
    if (!batch) return data;
    return data.filter((item) => item[batchIdField] === batch.id);
  };

  const filteredFeedRecords = filterByBatch(feedRecords, 'batch_id');
  const filteredVaccinationRecords = filterByBatch(vaccinationRecords, 'batch_id');
  const filteredExpenses = filterByBatch(expenses, 'batch_id');

  // ---------- Currency helper ----------
  const formatCurrency = (amount) => {
    if (isNaN(amount) || !isFinite(amount)) return '₱0.00';
    return `₱${amount.toFixed(2)}`;
  };

  // ---------- Compute feed + vaccine combined expenses (safe) ----------
  const getFeedCost = () => {
    let total = 0;
    filteredFeedRecords.forEach((rec) => {
      const qty = parseFloat(rec.quantity_kg) || 0;
      const stock = feedStock.find((s) => s.feed_type === rec.feed_type);
      const price = stock?.unit_price || 0;
      total += qty * price;
    });
    return Math.round(total * 100) / 100;
  };

  const getVaccineCost = () => {
    let total = 0;
    filteredVaccinationRecords.forEach((rec) => {
      const dosage = parseFloat(rec.dosage) || 0;
      const stock = vaccineStock.find((s) => s.vaccine_name === rec.vaccine_name);
      const price = stock?.price_per_dose || 0;
      total += dosage * price;
    });
    return Math.round(total * 100) / 100;
  };

  const totalFeedCost = getFeedCost();
  const totalVaccineCost = getVaccineCost();
  const combinedExpenses = totalFeedCost + totalVaccineCost;

  // ---------- Computed data for charts ----------

  // 1. Growth data (filtered by batch)
  const getGrowthData = () => {
    const targetBatches =
      selectedBatch === 'All Batches'
        ? batches
        : batches.filter((b) => b.batch_code === selectedBatch);
    if (targetBatches.length === 0) return [];

    const weeks = 14;
    const data = [];
    targetBatches.forEach((batch) => {
      const start = Number(batch.start_weight) || 0;
      const current = Number(batch.current_weight) || start;
      const weekIncrement = (current - start) / weeks;
      for (let i = 0; i <= weeks; i += 2) {
        const week = i;
        const weight = start + weekIncrement * i;
        const targetWeight = start + (i / weeks) * (current * 1.2 - start);
        data.push({ week: `W${week}`, actual: weight, target: targetWeight });
      }
    });
    const grouped = {};
    data.forEach((d) => {
      if (!grouped[d.week]) grouped[d.week] = { week: d.week, actual: [], target: [] };
      grouped[d.week].actual.push(d.actual);
      grouped[d.week].target.push(d.target);
    });
    return Object.keys(grouped).map((week) => ({
      week,
      actual:
        Math.round(
          (grouped[week].actual.reduce((a, b) => a + b, 0) / grouped[week].actual.length) * 10
        ) / 10,
      target:
        Math.round(
          (grouped[week].target.reduce((a, b) => a + b, 0) / grouped[week].target.length) * 10
        ) / 10,
    }));
  };

  // 2. Feed consumption (from filtered feed records)
  const getFeedConsumptionData = () => {
    const grouped = {};
    filteredFeedRecords.forEach((r) => {
      const date = r.feeding_date;
      if (!date) return;
      if (!grouped[date]) grouped[date] = 0;
      grouped[date] += Number(r.quantity_kg);
    });
    const sorted = Object.keys(grouped).sort();
    return sorted.map((date) => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: Math.round(grouped[date] * 10) / 10,
    }));
  };

  // 3. Profit trend (uses combined expenses)
  const getProfitTrend = () => {
    const targetBatches =
      selectedBatch === 'All Batches'
        ? batches
        : batches.filter((b) => b.batch_code === selectedBatch);
    const totalRevenue = targetBatches.reduce(
      (sum, b) => sum + (Number(b.current_weight) || 0) * 180,
      0
    );
    // Use combined expenses but spread evenly across months
    const months = {};
    filteredExpenses.forEach((e) => {
      const date = new Date(e.expense_date);
      const month = date.toLocaleString('en-US', { month: 'short' });
      if (!months[month]) months[month] = 0;
      months[month] += Number(e.amount);
    });
    const monthNames = Object.keys(months).sort(
      (a, b) => new Date(`1 ${a} 2026`) - new Date(`1 ${b} 2026`)
    );
    const combinedPerMonth = combinedExpenses / (monthNames.length || 1);
    const revenuePerMonth = totalRevenue / (monthNames.length || 1);
    return monthNames.map((month) => ({
      month,
      profit: Math.round((revenuePerMonth - combinedPerMonth) * 10) / 10,
    }));
  };

  // 4. Expense breakdown (still uses the expenses table)
  const getExpenseBreakdown = () => {
    const breakdown = {};
    filteredExpenses.forEach((e) => {
      const type = e.expense_type || 'Other';
      if (!breakdown[type]) breakdown[type] = 0;
      breakdown[type] += Number(e.amount);
    });
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return Object.keys(breakdown).map((name) => ({
      name,
      value: Math.round(breakdown[name] * 100) / 100,
      color: name === 'Feeds' ? '#10B981' : name === 'Vaccines' ? '#3B82F6' : '#F59E0B',
    }));
  };

  // 5. Vaccination summary
  const getVaccinationSummary = () => {
    const totalDoses = vaccinationRecords.reduce(
      (sum, r) => sum + (Number(r.dosage) || 0),
      0
    );
    const completed = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;
    const scheduled = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'scheduled'
    ).length;
    return { totalDoses, completed, scheduled };
  };

  // 6. Total feed stock
  const totalFeedStock = feedStock.reduce((sum, s) => sum + (s.stock_quantity || 0), 0);

  // ---------- Report actions ----------
  const handleViewReport = (reportName) => {
    setReportModal(reportName);
  };

  const handleCloseModal = () => {
    setReportModal(null);
  };

  const handleDownloadReport = (reportName) => {
    // Generate a dummy CSV file
    const content = `Report: ${reportName}\nGenerated: ${new Date().toLocaleString()}\n\nThis is a placeholder report.\nData would be included here.`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${reportName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleHeaderDownload = () => {
    window.print();
  };

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
        <div className="absolute inset-0">
          <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="text-gray-700">Loading reports...</div>
        </div>
        <BottomNav active="Reports" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-gray-700" />
              </button>
              <h1 className="text-lg font-bold text-gray-900">Analytics & Reports</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleHeaderDownload}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <Download className="w-4 h-4 text-gray-700" />
              </button>
              <div className="relative">
                {isOnline ? (
                  <Cloud className="w-5 h-5 text-green-600" />
                ) : (
                  <CloudOff className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 md:px-8 lg:px-12 pb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="w-full px-4 py-2 bg-white/30 backdrop-blur-lg border border-white/40 rounded-xl text-sm font-semibold text-gray-900 flex items-center justify-between shadow-lg"
              >
                {dateRange} <ChevronDown className="w-4 h-4" />
              </button>
              {showDateDropdown && (
                <div className="absolute top-full mt-2 w-full bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-2xl overflow-hidden z-20">
                  {['This month', 'Last 30 days', 'Last 90 days', 'Custom range'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setDateRange(option);
                        setShowDateDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-green-100/50 transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative flex-1">
              <button
                onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                className="w-full px-4 py-2 bg-white/30 backdrop-blur-lg border border-white/40 rounded-xl text-sm font-semibold text-gray-900 flex items-center justify-between shadow-lg"
              >
                {selectedBatch} <ChevronDown className="w-4 h-4" />
              </button>
              {showBatchDropdown && (
                <div className="absolute top-full mt-2 w-full bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-2xl overflow-hidden z-20">
                  {['All Batches', ...batches.map((b) => b.batch_code)].filter(Boolean).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSelectedBatch(option);
                        setShowBatchDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-green-100/50 transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 pb-24">
          {/* Alerts Panel (mock) */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
            <div className="p-4 border-b border-white/20">
              <h3 className="font-semibold text-gray-900 text-sm">Active Alerts</h3>
            </div>
            <div className="divide-y divide-white/20">
              <div className="p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Batch B: Growth slower than expected
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">Check feeding schedule</div>
                </div>
              </div>
              <div className="p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    Feed stock for Grower Pellet below 50 kg
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-gray-700 font-semibold">Feed Stock</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{totalFeedStock} kg</div>
              <div className="text-xs text-gray-600">Total remaining</div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Syringe className="w-4 h-4 text-blue-600" />
                <span className="text-xs text-gray-700 font-semibold">Vaccinations</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {getVaccinationSummary().totalDoses} doses
              </div>
              <div className="text-xs text-gray-600">
                {getVaccinationSummary().completed} completed ·{' '}
                {getVaccinationSummary().scheduled} scheduled
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-gray-700 font-semibold">Total Expenses</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(combinedExpenses)}</div>
              <div className="text-xs text-gray-600">
                Feed: {formatCurrency(totalFeedCost)} · Vaccine: {formatCurrency(totalVaccineCost)}
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <span className="text-xs text-gray-700 font-semibold">Batches</span>
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedBatch === 'All Batches' ? batches.length : 1}
              </div>
              <div className="text-xs text-gray-600">
                {selectedBatch === 'All Batches' ? 'Total batches' : selectedBatch}
              </div>
            </div>
          </div>

          {/* Growth Performance */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Pig Growth Trend (Weight vs. Age)</h3>
            <div className="bg-white/40 rounded-xl p-3 mb-3">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={getGrowthData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="#6B7280" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#6B7280" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10B981"
                    strokeWidth={3}
                    dot={{ fill: '#10B981', r: 4 }}
                    name="Actual"
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#9CA3AF"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Target"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="bg-white/40 rounded-lg p-2">
                <div className="text-xs text-gray-600">ADG</div>
                <div className="text-lg font-bold text-gray-900">0.65 kg</div>
              </div>
              <div className="bg-white/40 rounded-lg p-2">
                <div className="text-xs text-gray-600">Current</div>
                <div className="text-lg font-bold text-gray-900">72 kg</div>
              </div>
              <div className="bg-white/40 rounded-lg p-2">
                <div className="text-xs text-gray-600">Remaining</div>
                <div className="text-lg font-bold text-gray-900">4 wks</div>
              </div>
            </div>
          </div>

          {/* Feed Consumption */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Feed Consumption</h3>
            <div className="bg-white/40 rounded-xl p-3 mb-3">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={getFeedConsumptionData()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#6B7280" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#6B7280" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10B981"
                    strokeWidth={3}
                    dot={{ fill: '#10B981', r: 3 }}
                    name="Actual"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-blue-100/60 backdrop-blur-lg border border-blue-300/50 rounded-xl p-3">
              <div className="text-xs text-blue-800 font-medium">
                {selectedBatch === 'All Batches' ? 'All batches' : selectedBatch} ·{' '}
                {filteredFeedRecords.length} feeding records
              </div>
            </div>
          </div>

          {/* Feed Efficiency */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Feed Efficiency</h3>
            <div className="bg-white/40 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">Feed Conversion Ratio</div>
              <div className="text-4xl font-bold text-green-600">2.8</div>
              <div className="text-xs text-gray-600 mt-1">Good (Target: &lt; 3.0)</div>
            </div>
          </div>

          {/* Profit Analysis */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Profit Summary (This Period)</h3>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Revenue from Sales</span>
                <span className="font-bold text-green-600">
                  ₱
                  {(selectedBatch === 'All Batches'
                    ? batches
                    : batches.filter((b) => b.batch_code === selectedBatch)
                  )
                    .reduce((sum, b) => sum + (Number(b.current_weight) || 0) * 180, 0)
                    .toLocaleString()}
                </span>
              </div>
              <div className="border-t border-white/30 pt-2">
                <div className="text-xs text-gray-600 mb-2">Expenses:</div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Feeds (consumed)</span>
                  <span className="text-gray-900">{formatCurrency(totalFeedCost)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Vaccines</span>
                  <span className="text-gray-900">{formatCurrency(totalVaccineCost)}</span>
                </div>
                {getExpenseBreakdown().length > 0 && (
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 ml-2">Other (manual)</span>
                    <span className="text-gray-900">
                      {formatCurrency(
                        filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-white/30 pt-2 mt-2">
                  <span className="text-gray-900">Total Expenses</span>
                  <span className="text-red-600">{formatCurrency(combinedExpenses)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-green-100/60 rounded-lg p-3 mt-3">
                <span className="font-bold text-gray-900">Net Profit</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(
                      (selectedBatch === 'All Batches'
                        ? batches
                        : batches.filter((b) => b.batch_code === selectedBatch)
                      ).reduce((sum, b) => sum + (Number(b.current_weight) || 0) * 180, 0) -
                        combinedExpenses
                    )}
                  </div>
                  <span className="px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-semibold">
                    {Math.round(
                      ((selectedBatch === 'All Batches'
                        ? batches
                        : batches.filter((b) => b.batch_code === selectedBatch)
                      ).reduce((sum, b) => sum + (Number(b.current_weight) || 0) * 180, 0) /
                        (combinedExpenses || 1) -
                        1) * 100
                    )}
                    % margin
                  </span>
                </div>
              </div>
            </div>

            {/* Expense Breakdown Chart (manual expenses) */}
            <div className="bg-white/40 rounded-xl p-3 mb-3">
              <div className="text-sm font-semibold text-gray-900 mb-2">
                Manual Expense Breakdown
              </div>
              <div className="flex items-center justify-between">
                <ResponsiveContainer width="40%" height={120}>
                  <PieChart>
                    <Pie
                      data={getExpenseBreakdown()}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={45}
                    >
                      {getExpenseBreakdown().map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {getExpenseBreakdown().map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <div className="text-xs text-gray-700 flex-1">{item.name}</div>
                      <div className="text-xs font-semibold text-gray-900">
                        {Math.round(
                          (item.value /
                            (filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0) ||
                              1)) *
                            100
                        )}
                        %
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Profit Trend */}
            <div className="bg-white/40 rounded-xl p-3">
              <div className="text-sm font-semibold text-gray-900 mb-2">Monthly Profit Trend</div>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={getProfitTrend()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#6B7280" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#6B7280" />
                  <Tooltip />
                  <Bar dataKey="profit" fill="#10B981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Generate Reports */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
            <div className="p-4 border-b border-white/20">
              <h3 className="font-semibold text-gray-900">Generate Reports</h3>
            </div>
            <div className="divide-y divide-white/20">
              {[
                {
                  name: 'Growth Performance Report',
                  desc: 'Weight progression, ADG, trends',
                },
                {
                  name: 'Feed Consumption Report',
                  desc: 'Daily intake, forecast, usage',
                },
                {
                  name: 'Vaccination Report',
                  desc: 'Vaccines by batch, dates, costs',
                },
                {
                  name: 'Profit & Loss Statement',
                  desc: 'Income vs expenses, margins',
                },
              ].map((report) => (
                <div key={report.name} className="p-4 flex items-center justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{report.name}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{report.desc}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleViewReport(report.name)}
                      className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold shadow-lg active:scale-95 transition-transform"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDownloadReport(report.name)}
                      className="w-8 h-8 bg-white/30 backdrop-blur-lg rounded-lg flex items-center justify-center active:scale-95 transition-transform"
                    >
                      <Download className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reports */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
            <div className="p-4 border-b border-white/20">
              <h3 className="font-semibold text-gray-900">Recent Reports</h3>
            </div>
            <div className="divide-y divide-white/20">
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">
                    Growth_Report_BatchA_May2026.pdf
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">May 10, 2026</div>
                </div>
                <button
                  onClick={() => handleViewReport('Growth Report Batch A')}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold shadow-lg active:scale-95 transition-transform mr-2"
                >
                  View
                </button>
                <button
                  onClick={() => handleDownloadReport('Growth_Report_BatchA_May2026')}
                  className="w-8 h-8 bg-white/30 backdrop-blur-lg rounded-lg flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Download className="w-4 h-4 text-gray-700" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">
                    Feed_Consumption_Q2_2026.csv
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">May 1, 2026</div>
                </div>
                <button
                  onClick={() => handleViewReport('Feed Consumption Report')}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-semibold shadow-lg active:scale-95 transition-transform mr-2"
                >
                  View
                </button>
                <button
                  onClick={() => handleDownloadReport('Feed_Consumption_Q2_2026')}
                  className="w-8 h-8 bg-white/30 backdrop-blur-lg rounded-lg flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Download className="w-4 h-4 text-gray-700" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Report View Modal */}
        {reportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-xl font-bold text-gray-900">{reportModal}</h2>
                <button
                  onClick={handleCloseModal}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>
              <div className="p-6">
                <p className="text-gray-700">
                  This is a placeholder view for the <strong>{reportModal}</strong>.
                  <br />
                  <br />
                  In a real implementation, this would display the full report content (charts, tables,
                  etc.).
                </p>
                <div className="mt-4 p-4 bg-white/20 rounded-xl border border-white/30">
                  <p className="text-sm text-gray-600">Example data for {reportModal}:</p>
                  <ul className="mt-2 text-sm text-gray-700 space-y-1">
                    <li>• Total records: {Math.floor(Math.random() * 100) + 10}</li>
                    <li>• Date range: {dateRange}</li>
                    <li>• Batch: {selectedBatch}</li>
                    <li>• Generated: {new Date().toLocaleString()}</li>
                  </ul>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleCloseModal}
                    className="px-4 py-2 bg-green-500 text-white rounded-xl shadow-lg active:scale-95 transition-transform"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <BottomNav active="Reports" />
      </div>
    </div>
  );
}