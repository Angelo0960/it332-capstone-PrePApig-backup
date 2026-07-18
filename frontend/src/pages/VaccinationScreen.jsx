import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Syringe,
  DollarSign,
  TrendingUp,
  Home,
  Package,
  X,
  AlertTriangle,
  Calendar,
  Check,
} from 'lucide-react';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png';
import BottomNav from '../components/BottomNav';
import { API_BASE, getAuthHeaders } from '../api.js';

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

// Mock data fallback
const MOCK_BATCHES = [
  { id: 'A', name: 'Batch A', day: 34, pigCount: 12 },
  { id: 'B', name: 'Batch B', day: 21, pigCount: 8 },
  { id: 'C', name: 'Batch C', day: 48, pigCount: 15 },
];

const MOCK_RECORDS = [
  {
    id: '1',
    batch_id: 'A',
    batch_name: 'Batch A',
    vaccine_name: 'Swine Fever',
    dosage: 12,
    vaccination_date: '2026-05-10',
    notes: 'Booster shot',
  },
  {
    id: '2',
    batch_id: 'B',
    batch_name: 'Batch B',
    vaccine_name: 'E. Coli',
    dosage: 8,
    vaccination_date: '2026-05-05',
    notes: '',
  },
  {
    id: '3',
    batch_id: 'A',
    batch_name: 'Batch A',
    vaccine_name: 'PRRS',
    dosage: 12,
    vaccination_date: '2026-04-28',
    notes: '',
  },
];

// Default vaccine prices (fallback if stock not available)
const DEFAULT_PRICES = {
  'Swine Fever': 45.0,
  'E. Coli': 38.5,
  'PRRS': 52.0,
  'Porcine Circovirus': 48.0,
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [useMock, setUseMock] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Data
  const [vaccinationRecords, setVaccinationRecords] = useState(MOCK_RECORDS);
  const [batches, setBatches] = useState(MOCK_BATCHES);
  const [vaccineStock, setVaccineStock] = useState([]);

  // Form states
  const [vaccinationForm, setVaccinationForm] = useState({
    batch: '',
    vaccineType: '',
    doses: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [restockForm, setRestockForm] = useState({
    vaccineType: '',
    doses: '',
    cost: '',
    expiryDate: '',
    purchaseDate: new Date().toISOString().split('T')[0],
  });

  // Fetch batches
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
            breed: batch.breed,
            startWeight: batch.start_weight,
            currentWeight: batch.current_weight,
            dateAcquired: batch.date_acquired,
            status: batch.status,
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

  // Fetch vaccinations
  const fetchVaccinations = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_BASE}/vaccinations/all`;
      if (selectedBatch !== 'all') {
        url = `${API_BASE}/vaccinations/batch/${selectedBatch}`;
      }
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setVaccinationRecords(json.data || []);
        setUseMock(false);
      } else {
        throw new Error(json.message || 'No records');
      }
    } catch (err) {
      console.warn('Using mock records:', err.message);
      setUseMock(true);
      if (selectedBatch === 'all') {
        setVaccinationRecords(MOCK_RECORDS);
      } else {
        setVaccinationRecords(MOCK_RECORDS.filter((r) => r.batch_id === selectedBatch));
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch vaccine stock
  const fetchVaccineStock = async () => {
    try {
      const res = await fetch(`${API_BASE}/vaccinations/stock`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch stock');
      const json = await res.json();
      if (json.success) {
        setVaccineStock(json.data || []);
      }
    } catch (err) {
      console.warn('Could not fetch vaccine stock:', err.message);
      setVaccineStock([]);
    }
  };

  // Load data
  useEffect(() => {
    fetchBatches();
    fetchVaccineStock();
  }, []);

  useEffect(() => {
    fetchVaccinations();
  }, [selectedBatch, refreshKey]);

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
        setRefreshKey((prev) => prev + 1);
        setShowRecordVaccination(false);
        setVaccinationForm({
          batch: '',
          vaccineType: '',
          doses: '',
          date: new Date().toISOString().split('T')[0],
          notes: '',
        });
        fetchVaccineStock();
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
  const handleDirectMarkAsDone = (batchId, vaccineName, doses) => {
    const payload = {
      batch_id: batchId,
      vaccine_name: vaccineName,
      vaccination_date: new Date().toISOString().split('T')[0],
      dosage: parseInt(doses, 10) || 0,
      notes: 'Marked as done via schedule',
      next_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      administered_by: 'Farmer',
      status: 'Completed',
    };
    handleSaveVaccination(payload);
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
      next_due_date: new Date(new Date(vaccinationForm.date).getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
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
    const price = parseFloat(restockForm.cost) || 0;
    try {
      const res = await fetch(`${API_BASE}/vaccinations/stock/update`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          vaccine_name: vaccineName,
          stock_quantity: doses,
          expiry_date: restockForm.expiryDate || null,
          price_per_dose: price,
        }),
      });
      if (!res.ok) throw new Error('Failed to restock');
      const json = await res.json();
      if (json.success) {
        alert('Stock updated successfully!');
        setShowRestockVaccine(false);
        setRestockForm({
          vaccineType: '',
          doses: '',
          cost: '',
          expiryDate: '',
          purchaseDate: new Date().toISOString().split('T')[0],
        });
        fetchVaccineStock();
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

  const getVaccinePrice = (name) => {
    if (!name) return 0;
    const trimmed = name.trim();
    const stock = vaccineStock.find((s) => s.vaccine_name?.trim() === trimmed);
    if (stock && typeof stock.price_per_dose === 'number' && !isNaN(stock.price_per_dose)) {
      return stock.price_per_dose;
    }
    return DEFAULT_PRICES[trimmed] || 0;
  };

  const calculateBatchVaccinationExpense = (batchId) => {
    const filtered =
      batchId === 'all'
        ? vaccinationRecords
        : vaccinationRecords.filter((r) => r.batch_id === batchId);
    return filtered.reduce((total, rec) => {
      const dosage = Number(rec.dosage);
      const price = getVaccinePrice(rec.vaccine_name);
      const validDosage = isNaN(dosage) ? 0 : dosage;
      return total + validDosage * price;
    }, 0);
  };

  const selectedBatchData = batches.find((b) => b.id === selectedBatch);
  const batchExpense = calculateBatchVaccinationExpense(selectedBatch);
  const filteredRecords = vaccinationRecords;
  const scheduleBatches = batches.length > 0 ? batches : MOCK_BATCHES;

  const totalDoses = vaccinationRecords.reduce((sum, r) => {
    const dosage = Number(r.dosage);
    return sum + (isNaN(dosage) ? 0 : dosage);
  }, 0);

  const uniqueVaccines = new Set(
    vaccinationRecords.map((r) => r.vaccine_name?.trim()).filter(Boolean)
  ).size;

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
              className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-gray-700" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Vaccination Manager</h1>
          </div>
          <div className="flex items-center gap-2">
            {useMock && (
              <span className="text-xs text-yellow-600 bg-yellow-100/80 px-2 py-0.5 rounded-full">
                Offline Mode
              </span>
            )}
            <div className="relative">
              {isOnline ? (
                <Cloud className="w-5 h-5 text-green-600" />
              ) : (
                <CloudOff className="w-5 h-5 text-gray-400" />
              )}
              {pendingSync > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                  {pendingSync}
                </span>
              )}
            </div>
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
                    ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg'
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
                      ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg'
                      : 'bg-white/30 text-gray-700'
                  }`}
                >
                  {batch.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 pb-24">
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100/80 rounded-lg flex items-center justify-center">
                      <Syringe className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-xs text-gray-700 font-semibold">
                      Total Vaccines Administered
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    {isNaN(totalDoses) ? 0 : totalDoses} doses
                  </div>
                  <div className="text-xs text-gray-600">Across {uniqueVaccines} vaccine types</div>
                  <div className="mt-2">
                    {totalDoses === 0 ? (
                      <span className="px-2 py-1 bg-gray-100/80 border border-gray-300/50 rounded-full text-xs text-gray-700 font-semibold">
                        No records
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-green-100/80 border border-green-300/50 rounded-full text-xs text-green-700 font-semibold">
                        {totalDoses} doses
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-white/20 backdrop-blur-lg rounded-2xl p-4 border border-white/30 shadow-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-purple-100/80 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="text-xs text-gray-700 font-semibold">
                      {selectedBatch === 'all' ? 'All Batches' : selectedBatchData?.name || 'Unknown'}
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">
                    ₱
                    {isNaN(batchExpense)
                      ? 0
                      : batchExpense.toLocaleString('en-PH', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-gray-600">
                    {selectedBatch === 'all'
                      ? 'Total vaccination expenses'
                      : 'Vaccination expenses for this batch'}
                  </div>
                </div>
              </div>

              {/* Vaccine Stock Table */}
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
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
                      if (isLow) {
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
                            {item.price_per_dose && ` · ₱${item.price_per_dose.toFixed(2)}/dose`}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                <button
                  onClick={() => setShowRecordVaccination(true)}
                  className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Record Vaccination
                </button>
                <button
                  onClick={() => setShowRestockVaccine(true)}
                  className="bg-white/30 backdrop-blur-lg border border-white/40 text-green-700 font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Restock Vaccine
                </button>
              </div>

              {/* Automated Vaccination Schedule */}
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg mb-4">
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
                    .filter((batch) => (selectedBatch === 'all' ? true : batch.id === selectedBatch))
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
                      const overallStatus = isAllComplete
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
                                {batch.name} – Day {day}
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
                                  onClick={() => {
                                    const doses = String(dueVax.dosePerPig * pigCount);
                                    handleDirectMarkAsDone(batch.id, dueVax.vaccine, doses);
                                  }}
                                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold py-2 rounded-lg shadow-lg active:scale-95 transition-all"
                                >
                                  Mark as Done
                                </button>
                              );
                            })()}
                        </div>
                      );
                    })}
                </div>

                <div className="mt-4 p-3 bg-blue-50/40 rounded-xl border border-blue-200/50">
                  <div className="flex items-start gap-2">
                    <div className="text-blue-600 text-sm">ℹ️</div>
                    <div className="flex-1">
                      <p className="text-xs text-blue-900 font-medium">
                        Standard vaccination schedule:
                      </p>
                      <ul className="text-xs text-blue-800 mt-1 space-y-0.5 ml-2">
                        <li>• Days 7-10: Swine Fever</li>
                        <li>• Days 14-21: E. Coli</li>
                        <li>• Days 28-35: PRRS</li>
                        <li>• Days 42-49: Porcine Circovirus</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vaccination History */}
              <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 overflow-hidden shadow-lg mb-4">
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
                              {record.batch_name || getBatchName(record.batch_id)}
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
                          <span className="px-2 py-1 bg-blue-100/80 border border-blue-300/50 rounded-full text-xs text-blue-700 font-semibold">
                            {record.batch_id}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80%] overflow-y-auto">
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