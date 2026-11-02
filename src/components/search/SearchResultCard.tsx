import React from 'react';
import { Plus, Check, Building, MapPin } from 'lucide-react';
import { Case } from '../../types';

interface SearchResultCardProps {
  caseItem: Case;
  isTracked: boolean;
  isSelected: boolean;
  isBulkSelected: boolean;
  isAdding: boolean;
  onSelect: () => void;
  onToggleBulk: () => void;
  onTrack: () => void;
  onUntrack: () => void;
}

export default function SearchResultCard({
  caseItem: c,
  isTracked,
  isSelected,
  isBulkSelected,
  isAdding,
  onSelect,
  onToggleBulk,
  onTrack,
  onUntrack
}: SearchResultCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`p-3.5 border rounded-xl text-left cursor-pointer transition-all hover:shadow-sm ${
        isSelected
          ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
      id={`case-search-result-${c.id}`}
    >
      <div className="flex items-start space-x-3">
        {!isTracked && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleBulk();
            }}
            className="mt-0.5 flex-shrink-0 cursor-pointer"
          >
            <div className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all ${
              isBulkSelected
                ? 'bg-amber-500 border-amber-600 text-slate-950'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}>
              {isBulkSelected && <Check className="h-3 w-3 stroke-[3]" />}
            </div>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start space-x-2">
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] uppercase font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
                {c.caseNumber}
              </span>
              {c.cnrNumber && (
                <span className="text-[10px] uppercase font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                  CNR: {c.cnrNumber}
                </span>
              )}
              {c.source === 'Indian Kanoon' ? (
                <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded flex items-center space-x-1">
                  <span>📜 Indian Kanoon</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded flex items-center space-x-1">
                  <span>🏛️ eCourts</span>
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
              Filed: {c.filingDate}
            </span>
          </div>

          <h4 className="text-sm font-semibold text-slate-900 mt-2 line-clamp-1">
            {c.title}
          </h4>

          {c.citation && (
            <div className="text-[11px] font-mono text-purple-700 font-medium mt-0.5">
              Citation: {c.citation}
            </div>
          )}

          {c.headlineSnippet && (
            <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200/70 p-1.5 rounded mt-1.5 line-clamp-2 italic">
              "{c.headlineSnippet}"
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
            <div className="flex items-center space-x-1">
              <Building className="h-3 w-3 text-slate-400" />
              <span className="line-clamp-1">{c.court}</span>
            </div>
            {(c.state || c.district) && (
              <div className="flex items-center space-x-1 text-slate-600 font-medium">
                <MapPin className="h-3 w-3 text-amber-600" />
                <span>{[c.district, c.state].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between items-center pt-2.5 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 italic line-clamp-1">
              Category: {c.category}
            </span>

            {isTracked ? (
              <div className="flex items-center space-x-1.5 flex-shrink-0">
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center space-x-0.5">
                  <Check className="h-3 w-3" />
                  <span>Tracked</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUntrack();
                  }}
                  className="text-[10px] text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors"
                  title="Unbind Case"
                >
                  Unbind
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTrack();
                }}
                disabled={isAdding}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-[10px] px-2.5 py-1 rounded transition-colors flex items-center space-x-1 cursor-pointer flex-shrink-0"
                id={`btn-track-case-${c.id}`}
              >
                <Plus className="h-2.5 w-2.5" />
                <span>{isAdding ? "Linking..." : "Add to Dashboard"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
