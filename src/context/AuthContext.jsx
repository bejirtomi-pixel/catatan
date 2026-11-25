import { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  loginWithGoogle as firebaseLoginWithGoogle,
  logoutFirebase,
  subscribeToAuth,
} from '../services/firebase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState(null);

  useEffect(() => {
    // Dengarkan status autentikasi dari Firebase Auth
    const unsubscribe = subscribeToAuth((user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await firebaseLoginWithGoogle();
      if (!res.ok) {
        setLoginError(res.error || 'Gagal masuk dengan Google.');
        return false;
      }
      return true;
    } catch (err) {
      setLoginError(err?.message || 'Terjadi kesalahan sistem saat login.');
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      const res = await logoutFirebase();
      if (!res.ok) {
        throw new Error(res.error);
      }
      return true;
    } catch (err) {
      console.error('Logout error:', err);
      return false;
    }
  };

  const clearError = () => {
    setLoginError(null);
  };

  const value = {
    currentUser,
    ownerUid: currentUser?.uid || null,
    isAuthenticated: !!currentUser,
    loading,
    isLoggingIn,
    loginError,
    login,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
}
