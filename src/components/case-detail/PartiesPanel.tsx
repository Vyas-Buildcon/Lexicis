import React from 'react';
import { Scale, Briefcase, User, BookOpen } from 'lucide-react';
import { Case } from '../../types';

/** Parties & Advocates section, matching the official eCourts layout. */
export default function PartiesPanel({ caseItem }: { caseItem: Case }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
      <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
        <Scale className="h-5 w-5 text-sky-800" />
        <h3 className="text-base font-display font-bold text-slate-900">
          Parties & Advocates
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Petitioners Column */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-900 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100">
            <User className="h-4 w-4 text-sky-700" />
            <span>Petitioners</span>
          </div>
          <div className="space-y-2">
            {(caseItem.petitionersList || [caseItem.petitioner]).map((p, idx) => (
              <div key={idx} className="flex items-start space-x-2.5 bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-800">
                <span className="bg-sky-100 text-sky-900 font-bold px-2 py-0.5 rounded-full text-[11px]">
                  {idx + 1}
                </span>
                <span className="font-semibold leading-relaxed">{p}</span>
              </div>
            ))}
          </div>

          {/* Petitioner Advocate */}
          <div className="pt-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Briefcase className="h-3.5 w-3.5 text-slate-600" />
              <span>Petitioner Advocate</span>
            </div>
            <div className="bg-indigo-50/50 border border-indigo-150 p-3 rounded-xl text-xs font-bold text-indigo-950">
              {(caseItem.petitionerAdvocates && caseItem.petitionerAdvocates.length > 0)
                ? caseItem.petitionerAdvocates.join(', ')
                : (caseItem.advocateName || "Advocate on Record / Designated Counsel")}
            </div>
          </div>
        </div>

        {/* Respondents Column */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-amber-900 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">
            <User className="h-4 w-4 text-amber-700" />
            <span>Respondents</span>
          </div>
          <div className="space-y-2">
            {(caseItem.respondentsList || [caseItem.respondent]).map((r, idx) => (
              <div key={idx} className="flex items-start space-x-2.5 bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-800">
                <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full text-[11px]">
                  {idx + 1}
                </span>
                <span className="font-semibold leading-relaxed">{r}</span>
              </div>
            ))}
          </div>

          {/* Respondent Advocate */}
          <div className="pt-2">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Briefcase className="h-3.5 w-3.5 text-slate-600" />
              <span>Respondent Advocate</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs text-slate-700 italic font-medium">
              {(caseItem.respondentAdvocates && caseItem.respondentAdvocates.length > 0)
                ? caseItem.respondentAdvocates.join(', ')
                : "Advocate on Record / Standing Counsel"}
            </div>
          </div>
        </div>
      </div>

      {/* Acts & Sections Chips */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 flex items-center space-x-1">
          <BookOpen className="h-3.5 w-3.5 text-slate-600" />
          <span>Acts & Sections:</span>
        </span>
        <span className="bg-sky-50 text-sky-900 border border-sky-200 px-3 py-1 rounded-lg text-xs font-semibold">
          {caseItem.actsAndSections || caseItem.category || "Code Of Civil Procedure - 21"}
        </span>
      </div>
    </div>
  );
}