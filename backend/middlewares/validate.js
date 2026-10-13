import supabase from '../config/supabase.js';

const isMissing = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFields = ['date_acquired', 'feeding_date', 'vaccination_date', 'next_due_date', 'expense_date', 'expiry_date', 'last_updated'];
const textLimits = { batch_code: 50, status: 20, health_status: 50, feeding_time: 20, email: 254 };
const textFields = ['batch_code', 'breed', 'status', 'health_status', 'feed_type', 'vaccine_name', 'expense_type', 'feeding_time', 'administered_by', 'notes', 'description', 'title', 'message', 'type', 'token', 'email', 'password'];

export const validateBody = ({ required = [], nonNegative = [], integers = [], forbidden = [], nullable = [], update = false } = {}) => (req, res, next) => {
  const body = req.body;
  const reject = (message) => res.status(400).json({ success: false, message });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject('A JSON object is required');
  const blocked = ['owner_id', 'user_id', 'id', 'created_at', 'updated_at', ...forbidden].filter((field) => Object.hasOwn(body, field));
  if (blocked.length) return reject(`Fields cannot be changed: ${blocked.join(', ')}`);
  if (update && !Object.keys(body).length) return reject('At least one update field is required');
  const missing = required.filter((field) => isMissing(body[field]));
  if (missing.length) return reject(`Missing required fields: ${missing.join(', ')}`);
  for (const field of [...new Set([...nonNegative, ...integers])]) {
    if (body[field] === undefined || (body[field] === null && nullable.includes(field))) continue;
    const value = body[field];
    if (isMissing(value) || !['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0) return reject(`${field} must be a non-negative number`);
    if (integers.includes(field) && (!Number.isSafeInteger(Number(value)) || Number(value) > 10000)) return reject(`${field} must be an integer from 0 to 10000`);
    body[field] = Number(value);
  }
  for (const field of textFields) {
    if (body[field] === undefined || (body[field] === null && !required.includes(field) && !['batch_code', 'feed_type', 'vaccine_name', 'expense_type'].includes(field))) continue;
    if (typeof body[field] !== 'string' || (body[field].trim() === '' && ['batch_code', 'feed_type', 'vaccine_name', 'expense_type', 'status', 'health_status'].includes(field)) || body[field].length > (['notes', 'description', 'message', 'token', 'password'].includes(field) ? 4096 : (textLimits[field] || 100))) return reject(`${field} must be a non-empty string within the allowed length`);
  }
  for (const field of dateFields) {
    const value = body[field];
    if (value === undefined || (value === null && !required.includes(field) && !['feeding_date', 'vaccination_date', 'expense_date'].includes(field))) continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return reject(`${field} must be a valid YYYY-MM-DD date`);
  }
  if (body.batch_id !== undefined && body.batch_id !== null && (typeof body.batch_id !== 'string' || !uuid.test(body.batch_id))) return reject('batch_id must be a UUID');
  next();
};

// Used for payloads that can attach or move a record to a batch.
export const validateBatchOwnership = async (req, res, next) => {
  if (req.body.batch_id == null) return next();
  try {
    const { data, error } = await supabase.from('pig_batches').select('id').eq('id', req.body.batch_id).eq('owner_id', req.user.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Batch not found' });
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Could not verify batch ownership' });
  }
};

export const validateAuthConfig = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
};
