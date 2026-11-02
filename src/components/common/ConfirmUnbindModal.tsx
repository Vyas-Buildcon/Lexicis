import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Case } from '../../types';

interface ConfirmUnbindModalProps {
  caseItem: Case;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmUnbindModal({ caseItem, onCancel, onConfirm }: ConfirmUnbindModalProps) {
  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[99999] flex items-center justify-center p-4"
      id="global-confirm-unbind-modal-backdrop"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 relative text-left"
        id="global-confirm-unbind-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3">
          <div className="bg-rose-100 text-rose-700 p-3 rounded-xl border border-rose-200 shrink-0">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-950">Confirm Unbind Case</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              {caseItem.caseNumber || caseItem.id}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-700 leading-relaxed">
          Are you sure you want to unbind <strong className="text-slate-950">{caseItem.title}</strong> from your active dashboard portfolio?
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 flex items-start space-x-2">
          <span className="text-amber-600 text-sm font-bold shrink-0">ℹ️</span>
          <span>This case will be immediately removed from your active portfolio. You can re-bind it anytime using the Lexicis Search Registry.</span>
        </div>

        <div className="flex space-x-3 pt-2">
          <button
            type="button"
            id="btn-cancel-global-unbind"
            onClick={onCancel}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2.5 px-4 rounded-xl transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            id="btn-confirm-global-unbind"
            onClick={onConfirm}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center space-x-1.5"
          >
            <span>Confirm Unbind</span>
          </button>
        </div>
      </div>
    </div>
  );
}
