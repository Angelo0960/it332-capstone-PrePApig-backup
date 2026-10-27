import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Download,
  Share,
  Home,
  FileText,

  ChevronDown,

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
import { formatCurrency, formatPricePerKg } from '../utils/formatters.js';
import { getUserCacheKey, readCache, writeCache } from '../utils/cache.js';
// ────────────────────────────────────────────────────────────────

const DEFAULT_PRICE_POINTS = [
  { location: 'Calaca', pricePhpPerKg: 120, unit: 'PHP/kg', source: 'User-provided local reference', status: 'reference' },
  { location: 'Tuy', pricePhpPerKg: 190, unit: 'PHP/kg', source: 'User-provided local reference', status: 'reference' },
  { location: 'Nasugbu', pricePhpPerKg: 210, unit: 'PHP/kg', source: 'User-provided local reference', status: 'reference' },
];

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
  const [financial, setFinancial] = useState(null);
  const [financialError, setFinancialError] = useState(null);
  const [feedStock, setFeedStock] = useState([]);
  const [pigPriceLocations, setPigPriceLocations] = useState(['Calaca', 'Lemery', 'Balayan', 'Tuy', 'Nasugbu']);
  const [pigPriceReference, setPigPriceReference] = useState(null);
  const [pricePoints, setPricePoints] = useState(DEFAULT_PRICE_POINTS);
  const [selectedPriceLocation, setSelectedPriceLocation] = useState(() => (
    localStorage.getItem(`prepapig:${getUserCacheKey()}:selected-price-location`) || null
  ));
  const [facebookPriceSources, setFacebookPriceSources] = useState([]);
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
  const aiAbortController = useRef(null);
  const autoAiAnalysisRequested = useRef(false);

  const getDateQuery = () => {
    const end = new Date();
    const start = new Date(end);
    if (dateRange === 'This month') start.setDate(1);
    else if (dateRange === 'Last 90 days') start.setDate(start.getDate() - 89);
    else start.setDate(start.getDate() - 29);
    return `from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`;
  };

  // ---------- Fetch all data in one response ----------
  const fetchAllData = async (signal) => {
    const cacheKey = `analytics:${getUserCacheKey()}:${dateRange}`;
    const cached = readCache(cacheKey);
    if (cached && typeof cached === 'object') {
      setBatches(cached.batches || []);
      setFeedRecords(cached.feedRecords || []);
      setVaccinationRecords(cached.vaccinationRecords || []);
      setExpenses(cached.expenses || []);
      setFeedStock(cached.feedStock || []);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/reports/analytics?${getDateQuery()}`, {
        headers: getAuthHeaders(),
        signal,
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
      writeCache(cacheKey, {
        batches: data.batches || [],
        feedRecords: data.feedRecords || [],
        vaccinationRecords: data.vaccinationRecords || [],
        expenses: data.expenses || [],
        feedStock: data.feedStock || [],
      });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError('Failed to load some data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  // ---------- Fetch pig price basis for analysis ----------
  const fetchPigPriceBasis = async (signal) => {
    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Pig price unavailable');
      setPigPriceLocations(json.priceSourceLocations || []);
      setPigPriceReference(json.data || null);
      setPricePoints(json.pricePoints || []);
      setFacebookPriceSources(json.facebookPriceSources || []);
      setPigPriceError(null);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Error loading pig price basis:', err);
      setPigPriceLocations(DEFAULT_PRICE_POINTS.map((point) => point.location));
      setPigPriceReference(null);
      setPricePoints(DEFAULT_PRICE_POINTS);
      setPigPriceError('Price sources unavailable');
    }
  };

  const requestAiPriceAnalysis = async (locations = pigPriceLocations) => {
    if (!Array.isArray(locations) || locations.length < 3) return;

    const cacheKey = `price-ai-analysis:${getUserCacheKey()}:${locations.join('|')}`;
    const cachedAnalysis = readCache(cacheKey);
    if (cachedAnalysis) {
      setAiAnalysis(cachedAnalysis);
      setAiAnalysisError(null);
      setAiAnalysisLoading(false);
      return;
    }

    aiAbortController.current?.abort();
    const controller = new AbortController();
    aiAbortController.current = controller;
    setAiAnalysisLoading(true);
    setAiAnalysisError(null);
    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs/ai-analysis`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations }),
        signal: controller.signal,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        const requestId = response.headers.get('x-request-id') || json.requestId || 'unavailable';
        console.error('Pig-price AI request failed', { status: response.status, requestId, message: json.message });
        if (response.status === 402 || response.status === 429) {
          throw new Error('AI provider credits or quota are unavailable. Local reference prices remain available; add credits to the configured OpenRouter account, use a funded key, or configure an OpenAI fallback.');
        }
        throw new Error(json.message || 'AI price analysis unavailable');
      }
      setAiAnalysis(json);
      writeCache(cacheKey, json);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setAiAnalysis(null);
      setAiAnalysisError(
        (err.message.includes('API key is not configured') || err.message.includes('No AI provider is configured'))
          ? 'No AI provider is configured on the backend. Add OPENROUTER_API_KEY or OPENAI_API_KEY to the Render backend environment variables, then redeploy.'
          : err.message
      );
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAllData(controller.signal);
    fetchPigPriceBasis(controller.signal);
    return () => controller.abort();
  }, [dateRange]);

  useEffect(() => {
    if (autoAiAnalysisRequested.current || !pigPriceReference || pigPriceLocations.length < 3) return;
    autoAiAnalysisRequested.current = true;
    void requestAiPriceAnalysis(pigPriceLocations);
  }, [pigPriceReference, pigPriceLocations]);

  useEffect(() => {
    const controller = new AbortController();
    setFinancial(null);
    setFinancialError(null);
    const batch = batches.find((row) => row.batch_code === selectedBatch);
    if (selectedBatch !== 'All Batches' && !batch) return () => controller.abort();
    const batchQuery = batch ? `&batch_id=${encodeURIComponent(batch.id)}` : '';
    const financialCacheKey = `analytics-financial:${getUserCacheKey()}:${dateRange}:${batch?.id || 'all'}`;
    const cachedFinancial = readCache(financialCacheKey);
    if (cachedFinancial) setFinancial(cachedFinancial);
    fetch(`${API_BASE}/reports/financial?${getDateQuery()}${batchQuery}`, {
      headers: getAuthHeaders(), signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Financial report unavailable');
      setFinancial(result.data);
      writeCache(financialCacheKey, result.data);
    }).catch((err) => {
      if (err.name !== 'AbortError') setFinancialError('Recorded financial results unavailable. Please refresh.');
    });
    return () => controller.abort();
  }, [dateRange, selectedBatch, batches]);

  useEffect(() => {
    if (pricePoints.length > 0 && !pricePoints.some((point) => point.location === selectedPriceLocation)) {
      setSelectedPriceLocation(pricePoints[0].location);
    }
  }, [pricePoints, selectedPriceLocation]);

  useEffect(() => {
    const selectedPoint = pricePoints.find((point) => point.location === selectedPriceLocation);
    if (!selectedPoint) return;
    localStorage.setItem(`prepapig:${getUserCacheKey()}:selected-price-location`, selectedPoint.location);
    localStorage.setItem(`prepapig:${getUserCacheKey()}:selected-price-per-kg`, String(selectedPoint.pricePhpPerKg));
    window.dispatchEvent(new CustomEvent('prepapig:price-selection-changed', {
      detail: {
        location: selectedPoint.location,
        pricePerKg: Number(selectedPoint.pricePhpPerKg),
      },
    }));
  }, [pricePoints, selectedPriceLocation]);

  useEffect(() => () => aiAbortController.current?.abort(), []);

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


  // ---------- Current-price feed valuation (estimate only) ----------
  const getFeedCost = () => {
    let total = 0;
    filteredFeedRecords.forEach((rec) => {
      const qty = parseFloat(rec.quantity_kg) || 0;
      const price = feedPriceMap.get(rec.feed_type) || 0;
      total += qty * price;
    });
    return Math.round(total * 100) / 100;
  };

  const feedPriceMap = useMemo(() => new Map(feedStock.map((stock) => [stock.feed_type, Number(stock.unit_price) || 0])), [feedStock]);
  const totalFeedCost = useMemo(() => getFeedCost(), [filteredFeedRecords, feedStock]);
  const selectedBatches = selectedBatch === 'All Batches'
    ? batches.filter((b) => b.status?.toLowerCase() === 'active')
    : batches.filter((b) => b.batch_code === selectedBatch && b.status?.toLowerCase() === 'active');
  const referencePrice = Number(pigPriceReference?.pricePhpPerKg);
  const selectedPricePoint = pricePoints.find((point) => point.location === selectedPriceLocation);
  const selectedPrice = Number(selectedPricePoint?.pricePhpPerKg);
  const chosenPrice = selectedPrice > 0 ? selectedPrice : referencePrice;
  const salesRevenue = selectedBatches.reduce((sum, batch) => {
    const recordedPrice = Number(batch.sale_price_per_kg);
    const price = selectedPrice > 0
      ? selectedPrice
      : recordedPrice > 0
        ? recordedPrice
        : referencePrice > 0
          ? referencePrice
          : 0;
    return price > 0 ? sum + (Number(batch.current_weight) || 0) * price : sum;
  }, 0);
  const estimateAvailable = !loading && !error && selectedBatches.length > 0 && selectedBatches.every((batch) => Number(batch.current_weight) > 0 && (selectedPrice > 0 || Number(batch.sale_price_per_kg) > 0 || referencePrice > 0));
  const hasRecordedSalePrice = selectedBatches.some((batch) => Number(batch.sale_price_per_kg) > 0);
  const usesSelectedPrice = selectedPrice > 0 && selectedBatches.length > 0;
  const usesProvincialEstimate = !usesSelectedPrice && !hasRecordedSalePrice && referencePrice > 0 && selectedBatches.length > 0;

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
    const totalDoses = filteredVaccinationRecords.reduce(
      (sum, r) => sum + (Number(r.dosage) || 0),
      0
    );
    const completed = filteredVaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;
    const scheduled = filteredVaccinationRecords.filter(
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
  const profitTrend = financial?.monthly || [];
  const expenseBreakdown = useMemo(() => getExpenseBreakdown(), [filteredExpenses]);
  const vaccinationSummary = useMemo(() => getVaccinationSummary(), [filteredVaccinationRecords]);
  const pricingActionSuggestion = aiAnalysis?.suggestion
    || (pricePoints.length > 0
      ? 'Before selling, compare the buyer\'s liveweight offer with these local reference prices, confirm the price date and unit, and negotiate using the closest verified location rather than a retail price.'
      : 'Wait for a current local price source before setting a selling price; confirm the buyer\'s unit, location, and price date.');

  const handleDownloadReport = (reportName) => {
    const content = [
      `Report: ${reportName}`,
      `Generated: ${new Date().toLocaleString()}`,
      `Date range: ${dateRange}`,
      `Batch: ${selectedBatch}`,
      '',
      `Actual recorded sales: ${financial ? financial.actualRevenue : 'Unavailable'}`,
      `Recorded expenses: ${financial ? financial.recordedExpenses : 'Unavailable'}`,
      `Recorded profit: ${financial ? financial.recordedProfit : 'Unavailable'}`,
      'Basis: Sales minus recorded expenses by transaction date; unrecorded costs excluded.',
      'Month,Recorded sales,Recorded expenses,Recorded profit',
      ...(financial?.monthly || []).map((row) => `${row.month},${row.revenue},${row.expenses},${row.profit}`),
    ].join('\n');
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
    <div className="mobile-screen-shell w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-0">
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
        <div className="flex-1 min-h-0 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="text-xs text-gray-700 font-semibold mb-2">Feed Stock</div>
              <div className="text-2xl font-bold text-gray-900">{totalFeedStock} kg</div>
              <div className="text-xs text-gray-600">Total remaining</div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="text-xs text-gray-700 font-semibold mb-2">Vaccinations</div>
              <div className="text-2xl font-bold text-gray-900">
                {vaccinationSummary.totalDoses} doses
              </div>
              <div className="text-xs text-gray-600">
                {vaccinationSummary.completed} completed ·{' '}
                {vaccinationSummary.scheduled} scheduled
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="text-xs text-gray-700 font-semibold mb-2">Recorded expenses (period)</div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight break-words">
                {financial ? formatCurrency(financial.recordedExpenses) : 'Unavailable'}
              </div>
              <div className="text-xs text-gray-600">
                Feed: {formatCurrency(totalFeedCost)} · Vaccine: Unavailable
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="text-xs text-gray-700 font-semibold mb-2">Batches</div>
              <div className="text-2xl font-bold text-gray-900">
                {selectedBatch === 'All Batches' ? batches.length : 1}
              </div>
              <div className="text-xs text-gray-600">
                {selectedBatch === 'All Batches' ? 'Total batches' : selectedBatch}
              </div>
            </div>
          </div>

          {/* Local Pig Price Sources and OpenAI Analysis */}
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">Local Pig Price Sources</h3>
                <p className="text-xs text-gray-600">AI price analysis loads automatically from the available locations</p>
              </div>
              {aiAnalysisLoading && <span className="text-xs text-purple-700 font-semibold">Analyzing...</span>}
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
            {pricePoints.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-700 font-semibold mb-2">Choose a price for estimated profit</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {pricePoints.slice(0, 3).map((point) => {
                    const isSelected = point.location === selectedPriceLocation;
                    return (
                      <button
                        key={point.location}
                        type="button"
                        onClick={() => setSelectedPriceLocation(point.location)}
                        className={`text-left rounded-xl p-3 border transition-all ${
                          isSelected
                            ? 'bg-green-100/80 border-green-500 ring-2 ring-green-400/40'
                            : 'bg-white/50 border-white/40 hover:bg-white/70'
                        }`}
                      >
                        <div className="text-xs text-gray-600">{point.location}</div>
                        <div className="text-lg font-bold text-green-700">
                          {point.pricePhpPerKg == null ? 'Unavailable' : formatPricePerKg(point.pricePhpPerKg)}
                        </div>
                        <div className="text-[10px] text-gray-500">{point.source}</div>
                        <div className="text-[10px] font-semibold text-gray-700 mt-1">
                          {isSelected ? 'Selected for profit estimate' : 'Select price'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {pigPriceError && <div className="text-xs text-red-600">{pigPriceError}</div>}
            {facebookPriceSources.length > 0 && (
              <div className="text-[10px] text-gray-600 mb-2">
                Facebook public search sources: {facebookPriceSources.map((source) => (
                  <a key={source.location} href={source.url} target="_blank" rel="noreferrer" className="underline mr-2">{source.location}</a>
                ))}
              </div>
            )}
            {aiAnalysisError && <div className="text-xs text-red-600 mt-2">{aiAnalysisError}</div>}
            {aiAnalysis && (
              <div className="bg-purple-100/50 border border-purple-300/50 rounded-xl p-3 mt-3">
                <div className="text-xs font-semibold text-purple-900 mb-2">Detailed AI pricing review</div>
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
            <div className="bg-amber-100/60 border border-amber-300/50 rounded-xl p-3 mt-3">
              <div className="text-xs font-semibold text-amber-900 mb-1">What to do with these prices</div>
              <div className="text-sm text-amber-950">{pricingActionSuggestion}</div>
            </div>
            <div className="text-[10px] text-gray-500 mt-2">AI analysis covers pricing only: observed prices, price range, location comparison, price direction, source quality, and limitations. It does not calculate profit or other financial results.</div>
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
            <h3 className="font-semibold text-gray-900 mb-3">Financial Summary</h3>
            <div className="space-y-2 mb-3 text-sm">
              <div className="flex justify-between"><span>Actual recorded sales (period)</span><strong>{financial ? formatCurrency(financial.actualRevenue) : 'Unavailable'}</strong></div>
              <div className="flex justify-between"><span>Recorded expenses (period)</span><strong>{financial ? formatCurrency(financial.recordedExpenses) : 'Unavailable'}</strong></div>
              <div className="flex justify-between"><span>Recorded profit (period)</span><strong>{financial ? formatCurrency(financial.recordedProfit) : 'Unavailable'}</strong></div>
              <p className="text-xs text-gray-600">Sales minus recorded expenses by transaction date. Unrecorded costs are excluded. Zero sales means no sales recorded for this period.</p>
              {financialError && <p className="text-xs text-red-700">{financialError}</p>}
            </div>
            <p className="text-xs text-gray-600 mb-3">Estimates below use current standing weight of active batches and current prices, not historical revenue. Feed valuation is shown for reference and excluded from recorded profit. Vaccine cost is unavailable without recorded dose costs. Costs entered in expenses may be incomplete.</p>
            <div className="space-y-2 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">Estimated standing pig value (current)</span>
                <span className="font-bold text-green-600">
                  {estimateAvailable ? formatCurrency(salesRevenue) : 'Unavailable'}
                </span>
              </div>
              {usesSelectedPrice && (
                <div className="text-[10px] text-green-700 mb-2">
                  Standing value estimate uses the selected {selectedPriceLocation} price of {formatPricePerKg(chosenPrice)} per kg.
                </div>
              )}
              {usesProvincialEstimate && (
                <div className="text-[10px] text-amber-700 mb-2">
                  Estimated value uses the latest Batangas provincial farmgate reference.
                </div>
              )}
              <div className="border-t border-white/30 pt-2">
                <div className="text-xs text-gray-600 mb-2">Expenses:</div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Feeds (current-price estimate)</span>
                  <span className="text-gray-900">{formatCurrency(totalFeedCost)}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Vaccine cost (dose costs unavailable)</span>
                  <span className="text-gray-900">Unavailable</span>
                </div>
                {expenseBreakdown.length > 0 && (
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 ml-2">Recorded expenses</span>
                    <span className="text-gray-900">
                      {formatCurrency(
                        filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-white/30 pt-2 mt-2">
                  <span className="text-gray-900">Recorded expenses (period)</span>
                  <span className="text-red-600">{financial ? formatCurrency(financial.recordedExpenses) : 'Unavailable'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-green-100/60 rounded-lg p-3 mt-3">
                <span className="font-bold text-gray-900">Estimated value less recorded costs</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    {estimateAvailable && financial ? formatCurrency(salesRevenue - financial.recordedExpenses) : 'Unavailable'}
                  </div>
                  <span className="px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-semibold">
                    {estimateAvailable
                      ? 'Estimate only'
                      : 'Estimate unavailable'}
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
              <div className="text-sm font-semibold text-gray-900 mb-2">Monthly Recorded Profit</div>
              {profitTrend.length === 0 && <p className="text-xs text-gray-600">{financial ? 'No dated sales or expenses recorded in this period.' : 'Recorded monthly results unavailable.'}</p>}
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

        </div>

        <BottomNav active="Reports" />
      </div>
    </div>
  );
}