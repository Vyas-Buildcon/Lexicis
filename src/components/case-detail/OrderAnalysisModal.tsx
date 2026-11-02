import React from 'react';
import { Sparkles, FileText, Download, Loader2, Scale, Briefcase, X } from 'lucide-react';
import { Case, CaseOrder } from '../../types';

interface OrderAnalysisModalProps {
  caseItem: Case;
  order: CaseOrder;
  loading: boolean;
  analysis: any | null;
  isDownloading: boolean;
  onClose: () => void;
  onDownloadPdf: (order: CaseOrder) => void;
}

/** Court order & judicial directives analysis with a certified PDF download. */
export default function OrderAnalysisModal({
  caseItem,
  order,
  loading,
  analysis,
  isDownloading,
  onClose,
  onDownloadPdf
}: OrderAnalysisModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Court Order &amp; Judicial Directives Analysis
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {order.title} • {order.orderDate}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-semibold text-slate-600">
                Extracting operative directives and analyzing judicial text...
              </p>
              <p className="text-xs text-slate-500">
                The official order is retrieved from the eCourts registry; the first time this can take up to a minute.
              </p>
            </div>
          ) : (
            <>
              {/* Bench & Forum Quick Facts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Courtroom</div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">{analysis?.courtroom || caseItem.courtRoom || 'REGISTRAR COURT. 1'}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Order Type</div>
                  <div className="text-xs font-bold text-indigo-700 mt-0.5">{order.orderType || 'Reported Order'}</div>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 col-span-2">
                  <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Presiding Officer</div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5 truncate">{analysis?.bench || caseItem.judge}</div>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center space-x-1.5">
                  <FileText className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Executive Legal Summary</span>
                </h4>
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-sm text-slate-800 leading-relaxed font-sans">
                  {analysis?.executiveSummary || order.summary}
                </div>
                {(analysis?.orderNature || analysis?.nextHearingDate) && (
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    {analysis?.orderNature && (
                      <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-semibold">Nature: {analysis.orderNature}</span>
                    )}
                    {analysis?.nextHearingDate && (
                      <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded font-semibold">Next date fixed: {analysis.nextHearingDate}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Plain-language meaning for the litigant */}
              {analysis?.plainLanguageSummary && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center space-x-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                    <span>What This Order Means For You</span>
                  </h4>
                  <div className="bg-amber-50/40 border border-amber-100 rounded-xl p-3 text-xs text-slate-800 leading-relaxed">
                    {analysis.plainLanguageSummary}
                  </div>
                </div>
              )}

              {/* Operative Directives */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center space-x-1.5">
                  <Scale className="h-3.5 w-3.5 text-sky-700" />
                  <span>Operative Courtroom Directives</span>
                </h4>
                <div className="space-y-2">
                  {Array.isArray(analysis?.operativeDirectives) && analysis.operativeDirectives.length > 0 ? (
                    analysis.operativeDirectives.map((directive: string, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                        <span className="h-4 w-4 bg-sky-100 text-sky-800 font-mono text-[10px] font-bold rounded-full flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{directive}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      {order.summary}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions required by this order */}
              {Array.isArray(analysis?.actionItems) && analysis.actionItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center space-x-1.5">
                    <FileText className="h-3.5 w-3.5 text-rose-600" />
                    <span>Required Actions & Deadlines</span>
                  </h4>
                  <div className="space-y-2">
                    {analysis.actionItems.map((item: { action: string; deadline?: string; party?: string }, idx: number) => (
                      <div key={idx} className="text-xs text-slate-700 bg-rose-50/40 border border-rose-100 p-2.5 rounded-lg">
                        <span className="font-semibold text-slate-900">{item.action}</span>
                        {(item.deadline || item.party) && (
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            {item.deadline ? `By ${item.deadline}` : ''}{item.deadline && item.party ? ' · ' : ''}{item.party || ''}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(analysis?.complianceRisks) && analysis.complianceRisks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Compliance Risks
                  </h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                    {analysis.complianceRisks.map((risk: string, idx: number) => <li key={idx}>{risk}</li>)}
                  </ul>
                </div>
              )}

              {/* Legal Counsel & Appearances */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center space-x-1.5">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Counsel Appearances</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="bg-sky-50/60 border border-sky-200 p-2.5 rounded-lg">
                    <span className="font-bold text-sky-900">For Petitioner(s):</span>
                    <p className="text-slate-700 mt-1">
                      {analysis?.petitionerCounsel || caseItem.petitionerAdvocates?.join(', ') || caseItem.advocateName || 'Counsel on Record'}
                    </p>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200 p-2.5 rounded-lg">
                    <span className="font-bold text-amber-900">For Respondent(s):</span>
                    <p className="text-slate-700 mt-1">
                      {analysis?.respondentCounsel || caseItem.respondentAdvocates?.join(', ') || 'Advocate on Record'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Ratio Decidendi */}
              {analysis?.ratioDecidendi && (
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Key Ratio / Procedural Rule
                  </h4>
                  <p className="text-xs text-slate-700 italic bg-amber-50/30 border border-amber-100 p-2.5 rounded-lg">
                    "{analysis.ratioDecidendi}"
                  </p>
                </div>
              )}

              {/* Full Order Text transcript */}
              {order.fullText && (
                <div className="space-y-1 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Official Order Transcript
                  </h4>
                  <div className="bg-slate-900 text-slate-100 font-mono text-[11px] p-3 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {order.fullText}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={() => onDownloadPdf(order)}
            disabled={isDownloading}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>Download Certified PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}