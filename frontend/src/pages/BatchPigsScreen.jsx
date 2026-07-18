import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Pencil, X, Check, Home, Package, Syringe, TrendingUp } from 'lucide-react';
import backgroundImage from '../../src/assets/Gemini_Generated_Image_o4e5bbo4e5bbo4e5.png';
import BottomNav from '../components/BottomNav';
// ─── IMPORT FROM CENTRAL api.js ───────────────────────────────
import { API_BASE, getAuthHeaders } from '../api.js';
// ────────────────────────────────────────────────────────────────

export default function BatchPigsScreen() {
  const navigate = useNavigate();
  const { batchId } = useParams();
  const [loading, setLoading] = useState(true);
  const [pigs, setPigs] = useState([]);
  const [batchName, setBatchName] = useState('');
  const [error, setError] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPig, setEditingPig] = useState(null);

  // Form states
  const [newPig, setNewPig] = useState({ weight: '', health_status: 'Healthy', notes: '' });
  const [editPig, setEditPig] = useState({ weight: '', health_status: '', notes: '' });

  // Fetch pigs
  const fetchPigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pigs/batch/${batchId}/pigs`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch pigs');
      const json = await res.json();
      if (json.success) {
        setPigs(json.data);
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch batch name
  const fetchBatchName = async () => {
    try {
      const res = await fetch(`${API_BASE}/pigs/${batchId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch batch');
      const json = await res.json();
      if (json.success) {
        setBatchName(json.data.batch_code || 'Batch');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchBatchName();
    fetchPigs();
  }, [batchId]);

  // Add pig
  const handleAddPig = async () => {
    if (!newPig.weight) {
      alert('Weight is required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/pig`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          batch_id: batchId,
          weight: parseFloat(newPig.weight),
          health_status: newPig.health_status || 'Healthy',
          notes: newPig.notes || '',
        }),
      });
      if (!res.ok) throw new Error('Failed to add pig');
      const json = await res.json();
      if (json.success) {
        await fetchPigs();
        setShowAddModal(false);
        setNewPig({ weight: '', health_status: 'Healthy', notes: '' });
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alert('Error adding pig: ' + err.message);
    }
  };

  // Edit pig
  const handleEditPig = (pig) => {
    setEditingPig(pig);
    setEditPig({
      weight: pig.weight.toString(),
      health_status: pig.health_status || 'Healthy',
      notes: pig.notes || '',
    });
    setShowEditModal(true);
  };

  const handleUpdatePig = async () => {
    if (!editPig.weight) {
      alert('Weight is required');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/pigs/pig/${editingPig.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          weight: parseFloat(editPig.weight),
          health_status: editPig.health_status || 'Healthy',
          notes: editPig.notes || '',
        }),
      });
      if (!res.ok) throw new Error('Failed to update pig');
      const json = await res.json();
      if (json.success) {
        await fetchPigs();
        setShowEditModal(false);
        setEditingPig(null);
        setEditPig({ weight: '', health_status: '', notes: '' });
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alert('Error updating pig: ' + err.message);
    }
  };

  // Delete pig
  const handleDeletePig = async (pigId) => {
    if (!window.confirm('Are you sure you want to delete this pig?')) return;
    try {
      const res = await fetch(`${API_BASE}/pigs/pig/${pigId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete pig');
      const json = await res.json();
      if (json.success) {
        await fetchPigs();
      } else {
        throw new Error(json.message);
      }
    } catch (err) {
      alert('Error deleting pig: ' + err.message);
    }
  };

  const totalWeight = pigs.reduce((sum, p) => sum + p.weight, 0);
  const avgWeight = pigs.length > 0 ? totalWeight / pigs.length : 0;

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col">
      <div className="absolute inset-0">
        <img src={backgroundImage} alt="Farm Background" className="w-full h-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col flex-1 min-h-screen">
        {/* Header */}
        <div className="px-4 md:px-8 lg:px-12 pt-3 pb-2 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {batchName} – Pigs
            <span className="text-sm font-normal ml-2 text-gray-600">({pigs.length} pigs)</span>
          </h1>
          <div className="flex-1" />
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold px-4 py-2 rounded-xl shadow-lg active:scale-95 transition-transform flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {/* Summary */}
        <div className="px-4 md:px-8 lg:px-12 mb-4">
          <div className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg flex justify-around">
            <div className="text-center">
              <div className="text-xs text-gray-600">Total Weight</div>
              <div className="text-lg font-bold text-gray-900">{totalWeight.toFixed(2)} kg</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-600">Avg Weight</div>
              <div className="text-lg font-bold text-gray-900">{avgWeight.toFixed(2)} kg</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-600">Count</div>
              <div className="text-lg font-bold text-gray-900">{pigs.length}</div>
            </div>
          </div>
        </div>

        {/* Pig List */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 pb-24">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-600">Loading...</div>
          ) : error ? (
            <div className="bg-red-100/20 border border-red-300/50 rounded-xl p-4 text-red-700">
              <p>{error}</p>
              <button onClick={fetchPigs} className="mt-2 underline">
                Retry
              </button>
            </div>
          ) : pigs.length === 0 ? (
            <div className="text-center py-20 text-gray-500">No pigs in this batch yet.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pigs.map((pig) => (
                <div
                  key={pig.id}
                  className="bg-white/20 backdrop-blur-lg rounded-2xl border border-white/30 p-4 shadow-lg flex flex-col"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{pig.weight} kg</div>
                      <div className="text-xs text-gray-600">
                        Health:{' '}
                        <span
                          className={`font-medium ${
                            pig.health_status === 'Healthy' ? 'text-green-600' : 'text-yellow-600'
                          }`}
                        >
                          {pig.health_status}
                        </span>
                      </div>
                      {pig.notes && <div className="text-xs text-gray-500 mt-1">📝 {pig.notes}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditPig(pig)}
                        className="w-7 h-7 rounded-full bg-blue-100/80 flex items-center justify-center hover:bg-blue-200 transition-all"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleDeletePig(pig.id)}
                        className="w-7 h-7 rounded-full bg-red-100/80 flex items-center justify-center hover:bg-red-200 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <BottomNav active="" />
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/30">
              <h2 className="text-lg font-bold text-gray-900">Add Pig</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <X className="w-4 h-4 text-gray-700" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Weight (kg)</label>
                <input
                  type="number"
                  value={newPig.weight}
                  onChange={(e) => setNewPig({ ...newPig, weight: e.target.value })}
                  placeholder="25.5"
                  step="0.1"
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Health Status
                </label>
                <select
                  value={newPig.health_status}
                  onChange={(e) => setNewPig({ ...newPig, health_status: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                >
                  <option value="Healthy">Healthy</option>
                  <option value="Sick">Sick</option>
                  <option value="Recovering">Recovering</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Notes</label>
                <textarea
                  value={newPig.notes}
                  onChange={(e) => setNewPig({ ...newPig, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                  placeholder="Any notes..."
                />
              </div>
              <button
                onClick={handleAddPig}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
              >
                Add Pig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingPig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white/30 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl w-full max-w-sm max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/30">
              <h2 className="text-lg font-bold text-gray-900">Edit Pig</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingPig(null);
                }}
                className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-lg flex items-center justify-center shadow-[4px_4px_8px_rgba(0,0,0,0.15),-4px_-4px_8px_rgba(255,255,255,0.7)] active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.15),inset_-2px_-2px_4px_rgba(255,255,255,0.7)] transition-all"
              >
                <X className="w-4 h-4 text-gray-700" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Weight (kg)</label>
                <input
                  type="number"
                  value={editPig.weight}
                  onChange={(e) => setEditPig({ ...editPig, weight: e.target.value })}
                  step="0.1"
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Health Status
                </label>
                <select
                  value={editPig.health_status}
                  onChange={(e) => setEditPig({ ...editPig, health_status: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                >
                  <option value="Healthy">Healthy</option>
                  <option value="Sick">Sick</option>
                  <option value="Recovering">Recovering</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Notes</label>
                <textarea
                  value={editPig.notes}
                  onChange={(e) => setEditPig({ ...editPig, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl bg-white/40 backdrop-blur-lg border border-white/50 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none"
                />
              </div>
              <button
                onClick={handleUpdatePig}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}