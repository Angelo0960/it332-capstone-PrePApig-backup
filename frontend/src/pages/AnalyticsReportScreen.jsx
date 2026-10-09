import { useMemo, useState, useEffect } from 'react';
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
  PhilippinePeso,
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
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';
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
  const [pigPriceLocations, setPigPriceLocations] = useState(['Calaca', 'Lemery', 'Balayan', 'Tuy', 'Nasugbu']);
  const [pigPriceReference, setPigPriceReference] = useState(null);
  const [pigPriceError, setPigPriceError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState(null);

  // Filters
  const [dateRange, setDateRange] = useState('Last 30 days');
  const [selectedBatch, setSelectedBatch] = useState('All Batches');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);

  // --- Report modal state ---
  const [reportModal, setReportModal] = useState(null); // null or report name

  const getDateQuery = () => {
    const end = new Date();
    const start = new Date(end);
    if (dateRange === 'This month') start.setDate(1);
    else if (dateRange === 'Last 90 days') start.setDate(start.getDate() - 89);
    else start.setDate(start.getDate() - 29);
    return `from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`;
  };

  // ---------- Fetch all data in one response ----------
  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/reports/analytics?${getDateQuery()}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Failed to load analytics');
      const data = json.data || {};
      setBatches(data.batches || []);
      setFeedRecords(data.feedRecords || []);
      setVaccinationRecords(data.vaccinationRecords || []);
      setExpenses(data.expenses || []);
      setFeedStock(data.feedStock || []);
      setVaccineStock(data.vaccineStock || []);
    } catch (err) {
      setError('Failed to load some data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Fetch pig price basis for analysis ----------
  const fetchPigPriceBasis = async () => {
    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Pig price unavailable');
      setPigPriceLocations(json.priceSourceLocations || []);
      setPigPriceReference(json.data || null);
      setPigPriceError(null);
    } catch (err) {
      console.error('Error loading pig price basis:', err);
      setPigPriceLocations([]);
      setPigPriceReference(null);
      setPigPriceError('Price sources unavailable');
    }
  };

  const requestAiPriceAnalysis = async () => {
    setAiAnalysisLoading(true);
    setAiAnalysisError(null);
    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs/ai-analysis`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations: pigPriceLocations }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gemini analysis unavailable');
      }
      setAiAnalysis(json);
    } catch (err) {
      setAiAnalysis(null);
      setAiAnalysisError(
        err.message.includes('Gemini API key is not configured')
          ? 'Gemini is not configured on the backend. Add GEMINI_API_KEY to the Render backend environment variables, then redeploy.'
          : err.message
      );
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [dateRange]);

  // ---------- Filter data by selected batch ----------
  const filterByBatch = (data, batchIdField) => {
    if (selectedBatch === 'All Batches') return data;
    const batch = batches.find((b) => b.batch_code === selectedBatch);
    if (!batch) return data;
    return data.filter((item) => item[batchIdField] === batch.id);
  };

  const filteredFeedRecords = useMemo(
    () => filterByBatch(feedRecords, 'batch_id'),
    [feedRecords, batches, selectedBatch]
  );
  const filteredVaccinationRecords = useMemo(
    () => filterByBatch(vaccinationRecords, 'batch_id'),
    [vaccinationRecords, batches, selectedBatch]
  );
  const filteredExpenses = useMemo(
    () => filterByBatch(expenses, 'batch_id'),
    [expenses, batches, selectedBatch]
  );

  // ---------- Currency helper ----------
  const formatCurrency = (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return '₱0.00';
    return `₱${numericAmount.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatPricePerKg = (amount) => {
    const numericAmount = Number(amount);
    return Number.isFinite(numericAmount)
      ? `₱${numericAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/kg`
      : 'Unavailable';
  };

  // ---------- Compute feed + vaccine combined expenses (safe) ----------
  const getFeedCost = () => {
    let total = 0;
    filteredFeedRecords.forEach((rec) => {
      const qty = parseFloat(rec.quantity_kg) || 0;
      const price = feedPriceMap.get(rec.feed_type) || 0;
      total += qty * price;
    });
    return Math.round(total * 100) / 100;
  };

  const getVaccineCost = () => {
    let total = 0;
    filteredVaccinationRecords.forEach((rec) => {
      const dosage = parseFloat(rec.dosage) || 0;
      const price = vaccinePriceMap.get(rec.vaccine_name) || 0;
      total += dosage * price;
    });
    return Math.round(total * 100) / 100;
  };

  const feedPriceMap = new Map(feedStock.map((stock) => [stock.feed_type, Number(stock.unit_price) || 0]));
  const vaccinePriceMap = new Map(vaccineStock.map((stock) => [stock.vaccine_name, Number(stock.price_per_dose) || 0]));
  const totalFeedCost = useMemo(() => getFeedCost(), [filteredFeedRecords, feedStock]);
  const totalVaccineCost = useMemo(() => getVaccineCost(), [filteredVaccinationRecords, vaccineStock]);
  const combinedExpenses = totalFeedCost + totalVaccineCost;

  // ---------- Computed data for charts ----------

  // Feed consumption (from filtered feed records)
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
  const totalFeedStock = useMemo(
    () => feedStock.reduce((sum, s) => sum + (s.stock_quantity || 0), 0),
    [feedStock]
  );
  const feedConsumptionData = useMemo(() => getFeedConsumptionData(), [filteredFeedRecords]);
  const profitTrend = useMemo(
    () => getProfitTrend(),
    [batches, selectedBatch, filteredExpenses, combinedExpenses]
  );
  const expenseBreakdown = useMemo(() => getExpenseBreakdown(), [filteredExpenses]);
  const vaccinationSummary = useMemo(() => getVaccinationSummary(), [vaccinationRecords]);

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
                {vaccinationSummary.totalDoses} doses
              </div>
              <div className="text-xs text-gray-600">
                {vaccinationSummary.completed} completed ·{' '}
                {vaccinationSummary.scheduled} scheduled
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <PhilippinePeso className="w-4 h-4 text-purple-600" />
                <span className="text-xs text-gray-700 font-semibold">Total Expenses</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight break-words">
                {formatCurrency(combinedExpenses)}
              </div>
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

          {/* Local Pig Price Sources and Gemini Analysis */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">Local Pig Price Sources</h3>
                <p className="text-xs text-gray-600">Use 3+ nearby locations for Gemini price analysis</p>
              </div>
              <button
                onClick={requestAiPriceAnalysis}
                disabled={aiAnalysisLoading || pigPriceLocations.length < 3}
                className="px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold shadow-lg disabled:opacity-50"
              >
                {aiAnalysisLoading ? 'Analyzing...' : 'Ask Gemini AI'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {(pigPriceLocations.length > 0 ? pigPriceLocations : ['Calaca', 'Lemery', 'Balayan', 'Tuy', 'Nasugbu']).map((location) => (
                <span key={location} className="px-2 py-1 bg-white/50 rounded-lg text-xs text-gray-800">
                  {location}
                </span>
              ))}
            </div>
            {pigPriceReference && (
              <div className="text-xs text-gray-600 mb-2">
                Provincial reference: <span className="font-bold text-green-600">{formatPricePerKg(pigPriceReference.pricePhpPerKg)}</span> ({pigPriceReference.period}).
              </div>
            )}
            {pigPriceError && <div className="text-xs text-red-600">{pigPriceError}</div>}
            {aiAnalysisError && <div className="text-xs text-red-600 mt-2">{aiAnalysisError}</div>}
            {aiAnalysis && (
              <div className="bg-purple-100/50 border border-purple-300/50 rounded-xl p-3 mt-3">
                <div className="text-xs font-semibold text-purple-900 mb-2">Gemini price suggestion</div>
                {aiAnalysis.pricePoints?.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    {aiAnalysis.pricePoints.map((point, index) => (
                      <div key={`${point.location}-${index}`} className="bg-white/50 rounded-lg p-2">
                        <div className="text-xs font-semibold text-gray-900">{point.location}</div>
                        <div className="text-sm font-bold text-green-700">
                          {point.pricePhpPerKg == null ? 'Unavailable' : formatPricePerKg(point.pricePhpPerKg)}
                        </div>
                        <div className="text-[10px] text-gray-600">{point.period || point.status || 'Source checked'}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm text-gray-800 whitespace-pre-line">{aiAnalysis.analysis}</div>
                {aiAnalysis.suggestion && (
                  <div className="text-sm font-semibold text-purple-900 mt-2">Suggestion: {aiAnalysis.suggestion}</div>
                )}
                {aiAnalysis.limitations?.length > 0 && (
                  <div className="text-[10px] text-gray-600 mt-2">Limits: {aiAnalysis.limitations.join(' ')}</div>
                )}
                {aiAnalysis.sources?.length > 0 && (
                  <div className="text-[10px] text-gray-600 mt-2">Grounded sources: {aiAnalysis.sources.length}</div>
                )}
              </div>
            )}
            <div className="text-[10px] text-gray-500 mt-2">
              Gemini must find at least 3 geographically distinct public price points. It must mark unavailable locations instead of inventing prices.
            </div>
          </div>

          {/* Feed Consumption */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <h3 className="font-semibold text-gray-900 mb-3">Feed Consumption</h3>
            <div className="bg-white/40 rounded-xl p-3 mb-3">
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={feedConsumptionData}>
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
                {expenseBreakdown.length > 0 && (
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
                      data={expenseBreakdown}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={45}
                    >
                      {expenseBreakdown.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {expenseBreakdown.map((item) => (
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
                <BarChart data={profitTrend}>
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