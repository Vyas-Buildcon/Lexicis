import { useCallback, useEffect, useState } from 'react';
import { User } from '../types';
import { clearSession, readSessionToken, readSessionUser, writeSessionUser } from '../lib/storage';
import { SESSION_EXPIRED_EVENT } from '../api/client';

// Only this account may use the portal; any other cached session is discarded
const AUTHORIZED_EMAIL = 'archana.katkar@brickfour.com';

function restoreSession(): User | null {
  const cached = readSessionUser();
  if (cached?.email?.toLowerCase() === AUTHORIZED_EMAIL && readSessionToken()) return cached;
  if (cached) clearSession();
  return null;
}

export function useSession() {
  const [user, setUser] = useState<User | null>(restoreSession);

  const login = useCallback((loggedInUser: User) => {
    writeSessionUser(loggedInUser);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  // Keeps the header and cached session in step after a profile edit
  const updateUser = useCallback((updatedUser: User) => {
    writeSessionUser(updatedUser);
    setUser(updatedUser);
  }, []);

  // The server rejected the session (expired, or the password changed elsewhere)
  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout);
  }, [logout]);

  return { user, login, logout, updateUser };
}
