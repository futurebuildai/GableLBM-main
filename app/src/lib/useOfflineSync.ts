/**
 * useOfflineSync.ts — React hook for managing POS offline/online state and sync.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPendingTransactions,
  getPendingCount,
  clearSyncedTransactions,
  cacheProductCatalog,
  getCatalogCount,
} from './offlineStore';
import type { PendingTransaction } from './offlineStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

interface SyncResult {
  batch_id: string;
  synced_count: number;
  duplicate_count: number;
  error_count: number;
  errors?: { client_id: string; reason: string }[];
}

export interface OfflineSyncState {
  isOnline: boolean;
  pendingCount: number;
  catalogCount: number;
  lastSyncTime: string | null;
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  syncNow: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [catalogCount, setCatalogCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(
    localStorage.getItem('pos_last_sync')
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncLock = useRef(false);

  // Update pending count
  const refreshCounts = useCallback(async () => {
    try {
      const [pending, catalog] = await Promise.all([
        getPendingCount(),
        getCatalogCount(),
      ]);
      setPendingCount(pending);
      setCatalogCount(catalog);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  // Refresh product catalog from server
  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pos/catalog`);
      if (!res.ok) throw new Error('Catalog fetch failed');
      const products = await res.json();
      await cacheProductCatalog(products);
      const count = await getCatalogCount();
      setCatalogCount(count);
    } catch (err) {
      console.warn('Failed to refresh catalog:', err);
    }
  }, []);

  // Sync pending transactions to server
  const syncNow = useCallback(async () => {
    if (syncLock.current || !navigator.onLine) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      const pending: PendingTransaction[] = await getPendingTransactions();
      if (pending.length === 0) {
        setIsSyncing(false);
        syncLock.current = false;
        return;
      }

      const batchId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch(`${API_BASE}/api/pos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: batchId,
          register_id: pending[0]?.register_id || 'REG-01',
          items: pending.map((tx) => ({
            client_id: tx.client_id,
            register_id: tx.register_id,
            cashier_id: tx.cashier_id,
            customer_id: tx.customer_id || undefined,
            items: tx.items.map((item) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              uom: item.uom,
            })),
            tenders: tx.tenders,
            client_created_at: tx.client_created_at,
          })),
        }),
      });

      if (!res.ok) throw new Error('Sync request failed');

      const result: SyncResult = await res.json();
      setLastSyncResult(result);

      // Clear successfully synced + duplicates from local store
      const syncedIds = pending.map((t) => t.client_id);
      await clearSyncedTransactions(syncedIds);

      const now = new Date().toISOString();
      setLastSyncTime(now);
      localStorage.setItem('pos_last_sync', now);

      await refreshCounts();
    } catch (err) {
      console.error('Offline sync failed:', err);
    } finally {
      setIsSyncing(false);
      syncLock.current = false;
    }
  }, [refreshCounts]);

  // Monitor online/offline
  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      syncNow();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncNow]);

  // Initial counts
  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  // Auto-refresh catalog on mount if online and empty
  useEffect(() => {
    if (isOnline && catalogCount === 0) {
      refreshCatalog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return {
    isOnline,
    pendingCount,
    catalogCount,
    lastSyncTime,
    isSyncing,
    lastSyncResult,
    syncNow,
    refreshCatalog,
  };
}
