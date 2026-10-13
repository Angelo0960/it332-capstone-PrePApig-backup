import { useEffect, useState } from 'react';
import { API_BASE, getAuthHeaders } from '../api.js';
import { formatCurrency } from '../utils/formatters.js';

const empty = { batch_id: '', harvest_date: '', pig_count: '', total_weight_kg: '', sale_date: '', revenue: '', buyer: '', notes: '' };
const inputClass = 'w-full px-3 py-2 rounded-xl bg-white/40 border border-white/50 text-gray-900';

export default function HarvestSales({ batches, onChanged }) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setHistoryLoading(true);
    fetch(`${API_BASE}/sales`, { headers: getAuthHeaders(), signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Harvest history unavailable');
        setRecords(result.data);
        setError(null);
      }).catch((err) => { if (err.name !== 'AbortError') setError(err.message); }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/sales${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PUT' : 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ ...form, pig_count: Number(form.pig_count), total_weight_kg: Number(form.total_weight_kg),
          sale_date: form.sale_date || null, revenue: form.revenue === '' ? null : Number(form.revenue) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save harvest/sale');
      setForm(empty); setEditing(null); setOpen(false);
      setRevision((value) => value + 1); onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="bg-white/30 rounded-xl p-3 mb-3">
    <button type="button" disabled={busy} className="text-sm font-semibold text-green-800" onClick={() => { setOpen(!open); setForm(empty); setEditing(null); }}>Record harvest / sale</button>
    <p className="text-xs text-gray-600 my-2">Record total harvested weight and actual sale proceeds. An unsold harvest has no revenue. Records do not change batch counts or standing weights; update those separately after harvest.</p>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {open && <form onSubmit={save} className="space-y-2 mb-3">
      <label className="block text-xs">Batch<select required className={inputClass} value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}><option value="">Select batch</option>{batches.map((row) => <option key={row.id} value={row.id}>{row.batch_code}</option>)}</select></label>
      {[
        ['harvest_date', 'Harvest date', 'date', true], ['pig_count', 'Pigs harvested', 'number', true],
        ['total_weight_kg', 'Total harvested weight (kg)', 'number', true], ['sale_date', 'Sale date (leave blank if unsold)', 'date', false],
        ['revenue', 'Actual total sale proceeds (PHP)', 'number', false], ['buyer', 'Buyer (optional)', 'text', false], ['notes', 'Notes (optional)', 'text', false],
      ].map(([key, label, type, required]) => <label key={key} className="block text-xs">{label}<input className={inputClass} type={type} required={required || key === 'revenue' && !!form.sale_date || key === 'sale_date' && form.revenue !== ''} min={type === 'number' ? key === 'pig_count' ? '1' : key === 'total_weight_kg' ? '0.01' : '0' : undefined} step={type === 'number' ? key === 'pig_count' ? '1' : '0.01' : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <button disabled={busy} className="bg-green-500 text-white font-semibold py-2 px-4 rounded-xl">{busy ? 'Saving...' : editing ? 'Save changes' : 'Save harvest / sale'}</button>
    </form>}
    <div className="max-h-48 overflow-y-auto space-y-2">
      {historyLoading && <p className="text-xs text-gray-600">Loading harvest history...</p>}
      {records.length === 0 && !historyLoading && !error && <p className="text-xs text-gray-600">No harvests or sales recorded.</p>}
      {records.map((row) => <div key={row.id} className="text-xs bg-white/40 rounded-lg p-2 flex justify-between gap-2">
        <div>{batches.find((batch) => batch.id === row.batch_id)?.batch_code || 'Batch'} | {row.harvest_date} | {row.pig_count} pigs | {row.total_weight_kg} kg<br />{row.sale_date ? `Sold ${row.sale_date}: ${formatCurrency(row.revenue)}` : 'Unsold harvest'}</div>
        <button type="button" disabled={busy} className="text-green-800 font-semibold" onClick={() => { setEditing(row.id); setForm(Object.fromEntries(Object.keys(empty).map((key) => [key, row[key] ?? '']))); setOpen(true); }}>Edit</button>
      </div>)}
    </div>
  </div>;
}
