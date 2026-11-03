import { openDB } from 'idb';

const DB_NAME = 'PrepAPigDB';
const DB_VERSION = 3;

export const stores = {
  BATCHES: 'batches',
  FEED_RECORDS: 'feedRecords',
  VACCINATION_RECORDS: 'vaccinationRecords',
  SYNC_QUEUE: 'syncQueue',
  API_CACHE: 'apiCache',
  ID_MAP: 'idMap',
};

let dbPromise = null;

export async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains(stores.BATCHES)) {
          const batchStore = db.createObjectStore(stores.BATCHES, { keyPath: 'id' });
          batchStore.createIndex('byDate', 'createdAt');
        }
        if (!db.objectStoreNames.contains(stores.FEED_RECORDS)) {
          const feedStore = db.createObjectStore(stores.FEED_RECORDS, { keyPath: 'id' });
          feedStore.createIndex('byBatch', 'batchId');
        }
        if (!db.objectStoreNames.contains(stores.VACCINATION_RECORDS)) {
          const vaxStore = db.createObjectStore(stores.VACCINATION_RECORDS, { keyPath: 'id' });
          vaxStore.createIndex('byBatch', 'batchId');
        }
        if (!db.objectStoreNames.contains(stores.SYNC_QUEUE)) {
          const queueStore = db.createObjectStore(stores.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('byStatus', 'status');
        } else if (oldVersion < 2) {
          const queueStore = transaction.objectStore(stores.SYNC_QUEUE);
          if (!queueStore.indexNames.contains('byStatus')) queueStore.createIndex('byStatus', 'status');
        }
        if (!db.objectStoreNames.contains(stores.API_CACHE)) {
          db.createObjectStore(stores.API_CACHE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(stores.ID_MAP)) {
          db.createObjectStore(stores.ID_MAP, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRecord(storeName, record) {
  const db = await getDB();
  return db.put(storeName, record);
}

export async function getAllRecords(storeName) {
  const db = await getDB();
  return db.getAll(storeName);
}

export async function getRecordsByIndex(storeName, indexName, value) {
  const db = await getDB();
  return db.getAllFromIndex(storeName, indexName, value);
}

export async function deleteRecord(storeName, id) {
  const db = await getDB();
  return db.delete(storeName, id);
}

export async function addToSyncQueue(operation) {
  const db = await getDB();
  return db.add(stores.SYNC_QUEUE, {
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...operation,
  });
}

export async function getPendingSyncItems(ownerId) {
  const db = await getDB();
  const rows = await db.getAll(stores.SYNC_QUEUE);
  return rows
    .filter((row) => row.status === 'pending' && (!ownerId || row.ownerId === ownerId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
}

export async function claimPendingSyncItems(ownerId, limit = Number.POSITIVE_INFINITY) {
  const db = await getDB();
  const tx = db.transaction(stores.SYNC_QUEUE, 'readwrite');
  const all = await tx.store.getAll();
  const ownerItems = all.filter((row) => row.ownerId === ownerId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const blockedIndex = ownerItems.findIndex((item) => item.status !== 'pending');
  const eligible = (blockedIndex < 0 ? ownerItems : ownerItems.slice(0, blockedIndex)).slice(0, limit);
  const claimed = [];
  for (const item of eligible) {
    const next = { ...item, status: 'sending', attempts: Number(item.attempts || 0) + 1, lastError: null };
    await tx.store.put(next);
    claimed.push(next);
  }
  await tx.done;
  return claimed;
}

export async function getSyncItems(ownerId) {
  const db = await getDB();
  const rows = await db.getAll(stores.SYNC_QUEUE);
  return rows
    .filter((row) => !ownerId || row.ownerId === ownerId)
    .filter((row) => row.status !== 'completed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
}

export async function updateSyncItem(id, changes) {
  const db = await getDB();
  const tx = db.transaction(stores.SYNC_QUEUE, 'readwrite');
  const item = await tx.store.get(id);
  if (item) await tx.store.put({ ...item, ...changes, updatedAt: new Date().toISOString() });
  await tx.done;
}

export async function removeSyncItem(id) {
  const db = await getDB();
  return db.delete(stores.SYNC_QUEUE, id);
}

export async function markSyncItemCompleted(id) {
  return updateSyncItem(id, { status: 'completed' });
}

export async function clearCompletedSyncItems() {
  const db = await getDB();
  const tx = db.transaction(stores.SYNC_QUEUE, 'readwrite');
  const rows = await tx.store.getAll();
  for (const item of rows) if (item.status === 'completed') await tx.store.delete(item.id);
  await tx.done;
}

export async function saveApiCache(key, entry) {
  const db = await getDB();
  await db.put(stores.API_CACHE, { key, ...entry, savedAt: Date.now() });
  const rows = await db.getAll(stores.API_CACHE);
  if (rows.length > 100) {
    rows.sort((a, b) => a.savedAt - b.savedAt);
    await Promise.all(rows.slice(0, rows.length - 100).map((row) => db.delete(stores.API_CACHE, row.key)));
  }
}

export async function readApiCache(key) {
  const db = await getDB();
  return db.get(stores.API_CACHE, key);
}

export async function saveIdMapping(ownerId, localId, serverId) {
  if (!ownerId || !localId || !serverId) return;
  const db = await getDB();
  await db.put(stores.ID_MAP, { key: `${ownerId}:${localId}`, serverId });
}

export async function resolveId(ownerId, localId) {
  if (!ownerId || !localId) return localId;
  const db = await getDB();
  const mapped = await db.get(stores.ID_MAP, `${ownerId}:${localId}`);
  return mapped?.serverId || localId;
}
