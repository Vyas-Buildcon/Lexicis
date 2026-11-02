import React, { useState } from 'react';
import { Database, AlertTriangle, Check, RefreshCw, X, ExternalLink, Copy } from 'lucide-react';
import { SupabaseStatus } from '../../types';

interface SupabaseStatusModalProps {
  status: SupabaseStatus;
  onClose: () => void;
  onRetry: () => Promise<void>;
}

export default function SupabaseStatusModal({ status, onClose, onRetry }: SupabaseStatusModalProps) {
  const [retrying, setRetrying] = useState(false);
  const [copied, setCopied] = useState(false);

  const isConnected = status.status.status === 'connected';

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } catch (err) {
      console.error(err);
    } finally {
      setRetrying(false);
    }
  };

  const handleCopySql = () => {
    if (status.sql) {
      navigator.clipboard.writeText(status.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-850 rounded-2xl max-w-lg w-full p-6 text-left shadow-2xl relative space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center space-x-3 text-amber-500">
          <Database className="h-6 w-6" />
          <h3 className="text-lg font-display font-bold text-white">Cloud Database Sync Status</h3>
        </div>

        <div className="space-y-4 text-slate-300 text-sm">
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Project URL</span>
              <span className="text-xs text-slate-300 font-mono flex items-center space-x-1 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
                <span>{status.url}</span>
                <ExternalLink className="h-3 w-3 text-slate-500" />
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Sync State</span>
              <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded flex items-center space-x-1.5 ${
                !status.configured
                  ? 'bg-slate-950 text-slate-400 border border-slate-800'
                  : isConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-900/50'
                  : 'bg-rose-950/60 text-rose-400 border border-rose-900/50'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${
                  !status.configured
                    ? 'bg-slate-500'
                    : isConnected
                    ? 'bg-emerald-400'
                    : 'bg-rose-400'
                }`}></span>
                <span>
                  {!status.configured
                    ? 'Local File Storage Fallback'
                    : isConnected
                    ? 'Connected & Syncing Live'
                    : 'Cloud Connection Error'}
                </span>
              </span>
            </div>
          </div>

          {!status.configured ? (
            <div className="space-y-3">
              <div className="bg-amber-950/30 border border-amber-900/40 p-4 rounded-xl text-xs leading-relaxed text-amber-200">
                <p className="font-semibold mb-1">💡 Connect Cloud Database Storage</p>
                <p>You can connect using either your <strong>Direct PostgreSQL Connection String</strong> or your <strong>Database API Key</strong>.</p>
              </div>
              <div className="space-y-2.5 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400">
                <p className="font-bold text-slate-200">Method 1: Direct Connection String (Auto-creates tables)</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In AI Studio, open <strong>Settings &gt; Secrets</strong>.</li>
                  <li>Add secret <code className="text-amber-400 font-mono">DATABASE_URL</code> with your PostgreSQL direct string.</li>
                  <li>Restart dev server — tables and sync are initialized automatically!</li>
                </ol>
              </div>
            </div>
          ) : isConnected ? (
            <div className="space-y-3">
              <div className="bg-emerald-950/30 border border-emerald-900/40 p-4 rounded-xl text-xs leading-relaxed text-emerald-200 flex items-start space-x-2.5">
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Live Database Connected ({status.mode === 'direct_postgres' ? 'Direct PostgreSQL' : 'REST API'})!</p>
                  <p>All application state is securely written to your database in real-time. In case your browser cache is cleared or other devices access the app, the case tracker stays perfectly in sync.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-rose-950/30 border border-rose-900/40 p-4 rounded-xl text-xs leading-relaxed text-rose-200 flex items-start space-x-2.5">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Database Connection Notice</p>
                  <p className="mb-2">
                    {status.mode === 'direct_postgres'
                      ? 'Could not connect via direct PostgreSQL string. Please verify your password and port in DATABASE_URL.'
                      : 'Connected via REST API, but the state table is missing or access policy blocked access.'}
                  </p>
                  <p className="text-[11px] font-mono text-rose-300 bg-slate-950/80 p-2 rounded border border-rose-900/30">
                    Error details: {status.status.error || "Connection error"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-300">Option 1: Paste Direct Connection String into DATABASE_URL secret (Auto-creates tables)</span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs font-semibold text-slate-300">Option 2: Run this SQL on Database SQL Editor:</span>
                  <button
                    onClick={handleCopySql}
                    className="text-xs text-amber-500 hover:text-amber-400 font-medium flex items-center space-x-1 cursor-pointer bg-slate-850 hover:bg-slate-800 px-2 py-1 rounded transition-all"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <pre className="text-[10px] font-mono p-3 rounded-lg bg-slate-950 text-emerald-400 overflow-x-auto border border-slate-850 leading-relaxed max-h-40 overflow-y-auto">
                  {status.sql}
                </pre>
              </div>

              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full bg-amber-600 hover:bg-amber-700 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-sm hover:shadow"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Testing Sync...' : 'Test Sync Connection Now'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-750 text-white font-semibold text-xs py-2 px-4 rounded-lg cursor-pointer transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
