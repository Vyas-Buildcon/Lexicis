/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Briefcase, Calendar, AlertCircle, ChevronRight } from 'lucide-react';
import { Case, isProposedHearingDate } from '../../types';

interface AttorneyWorkspaceProps {
  attorneyName: string;
  trackedCases: Case[];
  onSelectCase: (c: Case) => void;
  onUntrackCase: (c: Case) => void;
  selectedCaseId?: string;
}

export default function AttorneyWorkspace({
  attorneyName,
  trackedCases,
  onSelectCase,
  onUntrackCase,
  selectedCaseId
}: AttorneyWorkspaceProps) {
  const [selectedCase, setSelectedCase] = useState<Case | null>(
    trackedCases.find(c => c.id === selectedCaseId) || trackedCases[0] || null
  );

  const handleCaseSelect = (c: Case) => {
    setSelectedCase(c);
    onSelectCase(c);
  };

  return (
    <div className="space-y-6 text-slate-900">

      {/* Welcome Banner Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-950 flex items-center space-x-2">
            <span className="text-amber-500">⚖️</span>
            <span>Welcome, {attorneyName}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Access, monitor, and analyze your tracked litigation portfolios in real-time.
          </p>
        </div>
        <div className="flex space-x-4 text-xs font-mono bg-slate-50 border border-slate-150 rounded-xl px-4 py-2.5">
          <div>
            <span className="text-slate-400 block text-[9px] uppercase font-bold">Linked Portfolios</span>
            <span className="text-slate-900 font-bold text-sm">{trackedCases.length} Active Cases</span>
          </div>
        </div>
      </div>

      {/* Case Grid Layout */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono flex items-center space-x-1.5">
            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
            <span>Active Case Portfolio Directory</span>
          </h3>
        </div>

        {trackedCases.length === 0 ? (
          <div className="text-center py-20 text-slate-400 border border-dashed border-slate-200 bg-white rounded-2xl space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No active portfolios listed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trackedCases.map(c => {
              const isSel = selectedCase?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleCaseSelect(c)}
                  className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all cursor-pointer relative ${
                    isSel
                      ? 'border-slate-950 ring-1 ring-slate-950 bg-slate-50/50'
                      : 'border-slate-200 hover:border-slate-350 hover:shadow-sm'
                  }`}
                  id={`attorney-case-card-${c.id}`}
                >
                  <div className="space-y-4">
                    {/* Header: Number and Category */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] font-bold font-mono text-amber-800 bg-amber-50 px-2 py-0.5 border border-amber-200 rounded">
                        {c.caseNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
                        {c.category}
                      </span>
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-950 line-clamp-2 leading-snug" title={c.title}>
                        {c.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 italic font-mono truncate">
                        {c.court}
                      </p>
                    </div>

                    {/* Details section */}
                    <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Presiding Judge:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[150px]" title={c.judge}>
                          {c.judge}
                        </span>
                      </div>
                      {c.nextHearingDate && (
                        <div className="flex justify-between items-start text-slate-500">
                          <span>Next Hearing:</span>
                          <div className="text-right">
                            <span className="font-bold text-rose-600 flex items-center justify-end space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{c.nextHearingDate}</span>
                            </span>
                            {isProposedHearingDate(c) && (
                              <span className="text-[10px] text-amber-600 font-semibold block leading-tight">
                                (Proposed)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-6 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wider font-mono text-slate-400">Current Status</span>
                      <span className="text-xs font-bold text-amber-700">{c.currentStatus}</span>
                    </div>

                    <div className="flex space-x-2 items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUntrackCase(c);
                        }}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[11px] py-1 px-2.5 rounded-lg cursor-pointer transition-colors flex items-center space-x-1"
                        title="Unbind Case"
                        id={`btn-attorney-unbind-${c.id}`}
                      >
                        <span>Unbind Case</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCaseSelect(c);
                        }}
                        className="bg-slate-900 hover:bg-slate-850 text-white font-semibold text-[11px] py-1.5 px-3 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <span>Open File</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
