import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE, getAuthHeaders } from '../api.js';
import BottomNav from '../components/BottomNav.jsx';

const glass = 'bg-white/30 backdrop-blur-xl rounded-2xl border border-white/40 p-4 shadow-lg';
const input = 'w-full rounded-xl bg-white/60 border border-white/50 p-2 text-gray-900';
const button = 'rounded-xl bg-purple-600 text-white px-4 py-2 disabled:opacity-50';
async function request(path, method = 'GET', body) {
 const response = await fetch(`${API_BASE}${path}`, { method, headers: getAuthHeaders(), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
 const result = await response.json();
 if (!response.ok) throw new Error(result.message || 'Request failed');
 return result;
}
async function paged(path) {
 const data = [];
 for (let offset = 0; ; offset += 500) {
  const result = await request(`${path}?limit=500&offset=${offset}`);
  data.push(...result.data);
  if (result.data.length < 500) return { data };
 }
}
const configs = {
 mortality: { title: 'Mortality tracking', endpoint: '/management/mortality', date: 'death_date', fields: ['count', 'cause', 'notes'], required: ['count', 'cause'] },
 treatments: { title: 'Health & treatment history', endpoint: '/management/treatments', date: 'treatment_date', fields: ['condition', 'treatment', 'medication', 'dosage', 'administered_by', 'outcome', 'notes'], required: ['condition', 'treatment'] },
 expenses: { title: 'Expense management', endpoint: '/expenses/all', date: 'expense_date', fields: ['expense_type', 'amount', 'description'], required: ['expense_type', 'amount'] },
};
function Field({ name, value, onChange, required = false }) {
 return <label className="block text-sm text-gray-700">{name.replaceAll('_', ' ')}<input className={input} name={name} value={value ?? ''} onChange={onChange} required={required} type={name.endsWith('_date') ? 'date' : ['count', 'amount'].includes(name) ? 'number' : 'text'} min={name === 'count' ? 1 : 0} step={name === 'count' ? 1 : name === 'amount' ? '0.01' : undefined} maxLength={2000} /></label>;
}
export default function FarmManagementScreen({ section = 'mortality' }) {
 const config = configs[section];
 const [rows, setRows] = useState([]);
 const [batches, setBatches] = useState([]);
 const [form, setForm] = useState({});
 const [editing, setEditing] = useState(null);
 const [profile, setProfile] = useState({});
 const [preferences, setPreferences] = useState({});
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [message, setMessage] = useState('');
 const [loaded, setLoaded] = useState(false);
 const [validation, setValidation] = useState(null);
 const [filter, setFilter] = useState('');
 const [from, setFrom] = useState('');
 const [to, setTo] = useState('');
 async function load() {
  setLoaded(false);
  if (config) {
   const [records, batchResult] = await Promise.all([section === 'expenses' ? paged(config.endpoint) : request(config.endpoint), paged('/pigs/all')]);
   setRows(records.data || []); setBatches(batchResult.data || []);
  } else {
   const result = await request('/management/settings');
   setProfile(result.profile); setPreferences(result.preferences);
  }
  setLoaded(true);
 }
 useEffect(() => { load().catch((err) => setError(err.message)); }, [section]);
 async function act(work) {
  setBusy(true); setError(''); setMessage('');
  try { await work(); } catch (err) { setError(err.message); } finally { setBusy(false); }
 }
 const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
 async function save(event) {
  event.preventDefault();
  await act(async () => {
   const payload = { ...form, batch_id: form.batch_id || null };
   for (const field of ['amount', 'count']) if (config.fields.includes(field)) payload[field] = Number(form[field]);
   const path = section === 'expenses' ? editing ? `/expenses/${editing}` : '/expenses/create' : config.endpoint;
   await request(path, editing ? 'PUT' : 'POST', payload);
   setForm({}); setEditing(null); await load(); setMessage('Record saved.');
  });
 }
 async function remove(row) {
  if (!window.confirm(section === 'mortality' ? 'Delete this mistaken mortality entry and restore its count to the batch?' : 'Delete this record?')) return;
  await act(async () => { await request(section === 'expenses' ? `/expenses/${row.id}` : `${config.endpoint}/${row.id}`, 'DELETE'); await load(); setMessage('Record deleted.'); });
 }
 const visible = config ? rows.filter((row) => (!filter || row.batch_id === filter) && (!from || row[config.date] >= from) && (!to || row[config.date] <= to)) : [];
 return <div className="mobile-screen-shell bg-gradient-to-br from-purple-100 via-pink-50 to-blue-100"><div className="mobile-screen-layer"><main className="mobile-page-content max-w-4xl mx-auto p-5 space-y-4">
  <h1 className="text-2xl font-bold text-gray-900">{config?.title || 'Profile & farm settings'}</h1>
  <nav className={`${glass} flex flex-wrap gap-3`} aria-label="Farm management"><Link to="/mortality">Mortality</Link><Link to="/treatments">Health history</Link><Link to="/expenses">Expenses</Link><Link to="/settings">Settings & backup</Link></nav>
  {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status" className="text-green-800">{message}</p>}
  {!loaded && !error && <p>Loading farm records…</p>}
  {config ? <>
   <form className={`${glass} space-y-3`} onSubmit={save}>
    <h2 className="font-semibold">{editing ? 'Edit expense' : 'Add record'}</h2>
    {section === 'mortality' && <p className="text-sm">Recorded deaths reduce the remaining batch count. No historical deaths are inferred. Individual pig rows are not reassigned by this batch-level ledger.</p>}
    <label className="block text-sm">Batch<select className={input} name="batch_id" value={form.batch_id || ''} onChange={change} required={section !== 'expenses'}><option value="">{section === 'expenses' ? 'Farm-wide expense' : 'Select batch'}</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code} ({batch.pig_count} remaining)</option>)}</select></label>
    <Field name={config.date} value={form[config.date]} onChange={change} required />
    {config.fields.map((field) => <Field key={field} name={field} value={form[field]} onChange={change} required={config.required.includes(field)} />)}
    <button className={button} disabled={busy || !loaded}>Save record</button>{editing && <button type="button" className="ml-3" onClick={() => { setEditing(null); setForm({}); }}>Cancel edit</button>}
   </form>
   <section className={`${glass} space-y-3`}><h2 className="font-semibold">Recorded history</h2>
    <label className="block text-sm">Filter by batch<select className={input} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All batches</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code}</option>)}</select></label>
    <div className="flex gap-3"><label>From<input className={input} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input className={input} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div>
    {section === 'expenses' && <p>Filtered manual expenses: ₱{visible.reduce((sum, row) => sum + Number(row.amount), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}
    {loaded && !visible.length && <p>No records in this selection.</p>}
    {visible.map((row) => <article className="bg-white/40 rounded-xl p-3 space-y-2" key={row.id}><p className="font-semibold">{row[config.date]} · {batches.find((batch) => batch.id === row.batch_id)?.batch_code || 'Farm-wide'}</p>{config.fields.map((field) => row[field] !== null && row[field] !== undefined && row[field] !== '' ? <p className="text-sm whitespace-pre-wrap" key={field}>{field.replaceAll('_', ' ')}: {row[field]}</p> : null)}
     {section === 'expenses' && <button disabled={busy} className="mr-4 text-purple-700" onClick={() => { setEditing(row.id); setForm(Object.fromEntries(['batch_id', config.date, ...config.fields].map((key) => [key, row[key] ?? '']))); }}>Edit</button>}<button disabled={busy} className="text-red-700" onClick={() => remove(row)}>Delete{section === 'mortality' ? ' mistaken entry' : ''}</button></article>)}
   </section>
  </> : <>
   <form className={`${glass} space-y-3`} onSubmit={(event) => { event.preventDefault(); act(async () => { const fields = ['first_name', 'middle_name', 'last_name', 'phone_number', 'farm_name', 'farm_address']; const result = await request('/management/settings/profile', 'PUT', Object.fromEntries(fields.map((field) => [field, profile[field] || '']))); setProfile(result.data); setMessage('Profile and farm settings saved.'); }); }}>
    <h2 className="font-semibold">Profile & farm</h2><p>{profile.email}</p>{['first_name', 'middle_name', 'last_name', 'phone_number', 'farm_name', 'farm_address'].map((field) => <Field key={field} name={field} value={profile[field]} onChange={(event) => setProfile({ ...profile, [field]: event.target.value })} />)}<button className={button} disabled={busy || !loaded}>Save settings</button>
   </form>
   <form className={`${glass} space-y-3`} onSubmit={(event) => { event.preventDefault(); act(async () => { await request('/management/settings/notifications', 'PUT', preferences); setMessage('Notification preferences saved.'); }); }}><h2 className="font-semibold">Notification preferences</h2>{['feed_reminders', 'vaccination_reminders', 'push_enabled'].map((field) => <label className="flex gap-3" key={field}><input type="checkbox" checked={preferences[field] ?? false} onChange={(event) => setPreferences({ ...preferences, [field]: event.target.checked })} />{field.replaceAll('_', ' ')}</label>)}<p className="text-sm">Push delivery also requires browser permission. Reminder switches control future in-app and push reminders.</p><button className={button} disabled={busy || !loaded}>Save preferences</button></form>
   <section className={`${glass} space-y-3`}><h2 className="font-semibold">JSON backup & validation</h2><p className="text-sm">Export stored farm records for this account. Credentials and device tokens are excluded. Reads are live, not a transactional snapshot. Validation checks structure and ownership; it does not import or restore records.</p>
    <button className={button} disabled={busy} onClick={() => act(async () => { const data = await request('/management/backup'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `prepapig-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('JSON export downloaded.'); })}>Download JSON export</button>
    <label className="block">Validate an export<input className={input} type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; setValidation(null); if (file) act(async () => { if (file.size > 900000) throw new Error('Validation currently supports files up to 900 KB. Larger exports can be downloaded but cannot be validated here.'); const result = await request('/management/backup/validate', 'POST', JSON.parse(await file.text())); setValidation(result); }); event.target.value = ''; }} /></label>
    {validation && <div role="status"><p className="font-semibold">{validation.valid ? 'Validation passed' : 'Validation failed'}</p><p>{validation.message}</p>{validation.errors.map((err) => <p className="text-red-700" key={err}>{err}</p>)}{Object.entries(validation.counts).map(([table, count]) => <p key={table}>{table}: {count} records</p>)}</div>}
   </section>
  </>}
 </main><BottomNav active="Farm" /></div></div>;
}
