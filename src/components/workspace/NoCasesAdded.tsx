import React from 'react';
import { Search, ArrowRight } from 'lucide-react';

/** Empty state shown when no cases are bound to the dashboard yet. */
export default function NoCasesAdded({ onGoToSearch }: { onGoToSearch: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-sm">
      <div className="w-14 h-14 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center mx-auto border border-sky-200">
        <Search className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">No Cases Added</h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        Go to the Search Registry and bind cases to the dashboard to start tracking them here.
      </p>
      <button
        onClick={onGoToSearch}
        className="inline-flex items-center space-x-2 bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <span>Go to Search Registry</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
