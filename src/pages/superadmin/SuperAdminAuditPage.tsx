import React, { useState, useMemo } from 'react';
import { FileText, Search, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useOverview, type AuditRow } from './useOverview';
import { formatDateTime } from './utils';

function AuditRowDetail({ row }: { row: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const payloadStr = JSON.stringify(row.payload, null, 2);

  return (
    <div className="border-b border-white/5 last:border-0">
      <div
        className="flex items-start gap-3 px-4 py-3 hover:bg-white/3 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs font-mono text-[#FCD804]/80">{row.action}</code>
            {row.merchantName && (
              <span className="text-xs text-white/40">→ {row.merchantName}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-white/30">
            <span>{row.actorEmail ?? 'system'}</span>
            <span>·</span>
            <span>{formatDateTime(row.createdAt)}</span>
          </div>
        </div>
        <div className="shrink-0 text-white/20">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-3">
          <pre className="rounded-xl bg-white/5 p-3 text-xs font-mono text-white/50 overflow-x-auto max-h-48">
            {payloadStr}
          </pre>
          <p className="mt-2 text-xs text-white/25">
            Entity: <code className="text-white/40">{row.entityType}/{row.entityId}</code>
          </p>
        </div>
      )}
    </div>
  );
}

export const SuperAdminAuditPage: React.FC = () => {
  const { data, loading, error, reload } = useOverview();
  const [search, setSearch] = useState('');

  const audits = useMemo(() => {
    if (!data) return [];
    if (!search) return data.audits;
    const q = search.toLowerCase();
    return data.audits.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        (a.actorEmail ?? '').toLowerCase().includes(q) ||
        (a.merchantName ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-400/20 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-300">{error}</p>
        <button onClick={() => void reload()} className="mt-4 text-sm text-red-300 hover:text-red-200 inline-flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Audit Log</h1>
          <p className="text-sm text-white/40 mt-0.5">100 entri terakhir dari semua tindakan admin</p>
        </div>
        <button
          onClick={() => void reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-white/8 border border-white/10 px-4 py-2 text-sm text-white/60 hover:text-white transition-colors self-start"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari aksi, aktor, merchant…"
          className="w-full rounded-xl bg-white/8 border border-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#FCD804]/30"
        />
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/8 overflow-hidden">
        {audits.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="h-8 w-8 mx-auto mb-3 text-white/20" />
            <p className="text-sm text-white/30">Belum ada entri audit log.</p>
          </div>
        ) : (
          audits.map((a) => <AuditRowDetail key={a.id} row={a} />)
        )}
      </div>
    </div>
  );
};
