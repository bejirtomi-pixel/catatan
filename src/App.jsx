import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Barang from './pages/Barang';
import Toko from './pages/Toko';
import Pesanan from './pages/Pesanan';
import Stok from './pages/Stok';
import Laporan from './pages/Laporan';
import Pengaturan from './pages/Pengaturan';

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
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}