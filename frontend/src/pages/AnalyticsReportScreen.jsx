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
  Legend,
  ReferenceLine,
  ErrorBar,
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
import { buildBatchDisplayNames } from '../utils/batchNames.js';
import useOfflineStatus from '../hooks/useOfflineStatus.js';
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

const getEstimatedBatchTotalWeightKg = (batch, weightTotals) => {
  const totalWeight = Number(weightTotals[String(batch?.id)]);
  return Number.isFinite(totalWeight) && totalWeight > 0 ? totalWeight : 0;
};

export default function AnalyticsReportsScreen() {
  const navigate = useNavigate();
  const { isOnline } = useOfflineStatus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data state
  const [batches, setBatches] = useState([]);
  const [batchTotalWeights, setBatchTotalWeights] = useState({});
  const [batchWeightLoading, setBatchWeightLoading] = useState(false);
  const [batchWeightError, setBatchWeightError] = useState(null);
  const [sales, setSales] = useState([]);
  const [soldReportBatches, setSoldReportBatches] = useState([]);
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
  const [profitAiResult, setProfitAiResult] = useState(null);
  const [profitAiLoading, setProfitAiLoading] = useState(false);
  const [profitAiError, setProfitAiError] = useState(null);
  const [pigPriceLocations, setPigPriceLocations] = useState(DEFAULT_PRICE_POINTS.map((point) => point.location));
  const [pigPriceReference, setPigPriceReference] = useState(null);

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
  const batchDisplayNames = buildBatchDisplayNames(batches);
  const selectedBatchLabel = selectedBatch === 'All Batches'
    ? selectedBatch
    : batchDisplayNames.get(String(batches.find((batch) => batch.batch_code === selectedBatch)?.id)) || 'Batch';
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

  // ---------- Fetch report data and supporting records ----------
  const fetchAllData = async (signal) => {
    const cacheKey = `analytics:${getUserCacheKey()}:${dateRange}`;
    const cached = null; // Reports must always reflect the latest sold-batch records.
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
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Failed to load analytics');
      const data = json.data || {};
      const [batchesResponse, salesResponse, soldResponse] = await Promise.all([
        fetch(`${API_BASE}/pigs/all?all=true`, { headers: getAuthHeaders(), signal, cache: 'no-store' }),
        fetch(`${API_BASE}/sales`, { headers: getAuthHeaders(), signal, cache: 'no-store' }),
        fetch(`${API_BASE}/reports/sold-batches`, { headers: getAuthHeaders(), signal, cache: 'no-store' }),
      ]);
      const [batchesJson, salesJson, soldJson] = await Promise.all([
        batchesResponse.json(),
        salesResponse.json(),
        soldResponse.json(),
      ]);
      if (!batchesResponse.ok || !batchesJson.success) throw new Error(batchesJson.message || 'Failed to load batches');
      if (!salesResponse.ok || !salesJson.success) throw new Error(salesJson.message || 'Failed to load sales');
      const recordedSaleIds = new Set((salesJson.data || [])
        .filter((sale) => Boolean(sale.batch_id))
        .map((sale) => String(sale.batch_id)));
      const latestBatches = batchesJson.data || [];
      const fallbackSoldBatches = latestBatches.filter((batch) => String(batch.status || '').trim().toLowerCase() === 'sold' || recordedSaleIds.has(String(batch.id)));
      const endpointSoldBatches = soldResponse.ok && soldJson.success ? soldJson.data || [] : [];
      const soldById = new Map([...endpointSoldBatches, ...fallbackSoldBatches].map((batch) => [String(batch.id), batch]));
      setSoldReportBatches([...soldById.values()]);
      setBatches(latestBatches);
      setSales(salesJson.data || []);
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

  useEffect(() => {
    if (batches.length === 0) {
      setBatchTotalWeights({});
      setBatchWeightError(null);
      setBatchWeightLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setBatchWeightLoading(true);
    setBatchWeightError(null);
    fetch(`${API_BASE}/reports/batch-weight-summary`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || 'Total batch weight data is unavailable.');
      }
      return result.data;
    }).then((rows) => {
      setBatchTotalWeights(Object.fromEntries(rows.map((row) => [String(row.batch_id), row.total_weight_kg])));
    }).catch((err) => {
      if (err.name === 'AbortError') return;
      setBatchTotalWeights({});
      setBatchWeightError('Total batch weights are unavailable. Refresh to try again.');
    }).finally(() => {
      if (!controller.signal.aborted) setBatchWeightLoading(false);
    });
    return () => controller.abort();
  }, [batches]);

  const fetchFeedForecast = async (signal) => {
    let hasCachedForecast = false;
    try {
      const batch = selectedBatch !== 'All Batches' ? batches.find((row) => row.batch_code === selectedBatch) : null;
      const batchId = batch?.batch_code || 'all';
      const cacheKey = `feed-ai-analysis-v3:${getUserCacheKey()}:${batchId}:1`;
      const cached = readCache(cacheKey, Number.POSITIVE_INFINITY);
      hasCachedForecast = Boolean(cached && typeof cached === 'object');
      if (cached && typeof cached === 'object') {
        setFeedForecast(cached);
        setFeedForecastAi(cached.aiAnalysis || null);
        setFeedForecastAiError(cached.aiAnalysisError || null);
        setFeedForecastError(null);
      }
      const response = await fetch(`${API_BASE}/feeds/forecast?source=uploaded_historical&batch_id=${encodeURIComponent(batchId)}&horizon_weeks=1&include_ai=true`, {
        cache: 'no-store',
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
      if (!hasCachedForecast) {
        setFeedForecast(null);
        setFeedForecastError(err.message || 'Uploaded feed forecast unavailable');
      }
    }
  };

  // ---------- Fetch pig price basis for analysis ----------
  const fetchPigPriceBasis = async (signal) => {
    const cacheKey = `pig-price-basis-v2:${getUserCacheKey()}`;
    // Render the last successful price basis immediately, then refresh it in the background.
    // The live request below still runs on every mount/date-range refresh.
    const cached = readCache(cacheKey, Number.POSITIVE_INFINITY);
    const hasCachedBasis = Boolean(cached && typeof cached === 'object');

    if (hasCachedBasis) {
      setPigPriceLocations(cached.priceSourceLocations || DEFAULT_PRICE_POINTS.map((point) => point.location));
      setPigPriceReference(cached.data || null);
      setPricePoints(cached.pricePoints?.length ? cached.pricePoints : DEFAULT_PRICE_POINTS);

      setPigPriceError(null);
    }

    try {
      const response = await fetch(`${API_BASE}/market-prices/pigs`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success) throw new Error(json.message || 'Pig price unavailable');
      const nextBasis = {
        priceSourceLocations: json.priceSourceLocations || [],
        data: json.data || null,
        pricePoints: json.pricePoints?.length ? json.pricePoints : DEFAULT_PRICE_POINTS,

      };
      setPigPriceLocations(nextBasis.priceSourceLocations);
      setPigPriceReference(nextBasis.data);
      setPricePoints(nextBasis.pricePoints);

      setPigPriceError(null);
      writeCache(cacheKey, nextBasis);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Error loading pig price basis:', err);
      if (!hasCachedBasis) {
        setPigPriceLocations(DEFAULT_PRICE_POINTS.map((point) => point.location));
        setPigPriceReference(null);
        setPricePoints(DEFAULT_PRICE_POINTS);

      }
      setPigPriceError(hasCachedBasis ? 'Using cached prices; live refresh unavailable' : 'Price sources unavailable');
    }
  };

  const requestAiPriceAnalysis = async (locations = pigPriceLocations, { bypassCache = false } = {}) => {
    if (!Array.isArray(locations) || locations.length < 3) return;

    const cacheKey = `price-ai-analysis-v5:${getUserCacheKey()}:${locations.join('|')}`;
    const cachedAnalysis = readCache(cacheKey, Number.POSITIVE_INFINITY);
    const hasCachedPriceAnalysis = Boolean(cachedAnalysis && !bypassCache);
    if (cachedAnalysis && !bypassCache) {
      setAiAnalysis(cachedAnalysis);
      if (Array.isArray(cachedAnalysis.pricePoints) && cachedAnalysis.pricePoints.length > 0) {
        setPricePoints(cachedAnalysis.pricePoints);
      }
      setAiAnalysisError(null);
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
        cache: 'no-store',
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
      if (hasCachedPriceAnalysis) {
        setAiAnalysisError('Using the previous live hog price analysis; a fresh update was unavailable.');
        return;
      }
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
    const refreshReportsWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const controller = new AbortController();
      void fetchAllData(controller.signal);
      window.setTimeout(() => controller.abort(), 15000);
    };
    window.addEventListener('visibilitychange', refreshReportsWhenVisible);
    window.addEventListener('focus', refreshReportsWhenVisible);
    return () => {
      window.removeEventListener('visibilitychange', refreshReportsWhenVisible);
      window.removeEventListener('focus', refreshReportsWhenVisible);
    };
  }, [dateRange]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchFeedForecast(controller.signal);
    return () => controller.abort();
  }, [selectedBatch, batches]);

  useEffect(() => {
    if (autoAiAnalysisRequested.current || !pigPriceReference || pigPriceLocations.length < 3) return;
    autoAiAnalysisRequested.current = true;
    void requestAiPriceAnalysis(pigPriceLocations, { bypassCache: true });
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


  // Usage records use immutable transaction-time prices. Legacy rows without a snapshot are not revalued.
  const getFeedCost = () => {
    let total = 0;
    filteredFeedRecords.forEach((rec) => {
      const qty = Number(rec.quantity_kg);
      const priceAtUsage = Number(rec.unit_price_at_usage);
      if (Number.isFinite(qty) && qty >= 0 && Number.isFinite(priceAtUsage) && priceAtUsage >= 0) {
        total += qty * priceAtUsage;
      }
    });
    return Math.round(total * 100) / 100;
  };
  const totalFeedCost = useMemo(() => getFeedCost(), [filteredFeedRecords]);
  const totalVaccineCost = useMemo(() => filteredVaccinationRecords.reduce((total, record) => {
    const dosage = Number(record.dosage);
    const priceAtUsage = Number(record.price_per_dose_at_usage);
    return Number.isFinite(dosage) && dosage >= 0 && Number.isFinite(priceAtUsage) && priceAtUsage >= 0
      ? total + dosage * priceAtUsage
      : total;
  }, 0), [filteredVaccinationRecords]);
  const totalRecordedCosts = financial
    ? Math.round((Number(financial.recordedExpenses || 0) + totalFeedCost + totalVaccineCost) * 100) / 100
    : null;
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
    return price > 0 ? sum + getEstimatedBatchTotalWeightKg(batch, batchTotalWeights) * price : sum;
  }, 0);
  const estimateAvailable = !loading && !error && !batchWeightLoading && !batchWeightError && selectedBatches.length > 0 && selectedBatches.every((batch) => getEstimatedBatchTotalWeightKg(batch, batchTotalWeights) > 0 && (selectedPrice > 0 || Number(batch.sale_price_per_kg) > 0 || referencePrice > 0));
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
  const feedHistoryLabel = feedForecast?.dataType === 'uploaded_historical_feed_usage' ? 'Synthetic history' : 'Recorded';
  const feedConsumptionData = useMemo(() => {
    if (!feedForecast) return getFeedConsumptionData();
    const historical = (feedForecast.history || []).map((row) => ({
      date: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: row.quantityKg,
      period: feedHistoryLabel,
    }));
    const forecast = (feedForecast.forecast || []).map((row) => ({
      date: new Date(`${row.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      forecast: row.predictedKg,
      lower: row.lowerKg,
      upper: row.upperKg,
      errorRange: [Math.max(0, row.upperKg - row.predictedKg), Math.max(0, row.predictedKg - row.lowerKg)],
      period: 'Forecast',
    }));
    return [...historical, ...forecast];
  }, [filteredFeedRecords, feedForecast, feedHistoryLabel]);
  const forecastStartDate = feedConsumptionData.find((point) => point.period === 'Forecast')?.date;
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
    const cacheKey = `expense-ai-analysis-v3:${getUserCacheKey()}:${dateRange}:${selectedBatch}:${summary.totalRecordedExpenses}:${summary.recordCount}:${JSON.stringify(breakdown)}`;
    const cached = readCache(cacheKey, Number.POSITIVE_INFINITY);
    if (cached) {
      setExpenseAiAnalysis(cached);
      setExpenseAiError(null);
    }
    const hasCachedExpenseAnalysis = Boolean(cached);
    const controller = new AbortController();
    setExpenseAiLoading(true);
    setExpenseAiError(null);
    fetch(`${API_BASE}/expenses/ai-analysis`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ summary }),
      signal: controller.signal,
    }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || 'Expense AI analysis unavailable');
      setExpenseAiAnalysis(json);
      writeCache(cacheKey, json);
    }).catch((err) => {
      if (err.name !== 'AbortError') {
        if (!hasCachedExpenseAnalysis) {
          setExpenseAiAnalysis(null);
          setExpenseAiError(err.message || 'Expense AI analysis unavailable');
        }
      }
    }).finally(() => setExpenseAiLoading(false));
    return () => controller.abort();
  }, [filteredExpenses, expenseBreakdown, dateRange, selectedBatch]);

  useEffect(() => {
    if (loading || error || batchWeightLoading) {
      setProfitAiResult(null);
      setProfitAiLoading(false);
      return undefined;
    }
    const selectedBatchRow = selectedBatch === 'All Batches'
      ? null
      : batches.find((row) => row.batch_code === selectedBatch);
    if (selectedBatch !== 'All Batches' && !selectedBatchRow) {
      setProfitAiResult(null);
      setProfitAiLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setProfitAiResult(null);
    setProfitAiError(null);
    setProfitAiLoading(true);
    const query = new URLSearchParams(getDateQuery());
    if (selectedBatchRow?.id) query.set('batch_id', selectedBatchRow.id);
    const selectedPriceForAnalysis = Number(selectedPrice) > 0 ? Number(selectedPrice) : null;
    const referencePriceForAnalysis = Number(referencePrice) > 0 ? Number(referencePrice) : null;
    fetch(`${API_BASE}/reports/ai-profit-analysis`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        from: query.get('from'),
        to: query.get('to'),
        batch_id: selectedBatchRow?.id || null,
        selected_price_per_kg: selectedPriceForAnalysis,
        reference_price_per_kg: referencePriceForAnalysis,
        price_source: selectedPriceForAnalysis ? selectedPriceLocation : referencePriceForAnalysis ? 'Batangas provincial farmgate reference' : null,
      }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'AI estimated-profit analysis unavailable');
      if (!controller.signal.aborted) {
        setProfitAiResult(result);
        setProfitAiError(result.aiAnalysisError || null);
      }
    }).catch((requestError) => {
      if (!controller.signal.aborted) setProfitAiError(requestError.message || 'AI estimated-profit analysis unavailable');
    }).finally(() => {
      if (!controller.signal.aborted) setProfitAiLoading(false);
    });
    return () => controller.abort();
  }, [loading, error, batchWeightLoading, batches, selectedBatch, dateRange, selectedPrice, selectedPriceLocation, referencePrice]);

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

  const handleDownloadProfitReport = async (batchCode = selectedBatch) => {
    try {
      const XLSXModule = await import('xlsx-js-style');
      const XLSX = XLSXModule.default || XLSXModule;
      const response = await fetch(`${API_BASE}/reports/analytics?from=1900-01-01&to=2999-12-31`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load report data');

      const reportData = result.data || {};
      const batchesResponse = await fetch(`${API_BASE}/pigs/all?all=true`, { headers: getAuthHeaders(), cache: 'no-store' });
      const batchesJson = await batchesResponse.json();
      if (!batchesResponse.ok || !batchesJson.success) throw new Error(batchesJson.message || 'Unable to load batch records');
      const allReportBatches = batchesJson.data || reportData.batches || [];
      const salesResponse = await fetch(`${API_BASE}/sales`, {
        headers: getAuthHeaders(),
        cache: 'no-store',
      });
      const salesResult = await salesResponse.json();
      if (!salesResponse.ok || !salesResult.success) throw new Error(salesResult.message || 'Unable to load sale data');
      const salesByBatch = new Map((salesResult.data || [])
        .filter((sale) => sale.sale_date && sale.revenue !== null && sale.revenue !== undefined)
        .map((sale) => [String(sale.batch_id), sale]));
      const soldBatches = allReportBatches.filter((batch) => String(batch.status || '').trim().toLowerCase() === 'sold' || salesByBatch.has(String(batch.id)));
      const reportBatches = batchCode === 'All Batches'
        ? soldBatches
        : soldBatches.filter((batch) => String(batch.batch_code) === String(batchCode));
      if (reportBatches.length === 0) {
        throw new Error(batchCode === 'All Batches'
          ? 'No sold batch is available for the profit report.'
          : 'The selected batch is not marked as sold.');
      }
      const displayNames = buildBatchDisplayNames(allReportBatches);
      const reportBatchName = (batch) => {
        const code = String(batch?.batch_code || '').trim();
        if (/^batch-\d+$/i.test(code)) return `Batch-${code.split('-')[1].padStart(2, '0')}`;
        return displayNames.get(String(batch?.id)) || 'Batch-XX';
      };
      const pigsByBatch = await Promise.all(reportBatches.map(async (batch) => {
        const pigResponse = await fetch(`${API_BASE}/pigs/batch/${batch.id}/pigs`, { headers: getAuthHeaders(), cache: 'no-store' });
        const pigResult = await pigResponse.json();
        return [batch.id, pigResponse.ok && pigResult.success ? pigResult.data || [] : []];
      }));
      const pigMap = new Map(pigsByBatch);
      const feedByBatch = new Map();
      (reportData.feedRecords || []).forEach((record) => {
        const current = feedByBatch.get(record.batch_id) || { kg: 0, cost: 0 };
        const quantity = Number(record.quantity_kg) || 0;
        const price = Number(record.unit_price_at_usage);
        current.kg += quantity;
        if (Number.isFinite(price) && price >= 0) current.cost += quantity * price;
        feedByBatch.set(record.batch_id, current);
      });
      const vaccineByBatch = new Map();
      (reportData.vaccinationRecords || []).forEach((record) => {
        if (String(record.status || '').toLowerCase() !== 'completed') return;
        const current = vaccineByBatch.get(record.batch_id) || { dosage: 0, cost: 0, names: [] };
        const dosage = Number(record.dosage) || 0;
        const price = Number(record.price_per_dose_at_usage);
        current.dosage += dosage;
        if (record.vaccine_name && !current.names.includes(record.vaccine_name)) current.names.push(record.vaccine_name);
        if (Number.isFinite(price) && price >= 0) current.cost += dosage * price;
        vaccineByBatch.set(record.batch_id, current);
      });
      const expensesByBatch = new Map();
      (reportData.expenses || []).forEach((expense) => {
        const current = expensesByBatch.get(expense.batch_id) || 0;
        expensesByBatch.set(expense.batch_id, current + (Number(expense.amount) || 0));
      });
      const headers = ['Batch Name', 'Individual Pig', 'Breed', 'Sale Date', 'Final Weight (kg)', 'Sale Price per kg', 'Sales Revenue', 'Feed Consumed (bags)', 'Feed Cost', 'Vaccine Name', 'Vaccine Dosage', 'Vaccine Cost', 'Other Recorded Expenses', 'Total Cost', 'Total Profit', 'Profit Margin'];
      const rows = [['PrepAPig Farm Profit Report'], [], headers];
      reportBatches.forEach((batch) => {
        const pigs = pigMap.get(batch.id) || [];
        const pigRows = pigs.length > 0 ? pigs : [{ id: '', weight: batch.current_weight }];
        const feed = feedByBatch.get(batch.id) || { kg: 0, cost: 0 };
        const vaccine = vaccineByBatch.get(batch.id) || { dosage: 0, cost: 0, names: [] };
        const otherExpenses = expensesByBatch.get(batch.id) || 0;
        const sale = salesByBatch.get(String(batch.id));
        const salePrice = Number.isFinite(Number(batch.sale_price_per_kg)) && Number(batch.sale_price_per_kg) > 0
          ? Number(batch.sale_price_per_kg)
          : sale && Number(sale.total_weight_kg) > 0 && Number(sale.revenue) >= 0
            ? Number(sale.revenue) / Number(sale.total_weight_kg)
            : NaN;
        pigRows.forEach((pig, index) => {
          const finalWeight = Number(pig.weight ?? batch.current_weight);
          const revenue = Number.isFinite(salePrice) && salePrice > 0 && Number.isFinite(finalWeight) ? finalWeight * salePrice : 0;
          const totalCost = feed.cost + vaccine.cost + (index === 0 ? otherExpenses : 0);
          const totalProfit = revenue - totalCost;
          rows.push([
            reportBatchName(batch),
            pig.id ? `Pig-${String(pig.id).slice(0, 8)}` : '',
            batch.breed || '',
            sale && sale.sale_date ? sale.sale_date : (batch.updated_at || batch.created_at || ''),
            Number.isFinite(finalWeight) ? finalWeight : '',
            salePrice > 0 ? salePrice : '',
            revenue || '',
            feed.kg > 0 ? feed.kg / 50 : '',
            feed.cost || '',
            vaccine.names.join(', '),
            vaccine.dosage || '',
            vaccine.cost || '',
            index === 0 ? otherExpenses : '',
            totalCost || '',
            revenue || totalCost ? totalProfit : '',
            revenue > 0 ? totalProfit / revenue : '',
          ]);
        });
      });
      const totalRow = ['TOTALS', '', '', '', 0, 0, 0, 0, 0, '', 0, 0, 0, 0, 0, 0];
      rows.slice(3).forEach((row) => {
        [4, 5, 6, 7, 8, 10, 11, 12, 13, 14].forEach((index) => { totalRow[index] += Number(row[index]) || 0; });
      });
      totalRow[15] = totalRow[6] > 0 ? totalRow[14] / totalRow[6] : 0;
      rows.push(totalRow);

      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
      sheet['A1'] = { v: 'PrepAPig Farm Profit Report', t: 's' };
      sheet['!freeze'] = { xSplit: 0, ySplit: 3 };
      sheet['!autofilter'] = { ref: `A3:P${rows.length}` };
      sheet['!cols'] = [18, 18, 16, 12, 16, 16, 16, 18, 16, 24, 16, 16, 20, 16, 16, 14].map((wch) => ({ wch }));
      const border = { top: { style: 'thin', color: { rgb: 'B7B7B7' } }, bottom: { style: 'thin', color: { rgb: 'B7B7B7' } }, left: { style: 'thin', color: { rgb: 'B7B7B7' } }, right: { style: 'thin', color: { rgb: 'B7B7B7' } } };
      for (let row = 0; row < rows.length; row += 1) {
        for (let col = 0; col < headers.length; col += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (!cell) continue;
          cell.s = { ...(cell.s || {}), border, alignment: { vertical: 'center', horizontal: row < 3 ? 'center' : [4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].includes(col) ? 'right' : 'left' } };
          if (row === 0) cell.s = { ...cell.s, font: { bold: true, sz: 14 }, alignment: { vertical: 'center', horizontal: 'center' } };
          if (row === 2) cell.s = { ...cell.s, font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4E78' } } };
          if (row > 2 && row < rows.length - 1 && row % 2 === 0) cell.s = { ...cell.s, fill: { fgColor: { rgb: 'F2F2F2' } } };
          if (row === rows.length - 1) cell.s = { ...cell.s, font: { bold: true }, border: { ...border, top: { style: 'medium', color: { rgb: '555555' } } } };
          if ([5, 6, 8, 11, 12, 13, 14].includes(col)) cell.z = '₱#,##0.00;[Red]-₱#,##0.00';
          if (col === 15) cell.z = '0.0%';
          if (col === 3 && row > 2) cell.z = 'mm/dd/yyyy';
        }
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Farm Profit Report');
      const reportFileName = reportBatches.length === 1
        ? `${reportBatchName(reportBatches[0])} Profit Report.xlsx`
        : 'Sold Batches Profit Report.xlsx';
      XLSX.writeFile(workbook, reportFileName);
    } catch (err) {
      setError(err.message || 'Unable to generate the farm profit report');
    }
  };

  const handleHeaderDownload = () => {
    window.print();
  };

  const recordedSaleBatchIds = new Set(sales
    .filter((sale) => sale.sale_date && sale.revenue !== null && sale.revenue !== undefined)
    .map((sale) => String(sale.batch_id)));
  const soldBatchReportItems = soldReportBatches
    .map((batch) => ({
      name: `${/^batch-\d+$/i.test(String(batch.batch_code || '')) ? `Batch-${String(batch.batch_code).split('-')[1].padStart(2, '0')}` : batchDisplayNames.get(String(batch.id)) || 'Batch-XX'} Profit Report`,
      desc: 'Individual pigs, final weights, feed, vaccines, and profit (.xlsx)',
      batchCode: batch.batch_code,
      xlsx: true,
    }));
  const profitReportItems = loading ? [] : soldBatchReportItems;

  return (
    <div className="dashboard-theme mobile-screen-shell w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover saturate-[0.65] brightness-[0.9] blur-[2px]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-[#F4F7F5]/80 via-[#EDF3EF]/72 to-[#DCE9E1]/76" />

      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="md:hidden w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
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
                {selectedBatchLabel} <ChevronDown className="w-4 h-4" />
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
                      {option === 'All Batches' ? option : batchDisplayNames.get(String(batches.find((batch) => batch.batch_code === option)?.id)) || 'Batch'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24 relative">
          <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="analytics-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="analytics-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">Feed Stock</div>
              <div className="analytics-summary-value font-bold text-gray-900">{Number(totalFeedStock).toLocaleString('en-PH', { maximumFractionDigits: 2 })} <span className="whitespace-nowrap">kg</span></div>
              <div className="analytics-summary-caption text-xs text-gray-600">Total remaining</div>
            </div>
            <div className="analytics-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="analytics-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">Vaccinations</div>
              <div className="analytics-summary-value font-bold text-gray-900">
                {vaccinationSummary.totalDoses} <span className="whitespace-nowrap">doses</span>
              </div>
              <div className="analytics-summary-caption text-xs text-gray-600">
                {vaccinationSummary.completed} completed ·{' '}
                {vaccinationSummary.scheduled} scheduled
              </div>
            </div>
            <div className="analytics-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="analytics-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">Total recorded costs (period)</div>
              <div className="analytics-summary-value font-bold text-gray-900">
                {totalRecordedCosts == null ? 'Unavailable' : formatCurrency(totalRecordedCosts)}
              </div>
            </div>
            <div className="analytics-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
              <div className="analytics-summary-label mb-2 text-xs text-gray-700 font-semibold uppercase tracking-wide">Batches</div>
              <div className="analytics-summary-value font-bold text-gray-900">
                {selectedBatch === 'All Batches' ? batches.length : 1}
              </div>
              <div className="analytics-summary-caption text-xs text-gray-600">
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
                className="inline-flex items-center gap-1 rounded-xl bg-pink-600 px-3 py-2 text-[10px] font-bold text-white shadow-md transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                        ? 'border-pink-300 bg-pink-50/80 ring-2 ring-pink-200'
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

            {pigPriceReference && (
              <div className="mt-3 text-[10px] text-gray-500">Provincial reference: {formatPricePerKg(pigPriceReference.pricePhpPerKg)} ({pigPriceReference.period}); not a municipality-specific quote.</div>
            )}
            {pigPriceError && <div className="mt-2 text-xs text-red-600">{pigPriceError}</div>}
            {marketRefreshError && <div className="mt-2 text-xs text-red-600">{marketRefreshError}</div>}
            {aiAnalysisError && <div className="mt-2 text-xs text-red-600">{aiAnalysisError}</div>}
            {aiAnalysis && (
              <div className="mt-4 rounded-[1.5rem] border border-[#ffd1df] bg-white/90 p-5 shadow-[0_12px_28px_rgba(255, 47, 114, 0.12)]">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold leading-tight text-[#ad1457]">
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
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-[#ad1457]">
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
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-transparent py-2 text-sm font-bold text-pink-600 transition hover:bg-pink-100/70"
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
                    <Line type="monotone" dataKey="price" stroke="#f5125d" strokeWidth={2} dot={false} name="Observed price" />
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

          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">Feed Consumption Forecast</h3>
                <p className="mt-1 text-[10px] text-[#555B6E]">
                  {feedHistoryLabel === 'Synthetic history'
                    ? 'Synthetic uploaded history, not actual farm records, compared with next-week estimate'
                    : 'Recorded usage compared with the next-week estimate'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-semibold">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">● {feedHistoryLabel}</span>
                <span className="rounded-full bg-pink-100 px-2.5 py-1 text-pink-700">● Forecast</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/60 bg-white/55 p-3">
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={feedConsumptionData} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#D9DCE7" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#555B6E' }} stroke="#A7ADBE" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#555B6E' }} stroke="#A7ADBE" tickLine={false} axisLine={false} width={34} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #ffd1df', boxShadow: '0 8px 20px rgba(37,40,56,0.12)', fontSize: 12 }}
                    labelStyle={{ color: '#252838', fontWeight: 700 }}
                    formatter={(value, name) => [`${value} kg`, name === 'actual' ? feedHistoryLabel : 'Forecast']}
                  />
                  <Legend verticalAlign="top" align="right" height={26} iconType="circle" wrapperStyle={{ fontSize: 10, color: '#555B6E' }} formatter={(value) => value === 'actual' ? feedHistoryLabel : 'Forecast'} />
                  {forecastStartDate && <ReferenceLine x={forecastStartDate} stroke="#f77f9f" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: 'Forecast starts', position: 'insideTopRight', fill: '#ad1457', fontSize: 10 }} />}
                  <Line type="monotone" dataKey="actual" stroke="#059669" strokeWidth={3} dot={{ fill: '#059669', stroke: '#FFFFFF', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} name="actual" connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" stroke="#f5125d" strokeWidth={3} strokeDasharray="7 5" dot={{ fill: '#f5125d', stroke: '#FFFFFF', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} name="forecast" connectNulls={false}>
                    <ErrorBar dataKey="errorRange" width={4} strokeWidth={1.5} stroke="#ffd1df" />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-[#6B7280]">
              <span>{feedHistoryLabel === 'Synthetic history' ? 'Illustrative uploaded data; not actual farm records.' : 'Recorded database feed logs.'}</span>
              <span>Dashed styling and error bars show the forecast range · Unit: kg</span>
            </div>
            {feedForecastError && <p className="text-[10px] text-red-700 mb-2">{feedForecastError}</p>}

            {feedForecastAi && (
              <div className="bg-white/90 border border-[#ffd1df] rounded-xl p-4 mb-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-2"><span className="text-sm font-bold text-[#ad1457]">AI Forecast Analysis</span><span className="text-[10px] uppercase font-bold text-[#f5125d]">{feedForecastAi.riskLevel || 'unknown'} risk</span></div>
                <p className="text-left text-sm leading-6 text-[#252838] mb-3">{feedForecastAi.analysis}</p>
                <p className="text-left text-sm leading-6 text-[#252838]"><strong className="text-[#ad1457]">Suggestion:</strong> {feedForecastAi.suggestion}</p>
                {feedForecastAi.stockContext && <div className="mt-3 text-[10px] text-[#555B6E]">
                  <p>Recorded stock (all feed types; not mapped to synthetic ration codes): <strong>{feedForecastAi.stockContext.totalRecordedStockKg} kg</strong></p>
                  {feedForecastAi.stockContext.rationForecasts?.length > 0 && <div className="grid grid-cols-2 gap-2 mt-2">{feedForecastAi.stockContext.rationForecasts.map((ration) => <span key={ration.rationCode}>{ration.rationCode} need: <strong>{ration.forecastKg} kg</strong> · Stock match: unavailable</span>)}</div>}
                </div>}
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
              <div className="analytics-cost-row flex justify-between"><span>Actual recorded sales (period)</span><strong className="analytics-financial-value">{financial ? formatCurrency(financial.actualRevenue) : 'Unavailable'}</strong></div>
              <div className="analytics-cost-row flex justify-between"><span>Manual expenses (period)</span><strong className="analytics-financial-value">{financial ? formatCurrency(financial.recordedExpenses) : 'Unavailable'}</strong></div>
              <div className="analytics-cost-row flex justify-between"><span>Recorded ledger profit (sales minus manual expenses)</span><strong className="analytics-financial-value">{financial ? formatCurrency(financial.recordedProfit) : 'Unavailable'}</strong></div>
              <p className="text-xs text-gray-600">Ledger profit uses sales minus manual expenses by transaction date. Feed and vaccine usage costs are shown separately and included in total costs below.</p>
              {financialError && <p className="text-xs text-red-700">{financialError}</p>}
            </div>
            <p className="text-xs text-gray-600 mb-3">Estimates below use the sum of recorded individual pig weights in each batch and explicitly selected or recorded prices, not historical revenue. Feed and vaccine usage costs use transaction-time snapshots when available. Manual expenses may be incomplete.</p>
            {batchWeightError && <p className="text-xs text-amber-800 mb-2">{batchWeightError}</p>}
            {batchWeightLoading && <p className="text-xs text-gray-600 mb-2">Calculating total batch weight…</p>}
            <div className="space-y-2 mb-3">
              <div className="analytics-cost-row flex items-center justify-between text-sm">
                <span className="text-gray-700">Estimated standing batch value (total recorded weight)</span>
                <span className="analytics-financial-value font-bold text-green-600">
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
                <div className="analytics-cost-row flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Feeds (transaction-time cost)</span>
                  <span className="analytics-financial-value text-gray-900">{formatCurrency(totalFeedCost)}</span>
                </div>
                <div className="analytics-cost-row flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 ml-2">Vaccines (transaction-time cost)</span>
                  <span className="analytics-financial-value text-gray-900">{formatCurrency(totalVaccineCost)}</span>
                </div>
                {expenseBreakdown.length > 0 && (
                  <div className="analytics-cost-row flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700 ml-2">Recorded expenses</span>
                    <span className="analytics-financial-value text-gray-900">
                      {formatCurrency(
                        filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
                      )}
                    </span>
                  </div>
                )}
                <div className="analytics-cost-row flex items-center justify-between text-sm font-semibold border-t border-white/30 pt-2 mt-2">
                  <span className="text-gray-900">Total recorded costs (period)</span>
                  <span className="analytics-financial-value text-red-600">{totalRecordedCosts == null ? 'Unavailable' : formatCurrency(totalRecordedCosts)}</span>
                </div>
              </div>
              <div className="analytics-net-summary flex items-center justify-between bg-green-100/60 rounded-lg p-3 mt-3">
                <span className="analytics-net-summary-label font-bold text-gray-900">Estimated value less recorded costs</span>
                <div className="analytics-net-summary-details text-right">
                  <div className="analytics-net-summary-amount text-2xl font-bold text-green-600">
                    {estimateAvailable && totalRecordedCosts != null ? formatCurrency(salesRevenue - totalRecordedCosts) : 'Unavailable'}
                  </div>
                  <span className="analytics-net-summary-badge px-2 py-0.5 bg-green-500 text-white rounded-full text-xs font-semibold">
                    {estimateAvailable
                      ? 'Estimate only'
                      : 'Estimate unavailable'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/55 border border-[#ffd1df] rounded-xl p-4 mt-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h4 className="text-sm font-bold text-[#ad1457]">AI Estimated Profit Analysis</h4>
                {['low', 'medium', 'high'].includes(String(profitAiResult?.aiAnalysis?.riskLevel || '').toLowerCase()) && (
                  <span className="text-[10px] uppercase font-bold text-[#f5125d]">
                    {String(profitAiResult.aiAnalysis.riskLevel).toLowerCase()} risk
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#6B7280] mb-3">AI interprets recorded weight and expense data. Amounts below are calculated from records and labeled price assumptions; this is not realized or full lifecycle profit.</p>
              {profitAiLoading && <p className="text-sm text-gray-600">Analyzing recorded growth and expenses…</p>}
              {profitAiError && <p className="text-sm text-amber-800">AI estimated-profit analysis unavailable: {profitAiError}</p>}
              {profitAiResult?.available === false && <p className="text-sm text-gray-600">{profitAiResult.message}</p>}
              {profitAiResult?.available && (() => {
                const context = profitAiResult.deterministic;
                const analysis = profitAiResult.aiAnalysis;
                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-xs">
                      <div className="rounded-lg bg-white/70 p-2"><span className="block text-gray-600">Estimated standing value</span><strong>{context.estimatedStandingValuePhp == null ? 'Unavailable' : formatCurrency(context.estimatedStandingValuePhp)}</strong></div>
                      <div className="rounded-lg bg-white/70 p-2"><span className="block text-gray-600">Recorded costs ({context.period.from} to {context.period.to})</span><strong>{formatCurrency(context.totalRecordedCostsPhp)}</strong></div>
                      <div className="rounded-lg bg-white/70 p-2"><span className="block text-gray-600">Standing value less selected-period costs</span><strong>{context.estimatedStandingValueLessSelectedPeriodCostsPhp == null ? 'Unavailable' : formatCurrency(context.estimatedStandingValueLessSelectedPeriodCostsPhp)}</strong></div>
                    </div>

                    {analysis && <>
                      <p className="text-sm leading-6 text-[#252838]">{analysis.analysis}</p>
                      <p className="text-sm leading-6 text-[#252838] mt-2"><strong className="text-[#ad1457]">Suggestion:</strong> {analysis.suggestion}</p>
                      {analysis.actions?.length > 0 && <ul className="list-disc pl-4 mt-2 text-xs text-[#555B6E]">{analysis.actions.map((action) => <li key={action}>{action}</li>)}</ul>}
                    </>}

                  </>
                );
              })()}
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

            <div className="rounded-xl border border-[#ffd1df] bg-white/90 p-4 mb-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-bold text-[#ad1457] mb-2"><Sparkles size={14} /> AI Expense Analysis</div>
              {expenseAiLoading && <p className="text-sm text-[#555B6E]">Analyzing recorded expense categories...</p>}
              {expenseAiError && <p className="text-xs text-red-700">{expenseAiError}</p>}
              {!expenseAiLoading && !expenseAiError && expenseAiAnalysis && (
                <>
                  <p className="text-left text-sm leading-6 text-[#252838]">{expenseAiAnalysis.analysis}</p>
                  <p className="text-left text-sm leading-6 text-[#252838] mt-3"><strong className="text-[#ad1457]">Suggestion:</strong> {expenseAiAnalysis.suggestion}</p>
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
              {[...profitReportItems].map((report) => (
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
                      onClick={() => report.xlsx ? handleDownloadProfitReport(report.batchCode) : handleDownloadReport(report.name)}
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
        </div>

        <BottomNav active="Reports" />
      </div>
    </div>
  );
}