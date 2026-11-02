import React from 'react';
import { appLogo } from '../../assets/logo';

export default function AppFooter() {
  return (
    <footer className="bg-white border-t border-slate-200 py-8 text-xs text-slate-600 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3">
        <div className="flex justify-center space-x-2 items-center text-slate-800">
          <img src={appLogo} alt="LEXICIS" className="h-6 w-auto object-contain" />
          <span className="font-display font-bold tracking-wider text-slate-900">LEXICIS</span>
        </div>
        <p className="text-[10px] text-slate-500">
          © 2026 Lexicis. All rights reserved. Confidential and Proprietary Client Portal.
        </p>
      </div>
    </footer>
  );
}
