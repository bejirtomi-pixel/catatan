import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, Menu, Package, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cx } from './UI';
import Logo from './Logo';
import Sidebar, { NAV } from './Sidebar';
import ToastHost from './Toast';

const MOBILE_NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/barang', label: 'Barang', icon: Package },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
  { to: '/stok', label: 'Stok', icon: Boxes },
  { to: '/laporan', label: 'Laporan', icon: BarChart3 },
];

export default function Layout() {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  const current = NAV.find((n) => n.to === location.pathname);

  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="flex min-h-screen flex-col md:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur md:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl border border-line bg-white p-2 text-ink shadow-soft md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{current ? current.label : 'Warung Madura'}</p>
            <p className="hidden text-[11px] text-ink-soft sm:block">Catatan Stok &amp; Pesanan</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/pengaturan"
              aria-label="Pengaturan"
              title="Pengaturan"
              className="rounded-xl border border-line bg-white p-2 text-ink shadow-soft transition active:scale-95 md:hidden"
            >
              <Settings className="h-5 w-5" />
            </Link>
            <Logo
              src={settings.logo}
              boxClassName="hidden h-9 w-9 rounded-xl bg-primary-soft text-lg shadow-soft sm:flex"
              alt="Logo toko"
            />
            <span className="hidden text-sm font-semibold text-ink sm:block">
              {settings.name || 'Warung Madura'}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="px-6 py-4 text-center text-[11px] text-ink-soft max-md:hidden">
          Warung Madura · Catatan Stok &amp; Pesanan
        </footer>
      </div>

      {/* Navigasi bawah untuk mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)] pt-1.5">
          {MOBILE_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                cx(
                  'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold transition active:scale-95',
                  isActive ? 'text-primary' : 'text-ink-soft'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'flex h-8 w-8 items-center justify-center rounded-xl transition',
                      isActive ? 'bg-primary text-white shadow-soft' : 'bg-primary-soft/40'
                    )}
                  >
                    <n.icon className="h-[18px] w-[18px]" />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <ToastHost />
    </div>
  );
}