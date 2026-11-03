import {
  addToSyncQueue,
  claimPendingSyncItems,
  getSyncItems,
  readApiCache,
  removeSyncItem,
  resolveId,
  saveApiCache,
  saveIdMapping,
  updateSyncItem,
} from './offlineStorage.js';

const OFFLINE_EVENT = 'prepapig:offline-state-changed';
const SYNC_EVENT = 'prepapig:offline-sync-complete';
const staleApiCacheKeys = new Set();

export function getOwnerId(token = localStorage.getItem('token')) {
  if (!token || token === 'null' || token === 'undefined') return null;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return String(payload.id || payload.sub || payload.email || '') || null;
  } catch {
    return null;
  }
}

function apiPath(url) {
  try { return new URL(url, window.location.href).pathname.replace(/\/$/, '') || '/'; }
  catch { return ''; }
}

function isCoreMutation(path, method) {
  const patterns = [
    ['POST', /^\/pigs\/create$/], ['PUT', /^\/pigs\/[0-9a-f-]+$/i], ['DELETE', /^\/pigs\/[0-9a-f-]+$/i],
    ['POST', /^\/pigs\/pig$/], ['PUT', /^\/pigs\/pig\/[0-9a-f-]+$/i], ['DELETE', /^\/pigs\/pig\/[0-9a-f-]+$/i],
    ['POST', /^\/feeds\/create$/], ['POST', /^\/feeds\/stock\/update$/],
    ['POST', /^\/vaccinations\/create$/], ['POST', /^\/vaccinations\/stock\/update$/],
    ['POST', /^\/expenses\/create$/], ['PUT', /^\/expenses\/[0-9a-f-]+$/i], ['DELETE', /^\/expenses\/[0-9a-f-]+$/i],
    ['POST', /^\/sales$/], ['PUT', /^\/sales\/[0-9a-f-]+$/i], ['DELETE', /^\/sales\/[0-9a-f-]+$/i],
  ];
  return patterns.some(([verb, regex]) => method === verb && regex.test(path));
}

function cacheableRead(path) {
  return /^\/(pigs|feeds|vaccinations|expenses|sales|reports)\//.test(path)
    || path === '/sales';
}

const makeId = () => {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure offline record IDs are unavailable in this browser.');
  return globalThis.crypto.randomUUID();
};

async function requestBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.sync?.register) await registration.sync.register('prepapig-offline-sync');
  } catch {
    // Foreground startup/online listeners remain the fallback.
  }
}

function optimisticRecord(path, body, localId) {
  if (!body || typeof body !== 'object') return null;
  const id = localId || makeId();
  const data = { ...body, id, localPending: true };
  if (path === '/pigs/create') {
    return { ...data, batch_code: 'Batch (Pending Sync)', pig_count: Number(body.pig_count) || 0, status: body.status || 'Active', created_at: new Date().toISOString() };
  }
  if (path === '/pigs/pig') return { ...data, weight: Number(body.weight) || 0 };
  if (path === '/feeds/create') return { ...data, created_at: new Date().toISOString() };
  if (path === '/vaccinations/create') return { ...data, created_at: new Date().toISOString() };
  if (path === '/expenses/create') return { ...data, amount: Number(body.amount) || 0 };
  if (path === '/sales') return { ...data, pig_count: Number(body.pig_count) || 0, total_weight_kg: Number(body.total_weight_kg) || 0, revenue: body.revenue == null ? null : Number(body.revenue), created_at: new Date().toISOString() };
  return data;
}

function resourceFor(path) {
  if (path.startsWith('/pigs')) return 'batches';
  if (path.startsWith('/feeds')) return 'feed';
  if (path.startsWith('/vaccinations')) return 'vaccinations';
  if (path.startsWith('/expenses')) return 'expenses';
  if (path.startsWith('/sales')) return 'sales';
  return null;
}

function responseData(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.records)) return json.data.records;
  return null;
}

function applyQueueOverlay(url, json, items) {
  const path = apiPath(url);
  const resource = resourceFor(path);
  if (!resource || !json || typeof json !== 'object') return json;
  const cloned = JSON.parse(JSON.stringify(json));
  const array = responseData(cloned);
  const overviewRecords = Array.isArray(cloned.data?.records) ? cloned.data.records : null;
  const targetArray = array || overviewRecords;

  for (const item of items) {
    if (!item.optimistic) continue;
    const record = item.optimistic.record;
    const itemPath = item.path;
    if (item.resource === 'sales' && path === '/pigs/all') {
      const sale = record || {};
      const batchId = sale.batch_id;
      const closed = sale.delete_batch === true || sale.sale_date != null && sale.revenue != null;
      const soldBatch = Array.isArray(cloned.data) && cloned.data.find((row) => String(row.id) === String(batchId));
      if (soldBatch && closed) soldBatch.status = 'Sold';
      continue;
    }
    if (item.resource !== resource) continue;
    const isRelevant = resource === 'batches'
      ? (itemPath === '/pigs/create' ? path === '/pigs/all' : path === '/pigs/all' || (path.startsWith('/pigs/batch/') && path.endsWith('/pigs')))
      : resource === 'feed' ? path.startsWith('/feeds/')
        : resource === 'vaccinations' ? path.startsWith('/vaccinations/')
          : resource === 'expenses' ? path === '/expenses/all'
            : path === '/sales';
    if (!isRelevant) continue;
    if (resource === 'batches' && path === '/pigs/all' && itemPath.startsWith('/pigs/pig')) continue;
    if (resource === 'batches' && path.startsWith('/pigs/batch/') && record?.batch_id
      && String(record.batch_id) !== String(path.split('/')[3])) continue;

    if (resource === 'feed' && path === '/feeds/stock') {
      const stockRows = Array.isArray(cloned.data) ? cloned.data : [];
      const row = stockRows.find((stock) => stock.feed_type === record?.feed_type);
      if (row && item.optimistic.action === 'restock') row.stock_quantity = Number(row.stock_quantity || 0) + Number(record.stock_quantity || 0);
      if (row && item.optimistic.action === 'price' && record.unit_price !== undefined) row.unit_price = record.unit_price;
      if (!row && item.optimistic.action === 'restock') stockRows.push({ ...record, id: `local-stock-${item.id}`, localPending: true });
      continue;
    }
    if (resource === 'vaccinations' && path === '/vaccinations/stock') {
      if (item.optimistic.action === 'restock' && Array.isArray(cloned.data)) cloned.data.push({ ...record, id: `local-stock-${item.id}`, localPending: true });
      continue;
    }

    if (targetArray && record && item.optimistic.action === 'create') {
      const duplicate = targetArray.some((row) => String(row.id) === String(record.id));
      if (!duplicate) targetArray.unshift(record);
    } else if (targetArray && item.optimistic.action === 'update') {
      const index = targetArray.findIndex((row) => String(row.id) === String(item.optimistic.targetId));
      if (index >= 0) targetArray[index] = { ...targetArray[index], ...(record || {}) };
    } else if (targetArray && item.optimistic.action === 'delete') {
      const index = targetArray.findIndex((row) => String(row.id) === String(item.optimistic.targetId));
      if (index >= 0) targetArray.splice(index, 1);
    }

    if (resource === 'feed' && cloned.data && !Array.isArray(cloned.data) && Array.isArray(cloned.data.stock)
      && item.optimistic.action === 'restock') {
      const stock = cloned.data.stock.find((row) => row.feed_type === item.optimistic.record.feed_type);
      if (stock) stock.stock_quantity = Number(stock.stock_quantity || 0) + Number(item.optimistic.record.stock_quantity || 0);
      else cloned.data.stock.push({ ...item.optimistic.record, id: item.optimistic.record.id || item.id });
    }
    if (resource === 'vaccinations' && cloned.data && !Array.isArray(cloned.data) && Array.isArray(cloned.data.stock)
      && item.optimistic.action === 'restock') {
      cloned.data.stock.push({ ...item.optimistic.record, id: item.optimistic.record.id || item.id });
    }
  }
  return cloned;
}

async function cachedResponse(cacheKey, url, ownerId) {
  const entry = await readApiCache(cacheKey);
  if (!entry) return null;
  let body = entry.body;
  try {
    const json = JSON.parse(body);
    const queue = await getSyncItems(ownerId);
    body = JSON.stringify(applyQueueOverlay(url, json, queue));
  } catch { /* Keep non-JSON cached responses byte-for-byte. */ }
  const headers = new Headers(entry.headers || {});
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  headers.set('X-PrepAPig-Offline-Cache', 'true');
  return new Response(body, { status: entry.status || 200, statusText: entry.statusText || 'OK', headers });
}

function queuedResponse(path, method, payload, localId) {
  let data;
  let optimistic = null;
  let action = method === 'DELETE' ? 'delete' : method === 'PUT' ? 'update' : 'create';
  const targetId = path.split('/').filter(Boolean).at(-1);
  if (path === '/feeds/stock/update' || path === '/vaccinations/stock/update') {
    action = payload?.stock_quantity !== undefined ? 'restock' : 'price';
    data = [];
    optimistic = { action, record: payload };
  } else {
    const pathId = path.split('/').filter(Boolean).at(-1);
    const record = method === 'POST' ? optimisticRecord(path, payload, localId)
      : method === 'PUT' ? { ...(payload || {}), id: pathId, localPending: true }
        : null;
    data = record;
    optimistic = { action, targetId: pathId, record };
    if (path === '/feeds/create' || path === '/vaccinations/create') data = record ? [record] : [];
  }
  return { json: { success: true, data, queued: true, message: 'Saved on this device; waiting to sync.' }, optimistic };
}

export async function handleOfflineFetch({ input, init, originalFetch, apiBase }) {
  const token = localStorage.getItem('token');
  const ownerId = getOwnerId(token);
  const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(requestUrl, window.location.href);
  const base = new URL(apiBase, window.location.href);
  const basePath = base.pathname.replace(/\/$/, '');
  if (url.origin !== base.origin || !(url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) || !ownerId) return originalFetch(input, init);

  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const path = apiPath(url.href);
  const cacheKey = `${ownerId}:${url.href}`;

  if (method === 'GET' && cacheableRead(path)) {
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const fallback = await cachedResponse(cacheKey, url.href, ownerId);
      if (fallback) {
        staleApiCacheKeys.add(cacheKey);
        window.dispatchEvent(new Event(OFFLINE_EVENT));
        return fallback;
      }
      throw error;
    }
    if (response.ok) {
      if (staleApiCacheKeys.delete(cacheKey)) window.dispatchEvent(new Event(OFFLINE_EVENT));
      try {
        const body = await response.clone().text();
        await saveApiCache(cacheKey, { body, status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers.entries()) });
      } catch {
        // A storage quota/IndexedDB issue must not replace a fresh server response with stale data.
      }
      return response;
    }
    if (response.status >= 500) {
      const fallback = await cachedResponse(cacheKey, url.href, ownerId);
      if (fallback) {
        staleApiCacheKeys.add(cacheKey);
        window.dispatchEvent(new Event(OFFLINE_EVENT));
        return fallback;
      }
    }
    return response;
  }

  if (!isCoreMutation(path, method)) return originalFetch(input, init);

  const requestBodyText = async () => typeof init?.body === 'string' ? init.body
    : input instanceof Request ? input.clone().text() : '';

  if (navigator.onLine !== false) {
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      // An aborted write can still have reached the server, so treat it as ambiguous.
      // Do not silently enqueue/replay it; require a server check before manual retry.
      const localId = method === 'POST' && ['/pigs/create', '/pigs/pig', '/feeds/create', '/vaccinations/create', '/expenses/create', '/sales'].includes(path) ? makeId() : null;
      const payloadText = await requestBodyText();
      const payload = payloadText ? JSON.parse(payloadText) : {};
      const result = queuedResponse(path, method, payload, localId);
      await addToSyncQueue({ ownerId, url: url.href, path, method, body: payloadText, localId, resource: resourceFor(path), optimistic: result.optimistic, status: 'needs_review', lastError: 'Connection was lost during the save; confirm server state before retrying.' });
      window.dispatchEvent(new Event(OFFLINE_EVENT));
      return new Response(JSON.stringify({ ...result.json, queued: true, needsReview: true, message: 'Save outcome is unclear. Check the server before retrying.' }), { status: 202, headers: { 'Content-Type': 'application/json', 'X-PrepAPig-Needs-Review': 'true' } });
    }

    if (response.status < 500) return response;

    // A 5xx can occur after a controller has already committed its primary write.
    // Keep the payload visible locally, but require server review before any replay.
    const payloadText = await requestBodyText();
    let payload = {};
    try { payload = payloadText ? JSON.parse(payloadText) : {}; }
    catch { throw new Error('The save outcome is unclear, but its request data could not be read for local review. Check the server before submitting again.'); }
    const localId = method === 'POST' && ['/pigs/create', '/pigs/pig', '/feeds/create', '/vaccinations/create', '/expenses/create', '/sales'].includes(path) ? makeId() : null;
    const result = queuedResponse(path, method, payload, localId);
    const serverError = await response.clone().json().catch(() => ({}));
    const lastError = serverError.message || `Server returned HTTP ${response.status}; check whether the save reached the server before retrying.`;
    const queueId = await addToSyncQueue({ ownerId, url: url.href, path, method, body: payloadText, localId, resource: resourceFor(path), optimistic: result.optimistic, status: 'needs_review', lastError });
    window.dispatchEvent(new Event(OFFLINE_EVENT));
    return new Response(JSON.stringify({ ...result.json, queued: true, needsReview: true, queueId, message: 'The server returned an error. Check the record on the server before retrying.' }), { status: 202, headers: { 'Content-Type': 'application/json', 'X-PrepAPig-Needs-Review': 'true' } });
  }

  const payloadText = await requestBodyText();
  let payload = {};
  try { payload = payloadText ? JSON.parse(payloadText) : {}; } catch { throw new Error('This record could not be saved offline because its request data was not readable.'); }
  const localId = method === 'POST' && ['/pigs/create', '/pigs/pig', '/feeds/create', '/vaccinations/create', '/expenses/create', '/sales'].includes(path) ? makeId() : null;
  const result = queuedResponse(path, method, payload, localId);
  const queueId = await addToSyncQueue({
    ownerId,
    url: url.href,
    path,
    method,
    body: payloadText,
    localId,
    resource: resourceFor(path),
    optimistic: result.optimistic,
    status: 'pending',
  });
  window.dispatchEvent(new Event(OFFLINE_EVENT));
  void requestBackgroundSync();
  return new Response(JSON.stringify({ ...result.json, queueId, localId }), { status: 202, headers: { 'Content-Type': 'application/json', 'X-PrepAPig-Queued': 'true' } });
}

async function replaceIds(value, ownerId) {
  if (typeof value === 'string') return resolveId(ownerId, value);
  if (Array.isArray(value)) return Promise.all(value.map((item) => replaceIds(item, ownerId)));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await replaceIds(item, ownerId)]));
    return Object.fromEntries(entries);
  }
  return value;
}

async function replaceUrlIds(value, ownerId) {
  const url = new URL(value);
  const segments = await Promise.all(url.pathname.split('/').map((segment) => resolveId(ownerId, segment)));
  url.pathname = segments.join('/');
  return url.href;
}

async function performOfflineQueueSync({ apiBase }) {
  const token = localStorage.getItem('token');
  const ownerId = getOwnerId(token);
  if (!ownerId || navigator.onLine === false) return { synced: 0, blocked: true };
  let synced = 0;
  while (true) {
    const [item] = await claimPendingSyncItems(ownerId, 1);
    if (!item) break;
    try {
      const body = item.body ? await replaceIds(JSON.parse(item.body), ownerId) : undefined;
      const bodyText = body === undefined ? undefined : JSON.stringify(body);
      const url = await replaceUrlIds(item.url, ownerId);
      const target = new URL(url);
      const base = new URL(apiBase, window.location.href);
      const basePath = base.pathname.replace(/\/$/, '');
      if (target.origin !== base.origin || !(target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
        || !isCoreMutation(apiPath(target.href), item.method)) {
        await updateSyncItem(item.id, { status: 'failed', lastError: 'This queued request is outside the supported offline record actions.' });
        break;
      }
      const response = await fetch(url, {
        method: item.method,
        headers: { Authorization: `Bearer ${token}`, ...(bodyText ? { 'Content-Type': 'application/json' } : {}) },
        __prepapigSync: true,
        ...(bodyText ? { body: bodyText } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        const ambiguous = response.status >= 500;
        await updateSyncItem(item.id, {
          status: ambiguous ? 'needs_review' : 'failed',
          lastError: ambiguous
            ? result.message || `Server returned HTTP ${response.status}; verify whether the change was applied before retrying.`
            : result.message || `Server rejected this save (HTTP ${response.status}).`,
        });
        break;
      }
      const serverRecord = Array.isArray(result.data) ? result.data[0] : result.data;
      if (item.localId && serverRecord?.id) await saveIdMapping(ownerId, item.localId, String(serverRecord.id));
      await removeSyncItem(item.id);
      synced += 1;
    } catch (error) {
      await updateSyncItem(item.id, { status: 'needs_review', lastError: 'The connection dropped during sync. Verify the record on the server before retrying.' });
      // The request may have reached the server; stop to prevent dependent operations running against unknown state.
      break;
    }
  }
  if (synced) {
    window.dispatchEvent(new Event(SYNC_EVENT));
    window.dispatchEvent(new Event('prepapig:financial-data-changed'));
  }
  window.dispatchEvent(new Event(OFFLINE_EVENT));
  return { synced, blocked: false };
}

let syncPromise = null;
export function syncOfflineQueue(options) {
  if (!syncPromise) {
    syncPromise = performOfflineQueueSync(options).finally(() => { syncPromise = null; });
  }
  return syncPromise;
}

export async function getOfflineStatus() {
  const ownerId = getOwnerId();
  if (!ownerId) return { pending: 0, failed: 0, needsReview: 0, items: [], usingCachedData: false, staleCacheCount: 0 };
  const items = await getSyncItems(ownerId);
  const staleCacheCount = [...staleApiCacheKeys].filter((key) => key.startsWith(`${ownerId}:`)).length;
  return {
    pending: items.filter((item) => item.status === 'pending' || item.status === 'sending').length,
    failed: items.filter((item) => item.status === 'failed').length,
    needsReview: items.filter((item) => item.status === 'needs_review').length,
    items,
    usingCachedData: staleCacheCount > 0,
    staleCacheCount,
  };
}

export async function retryOfflineItem(id) {
  const ownerId = getOwnerId();
  if (!ownerId) return false;
  const items = await getSyncItems(ownerId);
  const item = items.find((row) => row.id === id);
  if (!item || !['failed', 'needs_review'].includes(item.status)) return false;
  await updateSyncItem(id, { status: 'pending', lastError: null });
  window.dispatchEvent(new Event(OFFLINE_EVENT));
  return true;
}

export async function discardOfflineItem(id) {
  const ownerId = getOwnerId();
  if (!ownerId) return false;
  const items = await getSyncItems(ownerId);
  if (!items.some((item) => item.id === id)) return false;
  await removeSyncItem(id);
  window.dispatchEvent(new Event(OFFLINE_EVENT));
  window.dispatchEvent(new Event(SYNC_EVENT));
  window.dispatchEvent(new Event('prepapig:financial-data-changed'));
  return true;
}

export async function recoverInterruptedSync() {
  const ownerId = getOwnerId();
  if (!ownerId) return;
  const items = await getSyncItems(ownerId);
  await Promise.all(items.filter((item) => item.status === 'sending').map((item) => updateSyncItem(item.id, {
    status: 'needs_review',
    lastError: 'The app closed during sync. Verify the record on the server before retrying.',
  })));
}

export const offlineEvents = { state: OFFLINE_EVENT, sync: SYNC_EVENT };
