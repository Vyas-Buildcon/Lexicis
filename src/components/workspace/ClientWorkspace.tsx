/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Building, Calendar, Clock, ShieldCheck, ArrowRight, Landmark } from 'lucide-react';
import { Case, Hearing, isProposedHearingDate } from '../../types';

interface ClientWorkspaceProps {
  trackedCases: Case[];
  allHearings: Hearing[];
  onSelectCase: (c: Case) => void;
  onUntrackCase: (c: Case) => void;
  selectedCaseId?: string;
}

export default function ClientWorkspace({
  trackedCases,
  allHearings,
  onSelectCase,
  onUntrackCase,
  selectedCaseId
}: ClientWorkspaceProps) {
  const activeCases = trackedCases.filter(c => !c.currentStatus.toLowerCase().includes('disposed')).length;

  // Upcoming hearings for the tracked cases
  const clientHearings = allHearings.filter(h =>
    trackedCases.some(tc => tc.id === h.caseId) && h.status === 'upcoming'
  );

  return (
    <div className="space-y-6 text-slate-900">

      {/* 1. Dashboard Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Stat card 1 */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="bg-amber-100 text-amber-800 p-3 rounded-xl">
            <Landmark className="h-6 w-6 stroke-[1.5]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Tracked Cases</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-1">{trackedCases.length}</div>
          </div>
        </div>

        {/* Stat card 2 */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="bg-emerald-100 text-emerald-800 p-3 rounded-xl">
            <ShieldCheck className="h-6 w-6 stroke-[1.5]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Legal Files</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-1">{activeCases}</div>
          </div>
        </div>

        {/* Stat card 3 */}
        <div className="bg-white border border-slate-150 p-5 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="bg-rose-100 text-rose-800 p-3 rounded-xl">
            <Calendar className="h-6 w-6 stroke-[1.5]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Upcoming Listings</div>
            <div className="text-2xl font-display font-bold text-slate-900 mt-1">{clientHearings.length}</div>
          </div>
        </div>

      </div>

      {/* 2. Tracked Cases Section & Upcoming Agenda layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Tracked cases cards (Col span 2) */}
        <div className="lg:col-span-2 space-y-4 text-left">
          <h3 className="text-base font-display font-bold text-slate-950 flex items-center space-x-2">
            <span>Your Personal Cases Portfolio</span>
            <span className="bg-slate-100 text-slate-700 text-xs py-0.5 px-2 rounded-full font-mono">
              {trackedCases.length} Files
            </span>
          </h3>

          {trackedCases.length === 0 ? (
            <div className="text-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl p-6 space-y-3">
              <Building className="h-10 w-10 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-700">No cases bound to your account</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {trackedCases.map(c => {
                const isSelected = selectedCaseId === c.id;
                const isDisposed = c.currentStatus.toLowerCase().includes('disposed');

                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectCase(c)}
                    className={`p-5 border bg-white rounded-2xl transition-all cursor-pointer hover:shadow-md flex flex-col justify-between min-h-[215px] h-full ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                        : 'border-slate-200 hover:border-slate-350'
                    }`}
                    id={`client-portfolio-case-${c.id}`}
                  >
                    <div>
                      <div className="flex justify-between items-start space-x-2">
                        <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded">
                          {c.caseNumber}
                        </span>

                        <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${
                          isDisposed
                            ? 'bg-slate-150 text-slate-600'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {isDisposed ? 'Disposed' : 'Active Tracking'}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-950 mt-3 line-clamp-2 leading-snug">
                        {c.title}
                      </h4>

                      <p className="text-xs sm:text-sm text-slate-500 mt-1 italic line-clamp-2">
                        "{c.description}"
                      </p>

                      {c.nextHearingDate && (
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-mono text-[10px] uppercase">Next Hearing</span>
                          <div className="text-right">
                            <span className="font-bold text-rose-600 flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>{c.nextHearingDate}</span>
                            </span>
                            {isProposedHearingDate(c) && (
                              <span className="text-[10px] text-amber-600 font-bold block">
                                (Proposed Date)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400">Current Phase</div>
                        <div className="font-bold text-slate-800 truncate max-w-[120px]">{c.currentStatus}</div>
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
                          id={`btn-client-unbind-${c.id}`}
                        >
                          <span>Unbind Case</span>
                        </button>
                        <button className="text-amber-600 hover:text-amber-700 font-semibold flex items-center space-x-1 cursor-pointer">
                          <span>Details</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming agenda timeline calendar card */}
        <div className="space-y-4 text-left">
          <h3 className="text-base font-display font-bold text-slate-950 flex items-center space-x-2">
            <span>Upcoming Legal Agenda</span>
          </h3>

          <div className="bg-white border border-slate-150 rounded-2xl p-5 shadow-sm space-y-4">
            {clientHearings.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No hearings or deadlines scheduled in the near future.
              </div>
            ) : (
              <div className="space-y-4">
                {clientHearings.map(h => {
                  const associatedCase = trackedCases.find(tc => tc.id === h.caseId);
                  return (
                    <div key={h.id} className="p-3 bg-slate-50 rounded-xl border border-slate-150 space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] uppercase font-bold bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.2 rounded flex items-center space-x-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          <span>Hearing Listed</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {h.date}
                        </span>
                      </div>

                      <h5 className="text-sm font-bold text-slate-950 leading-snug line-clamp-1">
                        {h.title}
                      </h5>

                      {associatedCase && (
                        <p className="text-xs text-slate-500 font-medium truncate">
                          Case: {associatedCase.title}
                        </p>
                      )}

                      <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 flex justify-between">
                        <span>Room: <strong>{h.courtRoom}</strong></span>
                        <span>Time: <strong>{h.time}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
