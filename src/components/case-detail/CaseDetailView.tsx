/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Case, CaseAiInsight, CaseOrder } from '../../types';
import * as api from '../../api/client';
import CaseOverviewCard from './CaseOverviewCard';
import PartiesPanel from './PartiesPanel';
import AiInsightsPanel from './AiInsightsPanel';
import OrdersPanel from './OrdersPanel';
import HistoryTimeline from './HistoryTimeline';
import CaseCoachChat from './CaseCoachChat';
import OrderAnalysisModal from './OrderAnalysisModal';

interface CaseDetailViewProps {
  caseItem: Case;
  autoOpenChat?: boolean;
  onChatOpenChange?: (open: boolean) => void;
  onUntrackCase?: (c: Case) => void;
}

/** Analysis shown when the server cannot provide one: stored AI analysis, else the order summary. */
function localOrderAnalysis(ord: CaseOrder, caseItem: Case) {
  if (ord.aiAnalysis) {
    try {
      return JSON.parse(ord.aiAnalysis);
    } catch {
      return { executiveSummary: ord.aiAnalysis };
    }
  }
  return {
    executiveSummary: ord.summary,
    operativeDirectives: [ord.summary],
    bench: caseItem.judge,
    courtroom: caseItem.courtRoom
  };
}

export default function CaseDetailView({
  caseItem,
  autoOpenChat,
  onChatOpenChange,
  onUntrackCase
}: CaseDetailViewProps) {
  const [insights, setInsights] = useState<CaseAiInsight | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Court orders with their official text from the registry
  const [orders, setOrders] = useState<CaseOrder[]>(caseItem.orders || []);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Order analysis modal and PDF download state
  const [selectedOrderForAnalysis, setSelectedOrderForAnalysis] = useState<CaseOrder | null>(null);
  const [downloadingOrderId, setDownloadingOrderId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [orderAnalysisLoading, setOrderAnalysisLoading] = useState(false);
  const [orderAnalysisData, setOrderAnalysisData] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initial = caseItem.orders || [];
    setOrders(initial);
    setDownloadError(null);
    // Orders without registry text (or stored by an older version) are fetched now
    setLoadingOrders(initial.some(o => o.orderUrl?.endsWith('.pdf') && o.contentStatus !== 'loaded'));
    api.getCaseOrders(caseItem.id)
      .then(fresh => { if (!cancelled) setOrders(fresh); })
      .catch(err => console.warn("Could not load court orders:", err))
      .finally(() => { if (!cancelled) setLoadingOrders(false); });
    return () => { cancelled = true; };
  }, [caseItem.id]);

  const fetchAiInsights = async (force: boolean = false) => {
    setLoadingInsights(true);
    try {
      setInsights(await api.getCaseInsights(caseItem.id, force));
    } catch (err) {
      console.error("Could not fetch insights", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    fetchAiInsights();
  }, [caseItem.id]);

  const handleOpenOrderAnalysis = async (ord: CaseOrder) => {
    setSelectedOrderForAnalysis(ord);
    setOrderAnalysisLoading(true);
    setOrderAnalysisData(null);

    try {
      const result = await api.getOrderAnalysis(caseItem.id, ord.id);
      setOrderAnalysisData(result.analysis);
      // The order may have just received its official text
      setSelectedOrderForAnalysis(result.order);
      setOrders(prev => prev.map(o => (o.id === result.order.id ? result.order : o)));
    } catch (err) {
      console.error("Order analysis fetch error:", err);
      setOrderAnalysisData(localOrderAnalysis(ord, caseItem));
    } finally {
      setOrderAnalysisLoading(false);
    }
  };

  const handleDownloadOrderPdf = async (ord: CaseOrder) => {
    try {
      setDownloadingOrderId(ord.id);
      setDownloadError(null);
      const blob = await api.downloadOrderPdf(caseItem.id, ord.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cleanNo = (caseItem.caseNumber || caseItem.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Court_Order_${cleanNo}_${ord.orderDate || ord.id}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      setDownloadError(err?.message || "The order PDF could not be downloaded.");
    } finally {
      setDownloadingOrderId(null);
    }
  };

  return (
    <div className="space-y-6">

      <CaseOverviewCard caseItem={caseItem} onUntrackCase={onUntrackCase} />

      <PartiesPanel caseItem={caseItem} />

      {/* Main Layout Area */}
      <div className="space-y-6">
        <AiInsightsPanel
          caseItem={caseItem}
          insights={insights}
          loadingInsights={loadingInsights}
          onReanalyze={() => fetchAiInsights(true)}
        />

        <OrdersPanel
          orders={orders}
          loadingOrders={loadingOrders}
          downloadError={downloadError}
          downloadingOrderId={downloadingOrderId}
          onViewAnalysis={handleOpenOrderAnalysis}
          onDownloadPdf={handleDownloadOrderPdf}
        />

        <HistoryTimeline caseItem={caseItem} />
      </div>

      <CaseCoachChat
        caseItem={caseItem}
        autoOpenChat={autoOpenChat}
        onChatOpenChange={onChatOpenChange}
      />

      {selectedOrderForAnalysis && (
        <OrderAnalysisModal
          caseItem={caseItem}
          order={selectedOrderForAnalysis}
          loading={orderAnalysisLoading}
          analysis={orderAnalysisData}
          isDownloading={downloadingOrderId === selectedOrderForAnalysis.id}
          onClose={() => setSelectedOrderForAnalysis(null)}
          onDownloadPdf={handleDownloadOrderPdf}
        />
      )}
    </div>
  );
}
