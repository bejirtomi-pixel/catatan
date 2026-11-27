import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Store } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Barang from './pages/Barang';
import Toko from './pages/Toko';
import Pesanan from './pages/Pesanan';
import Stok from './pages/Stok';
import Laporan from './pages/Laporan';
import Kunjungan from './pages/Kunjungan';
import CatatanDigital from './pages/CatatanDigital';
import HutangPiutang from './pages/HutangPiutang';
import Pengaturan from './pages/Pengaturan';
import Login from './pages/Login';

function AuthGate({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-ink">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-white shadow-soft">
            <Store className="h-8 w-8 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-ink">Catatan Warung Madura</h1>
            <p className="mt-0.5 text-xs text-ink-soft">Memeriksa status sesi pemilik...</p>
          </div>
          <div className="h-1.5 w-36 overflow-hidden rounded-full bg-neutral-200">
            <div className="h-full w-2/3 animate-[pulse_1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return children;
}

function Shell() {
  const { settings } = useApp();
  const theme = settings.theme || 'soft-pink';
  return (
    <div className={`theme-${theme} min-h-screen bg-background font-sans text-ink`}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/barang" element={<Barang />} />
            <Route path="/toko" element={<Toko />} />
            <Route path="/pesanan" element={<Pesanan />} />
            <Route path="/stok" element={<Stok />} />
            <Route path="/hutang-piutang" element={<HutangPiutang />} />
            <Route path="/kunjungan" element={<Kunjungan />} />
            <Route path="/catatan-digital" element={<CatatanDigital />} />
            <Route path="/laporan" element={<Laporan />} />
            <Route path="/pengaturan" element={<Pengaturan />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <Shell />
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  );
}
