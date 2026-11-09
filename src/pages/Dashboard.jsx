import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  History,
  Inbox,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatQty, qtyText, rupiah } from '../utils/format';
import { Btn, EmptyState, StatusPill, TableWrap, TD, TH } from '../components/UI';
import ProductImage, { ProductFlags } from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import OrderDetailModal from '../components/OrderDetailModal';

const MENU_UTAMA = [
  {
    to: '/toko',
    label: 'Toko Pemasok',
    icon: Store,
    desc: 'Kelola toko pemasok & buat pesanan barang.',
    color: 'text-emerald-600 bg-emerald-50 hover:border-emerald-200',
  },
  {
    to: '/pesanan',
    label: 'Pesanan',
    icon: ClipboardList,
    desc: 'Proses penerimaan & selesaikan pesanan barang.',
    color: 'text-violet-600 bg-violet-50 hover:border-violet-200',
  },
  {
    to: '/stok',
    label: 'Stok Barang',
    icon: Boxes,
    desc: 'Pantau, sesuaikan jumlah, & tambah stok warung.',
    color: 'text-primary bg-primary-soft hover:border-primary/40',
  },
  {
    to: '/laporan',
    label: 'Laporan',
    icon: BarChart3,
    desc: 'Ringkasan mutasi stok, barang kosong, & log pesanan.',
    color: 'text-sky-600 bg-sky-50 hover:border-sky-200',
  },
];

// Helper untuk data grafik perubahan stok
function useStockChartData(movements, period) {
  return useMemo(() => {
    const now = new Date();
    const buckets = [];

    if (period === 'harian') {
      // 7 hari terakhir
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${day}`;
        const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        const label = `${dayNames[d.getDay()]} ${day}/${m}`;
        buckets.push({ key, label, masuk: 0, keluar: 0 });
      }

      for (const m of movements || []) {
        if (!m.timestamp) continue;
        const key = m.timestamp.slice(0, 10);
        const b = buckets.find((x) => x.key === key);
        if (b) {
          const diff = Number(m.diffBase) || 0;
          if (diff > 0) b.masuk += diff;
          else if (diff < 0) b.keluar += Math.abs(diff);
        }
      }
    } else if (period === 'mingguan') {
      // 4 minggu terakhir
      for (let i = 3; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(start.getDate() - (i * 7 + 6));
        const end = new Date(now);
        end.setDate(end.getDate() - (i * 7));
        const sDay = String(start.getDate()).padStart(2, '0');
        const sMo = String(start.getMonth() + 1).padStart(2, '0');
        const eDay = String(end.getDate()).padStart(2, '0');
        const eMo = String(end.getMonth() + 1).padStart(2, '0');
        const label = i === 0 ? 'Mgg Ini' : `Mgg -${i}`;
        const sub = `${sDay}/${sMo} - ${eDay}/${eMo}`;
        buckets.push({
          startTime: start.getTime(),
          endTime: end.getTime() + 86400000,
          label,
          sub,
          masuk: 0,
          keluar: 0,
        });
      }

      for (const m of movements || []) {
        if (!m.timestamp) continue;
        const time = new Date(m.timestamp).getTime();
        const b = buckets.find((x) => time >= x.startTime && time < x.endTime);
        if (b) {
          const diff = Number(m.diffBase) || 0;
          if (diff > 0) b.masuk += diff;
          else if (diff < 0) b.keluar += Math.abs(diff);
        }
      }
    } else {
      // Bulanan: 6 bulan terakhir
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'Mei',
        'Jun',
        'Jul',
        'Agu',
        'Sep',
        'Okt',
        'Nov',
        'Des',
      ];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const key = `${y}-${m}`;
        const label = `${monthNames[d.getMonth()]} ${String(y).slice(2)}`;
        buckets.push({ key, label, masuk: 0, keluar: 0 });
      }

      for (const m of movements || []) {
        if (!m.timestamp) continue;
        const key = m.timestamp.slice(0, 7);
        const b = buckets.find((x) => x.key === key);
        if (b) {
          const diff = Number(m.diffBase) || 0;
          if (diff > 0) b.masuk += diff;
          else if (diff < 0) b.keluar += Math.abs(diff);
        }
      }
    }

    const totalMasuk = buckets.reduce((s, b) => s + b.masuk, 0);
    const totalKeluar = buckets.reduce((s, b) => s + b.keluar, 0);
    const maxVal = Math.max(1, ...buckets.map((b) => Math.max(b.masuk, b.keluar)));

    return { buckets, totalMasuk, totalKeluar, maxVal };
  }, [movements, period]);
}

export default function Dashboard() {
  const {
    products,
    stocks,
    stockRows,
    orders,
    movements,
    needsRestock,
    activities,
    stores,
    storeById,
    settings,
  } = useApp();

  const navigate = useNavigate();

  // Modal detail barang & pesanan
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);

  // Filter periode grafik perubahan stok
  const [chartPeriod, setChartPeriod] = useState('harian'); // 'harian' | 'mingguan' | 'bulanan'
  const chartData = useStockChartData(movements, chartPeriod);

  // 1. Metrik Ringkasan Inventaris Barang
  const totalJenis = products.length;
  const totalStokFisik = useMemo(() => {
    return stocks.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
  }, [stocks]);

  const totalHampirHabis = useMemo(() => {
    return products.filter((p) => {
      const s = stocks.find((x) => x.productId === p.id);
      const qty = s ? Number(s.quantity) || 0 : 0;
      const min = p.minStock != null ? Number(p.minStock) : 0;
      return min > 0 && qty > 0 && qty < min;
    }).length;
  }, [products, stocks]);

  const totalStokKosong = useMemo(() => {
    return products.filter((p) => {
      const s = stocks.find((x) => x.productId === p.id);
      const qty = s ? Number(s.quantity) || 0 : 0;
      return qty <= 0;
    }).length;
  }, [products, stocks]);

  // 2. Metrik Ringkasan Pesanan
  const pesananBelumSelesai = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'belum_diterima' ||
          o.status === 'active' ||
          o.status === 'pending' ||
          o.status === 'menunggu'
      ),
    [orders]
  );
  const pesananSedangDiproses = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.status === 'sebagian' ||
          o.status === 'proses' ||
          o.status === 'diproses' ||
          o.status === 'kirim'
      ),
    [orders]
  );
  const pesananSudahDiterima = useMemo(
    () => orders.filter((o) => o.status === 'selesai' || o.status === 'diterima' || !!o.receipt),
    [orders]
  );
  const pesananDibatalkan = useMemo(
    () => orders.filter((o) => o.status === 'batal' || o.status === 'dibatalkan'),
    [orders]
  );

  // Daftar pesanan terbaru
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 6);
  }, [orders]);

  // 6. Informasi Barang Istimewa (unggulan, promo, catatan penting)
  const highlights = useMemo(() => {
    return products
      .map((p) => {
        const s = stocks.find((x) => x.productId === p.id);
        const hasSpecial = p.featured || p.promo || p.advertisement || (s && s.note);
        return hasSpecial ? { product: p, stock: s } : null;
      })
      .filter(Boolean)
      .slice(0, 6);
  }, [products, stocks]);

  // Ikon aktivitas berdasarkan tipe
  const getActivityIcon = (type) => {
    switch (type) {
      case 'product_add':
        return <Plus className="h-4 w-4 text-emerald-600" />;
      case 'product_edit':
        return <Pencil className="h-4 w-4 text-primary" />;
      case 'stock_in':
        return <PackagePlus className="h-4 w-4 text-emerald-600" />;
      case 'stock_out':
        return <PackageMinus className="h-4 w-4 text-rose-600" />;
      case 'stock_adjust':
        return <SlidersHorizontal className="h-4 w-4 text-amber-600" />;
      case 'order_created':
        return <ShoppingCart className="h-4 w-4 text-violet-600" />;
      case 'order_done':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      default:
        return <History className="h-4 w-4 text-ink-soft" />;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ============================================================ */}
      {/* 1. RINGKASAN INVENTARIS BARANG */}
      {/* ============================================================ */}
      <section data-testid="ringkasan-inventaris-barang" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Dashboard Pencatatan</h1>
            <p className="text-xs text-ink-soft">
              Pusat informasi dan pemantauan kondisi stok serta pesanan {settings?.name || 'Warung Madura'}.
            </p>
          </div>
          <Link
            to="/stok"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-primary shadow-soft transition hover:border-primary/40"
          >
            <Boxes className="h-4 w-4" /> Buka Halaman Stok
          </Link>
        </div>

        {/* 4 Kartu Ringkasan Inventaris */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Total Jenis Barang */}
          <Link
            to="/stok"
            className="card group flex flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-1 hover:ring-primary/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Total Jenis
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary transition group-hover:scale-110">
                <Boxes className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-ink">{totalJenis}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Jenis barang tercatat</p>
            </div>
          </Link>

          {/* Total Jumlah Seluruh Stok */}
          <Link
            to="/stok"
            className="card group flex flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-1 hover:ring-sky-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                Total Seluruh Stok
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition group-hover:scale-110">
                <Package className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-sky-700">{formatQty(totalStokFisik)}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Dalam satuan dasar fisik</p>
            </div>
          </Link>

          {/* Jumlah Barang Hampir Habis */}
          <Link
            to="/stok"
            className="card group flex flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-1 hover:ring-amber-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                Hampir Habis
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 transition group-hover:scale-110">
                <TrendingDown className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-amber-700">{totalHampirHabis}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Di bawah batas minimum</p>
            </div>
          </Link>

          {/* Jumlah Barang Stok Kosong */}
          <Link
            to="/stok"
            className="card group flex flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-1 hover:ring-rose-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                Stok Kosong
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 transition group-hover:scale-110">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-black text-rose-700">{totalStokKosong}</p>
              <p className="mt-0.5 text-xs text-ink-soft">Jumlah stok 0 atau habis</p>
            </div>
          </Link>
        </div>

        {/* Informasi Ringkas Toko Pemasok & Barang Master */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/toko"
            className="group flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 shadow-soft transition hover:border-primary/40 hover:bg-primary-soft/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Store className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-ink">Toko Pemasok</p>
                <p className="text-[11px] text-ink-soft">{stores.length} toko terdaftar</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
              Kelola <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            to="/barang"
            className="group flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 shadow-soft transition hover:border-primary/40 hover:bg-primary-soft/10"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink/5 text-ink">
                <Package className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-ink">Barang Master</p>
                <p className="text-[11px] text-ink-soft">{products.length} master barang & satuan</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
              Kelola <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. MENU UTAMA */}
      {/* ============================================================ */}
      <section data-testid="menu-utama" className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <Sparkles className="h-4 w-4 text-primary" />
            Menu Utama
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Akses cepat ke empat modul utama pencatatan warung Anda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3.5 p-4 sm:p-5 lg:grid-cols-4">
          {MENU_UTAMA.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group flex flex-col justify-between rounded-2xl border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card hover:ring-1 hover:ring-primary/40"
            >
              <div>
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition group-hover:scale-105 ${m.color}`}
                >
                  <m.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-sm font-extrabold text-ink">{m.label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">{m.desc}</p>
              </div>
              <div className="mt-4 flex items-center gap-1 text-xs font-bold text-primary">
                <span>Buka</span>
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. RINGKASAN PESANAN */}
      {/* ============================================================ */}
      <section data-testid="ringkasan-pesanan" className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <ClipboardList className="h-4 w-4 text-primary" />
                Ringkasan Pesanan Toko Pemasok
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Pantau status pemesanan barang kepada pemasok warung.
              </p>
            </div>
            <Link
              to="/pesanan"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Lihat Semua Pesanan <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* 4 Status Counter Pesanan */}
        <div className="grid grid-cols-2 gap-3 border-b border-line bg-surface/50 p-4 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-white p-3 text-center">
            <span className="text-[11px] font-bold text-amber-700">Belum Selesai</span>
            <p className="mt-1 text-xl font-black text-amber-700">{pesananBelumSelesai.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 text-center">
            <span className="text-[11px] font-bold text-sky-700">Sedang Diproses</span>
            <p className="mt-1 text-xl font-black text-sky-700">{pesananSedangDiproses.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 text-center">
            <span className="text-[11px] font-bold text-emerald-700">Sudah Diterima</span>
            <p className="mt-1 text-xl font-black text-emerald-700">{pesananSudahDiterima.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 text-center">
            <span className="text-[11px] font-bold text-rose-700">Dibatalkan</span>
            <p className="mt-1 text-xl font-black text-rose-700">{pesananDibatalkan.length}</p>
          </div>
        </div>

        {/* Tabel Pesanan Terbaru */}
        {recentOrders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Inbox}
              title="Belum ada pesanan dicatat"
              description="Buat pesanan barang baru melalui menu Toko Pemasok."
              action={
                <Link to="/toko">
                  <Btn size="sm" variant="soft" icon={Store}>
                    Buka Toko Pemasok
                  </Btn>
                </Link>
              }
            />
          </div>
        ) : (
          <TableWrap minWidth="min-w-[700px]">
            <thead className="border-b border-line bg-background/50">
              <tr>
                <TH className="w-32">No Pesanan</TH>
                <TH>Toko Pemasok</TH>
                <TH>Tanggal Pemesanan</TH>
                <TH>Jumlah Barang</TH>
                <TH>Status Pesanan</TH>
                <TH className="w-28 text-right">Aksi</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {recentOrders.map((o) => (
                <tr key={o.id} className="transition hover:bg-primary-soft/20">
                  <TD className="font-extrabold text-primary">{o.id}</TD>
                  <TD className="font-semibold text-ink">
                    {storeById(o.storeId)?.name || 'Pemasok Luar'}
                  </TD>
                  <TD className="text-xs text-ink-soft">{formatDateTime(o.createdAt)}</TD>
                  <TD className="text-xs font-bold text-ink">
                    {o.totalItems || o.items?.length || 0} barang
                  </TD>
                  <TD>
                    <StatusPill status={o.status} />
                  </TD>
                  <TD className="text-right">
                    <Btn
                      size="sm"
                      variant="outline"
                      icon={Eye}
                      onClick={() => setDetailOrder(o)}
                    >
                      Detail
                    </Btn>
                  </TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      {/* ============================================================ */}
      {/* 4. PENGINGAT STOK BARANG */}
      {/* ============================================================ */}
      <section data-testid="pengingat-stok-barang" className="card overflow-hidden">
        <div className="border-b border-line bg-amber-50/70 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Pengingat Stok Barang ({needsRestock.length})
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Daftar barang yang stoknya sudah kosong atau menipis di bawah batas stok minimum.
              </p>
            </div>
            <Link
              to="/stok"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:underline"
            >
              Lihat di Halaman Stok <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {needsRestock.length === 0 ? (
          <div className="p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-bold text-ink">Semua Stok Barang Aman</p>
            <p className="mt-1 text-xs text-ink-soft">
              Tidak ada barang yang kosong atau di bawah batas stok minimum saat ini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {needsRestock.slice(0, 8).map(({ product, qty, min, status }) => {
              const base =
                (product.units || []).find((u) => Number(u.factor) === 1) ||
                (product.units || [])[0];
              const baseName = base?.name || 'pcs';

              return (
                <div
                  key={product.id}
                  className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <ProductImage
                      product={product}
                      size="sm"
                      showBadges={false}
                      onClick={() => setDetailProduct(product)}
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => setDetailProduct(product)}
                        className="text-left text-sm font-bold text-ink hover:text-primary leading-snug"
                      >
                        {product.name}
                      </button>
                      <p className="text-xs text-ink-soft">
                        {product.category || 'Tanpa kategori'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-ink">
                        Stok Saat Ini:{' '}
                        <b
                          className={
                            qty <= 0 ? 'text-rose-600 font-extrabold' : 'text-amber-700 font-bold'
                          }
                        >
                          {formatQty(qty)} {baseName}
                        </b>
                      </p>
                      <p className="text-[11px] text-ink-soft">
                        Batas Minimum:{' '}
                        {min > 0 ? `${formatQty(min)} ${baseName}` : 'Belum diatur'}
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        status === 'habis'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {status === 'habis' ? 'Stok Kosong' : 'Hampir Habis'}
                    </span>

                    <Btn
                      size="sm"
                      variant="soft"
                      icon={SlidersHorizontal}
                      onClick={() =>
                        navigate('/stok', { state: { openAdjustFor: product.id } })
                      }
                    >
                      Sesuaikan
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* 5. GRAFIK PERUBAHAN STOK */}
      {/* ============================================================ */}
      <section data-testid="grafik-perubahan-stok" className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <BarChart3 className="h-4 w-4 text-primary" />
                Grafik Perubahan Stok
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Perbandingan kuantitas barang masuk & keluar berdasarkan riwayat mutasi fisik (bukan
                penjualan).
              </p>
            </div>

            {/* Pilihan Periode: Harian, Mingguan, Bulanan */}
            <div className="flex rounded-xl border border-line bg-white p-1 text-xs">
              <button
                type="button"
                onClick={() => setChartPeriod('harian')}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  chartPeriod === 'harian'
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={() => setChartPeriod('mingguan')}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  chartPeriod === 'mingguan'
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Mingguan
              </button>
              <button
                type="button"
                onClick={() => setChartPeriod('bulanan')}
                className={`rounded-lg px-3 py-1 font-bold transition ${
                  chartPeriod === 'bulanan'
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Bulanan
              </button>
            </div>
          </div>
        </div>

        {/* Ringkasan Angka Periode */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface/40 px-5 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 font-bold text-emerald-700">
              <span className="h-3 w-3 rounded-md bg-emerald-500" />
              Barang Masuk: +{formatQty(chartData.totalMasuk)}
            </span>
            <span className="flex items-center gap-1.5 font-bold text-rose-600">
              <span className="h-3 w-3 rounded-md bg-rose-500" />
              Barang Keluar: -{formatQty(chartData.totalKeluar)}
            </span>
          </div>
          <span className="text-ink-soft">
            Selisih Bersih:{' '}
            <b
              className={
                chartData.totalMasuk >= chartData.totalKeluar
                  ? 'text-emerald-700 font-bold'
                  : 'text-rose-600 font-bold'
              }
            >
              {chartData.totalMasuk >= chartData.totalKeluar ? '+' : ''}
              {formatQty(chartData.totalMasuk - chartData.totalKeluar)}
            </b>{' '}
            (satuan dasar)
          </span>
        </div>

        {/* Visualisasi Grafik Batang */}
        <div className="p-5">
          {chartData.buckets.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-soft">Belum ada riwayat mutasi.</p>
          ) : (
            <div className="flex h-52 items-end justify-between gap-2 sm:gap-4 pt-6 pb-2">
              {chartData.buckets.map((b, idx) => {
                const masukHeight =
                  chartData.maxVal > 0
                    ? Math.max(b.masuk > 0 ? 8 : 0, Math.round((b.masuk / chartData.maxVal) * 100))
                    : 0;
                const keluarHeight =
                  chartData.maxVal > 0
                    ? Math.max(
                        b.keluar > 0 ? 8 : 0,
                        Math.round((b.keluar / chartData.maxVal) * 100)
                      )
                    : 0;

                return (
                  <div
                    key={idx}
                    className="group relative flex flex-1 flex-col items-center justify-end h-full"
                  >
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] font-bold text-white shadow-card group-hover:block">
                      Masuk: +{formatQty(b.masuk)} | Keluar: -{formatQty(b.keluar)}
                    </div>

                    {/* Dual Bars */}
                    <div className="flex items-end gap-1 w-full max-w-[36px] h-full justify-center">
                      {/* Bar Masuk */}
                      <div
                        style={{ height: `${masukHeight}%` }}
                        className="w-1/2 rounded-t-md bg-emerald-500 transition-all hover:bg-emerald-600"
                        title={`Masuk: +${formatQty(b.masuk)}`}
                      />
                      {/* Bar Keluar */}
                      <div
                        style={{ height: `${keluarHeight}%` }}
                        className="w-1/2 rounded-t-md bg-rose-400 transition-all hover:bg-rose-500"
                        title={`Keluar: -${formatQty(b.keluar)}`}
                      />
                    </div>

                    {/* Label Sumbu X */}
                    <div className="mt-2 text-center">
                      <p className="text-[10px] font-bold text-ink-soft">{b.label}</p>
                      {b.sub && <p className="text-[9px] text-ink-soft/70">{b.sub}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. AKTIVITAS TERBARU */}
      {/* ============================================================ */}
      <section data-testid="aktivitas-terbaru" className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <History className="h-4 w-4 text-primary" />
                Aktivitas Terbaru
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Log kegiatan pencatatan: barang baru, mutasi stok, pembaruan info, dan pesanan.
              </p>
            </div>
            <Link
              to="/stok"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Lihat Riwayat Stok <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {activities.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={History}
              title="Belum ada aktivitas tercatat"
              description="Aktivitas akan otomatis tercatat saat menambah barang, mengubah stok, atau membuat pesanan."
            />
          </div>
        ) : (
          <div className="divide-y divide-line">
            {activities.slice(0, 8).map((act) => (
              <div
                key={act.id}
                className="flex items-start gap-3.5 px-5 py-3 transition hover:bg-primary-soft/20"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface border border-line">
                  {getActivityIcon(act.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-bold text-ink">{act.title}</p>
                    <span className="text-[11px] text-ink-soft">
                      {formatDateTime(act.timestamp)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{act.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* 7. INFORMASI BARANG */}
      {/* ============================================================ */}
      <section data-testid="informasi-barang" className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <Tag className="h-4 w-4 text-primary" />
                Informasi Barang
              </h2>
              <p className="mt-0.5 text-xs text-ink-soft">
                Daftar barang dengan status unggulan, promo aktif, penawaran khusus, atau catatan
                penting ({highlights.length}).
              </p>
            </div>
            <Link
              to="/stok"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Lihat Semua di Stok <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {highlights.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Sparkles}
              title="Belum ada informasi barang khusus"
              description="Tandai barang sebagai Unggulan, Promo, atau berikan Catatan saat mengedit barang di halaman Stok."
            />
          </div>
        ) : (
          <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map(({ product: p, stock: s }) => {
              const base =
                (p.units || []).find((u) => Number(u.factor) === 1) || (p.units || [])[0];

              return (
                <div
                  key={p.id}
                  onClick={() => setDetailProduct(p)}
                  className="group flex cursor-pointer flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <ProductImage product={p} size="md" showBadges={false} />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink transition group-hover:text-primary leading-snug line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-ink-soft">{p.category || 'Tanpa kategori'}</p>

                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {p.featured && (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                            Unggulan
                          </span>
                        )}
                        {p.promo && (
                          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Promo
                          </span>
                        )}
                        {p.advertisement && (
                          <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                            Khusus
                          </span>
                        )}
                        {s?.note && !p.promo && !p.advertisement && (
                          <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">
                            Catatan
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Keterangan promo atau catatan */}
                  {(p.promoDescription || p.description || s?.note) && (
                    <div className="mt-3 rounded-lg bg-surface p-2 text-[11px] text-ink-soft line-clamp-2">
                      {p.promoDescription || p.description || s?.note}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2 text-xs">
                    <span className="font-extrabold text-primary">
                      {rupiah(base?.price || 0)}
                      <span className="text-[10px] font-normal text-ink-soft">
                        /{base?.name || 'pcs'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary group-hover:underline">
                      Detail <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Detail Barang & Detail Pesanan */}
      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAddStock={(p) => {
          setDetailProduct(null);
          navigate('/stok', { state: { openAdjustFor: p.id } });
        }}
      />
      <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />
    </div>
  );
}
