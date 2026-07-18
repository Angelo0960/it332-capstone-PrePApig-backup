import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import {
  Home,
  DollarSign,
  Package,
  TrendingUp,
  Tag,
  Syringe,
  Bell,
  X,
  Plus,
  Scale,
  User,
  LogOut,
  Trash2,
  Pencil,
  Users,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import pigImage from '../../src/assets/Gemini_Generated_Image_92oun292oun292ou-removebg-preview (1).png';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
// ────────────────────────────────────────────────────────────────

// Calculate profit in pesos
const calculateProfit = (weight, pricePerKg, expenses) => {
  if (!weight || !pricePerKg || weight === 0 || pricePerKg === 0) return 0;
  if (expenses === undefined || expenses === null) return 0;
  const revenue = weight * pricePerKg;
  const profit = revenue - expenses;
  return Math.round(Math.max(0, profit));
};

// Format number with commas
const formatPeso = (amount) => {
  return amount.toLocaleString('en-PH');
};

// Calculate pig size based on age (day)
const calculatePigScale = (day) => {
  if (day <= 15) return 0.8 + (day / 15) * 0.4;
  else if (day <= 35) return 1.2 + ((day - 15) / 20) * 0.7;
  else if (day <= 50) return 1.9 + ((day - 35) / 15) * 0.4;
  else return Math.min(2.5, 2.3 + ((day - 50) / 20) * 0.2);
};

// Decode JWT to get user info
const getUserFromToken = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name || payload.email,
    };
  } catch {
    return null;
  }
};

export default function DashboardScreen() {
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [dragDirection, setDragDirection] = useState(0);

  // Edit pig count state
  const [showEditPigModal, setShowEditPigModal] = useState(false);
  const [editBatchId, setEditBatchId] = useState(null);
  const [editPigCount, setEditPigCount] = useState('');

  const [notifications, setNotifications] = useState([]);

  const [newBatch, setNewBatch] = useState({
    pig_count: '',
    breed: '',
    start_weight: '',
    date_acquired: '',
    status: 'Active',
  });

  const currentBatch = batches[currentBatchIndex];
  const user = getUserFromToken();

  // Feed stock data - mock (can be replaced later)
  const feedStocks = [
    { type: 'Starter Mash', stock: 48 },
    { type: 'Grower Pellet', stock: 245 },
    { type: 'Finisher', stock: 120 },
  ];

  // Helper functions for feed scheduling
  const getFeedTypeForAge = (day) => {
    if (day <= 21) return 'starter';
    if (day <= 49) return 'grower';
    return 'finisher';
  };

  const getFeedTypeName = (feedType) => {
    const names = { starter: 'Starter Mash', grower: 'Grower Pellet', finisher: 'Finisher' };
    return names[feedType];
  };

  const getDaysUntilFeedChange = (day) => {
    if (day <= 21) return 22 - day;
    if (day <= 49) return 50 - day;
    return null;
  };

  // Vaccination scheduling
  const vaccinationSchedule = [
    { vaccine: 'Swine Fever', minDay: 7, maxDay: 10 },
    { vaccine: 'E. Coli', minDay: 14, maxDay: 21 },
    { vaccine: 'PRRS', minDay: 28, maxDay: 35 },
    { vaccine: 'Porcine Circovirus', minDay: 42, maxDay: 49 },
  ];

  const getNextVaccination = (day) => {
    for (const vax of vaccinationSchedule) {
      if (day < vax.maxDay) return vax;
    }
    return null;
  };

  const isVaccinationDue = (day, vaccine) => {
    return day >= vaccine.minDay && day <= vaccine.maxDay;
  };

  const isVaccinationOverdue = (day, vaccine) => {
    return day > vaccine.maxDay;
  };

  // ---------- Generate unique batch code ----------
  const generateBatchCode = () => {
    const codes = batches.map((b) => b.batch_code).filter(Boolean);
    if (codes.length === 0) return 'BATCH-001';
    let maxNum = 0;
    codes.forEach((code) => {
      const parts = code.split('-');
      if (parts.length === 2) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `BATCH-${String(nextNum).padStart(3, '0')}`;
  };

  // ---------- Fetch notifications ----------
  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE}/notifications/all`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setNotifications([]);
    }
  };

  // ---------- Mark all as read ----------
  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    try {
      await Promise.all(
        unread.map(async (n) => {
          await fetch(`${API_BASE}/notifications/${n.id}/read`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
          });
        })
      );
      await fetchNotifications();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  // ---------- Fetch batches ----------
  const fetchBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pigs/all`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch batches');
      const json = await res.json();
      if (json.success) {
        const mapped = json.data.map((batch) => {
          const acquired = new Date(batch.date_acquired);
          const now = new Date();
          const day = Math.max(0, Math.floor((now - acquired) / (1000 * 60 * 60 * 24)));
          const name = batch.batch_code || `Batch ${batch.id}`;
          const growth = Math.min(100, Math.floor(day / 0.5));
          const vaccination = Math.min(100, Math.floor((day / 50) * 100));
          const health = 80;
          const feed = Math.max(0, 100 - Math.floor(day / 1.2));
          return {
            id: batch.id,
            name: name,
            batch_code: batch.batch_code,
            pigCount: batch.pig_count || 0,
            day: day,
            growth: growth,
            vaccination: vaccination,
            health: health,
            feed: feed,
            weight: batch.current_weight || batch.start_weight || 0,
            pricePerKg: 180,
            expenses: (batch.pig_count || 0) * 1000,
          };
        });
        setBatches(mapped);
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError(err.message);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Delete batch ----------
  const handleDeleteBatch = async (batchId, batchName) => {
    if (!window.confirm(`Are you sure you want to delete "${batchName}"? This will also delete all its pigs.`)) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/${batchId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete batch');
      const json = await res.json();
      if (json.success) {
        await fetchBatches();
        if (currentBatchIndex >= batches.length - 1 && currentBatchIndex > 0) {
          setCurrentBatchIndex(currentBatchIndex - 1);
        } else if (batches.length === 1) {
          setCurrentBatchIndex(0);
        }
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error deleting batch: ' + err.message);
    }
  };

  // ---------- Open edit pig modal ----------
  const handleOpenEditPig = (batchId, currentCount) => {
    setEditBatchId(batchId);
    setEditPigCount(String(currentCount));
    setShowEditPigModal(true);
  };

  // ---------- Update pig count ----------
  const handleUpdatePigCount = async () => {
    const newCount = parseInt(editPigCount);
    if (isNaN(newCount) || newCount < 0) {
      alert('Please enter a valid number');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/${editBatchId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ pig_count: newCount }),
      });
      if (!res.ok) throw new Error('Failed to update pig count');
      const json = await res.json();
      if (json.success) {
        await fetchBatches();
        setShowEditPigModal(false);
        setEditBatchId(null);
        setEditPigCount('');
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error updating pig count: ' + err.message);
    }
  };

  // ---------- Load data ----------
  useEffect(() => {
    fetchBatches();
    fetchNotifications();
  }, []);

  // ---------- Logout ----------
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  // ---------- Render "no batches" state ----------
  if (!loading && batches.length === 0) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
        <div className="absolute inset-0">
          <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="bg-white/30 backdrop-blur-lg p-8 rounded-2xl shadow-lg text-center">
            <p className="text-gray-700">No batches available</p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            <button onClick={fetchBatches} className="mt-4 px-4 py-2 bg-green-500 text-white rounded-xl shadow-lg">
              Retry
            </button>
            <button
              onClick={() => setShowAddBatch(true)}
              className="mt-2 ml-2 px-4 py-2 bg-blue-500 text-white rounded-xl shadow-lg"
            >
              Add Batch
            </button>
          </div>
        </div>
        <BottomNav active="Home" />
      </div>
    );
  }

  // ---------- Handle adding a batch ----------
  const handleAddBatch = async () => {
    if (!newBatch.pig_count || !newBatch.start_weight || !newBatch.date_acquired) {
      alert('Please fill in all required fields (Number of Pigs, Start Weight, Date Acquired)');
      return;
    }

    const batchCode = generateBatchCode();

    try {
      const res = await fetch(`${API_BASE}/pigs/create`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          batch_code: batchCode,
          pig_count: parseInt(newBatch.pig_count),
          breed: newBatch.breed || 'Unknown',
          start_weight: parseFloat(newBatch.start_weight),
          current_weight: parseFloat(newBatch.start_weight),
          date_acquired: newBatch.date_acquired,
          status: 'Active',
        }),
      });
      if (!res.ok) throw new Error('Failed to create batch');
      const json = await res.json();
      if (json.success) {
        await fetchBatches();
        setShowAddBatch(false);
        setNewBatch({ pig_count: '', breed: '', start_weight: '', date_acquired: '', status: 'Active' });
      } else {
        throw new Error(json.message || 'Unknown error');
      }
    } catch (err) {
      alert('Error adding batch: ' + err.message);
    }
  };

  // ---------- Swipe handling ----------
  const handleDragEnd = (_event, info) => {
    const swipeThreshold = 50;
    if (batches.length === 0) return;
    if (info.offset.x > swipeThreshold) {
      setDragDirection(1);
      setCurrentBatchIndex((prev) => (prev > 0 ? prev - 1 : batches.length - 1));
    } else if (info.offset.x < -swipeThreshold) {
      setDragDirection(-1);
      setCurrentBatchIndex((prev) => (prev < batches.length - 1 ? prev + 1 : 0));
    }
  };

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
        <div className="absolute inset-0">
          <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="text-gray-700">Loading...</div>
        </div>
        <BottomNav active="Home" />
      </div>
    );
  }

  // ---------- Notification style helper ----------
  const getNotificationStyle = (type) => {
    switch (type) {
      case 'vaccination':
        return { icon: '💉', bg: 'bg-blue-100/80' };
      case 'vaccination_reminder':
        return { icon: '💉', bg: 'bg-yellow-100/80' };
      case 'vaccination_overdue':
        return { icon: '⚠️', bg: 'bg-red-100/80' };
      case 'feed_reminder':
        return { icon: '🐖', bg: 'bg-green-100/80' };
      case 'feed':
        return { icon: '🐖', bg: 'bg-green-100/80' };
      default:
        return { icon: '📢', bg: 'bg-gray-100/80' };
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Prep<span className="text-pink-500">A</span>Pig
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications) markAllAsRead();
                }}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all relative"
              >
                <Bell className="w-4 h-4 text-gray-700" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowProfileModal(true)}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <span className="text-pink-500 text-sm">👤</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 pb-24">
          {batches.length > 0 && currentBatch && (
            <>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentBatch.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 mb-4"
                >
                  <div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg border border-white/30 p-3 relative">
                    <div className="text-xs text-gray-700 mb-1 font-medium">
                      {currentBatch.name}: {currentBatch.pigCount} Pigs
                      <button
                        onClick={() => handleOpenEditPig(currentBatch.id, currentBatch.pigCount)}
                        className="ml-1 inline-flex items-center text-blue-500 hover:text-blue-700 transition-colors"
                        title="Edit pig count"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-sm font-bold text-gray-900">Day {currentBatch.day}</div>
                    <button
                      onClick={() => navigate(`/batch/${currentBatch.id}/pigs`)}
                      className="absolute bottom-2 left-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-lg shadow-lg hover:bg-blue-600 transition-colors flex items-center gap-1"
                    >
                      <Users className="w-3 h-3" />
                      View Pigs
                    </button>
                    <button
                      onClick={() => handleDeleteBatch(currentBatch.id, currentBatch.name)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100/80 flex items-center justify-center hover:bg-red-200 transition-all"
                      title="Delete batch"
                    >
                      <Trash2 className="w-3 h-3 text-red-600" />
                    </button>
                  </div>
                  <div className="bg-white/20 backdrop-blur-lg rounded-2xl shadow-lg border border-white/30 p-3">
                    <div className="text-xs text-gray-700 mb-1 font-medium">Estimated Profit</div>
                    <div className="text-sm font-bold text-green-600">
                      ₱
                      {currentBatch?.weight !== undefined &&
                      currentBatch?.pricePerKg !== undefined &&
                      currentBatch?.expenses !== undefined
                        ? formatPeso(
                            calculateProfit(
                              currentBatch.weight,
                              currentBatch.pricePerKg,
                              currentBatch.expenses
                            )
                          )
                        : '0'}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <AnimatePresence mode="wait">
                <motion.div
                  key={`progress-${currentBatch.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2 mb-4"
                >
                  {/* Vaccination */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">Vaccination</span>
                      <span className="text-xs font-bold text-blue-600">
                        {Math.round(currentBatch.vaccination / 25)}/4 shots
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((shot) => (
                        <motion.div
                          key={`vac-${shot}`}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3, delay: shot * 0.1 }}
                        >
                          <Syringe
                            className={`w-5 h-5 ${
                              currentBatch.vaccination >= shot * 25
                                ? 'text-blue-500 fill-blue-500'
                                : 'text-gray-800/30'
                            } transition-colors duration-300`}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Avg Weight */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">Avg Weight</span>
                      <span className="text-xs font-bold text-purple-600">
                        {Math.round(currentBatch.weight / currentBatch.pigCount)} kg/pig
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((level) => {
                        const avgWeight = currentBatch.weight / currentBatch.pigCount;
                        const targetWeight =
                          currentBatch.day <= 21 ? 30 : currentBatch.day <= 49 ? 60 : 90;
                        const weightProgress = Math.min(100, (avgWeight / targetWeight) * 100);
                        return (
                          <motion.div
                            key={`weight-${level}`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.3, delay: level * 0.1 }}
                          >
                            <Scale
                              className={`w-5 h-5 ${
                                weightProgress >= level * 25
                                  ? 'text-purple-500 fill-purple-500'
                                  : 'text-gray-800/30'
                              } transition-colors duration-300`}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feed Level */}
                  <div className="bg-white/20 backdrop-blur-lg rounded-xl p-3 shadow-lg border border-white/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-800">
                        Feed: {getFeedTypeName(getFeedTypeForAge(currentBatch.day))}
                      </span>
                      <span className="text-xs font-bold text-orange-600">{currentBatch.feed}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4].map((bag) => (
                        <motion.div
                          key={`feed-${bag}`}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.3, delay: bag * 0.1 }}
                        >
                          <Package
                            className={`w-5 h-5 ${
                              currentBatch.feed >= bag * 25
                                ? 'text-orange-500 fill-orange-500'
                                : 'text-gray-800/30'
                            } transition-colors duration-300`}
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Pig Character */}
              <div className="flex items-center justify-center py-8 mb-4 relative min-h-[200px] md:min-h-[240px] lg:min-h-[288px]">
                <AnimatePresence mode="wait" custom={dragDirection}>
                  <motion.div
                    key={currentBatch.id}
                    custom={dragDirection}
                    initial={{ x: dragDirection * 300, opacity: 0, scale: 0.8 }}
                    animate={{ x: 0, opacity: 1, scale: 1 }}
                    exit={{ x: -dragDirection * 300, opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={handleDragEnd}
                    className="relative w-64 h-48 md:w-80 md:h-60 lg:w-96 lg:h-72 cursor-grab active:cursor-grabbing"
                  >
                    <motion.img
                      src={pigImage}
                      alt="Pig Character"
                      className="w-full h-full object-cover pointer-events-none"
                      animate={{ scale: calculatePigScale(currentBatch.day) }}
                      transition={{ duration: 0.5, ease: 'easeInOut' }}
                    />
                  </motion.div>
                </AnimatePresence>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2">
                  {batches.map((batch, index) => (
                    <button
                      key={batch.id}
                      onClick={() => {
                        setDragDirection(index > currentBatchIndex ? -1 : 1);
                        setCurrentBatchIndex(index);
                      }}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentBatchIndex ? 'bg-white w-6 shadow-lg' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Floating Add Button */}
        <button
          onClick={() => setShowAddBatch(true)}
          className="absolute bottom-24 right-6 w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-[8px_8px_16px_rgba(0,0,0,0.3),-8px_-8px_16px_rgba(255,255,255,0.1)] active:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.3),inset_-4px_-4px_8px_rgba(255,255,255,0.1)] transition-all z-40"
        >
          <Plus className="w-7 h-7 text-white" />
        </button>

        {/* Add Batch Modal */}
        {showAddBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Add New Batch</h2>
                <button
                  onClick={() => {
                    setShowAddBatch(false);
                    setNewBatch({
                      pig_count: '',
                      breed: '',
                      start_weight: '',
                      date_acquired: '',
                      status: 'Active',
                    });
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="text-xs text-gray-500 mb-2">
                  Batch code will be auto-generated:{' '}
                  <span className="font-mono font-semibold text-gray-700">
                    {generateBatchCode()}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Number of Pigs
                  </label>
                  <input
                    type="number"
                    value={newBatch.pig_count}
                    onChange={(e) => setNewBatch({ ...newBatch, pig_count: e.target.value })}
                    placeholder="12"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Breed (optional)
                  </label>
                  <input
                    type="text"
                    value={newBatch.breed}
                    onChange={(e) => setNewBatch({ ...newBatch, breed: e.target.value })}
                    placeholder="Landrace"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Start Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={newBatch.start_weight}
                    onChange={(e) => setNewBatch({ ...newBatch, start_weight: e.target.value })}
                    placeholder="15"
                    step="0.1"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Date Acquired
                  </label>
                  <input
                    type="date"
                    value={newBatch.date_acquired}
                    onChange={(e) => setNewBatch({ ...newBatch, date_acquired: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={handleAddBatch}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Add Batch
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Pig Count Modal */}
        {showEditPigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Edit Pig Count</h2>
                <button
                  onClick={() => {
                    setShowEditPigModal(false);
                    setEditBatchId(null);
                    setEditPigCount('');
                  }}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Number of Pigs
                  </label>
                  <input
                    type="number"
                    value={editPigCount}
                    onChange={(e) => setEditPigCount(e.target.value)}
                    placeholder="12"
                    min="0"
                    className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                  />
                </div>

                <button
                  onClick={handleUpdatePigCount}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
                >
                  Update
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Modal */}
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm md:max-w-md lg:max-w-lg">
              <div className="flex items-center justify-between p-5 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Profile</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-pink-100/80 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-pink-500" />
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{user?.name || 'User'}</div>
                    <div className="text-sm text-gray-600">{user?.email || 'No email'}</div>
                  </div>
                </div>

                <div className="border-t border-white/30 pt-4">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-transform"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Panel */}
        {showNotifications && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-[90%] md:w-[70%] lg:w-[50%] max-h-[70%] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-white/30">
                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
                >
                  <X className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {notifications.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No notifications</p>
                ) : (
                  notifications.map((notif) => {
                    const style = getNotificationStyle(notif.type);
                    return (
                      <div
                        key={notif.id}
                        className={`bg-white/20 backdrop-blur-lg rounded-2xl p-4 shadow-lg border border-white/30 ${
                          !notif.is_read ? 'border-l-4 border-l-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 ${style.bg} rounded-full flex items-center justify-center flex-shrink-0`}
                          >
                            <span className="text-xl">{style.icon}</span>
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-sm text-gray-900">{notif.title}</h3>
                            <p className="text-xs text-gray-700">{notif.message}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(notif.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <BottomNav active="Home" />
      </div>
    </div>
  );
}