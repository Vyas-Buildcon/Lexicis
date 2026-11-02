import React from 'react';
import { Sparkles, FileText, Download, Loader2 } from 'lucide-react';
import { CaseOrder } from '../../types';

interface OrdersPanelProps {
  orders: CaseOrder[];
  /** True while official order texts are being retrieved from the registry */
  loadingOrders: boolean;
  downloadingOrderId: string | null;
  downloadError: string | null;
  onViewAnalysis: (order: CaseOrder) => void;
  onDownloadPdf: (order: CaseOrder) => void;
}

/** Court orders & daily directives with analysis and PDF download actions. */
export default function OrdersPanel({ orders, loadingOrders, downloadingOrderId, downloadError, onViewAnalysis, onDownloadPdf }: OrdersPanelProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-base font-display font-bold text-slate-900 mb-4 flex items-center space-x-2">
        <FileText className="h-4 w-4 text-amber-600" />
        <span>Court Orders & Daily Directives</span>
      </h3>

      {loadingOrders && (
        <div className="mb-3 bg-sky-50 border border-sky-200 text-sky-900 text-xs font-medium px-3 py-2 rounded-xl flex items-center space-x-2" id="orders-loading-banner">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Retrieving the official order texts from the eCourts registry. This can take up to a minute the first time a case is opened.</span>
        </div>
      )}

      {downloadError && (
        <div className="mb-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium px-3 py-2 rounded-xl">
          {downloadError}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-slate-500 italic text-center">
          No court orders registered for this case record yet.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((ord) => {
            const isPending = ord.contentStatus === 'pending';
            return (
              <div key={ord.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900">{ord.title}</span>
                    {ord.orderNumber && (
                      <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-semibold">
                        {ord.orderNumber}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Order Date: {ord.orderDate}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isPending ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                  {ord.summary}
                </p>
                {ord.contentStatus === 'unavailable' && (
                  <p className="text-[11px] text-amber-700">
                    Official text not available: {ord.contentError || "the registry did not return this order's text."}
                  </p>
                )}
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    Type: {ord.orderType}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onViewAnalysis(ord)}
                      className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 flex items-center space-x-1 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg border border-indigo-200 transition-colors"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>View Analysis</span>
                    </button>
                    <button
                      onClick={() => onDownloadPdf(ord)}
                      disabled={downloadingOrderId === ord.id}
                      className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center space-x-1 cursor-pointer bg-amber-50 hover:bg-amber-100 disabled:opacity-60 px-3 py-1 rounded-lg border border-amber-200 transition-colors"
                    >
                      {downloadingOrderId === ord.id ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>{ord.orderUrl?.endsWith('.pdf') ? 'Downloading...' : 'Generating PDF...'}</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          <span>Download PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
