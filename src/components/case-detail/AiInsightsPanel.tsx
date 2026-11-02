import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, Scale, BookOpen, ArrowUpRight } from 'lucide-react';
import { Case, CaseAiInsight, isCaseDisposed } from '../../types';

interface AiInsightsPanelProps {
  caseItem: Case;
  insights: CaseAiInsight | null;
  loadingInsights: boolean;
  onReanalyze: () => void;
}

/** AI summary, merit assessment, comparable precedents and the recovery checklist. */
export default function AiInsightsPanel({ caseItem, insights, loadingInsights, onReanalyze }: AiInsightsPanelProps) {
  const [maxCases, setMaxCases] = useState(10);

  // Recovery checklist progress, kept per case
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setCompletedSteps({});
  }, [caseItem.id]);

  const toggleStep = (stepText: string) => {
    setCompletedSteps(prev => ({
      ...prev,
      [stepText]: !prev[stepText]
    }));
  };

  const precedentAnalysis = insights?.precedentAnalysis?.whatWillHappen ? insights.precedentAnalysis : null;
  const isDisposed = insights?.caseStage ? insights.caseStage === 'disposed' : isCaseDisposed(caseItem);
  const precedentCount = insights?.similarCases?.length || 0;
  const visibleCases = Math.min(maxCases, Math.max(1, precedentCount));

  return (
    <div className="bg-gradient-to-br from-amber-50/30 to-white text-slate-900 rounded-2xl p-6 shadow-sm border border-amber-200/80 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Sparkles className="h-40 w-40 text-amber-600" />
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-amber-500 fill-amber-400" />
          <h3 className="text-base font-display font-bold tracking-tight text-slate-950">
            AI-Powered Judicial Insights & Suggestions
          </h3>
        </div>
        
        <button
          onClick={onReanalyze}
          disabled={loadingInsights}
          className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold font-mono bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg py-1 px-2.5 flex items-center space-x-1 cursor-pointer transition-colors"
          id="btn-reanalyze-case"
        >
          <RefreshCw className={`h-3 w-3 ${loadingInsights ? 'animate-spin' : ''}`} />
          <span>Re-Analyze Case</span>
        </button>
      </div>

      {loadingInsights ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Reading every court order on record and comparing judgments on the same legal issues...</p>
          <p className="text-[11px] text-slate-400">The first analysis of a case can take 1–2 minutes while the official orders are retrieved.</p>
        </div>
      ) : insights ? (
        <div className="space-y-6 animate-fade-in" id="ai-insights-content">
          
          {insights.registryNotice && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium px-3.5 py-2.5 rounded-xl" id="insights-registry-notice">
              {insights.registryNotice}
            </div>
          )}

          {/* Executive Summary */}
          <div className="bg-amber-50/70 p-4 border-l-4 border-amber-500 rounded-r-xl">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              AI Legal Standing Summary
              {typeof insights.ordersAnalyzed === 'number' && (
                <span className="ml-2 normal-case tracking-normal font-semibold text-amber-700">
                  · complete case to date, based on {insights.ordersAnalyzed} court order{insights.ordersAnalyzed === 1 ? '' : 's'}
                </span>
              )}
            </h4>
            <p className="text-sm text-slate-800 leading-relaxed font-sans font-medium whitespace-pre-line">
              {insights.summary}
            </p>
          </div>

          {/* Sub layout: Merit Analysis & Similar cases count */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Legal Merit Assessment
              </h5>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {insights.legalMeritAnalysis}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Precedent Volumetrics
              </h5>
              <div className="flex items-baseline space-x-1 mt-1">
                <span className="text-3xl font-bold text-amber-600 font-display">{insights.similarCasesCount}</span>
                <span className="text-xs text-slate-500">similar cases mapped in our network</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                Judgments on the same legal issues found on Indian Kanoon, each checked against its own text for relevance and outcome.
              </p>
            </div>
          </div>

          {/* Similar Cases & Outcomes */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Scale className="h-5 w-5 text-amber-500" />
                <span>Comparative Precedents & Outcome Analysis</span>
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Judgments that decided the same legal questions as this case, with what each court actually ordered.
              </p>
              {precedentCount > 1 && (
              <div className="flex items-center space-x-3 mt-3">
                <span className="text-xs text-slate-500 font-semibold">Cases to show: {visibleCases}</span>
                <input
                  type="range"
                  min="1"
                  max={precedentCount}
                  value={visibleCases}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setMaxCases(isNaN(parsed) ? 5 : parsed);
                  }}
                  className="w-32 accent-amber-600"
                />
              </div>
              )}
            </div>

            {/* Results List */}
            {(insights.similarCases || []).length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                No judgments on the same legal issues were found for this case.
              </div>
            ) : (
              <div className="space-y-4">
                {(insights.similarCases || []).slice(0, visibleCases).map((sc, i) => {
                  const kanoonUrl = sc.docUrl || (sc.kanoonDocId 
                    ? `https://indiankanoon.org/doc/${sc.kanoonDocId}/` 
                    : `https://indiankanoon.org/search/?formInput=${encodeURIComponent(sc.citation || sc.title)}`);

                  return (
                    <div key={i} className="bg-slate-50/50 border border-slate-200 rounded-2xl p-5 hover:bg-white hover:border-slate-300 transition-all space-y-4 shadow-xs">
                      
                      {/* Header Block: Title, Match Strength, Citation, Direct Indian Kanoon Action */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                            <a
                              href={kanoonUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-bold text-indigo-950 hover:text-indigo-600 hover:underline font-sans inline-flex items-center gap-1 group cursor-pointer"
                              title="Click to view full judgment on Indian Kanoon"
                            >
                              <span>{sc.title}</span>
                              <ArrowUpRight className="h-4 w-4 text-indigo-500 opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
                            </a>
                            {sc.citation && (
                              <a
                                href={kanoonUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-mono font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
                                title="Open citation on Indian Kanoon"
                              >
                                <span>Citation: {sc.citation}</span>
                              </a>
                            )}
                          </div>
                          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            <span>Status: <strong className="text-emerald-700 uppercase font-mono">{sc.status || 'Decided'}</strong></span>
                            {typeof sc.similarity === 'number' && (
                              <>
                                <span>•</span>
                                <span>Match Strength: <strong className="text-amber-800">{sc.similarity}%</strong></span>
                              </>
                            )}
                            {sc.court && (
                              <>
                                <span>•</span>
                                <span>{sc.court}{sc.decisionDate ? `, ${sc.decisionDate}` : ''}</span>
                              </>
                            )}
                            <span>•</span>
                            <span className="text-indigo-600 font-medium">Source: Indian Kanoon</span>
                          </div>
                        </div>
                        
                        <a
                          href={kanoonUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="self-start sm:self-center text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs inline-flex items-center gap-1.5 font-sans cursor-pointer transition-all hover:scale-102 shrink-0"
                          title="Open full judgment transcript on Indian Kanoon"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>View on Indian Kanoon</span>
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </div>

                      {/* Descriptive Case Summary */}
                      {sc.description && (
                        <div className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-white/60 p-3.5 rounded-xl border border-slate-100">
                          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 font-mono">
                            Case Facts & Judicial Dispute Context
                          </h5>
                          <p className="text-slate-700 text-xs sm:text-sm">
                            {sc.description}
                          </p>
                        </div>
                      )}

                      {/* Verdict / Detailed Outcome Block */}
                      <div className="bg-amber-50/40 p-3.5 rounded-xl border border-amber-100 space-y-1 text-xs sm:text-sm">
                        <h5 className="text-[10px] font-bold text-amber-800 uppercase tracking-wider font-mono">
                          Descriptive Judicial Verdict & Result
                        </h5>
                        <p className="text-slate-800 font-medium leading-relaxed font-sans">
                          {sc.result}
                        </p>
                      </div>

                      {/* Strategic Takeaway / Ratio Decidendi */}
                      {sc.takeaway && (
                        <div className="bg-indigo-50/20 p-3.5 rounded-xl border border-indigo-50 text-xs sm:text-sm">
                          <div className="font-bold text-indigo-900 flex items-center space-x-1.5 mb-1 font-mono text-[10px] uppercase tracking-wider font-sans">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                            <span>Ratio Decidendi & Tactical Pleading Takeaway</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed">
                            {sc.takeaway}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Precedent Outcome Synthesis & Case Prognosis Block */}
          {precedentAnalysis && (
            <div className="bg-gradient-to-br from-amber-50/60 to-orange-50/30 border border-amber-200 rounded-2xl p-6 shadow-xs space-y-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                  <span>AI Precedent Synthesis & Strategic Diagnosis</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {isDisposed
                    ? 'Based on the complete record and the final orders: what the court decided, what it means now, and how the party came out of the dispute.'
                    : 'Based on the complete record, the latest orders and the outcomes of the precedents above: what will happen next and the exact strategic actions required to recover.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Section 1: Prognosis / What Will Happen */}
                <div className="bg-white p-5 rounded-xl border border-slate-150 space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2.5">
                    <Scale className="h-4 w-4 text-amber-600" />
                    <h5 className="text-xs font-bold uppercase tracking-wider text-amber-900 font-mono">
                      {isDisposed ? 'Final Outcome & Its Effect ("What Happened")' : 'Case Prognosis & Trajectory ("What Will Happen")'}
                    </h5>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line font-sans">
                    {precedentAnalysis.whatWillHappen}
                  </p>
                </div>

                {/* Section 2: Strategy / What You Must Do */}
                <div className="bg-white p-5 rounded-xl border border-slate-150 space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-900 font-mono">
                      {isDisposed ? 'How the Party Recovered ("What Was Done")' : 'Action Plan to Recover ("What You Must Do")'}
                    </h5>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line font-sans">
                    {precedentAnalysis.howToRecover}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disposed cases: how the matter was resolved and how the party recovered */}
          {isDisposed && (
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200" id="case-resolution-path">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                How This Case Was Resolved — Recovery Path
              </h4>
              <p className="text-[10px] text-slate-500 mb-4">
                This case is disposed. The steps below trace, from the court orders, how the dispute was resolved and how the party recovered.
              </p>
              {(insights.resolutionSteps || []).length === 0 ? (
                <p className="text-xs text-slate-500 italic">The record does not show enough detail to trace the resolution.</p>
              ) : (
                <ol className="relative border-l-2 border-emerald-200 ml-2 pl-5 space-y-3">
                  {(insights.resolutionSteps || []).map((step, idx) => (
                    <li key={idx} className="relative">
                      <span className="absolute -left-[29px] top-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white status-dot"></span>
                      <p className="text-sm text-slate-800 font-medium leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* Step-by-Step recovery plan checklist (pending cases only) */}
          {!isDisposed && (
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              AI Case Recovery Roadmap
            </h4>
            <p className="text-[10px] text-slate-500 mb-4">
              Actionable recommended tasks generated specifically for this dispute phase. Check off tasks as you complete them to track progress.
            </p>

            <div className="space-y-3">
              {insights.recoverySteps.map((step, idx) => {
                const isDone = !!completedSteps[step];
                return (
                  <div
                    key={idx}
                    onClick={() => toggleStep(step)}
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      isDone
                        ? 'bg-emerald-50 border-emerald-200 text-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-350 text-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => {}} // toggled on container click
                      className="mt-0.5 h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 bg-white cursor-pointer"
                    />
                    <div className="text-sm font-medium">
                      <span className={isDone ? 'line-through text-slate-400' : ''}>
                        {step}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

        </div>
      ) : (
        <div className="text-center py-8 text-slate-400 text-xs">
          AI analysis has not loaded correctly. Try clicking 'Re-Analyze Case' above.
        </div>
      )}
    </div>
  );
}