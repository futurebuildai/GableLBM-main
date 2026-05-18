/**
 * offlineStore.ts — IndexedDB wrapper for offline POS catalog and transaction queue.
 * Uses native IndexedDB API (no external dependencies).
 */

const DB_NAME = 'gable-pos-offline';
const DB_VERSION = 1;
const STORE_CATALOG = 'catalog';
const STORE_PENDING = 'pendingTransactions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        const catalogStore = db.createObjectStore(STORE_CATALOG, { keyPath: 'product_id' });
        catalogStore.createIndex('sku', 'sku', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'client_id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Catalog (product cache) ---

export interface CatalogProduct {
  product_id: string;
  sku: string;
  description: string;
  price: number; // dollars
  uom: string;
  in_stock: number;
}

/** Replace entire local catalog with fresh data from server. */
export async function cacheProductCatalog(products: CatalogProduct[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_CATALOG, 'readwrite');
  const store = tx.objectStore(STORE_CATALOG);
  store.clear();
  for (const p of products) {
    store.put(p);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Search catalog locally by SKU or description. */
export async function searchCatalog(query: string, limit = 20): Promise<CatalogProduct[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_CATALOG, 'readonly');
  const store = tx.objectStore(STORE_CATALOG);

  return new Promise((resolve, reject) => {
    const results: CatalogProduct[] = [];
    const q = query.toLowerCase();
    const cursorReq = store.openCursor();

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }
      const product = cursor.value as CatalogProduct;
      if (
        product.sku.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q)
      ) {
        results.push(product);
      }
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/** Get total cached product count. */
export async function getCatalogCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_CATALOG, 'readonly');
  const store = tx.objectStore(STORE_CATALOG);
  return new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- Pending Transactions (offline queue) ---

export interface PendingLineItem {
  product_id: string;
  quantity: number;
  uom: string;
  // Denormalized for offline display
  sku: string;
  description: string;
  unit_price: number; // dollars
}

export interface PendingTender {
  method: string; // CASH, CHECK
  amount: number; // dollars
  reference?: string;
}

export interface PendingTransaction {
  client_id: string; // UUID generated client-side
  register_id: string;
  cashier_id: string;
  customer_id?: string;
  items: PendingLineItem[];
  tenders: PendingTender[];
  client_created_at: string; // ISO timestamp
}

/** Add a completed offline transaction to the sync queue. */
export async function addPendingTransaction(tx: PendingTransaction): Promise<void> {
  const db = await openDB();
  const dbTx = db.transaction(STORE_PENDING, 'readwrite');
  dbTx.objectStore(STORE_PENDING).put(tx);
  return new Promise((resolve, reject) => {
    dbTx.oncomplete = () => resolve();
    dbTx.onerror = () => reject(dbTx.error);
  });
}

/** Get all pending (unsynced) transactions. */
export async function getPendingTransactions(): Promise<PendingTransaction[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, 'readonly');
  const store = tx.objectStore(STORE_PENDING);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Get pending transaction count. */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, 'readonly');
  const req = tx.objectStore(STORE_PENDING).count();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Clear synced transactions from the queue. */
export async function clearSyncedTransactions(clientIds: string[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, 'readwrite');
  const store = tx.objectStore(STORE_PENDING);
  for (const id of clientIds) {
    store.delete(id);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Clear ALL pending transactions. */
export async function clearAllPending(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PENDING, 'readwrite');
  tx.objectStore(STORE_PENDING).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
