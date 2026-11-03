import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  TrendingUp,
  Home,
  Package,
  X,
  AlertTriangle,
  Calendar,
  Check,
  Plus,
} from 'lucide-react';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.webp';
import BottomNav from '../components/BottomNav';
import { API_BASE, getAuthHeaders } from '../api.js';
import { buildVaccinationDonePayload } from '../utils/markDonePayloads.js';
import { getUserCacheKey, readCache, writeCache } from '../utils/cache.js';
import { buildBatchDisplayNames } from '../utils/batchNames.js';
import { formatLocalDate } from '../utils/dates.js';

// Standard vaccination schedule by age
const vaccinationSchedule = [
  { vaccine: 'Swine Fever', minDay: 7, maxDay: 10, dosePerPig: 1 },
  { vaccine: 'E. Coli', minDay: 14, maxDay: 21, dosePerPig: 1 },
  { vaccine: 'PRRS', minDay: 28, maxDay: 35, dosePerPig: 1 },
  { vaccine: 'Porcine Circovirus', minDay: 42, maxDay: 49, dosePerPig: 1 },
];

// Helpers
const isVaccinationDue = (day, vaccine) => {
  return day >= vaccine.minDay && day <= vaccine.maxDay;
};
const isVaccinationOverdue = (day, vaccine) => {
  return day > vaccine.maxDay;
};

const getNextScheduledDate = (batch, vaccinationDate) => {
  if (!batch?.dateAcquired) return null;
  const acquired = new Date(`${batch.dateAcquired}T00:00:00`);
  const administered = new Date(`${vaccinationDate}T00:00:00`);
  if (Number.isNaN(acquired.getTime()) || Number.isNaN(administered.getTime())) return null;
  const ageDays = (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((administered - acquired) / (1000 * 60 * 60 * 24)));
  const next = vaccinationSchedule.find((item) => item.minDay > ageDays);
  if (!next) return null;
  const due = new Date(acquired);
  due.setDate(due.getDate() + next.minDay);
  return formatLocalDate(due);
};


// Map select value to vaccine name
const VACCINE_NAME_MAP = {
  'swine-fever': 'Swine Fever',
  ecoli: 'E. Coli',
  prrs: 'PRRS',
};

export default function VaccinationScreen() {
  const navigate = useNavigate();

  const [isOnline] = useState(true);
  const [pendingSync] = useState(0);
  const [showRecordVaccination, setShowRecordVaccination] = useState(false);
  const [showRestockVaccine, setShowRestockVaccine] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Data
  const [vaccinationRecords, setVaccinationRecords] = useState([]);
  const [batches, setBatches] = useState([]);
  const [vaccineStock, setVaccineStock] = useState([]);
  const [pendingDone, setPendingDone] = useState({});

  // Form states
  const [vaccinationForm, setVaccinationForm] = useState({
    batch: '',
    vaccineType: '',
    doses: '',
    date: formatLocalDate(),
    notes: '',
  });
  const [restockForm, setRestockForm] = useState({
    vaccineType: '',
    doses: '',
    cost: '',
    expiryDate: '',
    purchaseDate: formatLocalDate(),
  });

  // Fetch batches
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
            name: displayNames.get(String(batch.id)) || 'Batch',
            day: day,
            pigCount: batch.pig_count || 0,
            breed: batch.breed,
            startWeight: batch.start_weight,
            currentWeight: batch.current_weight,
            dateAcquired: batch.date_acquired,
            status: batch.status,
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

  // Fetch vaccinations
  const fetchVaccinations = async () => {
    setLoading(true);
    setError(null);
    const cacheKey = `vaccination-records:${getUserCacheKey()}:${selectedBatch}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached)) {
      setVaccinationRecords(cached);
      setLoading(false);
    }
    try {
      let url = `${API_BASE}/vaccinations/all?all=true`;
      if (selectedBatch !== 'all') {
        url = `${API_BASE}/vaccinations/batch/${selectedBatch}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        const records = json.data || [];
        setVaccinationRecords(records);
        writeCache(cacheKey, records);

      } else {
        throw new Error(json.message || 'No records');
      }
    } catch (err) {
      console.warn('Could not fetch vaccination records:', err.message);

      setVaccinationRecords([]);
      setError('Unable to load vaccination records. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch vaccine stock
  const fetchVaccineStock = async () => {
    const cacheKey = `vaccine-stock:${getUserCacheKey()}`;
    const cached = readCache(cacheKey);
    if (Array.isArray(cached)) setVaccineStock(cached);
    try {
      const res = await fetch(`${API_BASE}/vaccinations/stock`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stock');
      const json = await res.json();
      if (json.success) {
        const stocks = json.data || [];
        setVaccineStock(stocks);
        writeCache(cacheKey, stocks);
      }
    } catch (err) {
      console.warn('Could not fetch vaccine stock:', err.message);
      setVaccineStock([]);
    }
  };

  const fetchVaccinationOverview = async () => {
    setIsRefreshing(true);
    setLoading(true);
    const userKey = getUserCacheKey();
    const cachedBatches = readCache(`batches:${userKey}`);
    const cachedRecords = readCache(`vaccination-records:${userKey}:all`);
    const cachedStock = readCache(`vaccine-stock:${userKey}`);
    if (Array.isArray(cachedBatches)) setBatches(cachedBatches);
    if (Array.isArray(cachedRecords)) setVaccinationRecords(cachedRecords);
    if (Array.isArray(cachedStock)) setVaccineStock(cachedStock);
    const hasCachedOverview = Array.isArray(cachedBatches) || Array.isArray(cachedRecords) || Array.isArray(cachedStock);
    if (hasCachedOverview) setLoading(false);

    try {
      const res = await fetch(`${API_BASE}/vaccinations/overview`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to load vaccination overview');
      const overview = json.data || {};
      const displayNames = buildBatchDisplayNames(overview.batches || []);
      const mappedBatches = (overview.batches || []).filter((batch) => !batch.status || String(batch.status).toLowerCase() === 'active').map((batch) => {
        const sourceDate = batch.date_acquired || batch.created_at;
        const day = sourceDate
          ? (Number(batch.age_on_acquisition) || 0) + Math.max(0, Math.floor((new Date() - new Date(sourceDate)) / (1000 * 60 * 60 * 24)))
          : 0;
        return {
          id: batch.id,
          name: displayNames.get(String(batch.id)) || 'Batch',
          day,
          pigCount: batch.pig_count || 0,
          breed: batch.breed,
          startWeight: batch.start_weight,
          currentWeight: batch.current_weight,
          dateAcquired: batch.date_acquired,
          status: batch.status,
        };
      });
      setBatches(mappedBatches);
      setVaccinationRecords(overview.records || []);
      setVaccineStock(overview.stock || []);
      writeCache(`batches:${userKey}`, mappedBatches);
      writeCache(`vaccination-records:${userKey}:all`, overview.records || []);
      writeCache(`vaccine-stock:${userKey}`, overview.stock || []);
      setLoading(false);
      setIsRefreshing(false);
    } catch (err) {
      console.warn('Could not fetch vaccination overview:', err.message);
      setIsRefreshing(false);
      void Promise.all([fetchBatches(), fetchVaccineStock(), fetchVaccinations()]);
    }
  };

  // Load data
  useEffect(() => {
    fetchVaccinationOverview();
  }, []);

  useEffect(() => {
    if (selectedBatch !== 'all') fetchVaccinations();
  }, [selectedBatch]);

  // Save vaccination (used by both modal and direct marking)
  const handleSaveVaccination = async (formData) => {
    try {
      const res = await fetch(`${API_BASE}/vaccinations/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to save: ${errorText}`);
      }
      const json = await res.json();
      if (json.success) {
        const savedRecord = Array.isArray(json.data) ? json.data[0] : json.data;
        if (savedRecord && (selectedBatch === 'all' || String(savedRecord.batch_id) === String(selectedBatch))) {
          setVaccinationRecords((records) => {
            const updatedRecords = [savedRecord, ...records];
            writeCache(`vaccination-records:${getUserCacheKey()}:${selectedBatch}`, updatedRecords);
            return updatedRecords;
          });
        }
        setShowRecordVaccination(false);
        setVaccinationForm({
          batch: '',
          vaccineType: '',
          doses: '',
          date: formatLocalDate(),
          notes: '',
        });
        void fetchVaccineStock();
        window.dispatchEvent(new Event('prepapig:financial-data-changed'));
        return true;
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error saving vaccination: ' + err.message);
      return false;
    }
  };

  // Direct "Mark as Done" – no modal
  const handleDirectMarkAsDone = async (batchId, vaccineName, doses) => {
    setPendingDone((current) => ({ ...current, [batchId]: true }));
    const vaccinationDate = formatLocalDate();
    const batch = batches.find((item) => String(item.id) === String(batchId));
    const payload = buildVaccinationDonePayload({
      batchId,
      vaccineName,
      doses,
      nextDueDate: getNextScheduledDate(batch, vaccinationDate),
    });
    const saved = await handleSaveVaccination(payload);
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

  // Modal submit
  const handleFormSubmit = () => {
    if (!vaccinationForm.batch || !vaccinationForm.vaccineType || !vaccinationForm.doses) return;
    const payload = {
      batch_id: vaccinationForm.batch,
      vaccine_name: vaccinationForm.vaccineType,
      vaccination_date: vaccinationForm.date,
      dosage: parseInt(vaccinationForm.doses, 10) || 0,
      notes: vaccinationForm.notes,
      next_due_date: getNextScheduledDate(
        batches.find((batch) => String(batch.id) === String(vaccinationForm.batch)),
        vaccinationForm.date
      ),
      administered_by: 'Farmer',
      status: 'Completed',
    };
    handleSaveVaccination(payload);
  };

  // Restock vaccine
  const handleRestock = async () => {
    const vaccineName = VACCINE_NAME_MAP[restockForm.vaccineType];
    if (!vaccineName) {
      alert('Please select a vaccine type');
      return;
    }
    const doses = parseInt(restockForm.doses, 10) || 0;
    if (doses <= 0) {
      alert('Please enter a valid number of doses');
      return;
    }
    const price = restockForm.cost.trim() === '' ? null : Number(restockForm.cost);
    try {
      const res = await fetch(`${API_BASE}/vaccinations/stock/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          vaccine_name: vaccineName,
          stock_quantity: doses,
          expiry_date: restockForm.expiryDate || null,
          ...(price === null ? {} : { price_per_dose: price }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.message || `Failed to restock (HTTP ${res.status})`);
      }
      if (json.success) {
        alert('Stock updated successfully!');
        setShowRestockVaccine(false);
        setRestockForm({
          vaccineType: '',
          doses: '',
          cost: '',
          expiryDate: '',
          purchaseDate: formatLocalDate(),
        });
        fetchVaccineStock();
        window.dispatchEvent(new Event('prepapig:financial-data-changed'));
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error restocking: ' + err.message);
    }
  };

  // Computed – safe parsing
  const getBatchName = (batchId) => {
    const batch = batches.find((b) => b.id === batchId);
    return batch ? batch.name : 'Unknown';
  };

  const getBatchPigCount = (batchId) => {
    const batch = batches.find((b) => b.id === batchId);
    return batch?.pigCount ?? 0;
  };

  const getVaccinePrice = (name) => {
    if (!name) return null;
    const trimmed = name.trim();
    const stock = vaccineStock.find((s) => s.vaccine_name?.trim() === trimmed);
    if (stock?.price_per_dose == null || stock.price_per_dose === '') return null;
    const price = Number(stock.price_per_dose);
    return Number.isFinite(price) && price >= 0 ? price : null;
  };

  const calculateBatchVaccinationExpense = (batchId) => {
    const filtered = batchId === 'all'
      ? vaccinationRecords
      : vaccinationRecords.filter((r) => r.batch_id === batchId);
    let total = 0;
    for (const rec of filtered) {
      const dosage = Number(rec.dosage);
      const priceAtUsage = Number(rec.price_per_dose_at_usage);
      if (!Number.isFinite(priceAtUsage) || priceAtUsage < 0 || !Number.isFinite(dosage) || dosage < 0) return null;
      total += dosage * priceAtUsage;
    }
    return total;
  };

  const selectedBatchData = batches.find((b) => String(b.id) === String(selectedBatch));
  const batchExpense = useMemo(
    () => calculateBatchVaccinationExpense(selectedBatch),
    [selectedBatch, vaccinationRecords, vaccineStock]
  );
  const filteredRecords = vaccinationRecords;
  const scheduleBatches = batches;

  const totalDoses = useMemo(
    () => vaccinationRecords.reduce((sum, r) => sum + (Number(r.dosage) || 0), 0),
    [vaccinationRecords]
  );

  return (
    <div className="dashboard-theme mobile-screen-shell min-h-screen w-full relative overflow-hidden flex flex-col">
      {isRefreshing && !loading && (
        <div className="absolute left-0 right-0 top-0 z-[60] h-1 overflow-hidden bg-white/25">
          <div className="h-full w-1/3 animate-pulse bg-emerald-400/80" />
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 z-50 p-4 md:p-8 bg-[#EDF3EF]/55 backdrop-blur-[2px] animate-pulse pointer-events-none">
          <div className="h-8 w-56 rounded bg-white/50 mb-5" />
          <div className="h-16 rounded-2xl bg-white/45 border border-white/50 mb-4" />
          <div className="flex gap-3 mb-4"><div className="h-12 w-32 rounded-xl bg-white/45" /><div className="h-12 w-32 rounded-xl bg-white/45" /><div className="h-12 w-32 rounded-xl bg-white/45" /></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><div className="h-28 rounded-2xl bg-white/45" /><div className="h-28 rounded-2xl bg-white/45" /><div className="h-28 rounded-2xl bg-white/45" /><div className="h-28 rounded-2xl bg-white/45" /></div>
          <div className="h-56 rounded-2xl bg-white/45 mb-4" />
          <div className="h-48 rounded-2xl bg-white/45" />
        </div>
      )}
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
              <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">Vaccination Manager</h1>
              <p className="hidden text-sm text-gray-600 lg:block">Monitor and manage vaccines across all batches</p>
            </div>
          </div>
          <div className="vaccination-header-actions flex items-center gap-2">
            <button onClick={() => setShowRecordVaccination(true)} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-[#ff2f72] px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-[#ff2f72]/25">
              <Plus className="w-4 h-4" /> Record Vaccination
            </button>
            <button onClick={() => setShowRestockVaccine(true)} className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-white/65 px-4 py-2.5 text-xs font-bold text-emerald-700 border border-white/70 shadow-lg">
              <Plus className="w-4 h-4" /> Purchase Vaccine
            </button>
            <button className="relative w-9 h-9 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_6px_rgba(255,255,255,0.7)] transition-all">
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
          <div className="vaccination-batch-selector relative z-50 isolate bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-3 shadow-lg">
            <select
              value={selectedBatch}
              onChange={(event) => setSelectedBatch(event.target.value)}
              className="md:hidden min-h-11 w-full rounded-xl border border-white/50 bg-white/45 px-3 text-base font-semibold text-gray-700 outline-none"
              aria-label="Select batch"
            >
              <option value="all">All Available Batches</option>
              {batches.map((batch) => (
                <option key={batch.id} value={String(batch.id)}>{batch.name} ({batch.pigCount ?? 0} pigs)</option>
              ))}
            </select>
            <div className="hidden md:flex items-center gap-2 overflow-x-auto">
              <button type="button" onClick={() => setSelectedBatch('all')} className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${selectedBatch === 'all' ? 'bg-[#ff2f72] text-white shadow-lg' : 'bg-white/30 text-gray-700'}`}>All Batches</button>
              {batches.map((batch) => (
                <button type="button" key={batch.id} onClick={() => setSelectedBatch(String(batch.id))} className={`px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${String(selectedBatch) === String(batch.id) ? 'bg-[#ff2f72] text-white shadow-lg' : 'bg-white/30 text-gray-700'}`}>{batch.name}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="vaccination-desktop-content flex-1 min-h-0 overflow-y-auto mobile-page-content px-4 md:px-8 lg:px-12 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-gray-600">Loading...</div>
            </div>
          ) : error ? (
            <div className="bg-red-100/20 border border-red-300/50 rounded-xl p-4 text-red-700">
              <p>Error: {error}</p>
              <button onClick={fetchVaccinations} className="mt-2 underline">
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="vaccination-summary-cards grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                <div className="vaccination-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                  <div className="text-xs text-gray-700 font-semibold uppercase tracking-wide mb-2">
                    Total Vaccines Administered
                  </div>
                  <div className="text-5xl sm:text-6xl leading-none font-extrabold tracking-[-0.06em] text-gray-900">
                    {isNaN(totalDoses) ? 0 : totalDoses}
                  </div>
                  <div className="text-xs text-gray-600 mt-2 font-semibold">doses</div>
                </div>

                <div className="vaccination-summary-card bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                  <div className="text-xs text-gray-700 font-semibold mb-2">
                    {selectedBatch === 'all' ? 'All Batches' : selectedBatchData?.name || 'Unknown'}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {batchExpense == null ? 'Unavailable' : `₱${batchExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`}
                  </div>
                  <div className="text-xs text-gray-600">
                    {selectedBatch === 'all'
                      ? 'Total vaccination expenses'
                      : 'Vaccination expenses for this batch'}
                  </div>
                </div>
              </div>

              {/* Vaccine Stock Table */}
              <div className="vaccination-stock-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
                <div className="p-4 border-b border-white/20">
                  <h3 className="font-semibold text-gray-900">Vaccine Stock</h3>
                </div>
                <div className="divide-y divide-white/20">
                  {vaccineStock.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No stock data available
                    </div>
                  ) : (
                    vaccineStock.map((item) => {
                      const isLow = item.stock_quantity < 10;
                      const isExpiringSoon =
                        item.expiry_date &&
                        new Date(item.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                      let statusBadge = 'OK';
                      let statusColor = 'bg-green-100/80 border-green-300/50 text-green-700';
                      const isExpired = item.expiry_date && new Date(item.expiry_date) < new Date();
                      if (isExpired) {
                        statusBadge = 'Expired';
                        statusColor = 'bg-red-100/80 border-red-300/50 text-red-700';
                      } else if (isLow) {
                        statusBadge = 'Low Stock';
                        statusColor = 'bg-red-100/80 border-red-300/50 text-red-700';
                      } else if (isExpiringSoon) {
                        statusBadge = 'Expiring Soon';
                        statusColor = 'bg-orange-100/80 border-orange-300/50 text-orange-700';
                      }
                      return (
                        <div key={item.id} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="font-medium text-gray-900">{item.vaccine_name}</div>
                            <span
                              className={`px-3 py-1 ${statusColor} rounded-full text-xs font-semibold`}
                            >
                              {statusBadge}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {item.stock_quantity} doses · Exp:{' '}
                            {item.expiry_date
                              ? new Date(item.expiry_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'N/A'}
                            {item.price_per_dose == null ? ' · Cost unavailable' : ` · ₱${Number(item.price_per_dose).toFixed(2)}/dose`}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="vaccination-action-buttons grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                <button
                  onClick={() => setShowRecordVaccination(true)}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(16,185,129,0.3),-6px_-6px_12px_rgba(255,255,255,0.5)] active:shadow-[inset_3px_3px_6px_rgba(5,150,105,0.4),inset_-3px_-3px_6px_rgba(110,231,183,0.4)] transition-all"
                >
                  Record Vaccination
                </button>
                <button
                  onClick={() => setShowRestockVaccine(true)}
                  className="bg-white/30 backdrop-blur-lg border border-white/40 text-emerald-700 font-bold py-3 rounded-xl shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.1),inset_-3px_-3px_6px_rgba(255,255,255,0.8)] transition-all"
                >
                  Purchase Vaccine
                </button>
              </div>

              {/* Automated Vaccination Schedule */}
              <div className="vaccination-schedule-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">
                    Automated Vaccination Schedule
                    {selectedBatch !== 'all' && ` - ${selectedBatchData?.name || ''}`}
                  </h3>
                  <div className="px-2 py-1 bg-blue-100/80 border border-blue-300/50 rounded-full text-xs text-blue-700 font-semibold flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                    Auto
                  </div>
                </div>

                <div className="space-y-3">
                  {scheduleBatches
                    .filter((batch) => (selectedBatch === 'all' ? true : String(batch.id) === String(selectedBatch)))
                    .map((batch) => {
                      const day = batch.day || 0;
                      const pigCount = batch.pigCount || 0;

                      // Get completed vaccine names for this batch from records
                      const completedVaccines = vaccinationRecords
                        .filter(
                          (r) => r.batch_id === batch.id && r.status?.toLowerCase() === 'completed'
                        )
                        .map((r) => r.vaccine_name?.trim());

                      // Build status for each vaccine in the schedule
                      const vaccineStatuses = vaccinationSchedule.map((vax) => {
                        const isCompleted = completedVaccines.includes(vax.vaccine);
                        const isDue = !isCompleted && isVaccinationDue(day, vax);
                        const isOverdue = !isCompleted && isVaccinationOverdue(day, vax);
                        const isUpcoming = !isCompleted && !isDue && !isOverdue;
                        return {
                          ...vax,
                          isCompleted,
                          isDue,
                          isOverdue,
                          isUpcoming,
                          status: isCompleted
                            ? 'Completed'
                            : isDue
                            ? 'Due Now'
                            : isOverdue
                            ? 'Overdue'
                            : 'Scheduled',
                        };
                      });

                      const completedCount = vaccineStatuses.filter((v) => v.isCompleted).length;
                      const nextVax = vaccineStatuses.find((v) => !v.isCompleted);
                      const isAllComplete = completedCount === vaccinationSchedule.length;
                      const hasOverdue = vaccineStatuses.some((v) => v.isOverdue);
                      const hasDue = vaccineStatuses.some((v) => v.isDue);
                      const isPending = Boolean(pendingDone[batch.id]);
                      const overallStatus = isPending
                        ? 'Saving...'
                        : isAllComplete
                        ? 'Complete'
                        : hasOverdue
                        ? 'Overdue'
                        : hasDue
                        ? 'Due Now'
                        : 'Scheduled';

                      return (
                        <div
                          key={batch.id}
                          className={`bg-white/30 backdrop-blur-sm rounded-xl p-3 border border-white/30 ${
                            hasOverdue ? 'bg-red-50/40 border-red-200/50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 text-sm">
                                {batch.name} – {pigCount} pigs · Day {day}
                              </div>

                              {/* Progress bar */}
                              <div className="flex items-center gap-1 mt-2 mb-2">
                                {vaccineStatuses.map((vax) => (
                                  <div
                                    key={vax.vaccine}
                                    className={`flex-1 h-1.5 rounded-full transition-all ${
                                      vax.isCompleted
                                        ? 'bg-green-500'
                                        : vax.isDue
                                        ? 'bg-yellow-500'
                                        : vax.isOverdue
                                        ? 'bg-red-500'
                                        : 'bg-gray-300'
                                    }`}
                                    title={`${vax.vaccine} – ${vax.status}`}
                                  />
                                ))}
                              </div>

                              <div className="text-xs text-gray-600">
                                Completed: {completedCount}/{vaccinationSchedule.length} vaccines
                              </div>

                              {nextVax && !isAllComplete && (
                                <>
                                  <div className="text-sm text-gray-700 mt-2">
                                    Next: {nextVax.vaccine}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Day {nextVax.minDay}-{nextVax.maxDay} ·{' '}
                                    {nextVax.dosePerPig * pigCount} doses needed
                                  </div>
                                  {nextVax.isOverdue && (
                                    <div className="text-xs text-red-600 font-semibold mt-1">
                                      ⚠️ Overdue by {day - nextVax.maxDay} day
                                      {day - nextVax.maxDay > 1 ? 's' : ''}
                                    </div>
                                  )}
                                  {nextVax.isDue && (
                                    <div className="text-xs text-yellow-700 font-semibold mt-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" />
                                      Due now
                                    </div>
                                  )}
                                  {nextVax.isUpcoming && (
                                    <div className="text-xs text-blue-600 font-medium mt-1">
                                      In {nextVax.minDay - day} day
                                      {nextVax.minDay - day !== 1 ? 's' : ''}
                                    </div>
                                  )}
                                </>
                              )}

                              {isAllComplete && (
                                <div className="text-xs text-green-600 font-semibold mt-2 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  All vaccinations complete
                                </div>
                              )}
                            </div>

                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                overallStatus === 'Overdue'
                                  ? 'bg-red-100/80 border border-red-300/50 text-red-700'
                                  : overallStatus === 'Due Now'
                                  ? 'bg-yellow-100/80 border border-yellow-300/50 text-yellow-700'
                                  : overallStatus === 'Scheduled'
                                  ? 'bg-blue-100/80 border border-blue-300/50 text-blue-700'
                                  : 'bg-green-100/80 border border-green-300/50 text-green-700'
                              }`}
                            >
                              {overallStatus}
                            </span>
                          </div>

                          {/* Mark as Done button */}
                          {!isAllComplete && (hasDue || hasOverdue) &&
                            (() => {
                              const dueVax = vaccineStatuses.find((v) => v.isDue || v.isOverdue);
                              if (!dueVax) return null;
                              return (
                                <button
                                  disabled={isPending}
                                  onClick={() => {
                                    const doses = String(dueVax.dosePerPig * pigCount);
                                    handleDirectMarkAsDone(batch.id, dueVax.vaccine, doses);
                                  }}
                                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold py-2 rounded-lg shadow-lg active:scale-95 transition-all"
                                >
                                  {isPending ? 'Saving...' : 'Mark as Done'}
                                </button>
                              );
                            })()}
                        </div>
                      );
                    })}
                </div>

              </div>

              {/* Vaccination History */}
              <div className="vaccination-history-card bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
                <div className="p-4 border-b border-white/20">
                  <h3 className="font-semibold text-gray-900">
                    Vaccination History
                    {selectedBatch !== 'all' && ` - ${selectedBatchData?.name || ''}`}
                  </h3>
                </div>
                <div className="divide-y divide-white/20">
                  {filteredRecords.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      No vaccination records found
                    </div>
                  ) : (
                    filteredRecords.slice(0, 10).map((record) => (
                      <div key={record.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 text-sm">
                              {record.batch_name || getBatchName(record.batch_id)} · {getBatchPigCount(record.batch_id)} pigs
                            </div>
                            <div className="text-xs text-gray-700 mt-1">
                              {record.vaccine_name} · {record.dosage} doses
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(record.vaccination_date).toLocaleDateString('en-US', {
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
                          <span className="max-w-[45%] truncate whitespace-nowrap px-2 py-1 bg-blue-100/80 border border-blue-300/50 rounded-full text-xs text-blue-700 font-semibold" title={record.batch_name || getBatchName(record.batch_id)}>
                            {record.batch_name || getBatchName(record.batch_id)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Record Vaccination Modal */}
        {showRecordVaccination && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Record Vaccination</h2>
                <button
                  onClick={() => setShowRecordVaccination(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Batch</label>
                  <select
                    value={vaccinationForm.batch}
                    onChange={(e) => setVaccinationForm({ ...vaccinationForm, batch: e.target.value })}
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
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Vaccine Type</label>
                  <select
                    value={vaccinationForm.vaccineType}
                    onChange={(e) =>
                      setVaccinationForm({ ...vaccinationForm, vaccineType: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  >
                    <option value="">Select vaccine...</option>
                    <option value="Swine Fever">Swine Fever</option>
                    <option value="E. Coli">E. Coli</option>
                    <option value="PRRS">PRRS</option>
                    <option value="Porcine Circovirus">Porcine Circovirus</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Doses Administered
                  </label>
                  <input
                    type="number"
                    value={vaccinationForm.doses}
                    onChange={(e) => setVaccinationForm({ ...vaccinationForm, doses: e.target.value })}
                    placeholder="12"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date</label>
                  <input
                    type="date"
                    value={vaccinationForm.date}
                    onChange={(e) => setVaccinationForm({ ...vaccinationForm, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Notes (optional)</label>
                  <textarea
                    value={vaccinationForm.notes}
                    onChange={(e) => setVaccinationForm({ ...vaccinationForm, notes: e.target.value })}
                    placeholder="e.g., Booster dose"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                  />
                </div>

                {!isOnline && (
                  <div className="text-xs text-gray-600 bg-yellow-50/50 p-2 rounded-lg">
                    Saved locally – will sync later
                  </div>
                )}

                <button
                  onClick={handleFormSubmit}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Save Vaccination
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restock Vaccine Modal */}
        {showRestockVaccine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center responsive-modal-overlay bg-black/50 backdrop-blur-sm p-4">
            <div className="responsive-modal bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Restock Vaccine</h2>
                <button
                  onClick={() => setShowRestockVaccine(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Vaccine Type</label>
                  <select
                    value={restockForm.vaccineType}
                    onChange={(e) => setRestockForm({ ...restockForm, vaccineType: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  >
                    <option value="">Select vaccine...</option>
                    <option value="swine-fever">Swine Fever</option>
                    <option value="ecoli">E. Coli</option>
                    <option value="prrs">PRRS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Doses Added</label>
                  <input
                    type="number"
                    value={restockForm.doses}
                    onChange={(e) => setRestockForm({ ...restockForm, doses: e.target.value })}
                    placeholder="50"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Cost (₱)</label>
                  <input
                    type="number"
                    value={restockForm.cost}
                    onChange={(e) => setRestockForm({ ...restockForm, cost: e.target.value })}
                    placeholder="3250"
                    step="0.01"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Expiry Date</label>
                  <input
                    type="date"
                    value={restockForm.expiryDate}
                    onChange={(e) => setRestockForm({ ...restockForm, expiryDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Date of Purchase</label>
                  <input
                    type="date"
                    value={restockForm.purchaseDate}
                    onChange={(e) => setRestockForm({ ...restockForm, purchaseDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>
                <button
                  onClick={handleRestock}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Record Purchase
                </button>
              </div>
            </div>
          </div>
        )}

        <BottomNav active="Vaccination" />
      </div>
    </div>
  );
}