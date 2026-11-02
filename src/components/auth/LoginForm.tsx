/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, Zap, Crown, ArrowRight } from 'lucide-react';
import { appLogo } from '../../assets/logo';
import { User } from '../../types';
import * as api from '../../api/client';

interface LoginFormProps {
  onAuthSuccess: (user: User) => void;
}

// Demo account seeded by the server (see adminAccount in server/config.ts)
const DEMO_EMAIL = 'demo@vyasgroup.com';
const DEMO_PASSWORD = 'Demo@123';
const DEMO_NAME = 'Vyas Admin';

export default function LoginForm({ onAuthSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const signIn = async (signInEmail: string, signInPassword: string) => {
    setError('');
    setLoading(true);

    try {
      onAuthSuccess(await api.login(signInEmail, signInPassword));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(email, password);
  };

  const handleQuickLogin = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    signIn(DEMO_EMAIL, DEMO_PASSWORD);
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-slate-100 transition-all">

        {/* Branding Head */}
        <div className="text-center">
          <div className="inline-flex mb-3">
            <img src={appLogo} alt="Vyas Group" className="h-24 w-auto object-contain" />
          </div>
          <h2 className="text-lg font-display font-bold text-slate-900 tracking-wider">LEXICIS</h2>
          <p className="text-xs text-slate-500 mt-1">Authorized Legal Counsel & Portfolio Portal</p>
        </div>

        {/* Error notification */}
        {error && (
          <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-800 p-3 rounded text-xs font-medium">
            {error}
          </div>
        )}

        {/* Authentication Form */}
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>

          {/* Email address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Mail className="h-4 w-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@vyasgroup.com"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                id="input-email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                id="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none cursor-pointer"
                title={showPassword ? "Hide password" : "Show password"}
                id="btn-toggle-password-visibility"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-slate-600" />
                ) : (
                  <Eye className="h-4 w-4 text-slate-400" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Action */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
            id="btn-auth-submit"
          >
            {loading ? "Authenticating..." : "Sign In to Portal"}
          </button>

        </form>

        {/* Quick access */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <Zap className="h-4 w-4 text-amber-500 fill-current" />
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Quick Access</span>
            </div>
            <span className="text-xs text-slate-500">1-Click Sign In</span>
          </div>

          <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-300 rounded-lg">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center">
                <Crown className="h-4 w-4 text-amber-600 fill-current" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-slate-900">{DEMO_NAME}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded uppercase tracking-wider">Admin</span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{DEMO_EMAIL}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleQuickLogin}
              disabled={loading}
              className="flex-shrink-0 flex items-center space-x-1.5 px-3 py-2 border border-amber-500 rounded-lg text-sm font-semibold text-slate-950 bg-white hover:bg-amber-50 transition-all cursor-pointer disabled:opacity-50"
              id="btn-quick-login"
            >
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
