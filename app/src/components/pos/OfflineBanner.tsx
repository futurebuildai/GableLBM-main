/**
 * OfflineBanner.tsx — Visual indicator for POS offline state and sync status.
 */
import { WifiOff, Wifi, RefreshCw, Cloud, Check } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  catalogCount: number;
  isSyncing: boolean;
  lastSyncTime: string | null;
  onSyncNow: () => void;
  onRefreshCatalog: () => void;
}

export function OfflineBanner({
  isOnline,
  pendingCount,
  catalogCount,
  isSyncing,
  lastSyncTime,
  onSyncNow,
  onRefreshCatalog,
}: OfflineBannerProps) {
  if (isOnline && pendingCount === 0) {
    return null; // hide banner when online and no pending
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-300 ${
        isOnline
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
      }`}
    >
      <div className="flex items-center gap-3">
        {isOnline ? (
          <Wifi className="w-4 h-4 text-emerald-400" />
        ) : (
          <WifiOff className="w-4 h-4 animate-pulse" />
        )}

        <span>
          {!isOnline && '⚡ OFFLINE MODE'}
          {isOnline && pendingCount > 0 && '⏳ Pending Sync'}
        </span>

        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-xs font-mono">
            {pendingCount} transaction{pendingCount !== 1 ? 's' : ''} queued
          </span>
        )}

        {!isOnline && (
          <span className="text-xs text-zinc-500">
            {catalogCount.toLocaleString()} products cached
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isOnline && pendingCount > 0 && (
          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-xs font-bold transition-colors disabled:opacity-50"
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        )}

        {isOnline && (
          <button
            onClick={onRefreshCatalog}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-xs text-zinc-400 transition-colors"
            title="Refresh product catalog for offline use"
          >
            <RefreshCw className="w-3 h-3" />
            Catalog
          </button>
        )}

        {lastSyncTime && (
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <Check className="w-3 h-3" />
            {formatTime(lastSyncTime)}
          </span>
        )}
      </div>
    </div>
  );
}
