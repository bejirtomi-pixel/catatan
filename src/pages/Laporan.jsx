import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FilterX,
  History,
  PackageCheck,
  PackageX,
  Printer,
  ReceiptText,
  RefreshCw,
  SearchX,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { dateKey, formatDateTime, formatQty, rupiah, round2 } from '../utils/format';
import {
  Btn,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusPill,
  TD,
  TH,
  TableWrap,
  Textarea,
} from '../components/UI';
import OrderDetailModal from '../components/OrderDetailModal';

const PAGE_SIZE = 8;

export default function Laporan() {
  const {
    orders,
    shortages,
    recordRepurchase,
    receiveRepurchase,
    pushToast,
    storeById,
    needsRestock,
  } = useApp();

  // Tab aktif: 'pesanan' | 'kekurangan' | 'pembelian_ulang' | 'restock'
  const [activeTab, setActiveTab] = useState('pesanan');

  // Filter pencarian dan tanggal
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('semua');
  const [shortageStatusFilter, setShortageStatusFilter] = useState('semua');

  // Pagination per tab
  const [pagePesanan, setPagePesanan] = useState(1);
  const [pageKekurangan, setPageKekurangan] = useState(1);
  const [pagePembelian, setPagePembelian] = useState(1);
  const [pageRestock, setPageRestock] = useState(1);

  // Modal states
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [repurchaseTarget, setRepurchaseTarget] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [detailShortage, setDetailShortage] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  // 1. Ringkasan Laporan (4 Metrik Data Asli)
  const summaryMetrics = useMemo(() => {
    let pesananSelesai = 0;
    let pesananSebagian = 0;
    for (const o of orders) {
      if (o.status === 'selesai' || o.status === 'diterima') pesananSelesai += 1;
      else if (o.status === 'sebagian' || o.status === 'proses' || o.status === 'diproses') pesananSebagian += 1;
    }

    let belumTerpenuhi = 0;
    let sudahDibeli = 0;
    for (const s of shortages) {
      if (s.status === 'belum' || s.quantity > 0) belumTerpenuhi += 1;
      if (s.status === 'sudah' || s.status === 'terpenuhi' || (s.repurchases && s.repurchases.length > 0)) {
        sudahDibeli += 1;
      }
    }

    return { pesananSelesai, pesananSebagian, belumTerpenuhi, sudahDibeli };
  }, [orders, shortages]);

  // Ekstrak seluruh riwayat pembelian ulang dari seluruh kekurangan barang
  const allRepurchases = useMemo(() => {
    const list = [];
    for (const s of shortages) {
      for (const r of s.repurchases || []) {
        list.push({ ...r, shortage: s });
      }
    }
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [shortages]);

  // 2. Filter Riwayat Pesanan
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      // Filter status pesanan
      if (orderStatusFilter !== 'semua') {
        if (orderStatusFilter === 'sebagian') {
          if (o.status !== 'sebagian' && o.status !== 'proses' && o.status !== 'diproses') return false;
        } else if (orderStatusFilter === 'selesai') {
          if (o.status !== 'selesai' && o.status !== 'diterima') return false;
        } else if (orderStatusFilter === 'batal') {
          if (o.status !== 'batal' && o.status !== 'dibatalkan') return false;
        } else if (orderStatusFilter === 'belum_diterima') {
          if (o.status !== 'belum_diterima' && o.status !== 'active') return false;
        }
      }

      // Filter rentang tanggal
      const oDate = dateKey(o.createdAt);
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;

      // Filter kata kunci
      if (!q) return true;
      const storeName = (storeById(o.storeId)?.name || '').toLowerCase();
      const itemNames = (o.items || []).map((i) => (i.productNameSnapshot || '').toLowerCase()).join(' ');
      return o.id.toLowerCase().includes(q) || storeName.includes(q) || itemNames.includes(q);
    });
  }, [orders, search, startDate, endDate, orderStatusFilter, storeById]);

  // 3. Filter Barang Belum Terpenuhi
  const filteredShortages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shortages.filter((s) => {
      // Filter status kekurangan
      if (shortageStatusFilter !== 'semua') {
        if (shortageStatusFilter === 'belum' && s.status !== 'belum') return false;
        if (shortageStatusFilter === 'sudah' && s.status !== 'sudah') return false;
        if (shortageStatusFilter === 'terpenuhi' && s.status !== 'terpenuhi') return false;
      }

      // Filter rentang tanggal
      const sDate = dateKey(s.createdAt);
      if (startDate && sDate < startDate) return false;
      if (endDate && sDate > endDate) return false;

      // Filter kata kunci
      if (!q) return true;
      const pName = (s.productNameSnapshot || '').toLowerCase();
      const sName = (s.storeNameSnapshot || '').toLowerCase();
      const oId = (s.orderId || '').toLowerCase();
      return pName.includes(q) || sName.includes(q) || oId.includes(q);
    });
  }, [shortages, search, startDate, endDate, shortageStatusFilter]);

  // 6. Filter Riwayat Pembelian Ulang
  const filteredRepurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRepurchases.filter((r) => {
      const rDate = dateKey(r.date || r.createdAt);
      if (startDate && rDate < startDate) return false;
      if (endDate && rDate > endDate) return false;

      if (!q) return true;
      const pName = (r.productName || r.shortage?.productNameSnapshot || '').toLowerCase();
      const oId = (r.orderId || r.shortage?.orderId || '').toLowerCase();
      const note = (r.note || '').toLowerCase();
      return pName.includes(q) || oId.includes(q) || note.includes(q);
    });
  }, [allRepurchases, search, startDate, endDate]);

  const hasFilter = search || startDate || endDate || orderStatusFilter !== 'semua' || shortageStatusFilter !== 'semua';

  const resetFilter = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setOrderStatusFilter('semua');
    setShortageStatusFilter('semua');
    setPagePesanan(1);
    setPageKekurangan(1);
    setPagePembelian(1);
    setPageRestock(1);
  };

  // Helper Pagination
  const paginate = (items, pageNum) => {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(pageNum, totalPages);
    const rows = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return { totalPages, safePage, rows };
  };

  const paginatedPesanan = paginate(filteredOrders, pagePesanan);
  const paginatedShortages = paginate(filteredShortages, pageKekurangan);
  const paginatedRepurchases = paginate(filteredRepurchases, pagePembelian);
  const paginatedRestock = paginate(needsRestock, pageRestock);

  // 9. Ekspor Excel (CSV UTF-8)
  const handleExportCsv = (type) => {
    let filename = `Laporan-${type}-${new Date().toISOString().split('T')[0]}.csv`;
    let rows = [];

    if (type === 'pesanan') {
      rows.push(['No Pesanan', 'Waktu Pemesanan', 'Toko Pemasok', 'Jumlah Jenis', 'Total Dipesan', 'Total Diterima', 'Total Biaya (Rp)', 'Status']);
      for (const o of filteredOrders) {
        const ordQty = (o.items || []).reduce((a, b) => a + (Number(b.quantity) || 0), 0);
        const recQty = (o.items || []).reduce((a, b) => a + (Number(b.receivedQuantity) || 0), 0);
        rows.push([
          o.id,
          formatDateTime(o.createdAt),
          storeById(o.storeId)?.name || '—',
          o.items?.length || 0,
          ordQty,
          recQty,
          o.totalPrice,
          o.status,
        ]);
      }
    } else if (type === 'kekurangan') {
      rows.push(['Tanggal Pesanan', 'Nama Barang', 'Toko Pemasok', 'Kekurangan Awal', 'Sisa Kekurangan', 'Satuan', 'No Pesanan Asal', 'Status']);
      for (const s of filteredShortages) {
        rows.push([
          formatDateOnly(s.createdAt),
          s.productNameSnapshot,
          s.storeNameSnapshot,
          s.initialQuantity != null ? s.initialQuantity : s.quantity,
          s.quantity,
          s.unit,
          s.orderId,
          s.status,
        ]);
      }
    } else if (type === 'pembelian_ulang') {
      rows.push(['Tanggal Pembelian', 'Nama Barang', 'Pesanan Asal', 'Jumlah Dibeli', 'Jumlah Diterima', 'Satuan', 'Harga Aktual (Rp)', 'Status Penerimaan', 'Catatan']);
      for (const r of filteredRepurchases) {
        rows.push([
          formatDateTime(r.date),
          r.productName || r.shortage?.productNameSnapshot,
          r.orderId || r.shortage?.orderId,
          r.quantity,
          r.receivedQuantity,
          r.unit,
          r.actualPrice || 0,
          r.isReceived ? 'Sudah Diterima' : 'Menunggu Kedatangan',
          r.note || '',
        ]);
      }
    }

    const content = '\uFEFF' + rows.map((e) => e.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Laporan ${type} berhasil diunduh (${rows.length - 1} baris)`);
    setExportOpen(false);
  };

  return (
    <div>
      <PageHeader
        title="Laporan"
        subtitle="Pusat riwayat pesanan pemasok, pemantauan barang belum terpenuhi, dan pembelian ulang."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            variant="soft"
            size="md"
            icon={Download}
            onClick={() => setExportOpen(true)}
            title="Unduh laporan ke format Excel (CSV) atau cetak PDF"
          >
            Unduh Laporan
          </Btn>
          <Btn
            variant="outline"
            size="md"
            icon={Printer}
            onClick={() => window.print()}
            title="Cetak tampilan laporan saat ini"
          >
            Cetak
          </Btn>
        </div>
      </PageHeader>

      {/* 1. Ringkasan Laporan (4 Kartu Metrik Akurat) */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Pesanan Selesai */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">Pesanan Selesai</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-700 tracking-tight">{summaryMetrics.pesananSelesai}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Pesanan lengkap diterima</p>
          </div>
        </div>

        {/* Card 2: Diterima Sebagian */}
        <div className="flex flex-col justify-between rounded-2xl border border-blue-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800">Diterima Sebagian</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Truck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-blue-700 tracking-tight">{summaryMetrics.pesananSebagian}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Sebagian barang masuk stok</p>
          </div>
        </div>

        {/* Card 3: Barang Belum Terpenuhi */}
        <div className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">Barang Belum Terpenuhi</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <PackageX className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-700 tracking-tight">{summaryMetrics.belumTerpenuhi}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Kekurangan pesanan pemasok</p>
          </div>
        </div>

        {/* Card 4: Barang Sudah Dibeli Kembali */}
        <div className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary">Sudah Dibeli Kembali</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <RefreshCw className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-primary tracking-tight">{summaryMetrics.sudahDibeli}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Barang dalam proses pemenuhan</p>
          </div>
        </div>
      </div>

      {/* Bar Filter Pencarian & Rentang Tanggal */}
      <div className="card mb-5 p-3.5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagePesanan(1);
                setPageKekurangan(1);
                setPagePembelian(1);
              }}
              placeholder="Cari no pesanan, toko, barang..."
              className="w-full sm:w-60"
            />
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPagePesanan(1);
                  setPageKekurangan(1);
                }}
                className="input h-9 text-xs font-semibold"
                title="Dari tanggal"
              />
              <span className="text-ink-soft">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPagePesanan(1);
                  setPageKekurangan(1);
                }}
                className="input h-9 text-xs font-semibold"
                title="Sampai tanggal"
              />
            </div>
            {hasFilter && (
              <Btn size="sm" variant="soft" icon={FilterX} onClick={resetFilter}>
                Reset
              </Btn>
            )}
          </div>

          {/* Tab Navigasi Menu Laporan */}
          <div className="flex flex-wrap gap-1 rounded-xl bg-primary-soft/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('pesanan')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'pesanan'
                  ? 'bg-primary text-white shadow-soft'
                  : 'text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <ReceiptText className="h-3.5 w-3.5" />
              <span>A. Riwayat Pesanan ({filteredOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kekurangan')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'kekurangan'
                  ? 'bg-primary text-white shadow-soft'
                  : 'text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <PackageX className="h-3.5 w-3.5" />
              <span>B. Barang Belum Terpenuhi ({filteredShortages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pembelian_ulang')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'pembelian_ulang'
                  ? 'bg-primary text-white shadow-soft'
                  : 'text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>C. Riwayat Pembelian Ulang ({filteredRepurchases.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('restock')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                activeTab === 'restock'
                  ? 'bg-primary text-white shadow-soft'
                  : 'text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <span>D. Stok Perlu Dibeli ({needsRestock.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: RIWAYAT PESANAN (Bagian A)
          ========================================================================= */}
      {activeTab === 'pesanan' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <ReceiptText className="h-4 w-4 text-primary" /> Riwayat Pesanan Toko Pemasok
              </h2>
              <p className="text-xs text-ink-soft">
                Memantau pesanan yang diterima sebagian, sudah selesai, maupun yang dibatalkan.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={orderStatusFilter}
                onChange={(e) => {
                  setOrderStatusFilter(e.target.value);
                  setPagePesanan(1);
                }}
                className="input h-8 text-xs font-bold text-ink"
                title="Filter status pesanan"
              >
                <option value="semua">Semua Status Pesanan</option>
                <option value="sebagian">Diterima Sebagian</option>
                <option value="selesai">Sudah Diterima</option>
                <option value="batal">Dibatalkan</option>
                <option value="belum_diterima">Belum Diterima</option>
              </select>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={hasFilter ? SearchX : ReceiptText}
                title={hasFilter ? 'Pesanan tidak ditemukan' : 'Belum ada riwayat pesanan'}
                description={
                  hasFilter
                    ? 'Coba sesuaikan kata kunci pencarian, filter tanggal, atau status pesanan.'
                    : 'Riwayat terisi otomatis setiap kali pesanan dibuat dari halaman Toko.'
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden shadow-soft">
              <TableWrap minWidth="min-w-[860px]">
                <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
                  <tr>
                    <TH>No Pesanan</TH>
                    <TH>Waktu Pemesanan</TH>
                    <TH>Toko Pemasok</TH>
                    <TH>Jenis Barang</TH>
                    <TH className="text-right">Dipesan</TH>
                    <TH className="text-right">Diterima</TH>
                    <TH className="text-right">Total Perkiraan Biaya</TH>
                    <TH className="text-center">Status</TH>
                    <TH className="text-right">Aksi</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white text-xs">
                  {paginatedPesanan.rows.map((o) => {
                    const totalOrdered = (o.items || []).reduce((a, b) => a + (Number(b.quantity) || 0), 0);
                    const totalReceived = (o.items || []).reduce((a, b) => a + (Number(b.receivedQuantity) || 0), 0);
                    return (
                      <tr key={o.id} className="transition hover:bg-primary-soft/30">
                        <TD>
                          <p className="font-extrabold text-primary">{o.id}</p>
                          {o.note && (
                            <p className="max-w-[140px] truncate text-[11px] italic text-ink-soft">
                              “{o.note}”
                            </p>
                          )}
                        </TD>
                        <TD className="text-ink-soft whitespace-nowrap">{formatDateTime(o.createdAt)}</TD>
                        <TD className="font-semibold text-ink">
                          <Chip tone="soft">🏪 {storeById(o.storeId)?.name || '—'}</Chip>
                        </TD>
                        <TD>
                          <div className="min-w-0 max-w-[200px]">
                            <p className="font-bold text-ink">{o.items?.length || 0} jenis</p>
                            <p className="truncate text-[11px] text-ink-soft">
                              {(o.items || []).map((i) => i.productNameSnapshot).join(', ')}
                            </p>
                          </div>
                        </TD>
                        <TD className="text-right font-semibold text-ink">{formatQty(totalOrdered)}</TD>
                        <TD className="text-right font-bold text-emerald-600">{formatQty(totalReceived)}</TD>
                        <TD className="text-right">
                          <p className="font-extrabold text-ink">{rupiah(o.totalPrice)}</p>
                          {o.totalCost > 0 && o.totalCost !== o.totalPrice && (
                            <p className="text-[10px] text-emerald-600 font-bold">
                              Diterima: {rupiah(o.totalCost)}
                            </p>
                          )}
                        </TD>
                        <TD className="text-center">
                          <StatusPill status={o.status} />
                        </TD>
                        <TD>
                          <div className="flex justify-end">
                            <Btn
                              size="sm"
                              variant="outline"
                              icon={Eye}
                              onClick={() => setSelectedOrder(o)}
                              title="Lihat rincian lengkap pesanan"
                            >
                              Lihat Detail
                            </Btn>
                          </div>
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div className="card overflow-hidden shadow-soft">
              <Pagination
                page={paginatedPesanan.safePage}
                totalPages={paginatedPesanan.totalPages}
                total={filteredOrders.length}
                from={(paginatedPesanan.safePage - 1) * PAGE_SIZE + 1}
                to={Math.min(paginatedPesanan.safePage * PAGE_SIZE, filteredOrders.length)}
                onPage={setPagePesanan}
              />
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 2: BARANG BELUM TERPENUHI (Bagian B)
          ========================================================================= */}
      {activeTab === 'kekurangan' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <PackageX className="h-4 w-4 text-primary" /> Daftar Barang Belum Terpenuhi
              </h2>
              <p className="text-xs text-ink-soft">
                Kekurangan barang dari pesanan pemasok yang belum atau sudah dicatat pembelian ulang.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={shortageStatusFilter}
                onChange={(e) => {
                  setShortageStatusFilter(e.target.value);
                  setPageKekurangan(1);
                }}
                className="input h-8 text-xs font-bold text-ink"
                title="Filter status kekurangan"
              >
                <option value="semua">Semua Status Kekurangan</option>
                <option value="belum">Belum Dibeli</option>
                <option value="sudah">Sudah Dibeli</option>
                <option value="terpenuhi">Terpenuhi</option>
              </select>
            </div>
          </div>

          {filteredShortages.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={PackageX}
                title="Tidak ada barang belum terpenuhi"
                description={
                  hasFilter
                    ? 'Tidak ada data kekurangan yang cocok dengan filter pencarian.'
                    : 'Daftar ini mencatat kekurangan barang dari pesanan yang belum terpenuhi.'
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden shadow-soft">
              <TableWrap minWidth="min-w-[820px]">
                <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
                  <tr>
                    <TH>Tanggal Pesanan</TH>
                    <TH>Nama Barang</TH>
                    <TH>Toko Pemasok</TH>
                    <TH className="text-right">Kekurangan Awal</TH>
                    <TH className="text-right">Sisa Belum Diterima</TH>
                    <TH>Satuan</TH>
                    <TH>No Pesanan Asal</TH>
                    <TH className="text-center">Status Pemenuhan</TH>
                    <TH className="text-right">Aksi</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white text-xs">
                  {paginatedShortages.rows.map((s) => {
                    const initial = s.initialQuantity != null ? s.initialQuantity : s.quantity;
                    const hasPendingDelivery = (s.repurchases || []).some((r) => !r.isReceived);
                    return (
                      <tr key={s.id} className="transition hover:bg-primary-soft/30">
                        <TD className="text-ink-soft whitespace-nowrap">{formatDateOnly(s.createdAt)}</TD>
                        <TD className="font-bold text-ink">{s.productNameSnapshot}</TD>
                        <TD className="text-ink-soft">{s.storeNameSnapshot || '—'}</TD>
                        <TD className="text-right font-semibold text-ink">{formatQty(initial)}</TD>
                        <TD className="text-right font-extrabold text-rose-600">
                          {formatQty(s.quantity)}
                        </TD>
                        <TD className="text-ink-soft">{s.unit}</TD>
                        <TD>
                          <span className="font-bold text-primary">{s.orderId || '—'}</span>
                        </TD>
                        <TD className="text-center">
                          {s.status === 'terpenuhi' || s.quantity <= 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Terpenuhi
                            </span>
                          ) : s.status === 'sudah' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Sudah Dibeli
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Belum Dibeli
                            </span>
                          )}
                        </TD>
                        <TD>
                          <div className="flex justify-end gap-1.5">
                            <Btn
                              size="sm"
                              variant="outline"
                              icon={Eye}
                              onClick={() => setDetailShortage(s)}
                              title="Lihat detail kekurangan & riwayat pembelian ulang"
                            >
                              Detail
                            </Btn>

                            {/* Tombol Tandai Sudah Dibeli */}
                            {s.quantity > 0 && (
                              <Btn
                                size="sm"
                                variant="soft"
                                icon={ShoppingBag}
                                onClick={() => setRepurchaseTarget(s)}
                                title="Catat pembelian ulang untuk kekurangan ini"
                              >
                                Tandai Dibeli
                              </Btn>
                            )}

                            {/* Tombol Catat Barang Tiba jika ada pembelian yang belum diterima */}
                            {hasPendingDelivery && (
                              <Btn
                                size="sm"
                                icon={PackageCheck}
                                onClick={() => {
                                  const pendingRep = (s.repurchases || []).find((r) => !r.isReceived);
                                  if (pendingRep) setReceiveTarget({ shortage: s, repurchase: pendingRep });
                                }}
                                title="Catat bahwa barang pembelian ulang telah tiba & masuk stok"
                              >
                                Catat Tiba
                              </Btn>
                            )}
                          </div>
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          )}

          {filteredShortages.length > 0 && (
            <div className="card overflow-hidden shadow-soft">
              <Pagination
                page={paginatedShortages.safePage}
                totalPages={paginatedShortages.totalPages}
                total={filteredShortages.length}
                from={(paginatedShortages.safePage - 1) * PAGE_SIZE + 1}
                to={Math.min(paginatedShortages.safePage * PAGE_SIZE, filteredShortages.length)}
                onPage={setPageKekurangan}
              />
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 3: RIWAYAT PEMBELIAN ULANG (Bagian C)
          ========================================================================= */}
      {activeTab === 'pembelian_ulang' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <RefreshCw className="h-4 w-4 text-primary" /> Riwayat Pembelian Ulang Barang Kekurangan
              </h2>
              <p className="text-xs text-ink-soft">
                Daftar barang yang pernah dibeli kembali untuk memenuhi kekurangan dari pesanan sebelumnya.
              </p>
            </div>
            <span className="text-xs font-semibold text-ink-soft">
              {filteredRepurchases.length} riwayat pembelian ulang
            </span>
          </div>

          {filteredRepurchases.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={RefreshCw}
                title="Belum ada riwayat pembelian ulang"
                description="Catatan pembelian ulang akan muncul saat Anda mencatat pembelian untuk barang yang belum terpenuhi."
              />
            </div>
          ) : (
            <div className="card overflow-hidden shadow-soft">
              <TableWrap minWidth="min-w-[840px]">
                <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
                  <tr>
                    <TH>Waktu Pembelian</TH>
                    <TH>Nama Barang</TH>
                    <TH>Pesanan Asal</TH>
                    <TH className="text-right">Jumlah Dibeli</TH>
                    <TH className="text-right">Jumlah Diterima</TH>
                    <TH className="text-right">Harga Aktual</TH>
                    <TH className="text-center">Status Penerimaan</TH>
                    <TH>Catatan</TH>
                    <TH className="text-right">Aksi</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white text-xs">
                  {paginatedRepurchases.rows.map((r) => (
                    <tr key={r.id} className="transition hover:bg-primary-soft/30">
                      <TD className="text-ink-soft whitespace-nowrap">{formatDateTime(r.date)}</TD>
                      <TD className="font-bold text-ink">
                        {r.productName || r.shortage?.productNameSnapshot}
                      </TD>
                      <TD>
                        <span className="font-semibold text-primary">
                          {r.orderId || r.shortage?.orderId || '—'}
                        </span>
                      </TD>
                      <TD className="text-right font-semibold text-ink">
                        {formatQty(r.quantity)} {r.unit}
                      </TD>
                      <TD className="text-right font-bold text-emerald-600">
                        {formatQty(r.receivedQuantity)} {r.unit}
                      </TD>
                      <TD className="text-right font-semibold text-ink">
                        {r.actualPrice > 0 ? rupiah(r.actualPrice) : '—'}
                      </TD>
                      <TD className="text-center">
                        {r.isReceived ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Sudah Diterima
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Menunggu Kedatangan
                          </span>
                        )}
                      </TD>
                      <TD className="text-ink-soft">
                        {r.note ? <span className="italic">“{r.note}”</span> : '—'}
                      </TD>
                      <TD>
                        <div className="flex justify-end">
                          {!r.isReceived && r.shortage && (
                            <Btn
                              size="sm"
                              icon={PackageCheck}
                              onClick={() => setReceiveTarget({ shortage: r.shortage, repurchase: r })}
                            >
                              Catat Tiba
                            </Btn>
                          )}
                        </div>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          )}

          {filteredRepurchases.length > 0 && (
            <div className="card overflow-hidden shadow-soft">
              <Pagination
                page={paginatedRepurchases.safePage}
                totalPages={paginatedRepurchases.totalPages}
                total={filteredRepurchases.length}
                from={(paginatedRepurchases.safePage - 1) * PAGE_SIZE + 1}
                to={Math.min(paginatedRepurchases.safePage * PAGE_SIZE, filteredRepurchases.length)}
                onPage={setPagePembelian}
              />
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          TAB 4: STOK PERLU DIBELI (Bagian D - Stok Minimum)
          ========================================================================= */}
      {activeTab === 'restock' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Barang Perlu Dibeli (Stok Minimum)
              </h2>
              <p className="text-xs text-ink-soft">
                Barang inventaris warung yang stoknya habis atau berada di bawah batas stok minimum ({needsRestock.length})
              </p>
            </div>
          </div>

          {needsRestock.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={AlertTriangle}
                title="Semua stok barang aman"
                description="Tidak ada barang yang habis atau di bawah batas minimum persediaan warung."
              />
            </div>
          ) : (
            <div className="card overflow-hidden shadow-soft">
              <TableWrap minWidth="min-w-[640px]">
                <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
                  <tr>
                    <TH>Nama Barang</TH>
                    <TH>Kategori</TH>
                    <TH className="text-right">Stok Saat Ini</TH>
                    <TH className="text-right">Batas Stok Minimum</TH>
                    <TH className="text-center">Status</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white text-xs">
                  {paginatedRestock.rows.map(({ product, qty, min, status }) => {
                    const base = (product.units || []).find((u) => Number(u.factor) === 1) || (product.units || [])[0];
                    return (
                      <tr key={product.id} className="transition hover:bg-primary-soft/30">
                        <TD className="font-bold text-ink">{product.name}</TD>
                        <TD className="text-ink-soft">{product.category || '—'}</TD>
                        <TD className="text-right font-extrabold text-ink">
                          {formatQty(qty)} {base?.name || 'pcs'}
                        </TD>
                        <TD className="text-right text-ink-soft">
                          {min > 0 ? `${formatQty(min)} ${base?.name || 'pcs'}` : '—'}
                        </TD>
                        <TD className="text-center">
                          {status === 'habis' ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Habis
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-current" /> Menipis
                            </span>
                          )}
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>
          )}

          {needsRestock.length > 0 && (
            <div className="card overflow-hidden shadow-soft">
              <Pagination
                page={paginatedRestock.safePage}
                totalPages={paginatedRestock.totalPages}
                total={needsRestock.length}
                from={(paginatedRestock.safePage - 1) * PAGE_SIZE + 1}
                to={Math.min(paginatedRestock.safePage * PAGE_SIZE, needsRestock.length)}
                onPage={setPageRestock}
              />
            </div>
          )}
        </section>
      )}

      {/* Modal Detail Pesanan */}
      <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />

      {/* Modal Tandai Sudah Dibeli (Pencatatan Pembelian Ulang) */}
      <RepurchaseModal
        target={repurchaseTarget}
        onClose={() => setRepurchaseTarget(null)}
        onSave={(payload) => {
          const res = recordRepurchase(payload);
          if (res?.ok) {
            pushToast(
              payload.isReceived
                ? `Pembelian ulang dicatat & ${formatQty(payload.quantity)} ${repurchaseTarget.unit} telah masuk ke stok warung.`
                : `Pembelian ulang dicatat (menunggu kedatangan). Stok belum bertambah.`
            );
            setRepurchaseTarget(null);
          } else {
            pushToast(res?.reason || 'Gagal mencatat pembelian ulang.', 'warning');
          }
        }}
      />

      {/* Modal Catat Barang Pembelian Ulang Tiba */}
      <ReceiveRepurchaseModal
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        onSave={(payload) => {
          const res = receiveRepurchase(payload);
          if (res?.ok) {
            pushToast(`Barang pembelian ulang telah tiba & masuk ke stok warung.`);
            setReceiveTarget(null);
          } else {
            pushToast(res?.reason || 'Gagal mencatat penerimaan barang.', 'warning');
          }
        }}
      />

      {/* Modal Detail Kekurangan Barang */}
      <ShortageDetailModal shortage={detailShortage} onClose={() => setDetailShortage(null)} />

      {/* Modal Ekspor / Unduh Laporan */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExportCsv}
      />
    </div>
  );
}

function formatDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* =========================================================================
   Modal Formulir Pencatatan Pembelian Ulang (Tandai Sudah Dibeli)
   ========================================================================= */
function RepurchaseModal({ target, onClose, onSave }) {
  const [qty, setQty] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [isReceived, setIsReceived] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (target) {
      setQty(String(target.quantity));
      setActualPrice('');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setIsReceived(true);
      setError('');
    }
  }, [target]);

  if (!target) return null;

  const submit = () => {
    const qtyNum = Number(qty);
    if (!(qtyNum > 0)) {
      setError('Jumlah pembelian ulang harus berupa angka lebih dari 0.');
      return;
    }

    onSave({
      shortageId: target.id,
      quantity: qtyNum,
      actualPrice: Number(actualPrice) || 0,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      note: note.trim(),
      isReceived,
    });
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Catat Pembelian Ulang Barang"
      subtitle={`Pencatatan pembelian ulang untuk kekurangan pesanan ${target.orderId || ''}`}
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={CheckCircle2} onClick={submit}>
            Simpan Pembelian Ulang
          </Btn>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-primary-soft/40 p-3.5 text-xs space-y-1">
        <p className="font-extrabold text-ink text-sm">{target.productNameSnapshot}</p>
        <p className="text-ink-soft">
          Kekurangan saat ini: <strong className="text-rose-600">{formatQty(target.quantity)} {target.unit}</strong>
          {' · '}
          Toko pemasok asal: <strong className="text-ink">{target.storeNameSnapshot || '—'}</strong>
        </p>
      </div>

      <div className="mt-4 space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Jumlah Dibeli Kembali (${target.unit})`} required error={error}>
            <Input
              type="number"
              min="0.1"
              step="any"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                if (error) setError('');
              }}
              placeholder="contoh: 3"
              autoFocus
            />
          </Field>
          <Field label="Harga Aktual Beli (Rp, opsional)">
            <Input
              type="number"
              min="0"
              value={actualPrice}
              onChange={(e) => setActualPrice(e.target.value)}
              placeholder="contoh: 15000"
            />
          </Field>
        </div>

        <Field label="Tanggal Pembelian">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs font-semibold"
          />
        </Field>

        <Field label="Catatan Tambahan (opsional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="contoh: Dibeli dari toko lain di pasar / supplier cadangan..."
          />
        </Field>

        {/* Pilihan Penerimaan: Bedakan sudah dibeli vs sudah diterima */}
        <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-3.5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isReceived}
              onChange={(e) => setIsReceived(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-primary focus:ring-primary"
            />
            <div className="text-xs">
              <span className="font-bold text-ink">
                Barang sudah benar-benar diterima (langsung masuk ke stok warung)
              </span>
              <p className="mt-0.5 text-ink-soft leading-relaxed">
                {isReceived
                  ? 'Kuantitas barang yang dicatat akan langsung ditambahkan ke inventaris stok warung.'
                  : 'Barang dicatat sudah dibeli ulang tetapi belum tiba. Stok TIDAK akan bertambah sampai barang dicatat telah diterima.'}
              </p>
            </div>
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================================
   Modal Catat Barang Pembelian Ulang Tiba & Masuk Stok
   ========================================================================= */
function ReceiveRepurchaseModal({ target, onClose, onSave }) {
  const [receivedQty, setReceivedQty] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (target?.repurchase) {
      setReceivedQty(String(target.repurchase.quantity));
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
    }
  }, [target]);

  if (!target || !target.repurchase) return null;

  const submit = () => {
    const val = Number(receivedQty);
    if (!(val > 0)) return;
    onSave({
      shortageId: target.shortage.id,
      repurchaseId: target.repurchase.id,
      receivedQuantity: val,
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      note: note.trim(),
    });
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Catat Kedatangan Barang Pembelian Ulang"
      subtitle="Barang yang telah tiba akan ditambahkan ke inventaris stok warung secara real-time."
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={CheckCircle2} onClick={submit}>
            Simpan & Tambah Stok
          </Btn>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-primary-soft/40 p-3 text-xs space-y-1">
        <p className="font-bold text-ink">
          {target.shortage.productNameSnapshot} ({target.shortage.unit})
        </p>
        <p className="text-ink-soft">
          Pembelian ulang dicatat: <strong>{formatQty(target.repurchase.quantity)} {target.shortage.unit}</strong>
        </p>
      </div>

      <div className="mt-3.5 space-y-3">
        <Field label={`Jumlah Barang yang Tiba (${target.shortage.unit})`} required>
          <Input
            type="number"
            min="0.1"
            step="any"
            value={receivedQty}
            onChange={(e) => setReceivedQty(e.target.value)}
          />
        </Field>

        <Field label="Tanggal Kedatangan">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-xs font-semibold"
          />
        </Field>

        <Field label="Catatan Penerimaan (opsional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="contoh: Diterima siang via kurir..."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* =========================================================================
   Modal Detail Kekurangan & Riwayat Pembelian Ulang (Section 7)
   ========================================================================= */
function ShortageDetailModal({ shortage, onClose }) {
  if (!shortage) return null;

  const initial = shortage.initialQuantity != null ? shortage.initialQuantity : shortage.quantity;
  const repurchases = shortage.repurchases || [];
  const totalRepurchased = repurchases.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
  const totalReceived = repurchases.reduce(
    (acc, r) => acc + (r.isReceived ? Number(r.receivedQuantity) || 0 : 0),
    0
  );

  return (
    <Modal
      open={!!shortage}
      onClose={onClose}
      title={`Detail Kekurangan — ${shortage.productNameSnapshot}`}
      subtitle={`Rincian kekurangan dari pesanan ${shortage.orderId || ''}`}
      size="lg"
      footer={
        <Btn variant="outline" size="sm" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      {/* Informasi Asal Pesanan */}
      <div className="rounded-xl border border-line bg-primary-soft/40 p-3.5 text-xs">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Pesanan Asal</p>
            <p className="font-extrabold text-primary">{shortage.orderId || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Toko Pemasok</p>
            <p className="font-semibold text-ink">{shortage.storeNameSnapshot || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Waktu Pencatatan</p>
            <p className="font-semibold text-ink">{formatDateTime(shortage.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Kartu Metrik Angka Kekurangan */}
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white p-3 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Kekurangan Awal</span>
          <p className="mt-1 text-base font-extrabold text-ink">{formatQty(initial)} {shortage.unit}</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Dibeli Kembali</span>
          <p className="mt-1 text-base font-extrabold text-blue-600">{formatQty(totalRepurchased)} {shortage.unit}</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-3 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Sudah Diterima</span>
          <p className="mt-1 text-base font-extrabold text-emerald-600">{formatQty(totalReceived)} {shortage.unit}</p>
        </div>
        <div className="col-span-2 sm:col-span-3 rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs flex items-center justify-between">
          <span className="font-bold text-rose-800">Sisa Kekurangan Saat Ini:</span>
          <span className="text-lg font-black text-rose-600">{formatQty(shortage.quantity)} {shortage.unit}</span>
        </div>
      </div>

      {/* Riwayat Pembelian Ulang untuk Kekurangan Ini */}
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink">
          Riwayat Pembelian Ulang ({repurchases.length})
        </p>

        {repurchases.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line bg-primary-soft/30 p-3 text-center text-xs text-ink-soft">
            Belum ada catatan pembelian ulang untuk kekurangan ini.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {repurchases.map((r, i) => (
              <div key={r.id || i} className="rounded-xl border border-line bg-white p-3 shadow-soft text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1 border-b border-line/60 pb-1.5">
                  <span className="font-bold text-ink">Pembelian #{i + 1} — {formatDateTime(r.date)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    r.isReceived ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {r.isReceived ? 'Sudah Tiba & Masuk Stok' : 'Menunggu Kedatangan'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-ink-soft">
                  <span>Dibeli: <strong className="text-ink">{formatQty(r.quantity)} {shortage.unit}</strong></span>
                  <span>Diterima: <strong className="text-emerald-600">{formatQty(r.receivedQuantity)} {shortage.unit}</strong></span>
                  {r.actualPrice > 0 && <span>Harga: <strong className="text-ink">{rupiah(r.actualPrice)}</strong></span>}
                </div>
                {r.note && <p className="mt-1 text-[11px] italic text-ink-soft">“{r.note}”</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Riwayat Perubahan Status */}
      {shortage.statusHistory && shortage.statusHistory.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-ink">
            Riwayat Perubahan Status
          </p>
          <div className="mt-2 space-y-1.5">
            {shortage.statusHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-primary-soft/30 px-3 py-1.5 text-xs text-ink-soft">
                <span>{h.note || `Status: ${h.status}`}</span>
                <span className="text-[10px]">{formatDateTime(h.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* =========================================================================
   Modal Ekspor Laporan (Excel & PDF/Cetak)
   ========================================================================= */
function ExportModal({ open, onClose, onExport }) {
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unduh Laporan Warung"
      subtitle="Pilih jenis laporan yang ingin diunduh sesuai filter yang sedang aktif."
      size="sm"
      footer={
        <Btn variant="outline" size="sm" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onExport('pesanan')}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Riwayat Pesanan (Excel / CSV)</p>
              <p className="text-[11px] text-ink-soft">Seluruh pesanan selesai, sebagian, & batal</p>
            </div>
          </div>
          <Download className="h-4 w-4 text-ink-soft" />
        </button>

        <button
          type="button"
          onClick={() => onExport('kekurangan')}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Barang Belum Terpenuhi (Excel / CSV)</p>
              <p className="text-[11px] text-ink-soft">Daftar kekurangan barang dari pesanan pemasok</p>
            </div>
          </div>
          <Download className="h-4 w-4 text-ink-soft" />
        </button>

        <button
          type="button"
          onClick={() => onExport('pembelian_ulang')}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-ink">Riwayat Pembelian Ulang (Excel / CSV)</p>
              <p className="text-[11px] text-ink-soft">Histori barang kekurangan yang dibeli kembali</p>
            </div>
          </div>
          <Download className="h-4 w-4 text-ink-soft" />
        </button>

        <div className="border-t border-line/60 pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              window.print();
            }}
            className="flex w-full items-center justify-between rounded-xl border border-line bg-white p-3 text-left transition hover:border-primary hover:bg-primary-soft/30"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Printer className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold text-ink">Cetak / Simpan PDF</p>
                <p className="text-[11px] text-ink-soft">Cetak dokumen laporan saat ini ke printer atau PDF</p>
              </div>
            </div>
            <FileText className="h-4 w-4 text-ink-soft" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
