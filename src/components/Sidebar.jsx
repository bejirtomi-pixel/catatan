import { NavLink } from 'react-router-dom';
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, Package, Settings, Store, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Logo from './Logo';
import { cx } from './UI';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/barang', label: 'Barang', icon: Package },
  { to: '/toko', label: 'Toko', icon: Store },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
  { to: '/stok', label: 'Stok', icon: Boxes },
  { to: '/laporan', label: 'Laporan', icon: BarChart3 },
  { to: '/pengaturan', label: 'Pengaturan', icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  const { settings, activeOrders } = useApp();
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0'
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Logo
            src={settings.logo}
            boxClassName="h-11 w-11 rounded-2xl bg-primary-soft text-xl shadow-soft"
            alt={settings.name || 'Logo warung'}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-ink">{settings.name || 'Warung Madura'}</p>
            <p className="truncate text-[11px] font-medium text-ink-soft">
              {settings.description || 'Catatan Stok & Pesanan'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-ink-soft hover:bg-line md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                  isActive
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:bg-primary-soft hover:text-ink'
                )
              }
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.to === '/pesanan' && activeOrders.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                  {activeOrders.length}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 rounded-xl bg-primary-soft px-3 py-2.5">
            <Logo
              src={settings.logo}
              boxClassName="h-9 w-9 rounded-xl bg-surface text-lg shadow-soft"
              alt="Logo toko"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink">{settings.name || 'Warung Madura'}</p>
              <p className="truncate text-[11px] text-ink-soft">{settings.description || 'Catatan Stok & Pesanan'}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}