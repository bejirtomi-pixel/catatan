import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Lock, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, isLoggingIn, loginError, clearError } = useAuth();
  const [internalError, setInternalError] = useState('');

  const handleLogin = async () => {
    setInternalError('');
    clearError();
    const success = await login();
    if (!success) {
      // loginError will be set in AuthContext
    }
  };

  const errorMessage = loginError || internalError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-ink">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        {/* Card Header / Logo */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-white shadow-soft">
            <Store className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Catatan Warung Madura</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            Manajemen Stok, Pesanan &amp; Pembukuan Terpadu
          </p>
        </div>

        {/* Card Body */}
        <div className="rounded-3xl border border-line bg-surface p-7 shadow-soft sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Lock className="h-4 w-4" />
              <span>Akses Khusus Pemilik</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-ink">Masuk Akun Pemilik Warung</h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              Silakan masuk menggunakan akun Google Anda untuk mengautentikasi kepemilikan data warung.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <div className="flex-1">
                <p className="font-bold">Gagal Masuk</p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </motion.div>
          )}

          {/* Tombol Google Sign-In */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="group relative flex w-full items-center justify-center gap-3 rounded-2xl border border-line bg-white px-5 py-3.5 text-sm font-bold text-ink shadow-soft transition hover:bg-neutral-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoggingIn ? (
              <div className="flex items-center gap-2.5 text-ink-soft">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span>Menghubungkan ke Google...</span>
              </div>
            ) : (
              <>
                {/* Google Logo SVG Resmi */}
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Lanjutkan dengan Google</span>
              </>
            )}
          </button>

          {/* Info Mode Aman */}
          <div className="mt-6 rounded-2xl bg-neutral-50 p-4 border border-line/60">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Keamanan &amp; Privasi Data</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Autentikasi menggunakan token Google terenkripsi. Data operasional harian warung Anda
              tersimpan secara mandiri dan aman.
            </p>
          </div>
        </div>

        {/* Footer Credit */}
        <p className="mt-6 text-center text-xs text-ink-soft">
          Catatan Warung Madura &copy; 2026 · Akses Tunggal Pemilik Warung
        </p>
      </motion.div>
    </div>
  );
}
