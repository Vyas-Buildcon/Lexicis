import React from 'react';
import { History } from 'lucide-react';
import { Case } from '../../types';

/** Real-time historical timeline & logs for a case. */
export default function HistoryTimeline({ caseItem }: { caseItem: Case }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-150 p-6 shadow-sm">
      <h3 className="text-base font-display font-bold text-slate-900 mb-4 flex items-center space-x-2">
        <History className="h-4 w-4 text-slate-500" />
        <span>Real-Time Historical Timeline & Logs</span>
      </h3>

      <div className="relative border-l-2 border-slate-100 ml-3.5 pl-5 space-y-6">
        {caseItem.history.map((h) => (
          <div key={h.id} className="relative">
            {/* Timeline bullet */}
            <span className="absolute -left-[27px] top-1 flex items-center justify-center bg-white rounded-full h-4 w-4 border-2 border-slate-400 ring-4 ring-white"></span>
            
            <div className="text-left">
              <div className="flex justify-between items-center flex-wrap gap-1">
                <span className="text-xs font-semibold text-slate-900">{h.title}</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(h.date).toLocaleString()}
                </span>
              </div>
              
              <div className="flex items-center space-x-2 mt-1.5">
                <span className="text-[9px] uppercase font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                  {h.status}
                </span>
                <span className="text-[10px] text-slate-400">
                  Logged by: {h.updatedBy}
                </span>
              </div>

              <p className="text-sm text-slate-700 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                {h.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}