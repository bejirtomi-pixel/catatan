import { useState } from 'react';
import { LogOut, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';

export default function UserAccountCard({ compact = false }) {
  const { currentUser, logout, ownerUid } = useAuth();
  const { pushToast } = useApp();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (!currentUser) return null;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      pushToast('Berhasil keluar dari akun Google.', 'info');
    } catch {
      pushToast('Gagal keluar dari sesi.', 'error');
    } finally {
      setIsLoggingOut(false);
      setShowConfirm(false);
    }
  };

  const displayName = currentUser.displayName || 'Pemilik Warung';
  const email = currentUser.email || '';
  const photo = currentUser.photoURL;
  const uidShort = ownerUid ? `${ownerUid.slice(0, 8)}...` : '';

  return (
    <>
      <div className="rounded-2xl border border-line bg-surface p-3 shadow-soft">
        <div className="flex items-center gap-2.5">
          {photo ? (
            <img
              src={photo}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-xl object-cover border border-line shadow-sm"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary font-bold text-sm shadow-sm">
              <User className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="truncate text-xs font-bold text-ink" title={displayName}>
                {displayName}
              </p>
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" title="Akun Terverifikasi" />
            </div>
            <p className="truncate text-[10px] text-ink-soft" title={email}>
              {email}
            </p>
            <p className="text-[9px] font-mono text-ink-soft/80" title={`UID: ${ownerUid}`}>
              UID: {uidShort}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            title="Keluar dari Akun Google"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-soft transition hover:bg-red-50 hover:text-red-600 active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Modal Konfirmasi Logout */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl border border-line bg-surface p-6 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <LogOut className="h-6 w-6" />
            </div>

            <div className="mt-4 text-center">
              <h3 className="text-base font-bold text-ink">Konfirmasi Keluar</h3>
              <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                Apakah Anda yakin ingin keluar dari akun <span className="font-semibold text-ink">{email}</span>?
              </p>
              <p className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 rounded-xl p-2 border border-emerald-100">
                Data operasional warung yang ada di memori perangkat ini tetap aman dan tidak akan terhapus.
              </p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl border border-line bg-white py-2.5 text-xs font-bold text-ink shadow-soft transition hover:bg-neutral-50 active:scale-95"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white shadow-soft transition hover:bg-red-700 active:scale-95 disabled:opacity-60"
              >
                {isLoggingOut ? 'Mengeluarkan...' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
