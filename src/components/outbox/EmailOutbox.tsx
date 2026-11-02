/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EmailLog } from '../../types';
import { Mail, Calendar, Eye, Send, ArrowRight, ShieldCheck, Clock, CheckCircle } from 'lucide-react';

interface EmailOutboxProps {
  emailLogs: EmailLog[];
  onRefresh: () => void;
}

export default function EmailOutbox({ emailLogs, onRefresh }: EmailOutboxProps) {
  const [selectedEmail, setSelectedEmail] = useState<EmailLog | null>(null);

  const handleSelectEmail = (log: EmailLog) => {
    setSelectedEmail(log);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-150 p-6 shadow-sm text-slate-900">
      
      {/* Panel Header */}
      <div className="mb-6 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-950 flex items-center space-x-2">
            <Mail className="h-5 w-5 text-amber-500" />
            <span>Simulated Outbox & Notification Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review live court alerts dispatched automatically. All emails are configured to forward to <strong>ganeshnagargoje1008@gmail.com</strong>.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 py-1.5 px-3 rounded-lg text-slate-700 transition-all cursor-pointer flex items-center space-x-1"
          id="btn-refresh-emails"
        >
          <Send className="h-3 w-3 rotate-45" />
          <span>Refresh Outbox</span>
        </button>
      </div>

      {/* Outbox Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Sent Logs list (4 cols) */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Sent Messages ({emailLogs.length})
          </h3>
          
          {emailLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-xs">
              No emails have been dispatched yet. Trigger an action or updates to watch this outbox populate in real-time!
            </div>
          ) : (
            emailLogs.map(log => {
              const isSel = selectedEmail?.id === log.id;
              const isHearing = log.type === 'hearing';

              return (
                <div
                  key={log.id}
                  onClick={() => handleSelectEmail(log)}
                  className={`p-3.5 border text-left rounded-xl cursor-pointer transition-all hover:shadow-sm ${
                    isSel
                      ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                  id={`email-log-${log.id}`}
                >
                  <div className="flex justify-between items-start space-x-2">
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                      isHearing 
                        ? 'bg-rose-50 text-rose-800 border border-rose-200' 
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 mt-2 line-clamp-1">
                    {log.subject}
                  </h4>
                  
                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    <span className="truncate max-w-[150px]">To: {log.recipient}</span>
                    <span className="text-emerald-600 font-semibold flex items-center space-x-0.5">
                      <CheckCircle className="h-3 w-3" />
                      <span>Delivered</span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Side: Message HTML template renderer (7 cols) */}
        <div className="lg:col-span-7 bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col justify-between h-[450px]">
          
          {selectedEmail ? (
            <div className="flex flex-col h-full justify-between animate-fade-in" id="email-preview-panel">
              {/* Mail Envelope header metadata */}
              <div className="bg-white p-3 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-1 mb-3">
                <p><strong>From:</strong> Lexis Case Tracker judicial Alert Core &lt;no-reply@lexicis.gov&gt;</p>
                <p><strong>To:</strong> {selectedEmail.recipient}</p>
                <p><strong>Subject:</strong> {selectedEmail.subject}</p>
                <p><strong>Dispatched:</strong> {new Date(selectedEmail.timestamp).toLocaleString()}</p>
              </div>

              {/* Scrollable Document sandboxed HTML body */}
              <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-y-auto p-4 select-text">
                <div 
                  dangerouslySetInnerHTML={{ __html: selectedEmail.contentHtml }}
                  className="scale-[0.95] origin-top"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center h-full text-slate-400 space-y-3">
              <Eye className="h-10 w-10 text-slate-300 stroke-[1.5]" />
              <div>
                <p className="text-xs font-semibold text-slate-600">Select an Outbox Record</p>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
