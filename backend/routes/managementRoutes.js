import express from 'express';
import supabase from '../config/supabase.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const run = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const check = (result) => { if (result.error) throw fail(result.error.code === '23514' ? result.error.message : 'Database operation failed', result.error.code === '23514' ? 400 : 500); return result.data; };
const profileFields = ['first_name', 'middle_name', 'last_name', 'phone_number', 'farm_name', 'farm_address'];
const preferenceFields = ['feed_reminders', 'vaccination_reminders', 'push_enabled'];
const defaults = { feed_reminders: true, vaccination_reminders: true, push_enabled: true };
function pick(body, fields, required = []) {
 if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Expected an object');
 if (Object.keys(body).some((key) => !fields.includes(key))) throw fail('Unknown field');
 const result = {};
 for (const key of fields) if (body[key] !== undefined) {
  if (typeof body[key] !== 'string' || body[key].length > 2000) throw fail(`Invalid ${key}`);
  result[key] = body[key].trim();
 }
 for (const key of required) if (!result[key]) throw fail(`${key} is required`);
 return result;
}
router.get('/settings', run(async (req, res) => {
 const profile = check(await supabase.from('profiles').select(`id,email,${profileFields.join(',')}`).eq('id', req.user.id).single());
 const preferences = check(await supabase.from('notification_preferences').select(preferenceFields.join(',')).eq('user_id', req.user.id).maybeSingle());
 res.json({ success: true, profile, preferences: preferences || defaults });
}));
router.put('/settings/profile', run(async (req, res) => {
 const values = pick(req.body, profileFields);
 const data = check(await supabase.from('profiles').update({ ...values, updated_at: new Date().toISOString() }).eq('id', req.user.id).select(`id,email,${profileFields.join(',')}`).single());
 res.json({ success: true, data });
}));
router.put('/settings/notifications', run(async (req, res) => {
 if (!req.body || Object.keys(req.body).some((key) => !preferenceFields.includes(key)) || preferenceFields.some((key) => typeof req.body[key] !== 'boolean')) throw fail('All notification preferences must be booleans');
 const data = check(await supabase.from('notification_preferences').upsert({ user_id: req.user.id, ...req.body, updated_at: new Date().toISOString() }).select(preferenceFields.join(',')).single());
 res.json({ success: true, data });
}));
for (const [path, table, dateField, fields, required] of [
 ['mortality', 'mortality_records', 'death_date', ['cause', 'notes'], ['cause']],
 ['treatments', 'treatment_records', 'treatment_date', ['condition', 'treatment', 'medication', 'dosage', 'administered_by', 'outcome', 'notes'], ['condition', 'treatment']],
]) {
 router.get(`/${path}`, run(async (req, res) => {
  const data = await allRows(table, 'owner_id', req.user.id);
  res.json({ success: true, data: data.sort((a, b) => b[dateField].localeCompare(a[dateField])) });
 }));
 router.post(`/${path}`, run(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw fail('Expected an object');
  const { batch_id, [dateField]: eventDate, count, ...texts } = req.body;
  const values = pick(texts, fields, required);
  if (!uuid(batch_id) || !date(eventDate)) throw fail('Valid batch and date are required');
  if (path === 'mortality' && (!Number.isSafeInteger(count) || count < 1)) throw fail('Count must be a positive integer');
  if (path !== 'mortality' && count !== undefined) throw fail('Unknown count field');
  const batch = check(await supabase.from('pig_batches').select('id').eq('id', batch_id).eq('owner_id', req.user.id).maybeSingle());
  if (!batch) throw fail('Batch not found', 404);
  const data = check(await supabase.from(table).insert({ ...values, batch_id, owner_id: req.user.id, [dateField]: eventDate, ...(path === 'mortality' ? { count } : {}) }).select().single());
  res.status(201).json({ success: true, data });
 }));
 router.delete(`/${path}/:id`, run(async (req, res) => {
  if (!uuid(req.params.id)) throw fail('Invalid record ID');
  const data = check(await supabase.from(table).delete().eq('id', req.params.id).eq('owner_id', req.user.id).select('id'));
  if (!data.length) throw fail('Record not found', 404);
  res.json({ success: true });
 }));
}
const tables = { pig_batches: 'owner_id', pigs: 'owner_id', feed_records: 'owner_id', feed_stocks: 'owner_id', vaccination_records: 'owner_id', vaccine_stocks: 'owner_id', expenses: 'owner_id', mortality_records: 'owner_id', treatment_records: 'owner_id', profiles: 'id', notification_preferences: 'user_id', notifications: 'user_id' };
async function allRows(table, ownerColumn, owner) {
 const rows = [];
 for (let offset = 0; ; offset += 500) {
  const columns = table === 'profiles' ? `id,email,${profileFields.join(',')},created_at,updated_at` : '*';
  const page = check(await supabase.from(table).select(columns).eq(ownerColumn, owner).order(table === 'notification_preferences' ? 'user_id' : 'id').range(offset, offset + 499));
  rows.push(...page);
  if (page.length < 500) return rows;
 }
}
router.get('/backup', run(async (req, res) => {
 const data = {};
 for (const [table, column] of Object.entries(tables)) data[table] = await allRows(table, column, req.user.id);
 res.json({ format: 'prepapig-backup', version: 1, exported_at: new Date().toISOString(), owner_id: req.user.id, limitations: ['Read-only export; validation does not restore data.', 'Live paginated reads are not a transactional snapshot.', 'Credentials, device tokens, files and inferred history are excluded.'], data });
}));
router.post('/backup/validate', run(async (req, res) => {
 const file = req.body;
 const errors = [];
 if (file?.format !== 'prepapig-backup' || file.version !== 1) errors.push('Unsupported format or version');
 if (file?.owner_id !== req.user.id) errors.push('Backup belongs to a different account');
 if (!file?.exported_at || !Number.isFinite(Date.parse(file.exported_at))) errors.push('Invalid export timestamp');
 const data = file?.data;
 if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('Missing data object');
 const counts = {};
 const batches = new Set(Array.isArray(data?.pig_batches) ? data.pig_batches.map((row) => row?.id) : []);
 for (const [table, column] of Object.entries(tables)) {
  const rows = data?.[table];
  if (!Array.isArray(rows)) { errors.push(`${table}: expected an array`); continue; }
  counts[table] = rows.length;
  const seen = new Set();
  for (const row of rows) {
   if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`${table}: invalid row`); break; }
   const id = table === 'notification_preferences' ? row.user_id : row.id;
   if (!uuid(id) || seen.has(id) || row[column] !== req.user.id) { errors.push(`${table}: invalid identity, duplicate or foreign owner`); break; }
   seen.add(id);
   if (row.batch_id && !batches.has(row.batch_id)) { errors.push(`${table}: missing referenced batch`); break; }
   if (table === 'mortality_records' && (!date(row.death_date) || !Number.isSafeInteger(row.count) || row.count < 1 || !row.cause || !row.batch_id)) errors.push('Invalid mortality record');
   if (table === 'treatment_records' && (!date(row.treatment_date) || !row.condition || !row.treatment || !row.batch_id)) errors.push('Invalid treatment record');
   if (table === 'expenses' && (!date(row.expense_date) || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0 || !row.expense_type)) errors.push('Invalid expense record');
   if (table === 'notification_preferences' && preferenceFields.some((key) => typeof row[key] !== 'boolean')) errors.push('Invalid notification preferences');
  }
 }
 if (data && Object.keys(data).some((key) => !Object.hasOwn(tables, key))) errors.push('Unknown dataset');
 res.json({ success: true, valid: errors.length === 0, errors: [...new Set(errors)], counts, message: 'Structural, ownership and batch-reference validation only. No records were imported; this does not verify historical accuracy or restore compatibility.' });
}));
export default router;
