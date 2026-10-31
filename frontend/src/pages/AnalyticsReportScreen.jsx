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
  MapPin,
  Radio,
  Sparkles,
  RefreshCw,

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
  { location: 'Lemery', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Calaca', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Tuy', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Balayan', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Lian', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Nasugbu', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
  { location: 'Taal', pricePhpPerKg: null, unit: 'PHP/kg liveweight', source: 'Search unavailable', status: 'unavailable' },
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
  const [feedForecast, setFeedForecast] = useState(null);
  const [feedForecastError, setFeedForecastError] = useState(null);
  const [feedForecastAi, setFeedForecastAi] = useState(null);
  const [feedForecastAiError, setFeedForecastAiError] = useState(null);
  const [expenseAiAnalysis, setExpenseAiAnalysis] = useState(null);
  const [expenseAiLoading, setExpenseAiLoading] = useState(false);
  const [expenseAiError, setExpenseAiError] = useState(null);
  const [pigPriceLocations, setPigPriceLocations] = useState(DEFAULT_PRICE_POINTS.map((point) => point.location));
  const [pigPriceReference, setPigPriceReference] = useState(null);
  const [priceSources, setPriceSources] = useState([]);
  const [pricePoints, setPricePoints] = useState(DEFAULT_PRICE_POINTS);
  const [selectedPriceLocation, setSelectedPriceLocation] = useState(() => (
    localStorage.getItem(`prepapig:${getUserCacheKey()}:selected-price-location`) || null
  ));

  const [pigPriceError, setPigPriceError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState(null);
  const [marketRefreshLoading, setMarketRefreshLoading] = useState(false);
  const [marketRefreshError, setMarketRefreshError] = useState(null);
  const [marketHistory, setMarketHistory] = useState([]);
  const [marketForecast, setMarketForecast] = useState(null);

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

  const fetchFeedForecast = async (signal) => {
    try {
      const batch = selectedBatch !== 'All Batches' ? batches.find((row) => row.batch_code === selectedBatch) : null;
      const batchId = batch?.batch_code || 'all';
      const cacheKey = `feed-ai-analysis-v1:${getUserCacheKey()}:${batchId}:1`;
      const cached = readCache(cacheKey);
      if (cached && typeof cached === 'object') {
        setFeedForecast(cached);
        setFeedForecastAi(cached.aiAnalysis || null);
        setFeedForecastAiError(cached.aiAnalysisError || null);
        setFeedForecastError(null);
        return;
      }
      const response = await fetch(`${API_BASE}/feeds/forecast?source=uploaded_historical&batch_id=${encodeURIComponent(batchId)}&horizon_weeks=1&include_ai=true`, {
        headers: getAuthHeaders(), signal,
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || 'Feed forecast unavailable');
      setFeedForecast(json);
      setFeedForecastAi(json.aiAnalysis || null);
      setFeedForecastAiError(json.aiAnalysisError || null);
      setFeedForecastError(null);
      writeCache(cacheKey, json);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setFeedForecast(null);
      setFeedForecastError(err.message || 'Uploaded feed forecast unavailable');
    }
  };

  // ---------- Fetch pig price basis for analysis ----------
  const fetchPigPriceBasis = async (signal) => {
    const cacheKey = `pig-price-basis-v2:${getUserCacheKey()}`;
    const cached = readCache(cacheKey, 15 * 60 * 1000);
    const hasCachedBasis = Boolean(cached && typeof cached === 'object');

    if (hasCachedBasis) {
      setPigPriceLocations(cached.priceSourceLocations || DEFAULT_PRICE_POINTS.map((point) => point.location));
      setPigPriceReference(cached.data || null);
      setPricePoints(cached.pricePoints?.length ? cached.pricePoints : DEFAULT_PRICE_POINTS);
      setPriceSources(cached.priceSources || []);
      setPigPriceError(null);
    }

    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Pig price unavailable');
      const nextBasis = {
        priceSourceLocations: json.priceSourceLocations || [],
        data: json.data || null,
        pricePoints: json.pricePoints?.length ? json.pricePoints : DEFAULT_PRICE_POINTS,
        priceSources: json.priceSources || [],
      };
      setPigPriceLocations(nextBasis.priceSourceLocations);
      setPigPriceReference(nextBasis.data);
      setPricePoints(nextBasis.pricePoints);
      setPriceSources(nextBasis.priceSources);
      setPigPriceError(null);
      writeCache(cacheKey, nextBasis);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Error loading pig price basis:', err);
      if (!hasCachedBasis) {
        setPigPriceLocations(DEFAULT_PRICE_POINTS.map((point) => point.location));
        setPigPriceReference(null);
        setPricePoints(DEFAULT_PRICE_POINTS);
        setPriceSources([]);
      }
      setPigPriceError(hasCachedBasis ? 'Using cached prices; live refresh unavailable' : 'Price sources unavailable');
    }
  };

  const requestAiPriceAnalysis = async (locations = pigPriceLocations, { bypassCache = false } = {}) => {
    if (!Array.isArray(locations) || locations.length < 3) return;

    const cacheKey = `price-ai-analysis-v4:${getUserCacheKey()}:${locations.join('|')}`;
    const cachedAnalysis = readCache(cacheKey);
    if (cachedAnalysis && !bypassCache) {
      setAiAnalysis(cachedAnalysis);
      if (Array.isArray(cachedAnalysis.pricePoints) && cachedAnalysis.pricePoints.length > 0) {
        setPricePoints(cachedAnalysis.pricePoints);
      }
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
      if (Array.isArray(json.pricePoints) && json.pricePoints.length > 0) {
        setPricePoints(json.pricePoints);
      }
      writeCache(cacheKey, json);
    } catch (err) {
      if (err.name === 'AbortError') return;
      const fallbackPoints = (pricePoints.length > 0 ? pricePoints : DEFAULT_PRICE_POINTS)
        .filter((point) => locations.includes(point.location) || !locations.length);
      setAiAnalysis({
        success: true,
        provider: 'local-reference-fallback',
        model: null,
        locations,
        pricePoints: fallbackPoints,
        analysis: 'AI analysis is temporarily unavailable. No hardcoded local price is being used; available values will appear only after the configured search provider returns a verified result.',
        suggestion: 'Retry the search or confirm the buyer\'s liveweight offer directly before selling.',
        limitations: ['Gemini could not be reached from the deployed application.', 'No local price is displayed without a search result or verified source.'],
        generatedAt: new Date().toISOString(),
      });
      setAiAnalysisError(null);
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  const fetchMarketHistory = async (locations = pigPriceLocations) => {
    try {
      const response = await fetch(`${API_BASE}/market-prices/history?locations=${encodeURIComponent(locations.join(','))}`, {
        headers: getAuthHeaders(),
      });
      if (!response.ok) return;
      const json = await response.json();
      setMarketHistory(json.rows || []);
      const forecastResponse = await fetch(`${API_BASE}/market-prices/forecast?locations=${encodeURIComponent(locations.join(','))}&horizon_weeks=4`, {
        headers: getAuthHeaders(),
      });
      if (forecastResponse.ok) {
        const forecastJson = await forecastResponse.json();
        setMarketForecast(forecastJson);
      }
    } catch (err) {
      console.warn('Market price history unavailable:', err.message);
    }
  };

  const refreshMarketPrices = async () => {
    setMarketRefreshLoading(true);
    setMarketRefreshError(null);
    try {
      const response = await fetch(`${API_BASE}/market-prices/refresh`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: pigPriceLocations }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || 'Market price refresh failed');
      setPricePoints(json.pricePoints?.length ? json.pricePoints : DEFAULT_PRICE_POINTS);
      await requestAiPriceAnalysis(pigPriceLocations, { bypassCache: true });
      await fetchMarketHistory(pigPriceLocations);
    } catch (err) {
      setMarketRefreshError(err.message || 'Market price refresh failed');
    } finally {
      setMarketRefreshLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchAllData(controller.signal);
    fetchPigPriceBasis(controller.signal);
    void fetchMarketHistory();
    return () => controller.abort();
  }, [dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchFeedForecast(controller.signal);
    return () => controller.abort();
  }, [selectedBatch, batches]);

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
      setFinancialError(result.data.salesAvailable === false
        ? 'Recorded sales are unavailable because the harvest sales ledger is not accessible. Apply the financial migrations in Supabase SQL Editor.'
        : null);
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
  const feedConsumptionData = useMemo(() => {
    if (!feedForecast) return getFeedConsumptionData();
    const historical = (feedForecast.history || []).map((row) => ({
      date: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: row.quantityKg,
    }));
    const forecast = (feedForecast.forecast || []).map((row) => ({
      date: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      forecast: row.predictedKg,
      lower: row.lowerKg,
      upper: row.upperKg,
    }));
    return [...historical, ...forecast];
  }, [filteredFeedRecords, feedForecast]);
  const profitTrend = financial?.monthly || [];
  const expenseBreakdown = useMemo(() => getExpenseBreakdown(), [filteredExpenses]);
  const vaccinationSummary = useMemo(() => getVaccinationSummary(), [filteredVaccinationRecords]);
  useEffect(() => {
    if (filteredExpenses.length === 0) {
      setExpenseAiAnalysis(null);
      setExpenseAiError(null);
      return undefined;
    }
    const breakdown = expenseBreakdown.map(({ name, value }) => ({ name, amount: value, percentage: Math.round((value / filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0)) * 100) }));
    const summary = {
      dateRange,
      selectedBatch,
      totalRecordedExpenses: Math.round(filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0) * 100) / 100,
      breakdown,
      recordCount: filteredExpenses.length,
    };
    const cacheKey = `expense-ai-analysis-v2:${getUserCacheKey()}:${dateRange}:${selectedBatch}:${summary.totalRecordedExpenses}:${summary.recordCount}:${JSON.stringify(breakdown)}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setExpenseAiAnalysis(cached);
      setExpenseAiError(null);
      return undefined;
    }
    const controller = new AbortController();
    setExpenseAiLoading(true);
    setExpenseAiError(null);
    fetch(`${API_BASE}/expenses/ai-analysis`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
      signal: controller.signal,
    }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || 'Expense AI analysis unavailable');
      setExpenseAiAnalysis(json);
      writeCache(cacheKey, json);
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        setExpenseAiAnalysis(null);
        setExpenseAiError(err.message || 'Expense AI analysis unavailable');
      }
    }).finally(() => setExpenseAiLoading(false));
    return () => controller.abort();
  }, [filteredExpenses, expenseBreakdown, dateRange, selectedBatch]);
  const pricingActionSuggestion = aiAnalysis?.suggestion
    || (pricePoints.length > 0
      ? 'Before selling, compare the buyer\'s liveweight offer with these local reference prices, confirm the price date and unit, and negotiate using the closest verified location rather than a retail price.'
      : 'Wait for a current local price source before setting a selling price; confirm the buyer\'s unit, location, and price date.');
  const livePricePoints = useMemo(
    () => pricePoints.filter((point) => Number.isFinite(Number(point.pricePhpPerKg))),
    [pricePoints]
  );
  const highestLivePrice = useMemo(
    () => livePricePoints.reduce((best, point) => (
      !best || Number(point.pricePhpPerKg) > Number(best.pricePhpPerKg) ? point : best
    ), null),
    [livePricePoints]
  );
  const priceUpdatedLabel = aiAnalysis?.generatedAt
    ? `updated ${new Date(aiAnalysis.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'waiting for web search';

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
    <div className="dashboard-theme mobile-screen-shell w-full relative overflow-hidden flex flex-col">
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

          {/* Live web pig price analysis */}
          <div className="bg-white/45 backdrop-blur-xl rounded-[1.75rem] border border-white/60 p-4 shadow-lg mb-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">Live Hog Price Analysis</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    <Radio size={10} /> {aiAnalysisLoading ? 'Updating' : livePricePoints.length > 0 ? 'Live' : 'Search'}
                  </span>
                </div>
                <p className="text-xs text-gray-600">Facebook public listings for farmgate prices per kg across nearby markets</p>

              </div>
              <button
                type="button"
                onClick={refreshMarketPrices}
                disabled={marketRefreshLoading || aiAnalysisLoading}
                className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-bold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={13} className={marketRefreshLoading ? 'animate-spin' : ''} />
                {marketRefreshLoading ? 'Refreshing' : 'Refresh prices'}
              </button>
            </div>
            <div className="space-y-2">
              {pricePoints.map((point) => {
                const isSelected = point.location === selectedPriceLocation;
                const isHighest = highestLivePrice?.location === point.location;
                return (
                  <button
                    key={point.location}
                    type="button"
                    onClick={() => point.pricePhpPerKg != null && setSelectedPriceLocation(point.location)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-violet-300 bg-violet-50/80 ring-2 ring-violet-200'
                        : 'border-white/70 bg-white/65 hover:bg-white/85'
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500">
                      <MapPin size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-900">
                        {point.location}
                        {isHighest && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">BEST FOUND</span>}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-gray-500">
                        {point.pricePhpPerKg == null ? point.source || 'No qualifying public Facebook result' : `${point.unit || 'PHP/kg liveweight'} · ${point.period || priceUpdatedLabel}`}
                      </span>
                      {point.sourceUrl && point.sourceUrl !== 'unavailable' && (
                        <a href={point.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[10px] text-violet-600 underline" onClick={(event) => event.stopPropagation()}>
                          Source: {point.source || 'Open source'}
                        </a>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-lg font-bold ${point.pricePhpPerKg == null ? 'text-gray-400' : 'text-gray-900'}`}>
                        {point.pricePhpPerKg == null ? '—' : formatPricePerKg(point.pricePhpPerKg)}
                      </span>
                      <span className="block text-[10px] text-emerald-600">{point.pricePhpPerKg == null ? 'unavailable' : 'per kg'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {priceSources.length > 0 && (
              <div className="mt-3 border-t border-white/40 pt-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Other price sources</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {priceSources.slice(0, 8).map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-violet-600 underline">
                      {source.title || source.url}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {pigPriceReference && (
              <div className="mt-3 text-[10px] text-gray-500">Provincial reference: {formatPricePerKg(pigPriceReference.pricePhpPerKg)} ({pigPriceReference.period}); not a municipality-specific quote.</div>
            )}
            {pigPriceError && <div className="mt-2 text-xs text-red-600">{pigPriceError}</div>}
            {marketRefreshError && <div className="mt-2 text-xs text-red-600">{marketRefreshError}</div>}
            {aiAnalysisError && <div className="mt-2 text-xs text-red-600">{aiAnalysisError}</div>}
            {aiAnalysis && (
              <div className="mt-4 rounded-[1.5rem] border border-[#D8D4FF] bg-white/90 p-5 shadow-[0_12px_28px_rgba(108,99,255,0.12)]">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold leading-tight text-[#4C43C7]">
                  <Sparkles size={16} />
                  <span>PrepAPig AI<br />recommendation</span>
                </div>
                <h4 className="max-w-sm text-lg font-extrabold leading-snug text-gray-900">
                  {highestLivePrice
                    ? `${highestLivePrice.location} has the strongest verified price point at ${formatPricePerKg(highestLivePrice.pricePhpPerKg)}.`
                    : 'A verified live market recommendation is not available yet.'}
                </h4>
                <p className="mt-3 max-w-2xl text-left text-sm leading-7 text-gray-700">
                  {aiAnalysis.suggestion || aiAnalysis.analysis || pricingActionSuggestion}
                </p>
                {aiAnalysis.analysis && aiAnalysis.suggestion && (
                  <p className="mt-3 max-w-2xl text-left text-sm leading-7 text-gray-600">{aiAnalysis.analysis}</p>
                )}
                {highestLivePrice && selectedPriceLocation && selectedPriceLocation !== highestLivePrice.location && (
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-[#4C43C7]">
                    {selectedPriceLocation} is currently selected. Compare it with the recommended market before selling.
                  </p>
                )}
                {aiAnalysis.sources?.length > 0 && (
                  <p className="mt-3 text-[10px] text-gray-500">Web sources checked: {aiAnalysis.sources.length}</p>
                )}
                {highestLivePrice && (
                  <button
                    type="button"
                    onClick={() => setSelectedPriceLocation(highestLivePrice.location)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-transparent py-2 text-sm font-bold text-violet-600 transition hover:bg-violet-100/70"
                  >
                    Use recommended market <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            )}
            <div className="mt-3 text-[10px] text-gray-500">Prices come from public web search or the provincial source. Confirm the posting date, location, liveweight basis, and buyer offer before selling.</div>
            {marketHistory.length > 1 && (
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/55 p-3">
                <div className="mb-2 text-xs font-semibold text-gray-800">Historical observed prices</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={marketHistory.slice(0, 90).map((row) => ({
                    date: row.observed_date || row.retrieved_at?.slice(0, 10),
                    price: Number(row.price_average),
                  })).filter((row) => Number.isFinite(row.price)).reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: 'PHP/kg', angle: -90, position: 'insideLeft', style: { fontSize: 9 } }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="price" stroke="#7C3AED" strokeWidth={2} dot={false} name="Observed price" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="text-[10px] text-gray-500">Observed records only. Missing dates are not interpolated.</div>
              </div>
            )}
            {marketForecast?.results?.some((result) => result.status === 'forecasted') && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="mb-2 text-xs font-semibold text-amber-900">4-week statistical price forecast</div>
                <div className="space-y-2">
                  {marketForecast.results.filter((result) => result.status === 'forecasted').map((result) => (
                    <div key={result.municipality} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-gray-900">{result.municipality}</div>
                        <div className="text-[10px] text-gray-500">MAE ₱{result.evaluation?.meanAbsoluteErrorPhpPerKg ?? '—'}/kg · {result.historyPoints} observations</div>
                      </div>
                      <div className="text-right text-sm font-bold text-amber-800">
                        {result.forecast?.[0] ? formatPricePerKg(result.forecast[0].predictedPricePhpPerKg) : '—'}
                        <div className="text-[10px] font-normal text-amber-700">{result.forecast?.[0]?.weekStart || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-gray-500">Forecasts require at least eight dated observations and are not guaranteed buyer quotes.</div>
              </div>
            )}
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
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={{ fill: '#7C3AED', r: 3 }}
                    name="Forecast"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {feedForecastError && <p className="text-[10px] text-red-700 mb-2">{feedForecastError}</p>}

            {feedForecastAi && (
              <div className="bg-white/90 border border-[#D8D4FF] rounded-xl p-4 mb-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-2"><span className="text-sm font-bold text-[#4C43C7]">AI Forecast Analysis</span><span className="text-[10px] uppercase font-bold text-[#5D55E9]">{feedForecastAi.riskLevel || 'unknown'} risk</span></div>
                <p className="text-left text-sm leading-6 text-[#252838] mb-3">{feedForecastAi.analysis}</p>
                <p className="text-left text-sm leading-6 text-[#252838]"><strong className="text-[#4C43C7]">Suggestion:</strong> {feedForecastAi.suggestion}</p>
                {feedForecastAi.stockContext && <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] text-[#555B6E]"><span>Stock: <strong>{feedForecastAi.stockContext.totalStockKg} kg</strong></span><span>1-week need: <strong>{feedForecastAi.stockContext.forecastKg} kg</strong></span><span>Coverage: <strong>{feedForecastAi.stockContext.coverageWeeks == null ? '—' : `${feedForecastAi.stockContext.coverageWeeks} wk`}</strong></span></div>}
                {feedForecastAi.stockContext?.projectedShortfallKg > 0 && <p className="text-[10px] text-red-700 mt-2">Projected stock shortfall: {feedForecastAi.stockContext.projectedShortfallKg} kg.</p>}
                {feedForecastAi.actions?.length > 0 && <ul className="list-disc pl-4 mt-3 text-[10px] text-[#555B6E]">{feedForecastAi.actions.map((action) => <li key={action}>{action}</li>)}</ul>}
                <p className="text-[10px] text-[#6B7280] mt-3">AI interpretation only; it does not replace recorded feed, inventory, expense, financial, or FCR calculations.</p>
              </div>
            )}
            {feedForecastAiError && <p className="text-[10px] text-amber-800 mb-2">AI suggestion unavailable: {feedForecastAiError}</p>}
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

            <div className="rounded-xl border border-[#D8D4FF] bg-white/90 p-4 mb-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-[#4C43C7] mb-2"><Sparkles size={14} /> AI Expense Analysis</div>
              {expenseAiLoading && <p className="text-sm text-[#555B6E]">Analyzing recorded expense categories...</p>}
              {expenseAiError && <p className="text-xs text-red-700">{expenseAiError}</p>}
              {!expenseAiLoading && !expenseAiError && expenseAiAnalysis && (
                <>
                  <p className="text-left text-sm leading-6 text-[#252838]">{expenseAiAnalysis.analysis}</p>
                  <p className="text-left text-sm leading-6 text-[#252838] mt-3"><strong className="text-[#4C43C7]">Suggestion:</strong> {expenseAiAnalysis.suggestion}</p>
                  {expenseAiAnalysis.actions?.length > 0 && <ul className="list-disc pl-4 mt-3 text-[10px] text-[#555B6E]">{expenseAiAnalysis.actions.map((action) => <li key={action}>{action}</li>)}</ul>}
                  {expenseAiAnalysis.limitations?.length > 0 && <p className="text-[10px] text-[#6B7280] mt-3">{expenseAiAnalysis.limitations.join(' ')}</p>}
                </>
              )}
              {!expenseAiLoading && !expenseAiError && !expenseAiAnalysis && <p className="text-sm text-[#555B6E]">No recorded expenses are available for this filter.</p>}
              <p className="text-[10px] text-[#6B7280] mt-3">AI interpretation is advisory and uses recorded expense categories only; it does not create or modify expense records.</p>
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