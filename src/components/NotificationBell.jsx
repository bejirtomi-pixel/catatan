import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime } from '../utils/format';

export default function NotificationBell() {
  const { activeNotifications, unreadNotifCount, markAllNotifsRead, markNotifRead } = useApp();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('semua');
  const dropdownRef = useRef(null);

  // Tutup dropdown jika klik di luar
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const filteredNotifs = activeNotifications.filter((n) => {
    if (filter === 'semua') return true;
    return n.category === filter;
  });

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'stok':
        return Boxes;
      case 'pesanan':
        return ClipboardList;
      case 'pembelian_ulang':
        return RefreshCw;
      default:
        return Info;
    }
  };

  const getTypeStyle = (type) => {
    switch (type) {
      case 'danger':
        return {
          bg: 'bg-rose-50 text-rose-600 border-rose-200',
          badge: 'bg-rose-100 text-rose-700',
          dot: 'bg-rose-500',
          icon: AlertCircle,
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          badge: 'bg-amber-100 text-amber-800',
          dot: 'bg-amber-500',
          icon: AlertTriangle,
        };
      case 'success':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          badge: 'bg-emerald-100 text-emerald-800',
          dot: 'bg-emerald-500',
          icon: CheckCircle2,
        };
      default:
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          badge: 'bg-blue-100 text-blue-800',
          dot: 'bg-blue-500',
          icon: Info,
        };
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Tombol Lonceng */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Pusat Pemberitahuan Warung"
        title="Pusat Pemberitahuan Warung"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-soft transition hover:border-primary/50 hover:bg-primary-soft active:scale-95"
      >
        <Bell className="h-4 w-4" />
        {unreadNotifCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-sm ring-2 ring-white animate-pulse">
            {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-2xl border border-line bg-surface p-3 shadow-card animate-in fade-in zoom-in-95 duration-150">
          {/* Header Dropdown */}
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-ink">Pusat Pemberitahuan</p>
                <p className="text-[10px] text-ink-soft">
                  {activeNotifications.length} pemberitahuan aktif
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotifsRead}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-soft transition"
                  title="Tandai semua telah dibaca"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Sudah Dibaca</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-ink-soft hover:bg-line hover:text-ink transition"
                aria-label="Tutup"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Tab Kategori */}
          <div className="mt-2 flex gap-1 rounded-xl bg-primary-soft/40 p-1 text-[11px]">
            {[
              { id: 'semua', label: 'Semua' },
              { id: 'stok', label: 'Stok' },
              { id: 'pesanan', label: 'Pesanan' },
              { id: 'pembelian_ulang', label: 'Pembelian' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`flex-1 rounded-lg py-1 font-bold transition text-center ${
                  filter === tab.id
                    ? 'bg-white text-primary shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Daftar Notifikasi */}
          <div className="mt-2.5 max-h-[360px] space-y-2 overflow-y-auto pr-0.5">
            {filteredNotifs.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500/70" />
                <p className="mt-2 text-xs font-bold text-ink">Tidak ada pemberitahuan</p>
                <p className="text-[11px] text-ink-soft">
                  Semua kondisi stok dan pesanan warung dalam keadaan normal.
                </p>
              </div>
            ) : (
              filteredNotifs.map((n) => {
                const style = getTypeStyle(n.type);
                const IconComponent = style.icon;
                return (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-2.5 transition hover:shadow-soft ${style.bg}`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="mt-0.5 shrink-0">
                          <IconComponent className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold leading-tight">{n.title}</p>
                          <p className="mt-1 text-[11px] leading-relaxed opacity-90">{n.message}</p>
                          <div className="mt-2 flex items-center justify-between text-[10px] opacity-75">
                            <span>{formatDateTime(n.createdAt)}</span>
                            {n.link && (
                              <Link
                                to={n.link}
                                onClick={() => {
                                  markNotifRead(n.id);
                                  setOpen(false);
                                }}
                                className="inline-flex items-center gap-1 font-bold underline hover:opacity-100"
                              >
                                Periksa <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Dropdown */}
          <div className="mt-2.5 border-t border-line/60 pt-2 text-center">
            <Link
              to="/pengaturan"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-primary hover:underline"
            >
              Atur Jenis Notifikasi di Pengaturan →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
