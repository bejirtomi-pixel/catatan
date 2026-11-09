import { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FilterX,
  PackageCheck,
  PackageX,
  Truck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { dateKey, formatDateTime, rupiah } from '../utils/format';
import {
  Btn,
  Chip,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  StatusPill,
  TD,
  TH,
  TableWrap,
} from '../components/UI';
import OrderDetailModal from '../components/OrderDetailModal';

export default function Pesanan() {
  const { orders, storeById } = useApp();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [detailOrder, setDetailOrder] = useState(null);
  const [initialReceive, setInitialReceive] = useState(false);

  // 1. Ringkasan Pesanan (5 metrik akurat dari data asli)
  const counts = useMemo(() => {
    const res = { semua: orders.length, belum_diterima: 0, sebagian: 0, selesai: 0, batal: 0 };
    for (const o of orders) {
      if (o.status === 'belum_diterima' || o.status === 'active' || o.status === 'pending') {
        res.belum_diterima += 1;
      } else if (o.status === 'sebagian' || o.status === 'proses' || o.status === 'diproses') {
        res.sebagian += 1;
      } else if (o.status === 'selesai' || o.status === 'diterima') {
        res.selesai += 1;
      } else if (o.status === 'batal' || o.status === 'dibatalkan') {
        res.batal += 1;
      }
    }
    return res;
  }, [orders]);

  // 8. Pencarian dan Filter Gabungan
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      // Filter status
      if (statusFilter !== 'semua') {
        if (statusFilter === 'belum_diterima') {
          if (o.status !== 'belum_diterima' && o.status !== 'active' && o.status !== 'pending') return false;
        } else if (statusFilter === 'sebagian') {
          if (o.status !== 'sebagian' && o.status !== 'proses' && o.status !== 'diproses') return false;
        } else if (statusFilter === 'selesai') {
          if (o.status !== 'selesai' && o.status !== 'diterima') return false;
        } else if (statusFilter === 'batal') {
          if (o.status !== 'batal' && o.status !== 'dibatalkan') return false;
        }
      }

      // Filter rentang tanggal
      const oDate = dateKey(o.createdAt);
      if (startDate && oDate < startDate) return false;
      if (endDate && oDate > endDate) return false;

      // Filter kata kunci pencarian (No pesanan, Toko, Barang)
      if (!q) return true;
      const storeName = (storeById(o.storeId)?.name || '').toLowerCase();
      const itemNames = (o.items || []).map((i) => (i.productNameSnapshot || '').toLowerCase()).join(' ');
      return o.id.toLowerCase().includes(q) || storeName.includes(q) || itemNames.includes(q);
    });
  }, [orders, search, startDate, endDate, statusFilter, storeById]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilter = search || startDate || endDate || statusFilter !== 'semua';

  // Kartu Ringkasan Atas
  const summaryCards = [
    {
      id: 'semua',
      label: 'Total Pesanan',
      sub: 'Semua pesanan tercatat',
      count: counts.semua,
      icon: ClipboardList,
      color: 'bg-primary-soft text-primary border-primary/20',
      activeRing: 'ring-primary',
    },
    {
      id: 'belum_diterima',
      label: 'Belum Diterima',
      sub: 'Menunggu pengiriman',
      count: counts.belum_diterima,
      icon: Clock,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      activeRing: 'ring-amber-500',
    },
    {
      id: 'sebagian',
      label: 'Diterima Sebagian',
      sub: 'Sebagian tiba & masuk stok',
      count: counts.sebagian,
      icon: Truck,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      activeRing: 'ring-blue-500',
    },
    {
      id: 'selesai',
      label: 'Sudah Diterima',
      sub: 'Lengkap seluruh barang',
      count: counts.selesai,
      icon: CheckCircle2,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      activeRing: 'ring-emerald-500',
    },
    {
      id: 'batal',
      label: 'Dibatalkan',
      sub: 'Pesanan dihentikan',
      count: counts.batal,
      icon: Ban,
      color: 'bg-rose-50 text-rose-700 border-rose-200',
      activeRing: 'ring-rose-500',
    },
  ];

  const handleOpenDetail = (order, shouldReceive = false) => {
    setDetailOrder(order);
    setInitialReceive(shouldReceive);
  };

  const resetFilter = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('semua');
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Pesanan"
        subtitle="Pusat pemantauan pesanan barang kepada toko pemasok dan pencatatan penerimaan stok."
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari no pesanan, toko, barang..."
            className="w-full sm:w-64"
          />
          <div className="flex w-full items-center gap-1.5 text-xs sm:w-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="input h-9 min-w-0 flex-1 text-xs font-semibold sm:w-auto"
              title="Dari tanggal"
            />
            <span className="text-ink-soft shrink-0">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="input h-9 min-w-0 flex-1 text-xs font-semibold sm:w-auto"
              title="Sampai tanggal"
            />
          </div>
          {hasFilter && (
            <Btn
              variant="soft"
              size="md"
              icon={FilterX}
              onClick={resetFilter}
              title="Reset seluruh filter pencarian dan tanggal"
              className="w-full sm:w-auto"
            >
              Reset
            </Btn>
          )}
        </div>
      </PageHeader>

      {/* 1. Ringkasan Pesanan (5 Kartu Interaktif) */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          const isSelected = statusFilter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setStatusFilter(isSelected && c.id !== 'semua' ? 'semua' : c.id);
                setPage(1);
              }}
              className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition shadow-soft last:col-span-2 sm:last:col-span-1 ${
                c.color
              } ${
                isSelected
                  ? `ring-2 ${c.activeRing} bg-white shadow-md`
                  : 'bg-white/80 hover:bg-white hover:border-primary/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold leading-tight">{c.label}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-current/10">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-black tracking-tight">{c.count}</p>
                <p className="mt-0.5 text-[10px] text-ink-soft leading-tight">{c.sub}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Kontrol Baris: Status Tabs & Pengaturan Page Size */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-primary-soft/40 p-1 w-full sm:w-auto">
          {summaryCards.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition ${
                  active
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:bg-white hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                    active ? 'bg-white/20 text-white' : 'bg-primary-soft text-primary'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 10. Pengaturan Jumlah Data Per Halaman */}
        <div className="flex w-full items-center justify-between sm:w-auto sm:justify-end gap-2 text-xs text-ink-soft">
          <span>Tampilkan per halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-bold text-ink outline-none focus:border-primary"
            title="Jumlah pesanan per halaman"
          >
            <option value={5}>5 baris</option>
            <option value={8}>8 baris</option>
            <option value={15}>15 baris</option>
            <option value={25}>25 baris</option>
            <option value={50}>50 baris</option>
          </select>
        </div>
      </div>

      {/* 2. Daftar Pesanan: Tabel untuk Desktop & Tablet, Kartu untuk Mobile */}
      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={hasFilter ? 'Pesanan tidak ditemukan' : 'Belum ada pesanan tercatat'}
            description={
              hasFilter
                ? 'Tidak ada pesanan yang sesuai dengan kata kunci, filter tanggal, atau status yang dipilih.'
                : 'Buat pesanan barang kepada pemasok melalui halaman Toko.'
            }
            action={
              hasFilter ? (
                <Btn size="sm" variant="soft" onClick={resetFilter}>
                  Reset Filter
                </Btn>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          {/* Tampilan Desktop & Tablet: Tabel Lengkap */}
          <div className="hidden md:block">
            <TableWrap minWidth="min-w-[860px]">
              <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
                <tr>
                  <TH className="w-40">1. Nomor Pesanan</TH>
                  <TH className="w-36">2. Waktu Pemesanan</TH>
                  <TH className="w-48">3. Toko Pemasok</TH>
                  <TH>4. Jumlah Jenis Barang</TH>
                  <TH className="w-40 text-right">5. Total Perkiraan Biaya</TH>
                  <TH className="w-36 text-center">6. Status Pesanan</TH>
                  <TH className="w-44 text-right">7. Aksi</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white text-xs">
                {rows.map((o) => {
                  const canReceive =
                    o.status === 'belum_diterima' ||
                    o.status === 'sebagian' ||
                    o.status === 'active';

                  const itemCount = o.items?.length || 0;
                  const previewItems = (o.items || []).slice(0, 2);
                  const remainingItemCount = Math.max(0, itemCount - 2);

                  return (
                    <tr key={o.id} className="transition hover:bg-primary-soft/30">
                      {/* 1. Nomor Pesanan */}
                      <TD>
                        <p className="font-extrabold text-primary">{o.id}</p>
                        {o.note && (
                          <p className="max-w-[150px] truncate text-[11px] italic text-ink-soft" title={o.note}>
                            “{o.note}”
                          </p>
                        )}
                      </TD>

                      {/* 2. Tanggal & Waktu */}
                      <TD className="text-ink-soft whitespace-nowrap">
                        {formatDateTime(o.createdAt)}
                      </TD>

                      {/* 3. Toko Pemasok */}
                      <TD>
                        <Chip tone="soft">🏪 {storeById(o.storeId)?.name || '—'}</Chip>
                      </TD>

                      {/* 4. Jumlah Jenis Barang & Pratinjau Rapi */}
                      <TD>
                        <div className="min-w-0 max-w-[260px]">
                          <p className="font-bold text-ink">
                            {itemCount} jenis barang
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {previewItems.map((it, idx) => (
                              <span
                                key={idx}
                                className="inline-block max-w-[125px] truncate rounded bg-primary-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink"
                                title={`${it.productNameSnapshot} (${it.quantity} ${it.unitName})`}
                              >
                                {it.productNameSnapshot}
                              </span>
                            ))}
                            {remainingItemCount > 0 && (
                              <span className="rounded bg-line/70 px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">
                                +{remainingItemCount} lainnya
                              </span>
                            )}
                          </div>
                        </div>
                      </TD>

                      {/* 5. Total Perkiraan Harga Pesanan */}
                      <TD className="text-right">
                        <p className="font-extrabold text-ink">{rupiah(o.totalPrice)}</p>
                        {o.totalCost > 0 && o.totalCost !== o.totalPrice && (
                          <p className="text-[10px] text-emerald-600 font-bold">
                            Masuk: {rupiah(o.totalCost)}
                          </p>
                        )}
                      </TD>

                      {/* 6. Status Pesanan */}
                      <TD className="text-center">
                        <StatusPill status={o.status} />
                      </TD>

                      {/* 7. Aksi (Lihat Detail & Catat Penerimaan) */}
                      <TD>
                        <div className="flex justify-end gap-1.5">
                          <Btn
                            size="sm"
                            variant={canReceive ? 'outline' : 'soft'}
                            icon={Eye}
                            onClick={() => handleOpenDetail(o, false)}
                            title="Lihat rincian lengkap pesanan"
                          >
                            Lihat Detail
                          </Btn>

                          {canReceive && (
                            <Btn
                              size="sm"
                              icon={PackageCheck}
                              onClick={() => handleOpenDetail(o, true)}
                              title="Buka formulir untuk mencatat barang yang baru tiba"
                            >
                              Catat Penerimaan
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

          {/* Tampilan Mobile: Kartu Responsif Vertikal */}
          <div className="space-y-3.5 md:hidden">
            {rows.map((o) => {
              const canReceive =
                o.status === 'belum_diterima' ||
                o.status === 'sebagian' ||
                o.status === 'active';

              const itemCount = o.items?.length || 0;
              const previewItems = (o.items || []).slice(0, 3);
              const remainingItemCount = Math.max(0, itemCount - 3);
              const storeName = storeById(o.storeId)?.name || '—';

              return (
                <div
                  key={o.id}
                  className="card p-4 shadow-soft transition hover:border-primary/40 space-y-3"
                >
                  {/* Baris 1: Nomor Pesanan & Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-line/60 pb-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Nomor Pesanan
                      </span>
                      <p className="text-sm font-extrabold text-primary">{o.id}</p>
                      {o.note && (
                        <p className="mt-0.5 text-xs italic text-ink-soft break-words">
                          “{o.note}”
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <StatusPill status={o.status} />
                    </div>
                  </div>

                  {/* Baris 2: Toko Pemasok & Waktu Pemesanan */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Toko Pemasok
                      </span>
                      <p className="mt-0.5 font-bold text-ink truncate" title={storeName}>
                        🏪 {storeName}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Waktu Pemesanan
                      </span>
                      <p className="mt-0.5 font-medium text-ink-soft text-[11px] leading-tight">
                        {formatDateTime(o.createdAt)}
                      </p>
                    </div>
                  </div>

                  {/* Baris 3: Barang yang Dipesan */}
                  <div className="rounded-xl border border-line bg-primary-soft/30 p-2.5 text-xs">
                    <div className="flex items-center justify-between text-ink mb-1.5">
                      <span className="font-bold">{itemCount} Jenis Barang</span>
                      <span className="text-[10px] font-bold text-ink-soft">
                        {(o.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0)} unit dipesan
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {previewItems.map((it, idx) => (
                        <span
                          key={idx}
                          className="inline-block max-w-[140px] truncate rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-ink border border-line/60 shadow-xs"
                          title={`${it.productNameSnapshot} (${it.quantity} ${it.unitName})`}
                        >
                          {it.productNameSnapshot} ({it.quantity} {it.unitName})
                        </span>
                      ))}
                      {remainingItemCount > 0 && (
                        <span className="rounded bg-line/80 px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">
                          +{remainingItemCount} lainnya
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Baris 4: Total Perkiraan Biaya */}
                  <div className="flex items-center justify-between rounded-xl bg-surface border border-line/60 p-2.5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Total Perkiraan Biaya
                      </span>
                      <p className="text-base font-black text-ink">{rupiah(o.totalPrice)}</p>
                    </div>
                    {o.totalCost > 0 && o.totalCost !== o.totalPrice && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                          Biaya Diterima
                        </span>
                        <p className="text-xs font-black text-emerald-600">
                          {rupiah(o.totalCost)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Baris 5: Tombol Aksi */}
                  <div className="flex items-center gap-2 pt-1">
                    <Btn
                      size="sm"
                      variant={canReceive ? 'outline' : 'primary'}
                      icon={Eye}
                      className="flex-1"
                      onClick={() => handleOpenDetail(o, false)}
                    >
                      Lihat Detail
                    </Btn>
                    {canReceive && (
                      <Btn
                        size="sm"
                        variant="primary"
                        icon={PackageCheck}
                        className="flex-1"
                        onClick={() => handleOpenDetail(o, true)}
                      >
                        Catat Penerimaan
                      </Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination Footer */}
      {filtered.length > 0 && (
        <div className="card mt-4 overflow-hidden shadow-soft">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            from={(safePage - 1) * pageSize + 1}
            to={Math.min(safePage * pageSize, filtered.length)}
            onPage={setPage}
          />
        </div>
      )}

      {/* 4. Modal Detail Pesanan & Catat Penerimaan */}
      <OrderDetailModal
        order={detailOrder}
        initialReceiveOpen={initialReceive}
        onClose={() => {
          setDetailOrder(null);
          setInitialReceive(false);
        }}
      />
    </div>
  );
}
