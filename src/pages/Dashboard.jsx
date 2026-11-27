import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Eye,
  HandCoins,
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
  Smartphone,
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
    to: '/kunjungan',
    label: 'Kunjungan',
    icon: CalendarClock,
    desc: 'Jadwal sales, pemasok, pengiriman, & agenda warung.',
    color: 'text-amber-600 bg-amber-50 hover:border-amber-200',
  },
  {
    to: '/catatan-digital',
    label: 'Catatan Digital',
    icon: Smartphone,
    desc: 'Layanan pulsa, paket data, token PLN, transfer, & e-wallet.',
    color: 'text-blue-600 bg-blue-50 hover:border-blue-200',
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
    visits = [],
    todayVisits = [],
    overdueVisits = [],
    upcomingVisits = [],
    digitalTransactions = [],
    todayDigitalTransactions = [],
    todayDigitalSummary = { totalProfit: 0 },
    pendingDigitalTransactions = [],
    debts = [],
    debtsSummary = { remainingPiutang: 0, remainingHutang: 0, overdueCount: 0, activeRecordsCount: 0 },
    overdueDebts = [],
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

  const isBackupOverdue = useMemo(() => {
    if (!settings.lastBackupAt) return true;
    const lastDate = new Date(settings.lastBackupAt);
    if (isNaN(lastDate.getTime())) return true;
    const now = new Date();
    const diffMs = now.getTime() - lastDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 7;
  }, [settings.lastBackupAt]);

  return (
    <div className="space-y-6 pb-12">
      {/* Pengingat Cadangan Data Berkala (> 7 Hari atau Belum Pernah Cadangkan) */}
      {isBackupOverdue && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 sm:px-4 text-xs shadow-soft transition">
          <div className="flex items-center gap-2.5 text-amber-950">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-200/70 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold">
                Pengingat Cadangan Data Warung
              </p>
              <p className="text-[11px] text-amber-900/80">
                {settings.lastBackupAt
                  ? `Cadangan terakhir dilakukan lebih dari 7 hari lalu. Disarankan mengunduh cadangan terbaru untuk keamanan data.`
                  : `Data warung belum pernah dicadangkan ke berkas. Disarankan mengunduh cadangan untuk mencegah kehilangan data.`}
              </p>
            </div>
          </div>
          <Link
            to="/pengaturan"
            className="inline-flex items-center gap-1 rounded-xl bg-amber-200/80 px-3 py-1.5 font-bold text-amber-950 hover:bg-amber-300/80 transition text-xs"
          >
            Buka Pengaturan Cadangan <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Pengingat Agenda Kunjungan Hari Ini & Terlambat */}
      {(todayVisits.length > 0 || overdueVisits.length > 0) && (
        <div data-testid="dashboard-visit-reminder" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/85 p-3.5 sm:px-4 text-xs shadow-soft transition">
          <div className="flex items-center gap-2.5 text-violet-950">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-200/80 text-violet-800">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold">
                Agenda Kunjungan ({todayVisits.length} Hari Ini{overdueVisits.length > 0 ? ` · ${overdueVisits.length} Terlambat` : ''})
              </p>
              <p className="text-[11px] text-violet-900/80">
                {todayVisits.length > 0
                  ? `Agenda aktif hari ini: ${todayVisits.map((v) => v.name).slice(0, 2).join(', ')}${todayVisits.length > 2 ? '...' : ''}.`
                  : `Terdapat ${overdueVisits.length} jadwal kunjungan yang melewati tanggal dan perlu ditindaklanjuti.`}
              </p>
            </div>
          </div>
          <Link
            to="/kunjungan"
            className="inline-flex items-center gap-1 rounded-xl bg-violet-200/90 px-3 py-1.5 font-bold text-violet-950 hover:bg-violet-300 transition text-xs shadow-xs"
          >
            Buka Kunjungan <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Pengingat Transaksi Digital Pending */}
      {pendingDigitalTransactions.length > 0 && (
        <div data-testid="dashboard-digital-pending" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/85 p-3.5 sm:px-4 text-xs shadow-soft transition">
          <div className="flex items-center gap-2.5 text-blue-950">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-200/80 text-blue-800">
              <Smartphone className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold">
                Transaksi Digital Menunggu ({pendingDigitalTransactions.length} Pending)
              </p>
              <p className="text-[11px] text-blue-900/80">
                Terdapat {pendingDigitalTransactions.length} transaksi pulsa/transfer/tagihan yang menunggu konfirmasi penyelesaian.
              </p>
            </div>
          </div>
          <Link
            to="/catatan-digital"
            className="inline-flex items-center gap-1 rounded-xl bg-blue-200/90 px-3 py-1.5 font-bold text-blue-950 hover:bg-blue-300 transition text-xs shadow-xs"
          >
            Buka Catatan Digital <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Pengingat Hutang-Piutang Jatuh Tempo */}
      {overdueDebts.length > 0 && (
        <div data-testid="dashboard-debt-overdue" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50/85 p-3.5 sm:px-4 text-xs shadow-soft transition">
          <div className="flex items-center gap-2.5 text-rose-950">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-200/80 text-rose-800">
              <HandCoins className="h-4 w-4" />
            </span>
            <div>
              <p className="font-bold">
                Hutang-Piutang Jatuh Tempo ({overdueDebts.length} Catatan)
              </p>
              <p className="text-[11px] text-rose-900/80">
                Terdapat {overdueDebts.length} catatan hutang/piutang yang melewati batas waktu tempo dan perlu ditindaklanjuti.
              </p>
            </div>
          </div>
          <Link
            to="/hutang-piutang"
            className="inline-flex items-center gap-1 rounded-xl bg-rose-200/90 px-3 py-1.5 font-bold text-rose-950 hover:bg-rose-300 transition text-xs shadow-xs"
          >
            Buka Hutang-Piutang <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. BAGIAN ATAS: TEPAT 2 KARTU UTAMA */}
      {/* ============================================================ */}
      <section data-testid="dashboard-top-cards" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-ink sm:text-2xl">Dashboard Pencatatan</h1>
            <p className="text-xs text-ink-soft">
              Pusat informasi dan pemantauan kondisi operasional {settings?.name || 'Warung Madura'}.
            </p>
          </div>
        </div>

        {/* Tepat 2 Kartu Utama di Bagian Atas */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Kartu 1: Informasi Tentang Toko */}
          <div
            data-testid="card-tentang-toko"
            className="card flex flex-col justify-between p-5 border border-line shadow-soft bg-white"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {settings?.logo ? (
                    <img
                      src={settings.logo}
                      alt={settings.name || 'Logo Toko'}
                      className="h-12 w-12 rounded-2xl object-cover border border-line shadow-xs"
                    />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-xs">
                      <Store className="h-6 w-6" />
                    </span>
                  )}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      Informasi Tentang Toko
                    </span>
                    <h2 className="text-lg font-black text-ink">
                      {settings?.name || 'Catatan Warung Madura'}
                    </h2>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                  Aktif
                </span>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-ink-soft">
                <p className="leading-relaxed text-ink/80 break-words">
                  {settings?.description || 'Pencatatan inventaris, stok barang, toko pemasok, dan pesanan operasional warung.'}
                </p>
                {settings?.address && (
                  <p className="text-[11px] text-ink-soft break-words">
                    <span className="font-semibold text-ink">Alamat:</span> {settings.address}
                  </p>
                )}
                {settings?.phone && (
                  <p className="text-[11px] text-ink-soft">
                    <span className="font-semibold text-ink">Kontak:</span> {settings.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-line/60 flex items-center justify-between">
              <span className="text-[11px] text-ink-soft">Identitas toko & tema warna</span>
              <Link
                to="/pengaturan"
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-soft transition hover:bg-primary-dark"
              >
                Lihat Pengaturan <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Kartu 2: Ringkasan Operasional Utama */}
          <div
            data-testid="card-ringkasan-operasional"
            className="card flex flex-col justify-between p-5 border border-line shadow-soft bg-white"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Boxes className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                      Ringkasan Operasional Utama
                    </span>
                    <h2 className="text-base font-black text-ink">Kondisi Stok & Pesanan</h2>
                  </div>
                </div>
                <Link
                  to="/stok"
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  Buka Stok <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Link
                  to="/barang"
                  className="rounded-xl border border-line/70 bg-bg/50 p-2.5 transition hover:border-primary/40 hover:bg-white"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Jenis Produk</p>
                  <p className="mt-1 text-xl font-black text-ink">{totalJenis}</p>
                  <p className="text-[10px] text-ink-soft">Item tercatat</p>
                </Link>

                <Link
                  to="/stok"
                  className="rounded-xl border border-line/70 bg-bg/50 p-2.5 transition hover:border-sky-400 hover:bg-white"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">Total Fisik</p>
                  <p className="mt-1 text-xl font-black text-sky-700">{formatQty(totalStokFisik)}</p>
                  <p className="text-[10px] text-ink-soft">Unit dasar</p>
                </Link>

                <Link
                  to="/stok"
                  className="rounded-xl border border-line/70 bg-bg/50 p-2.5 transition hover:border-amber-400 hover:bg-white"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Kritis</p>
                  <p className="mt-1 text-xl font-black text-amber-700">
                    {totalHampirHabis + totalStokKosong}
                  </p>
                  <p className="text-[10px] text-ink-soft">{totalHampirHabis} tipis · {totalStokKosong} habis</p>
                </Link>

                <Link
                  to="/pesanan"
                  className="rounded-xl border border-line/70 bg-bg/50 p-2.5 transition hover:border-violet-400 hover:bg-white"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Pesanan Aktif</p>
                  <p className="mt-1 text-xl font-black text-violet-700">
                    {pesananBelumSelesai.length + pesananSedangDiproses.length}
                  </p>
                  <p className="text-[10px] text-ink-soft">Perlu diproses</p>
                </Link>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[11px] text-ink-soft">
                {stores.length} Toko · {orders.length} Pesanan · {visits.length} Kunjungan · {digitalTransactions.length} Digital
              </span>
              <div className="flex items-center gap-3">
                <Link
                  to="/kunjungan"
                  className="text-xs font-bold text-amber-600 hover:underline"
                >
                  Kunjungan ({todayVisits.length})
                </Link>
                <Link
                  to="/catatan-digital"
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Digital ({todayDigitalTransactions.length} · {rupiah(todayDigitalSummary.totalProfit)})
                </Link>
                <Link
                  to="/pesanan"
                  className="text-xs font-bold text-violet-600 hover:underline"
                >
                  Kelola Pesanan
                </Link>
              </div>
            </div>
          </div>
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
            Akses cepat ke modul-modul operasional pencatatan warung Anda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3.5 p-4 sm:p-5 sm:grid-cols-3 lg:grid-cols-6">
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
                      <p className="font-bold text-ink transition group-hover:text-primary leading-snug break-words">
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
                    <div className="mt-3 rounded-lg bg-surface p-2 text-[11px] text-ink-soft break-words leading-relaxed">
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
