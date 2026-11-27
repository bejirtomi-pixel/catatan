import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FilterX,
  Globe,
  HelpCircle,
  History,
  PhoneCall,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Send,
  Smartphone,
  Trash2,
  Wallet,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatDateId, getLocalDateString, rupiah, dateKey } from '../utils/format';
import {
  DIGITAL_CATEGORIES,
  DIGITAL_STATUSES,
  PAYMENT_METHODS,
  calculateDigitalProfit,
  getCategoryLabel,
  getStatusLabel,
  maskDestination,
  summarizeDigitalTransactions,
} from '../utils/digitalFinance';
import {
  Btn,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TableWrap,
  TD,
  TH,
} from '../components/UI';

const PAGE_SIZE = 10;

// Daftar penyedia / provider populer untuk akses cepat
const QUICK_PROVIDERS = [
  'Telkomsel',
  'Indosat Ooredoo',
  'XL Axiata',
  'Smartfren',
  'Tri (3)',
  'PLN',
  'Bank BRI',
  'Bank BCA',
  'Bank Mandiri',
  'Bank BNI',
  'DANA',
  'GoPay',
  'OVO',
  'ShopeePay',
  'LinkAja',
  'PDAM',
  'BPJS Kesehatan',
];

// Preset nominal cepat
const QUICK_AMOUNTS = [10000, 20000, 25000, 50000, 100000, 200000];

export default function CatatanDigital() {
  const {
    digitalTransactions,
    createDigitalTransaction,
    updateDigitalTransaction,
    deleteDigitalTransaction,
    changeDigitalTransactionStatus,
    pushToast,
  } = useApp();

  // State filter & pencarian
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('semua'); // 'semua' | 'today' | 'week' | 'month'
  const [categoryFilter, setCategoryFilter] = useState('semua');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [paymentFilter, setPaymentFilter] = useState('semua');
  const [page, setPage] = useState(1);

  // State privasi (tampilkan nomor lengkap atau disensor)
  const [revealedIds, setRevealedIds] = useState(new Set());

  // State Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [detailTransaction, setDetailTransaction] = useState(null);
  const [statusModalTarget, setStatusModalTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Helper toggle sensor nomor tujuan
  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 1. Filter Data Transaksi Digital
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const todayStr = getLocalDateString();

    return (digitalTransactions || []).filter((t) => {
      // Filter kategori
      if (categoryFilter !== 'semua' && t.type !== categoryFilter) return false;

      // Filter status
      if (statusFilter !== 'semua' && t.status !== statusFilter) return false;

      // Filter metode pembayaran
      if (paymentFilter !== 'semua' && t.paymentMethod !== paymentFilter) return false;

      // Filter periode
      const txDate = (t.createdAt || '').slice(0, 10);
      if (periodFilter === 'today') {
        if (txDate !== todayStr) return false;
      } else if (periodFilter === 'week') {
        const pastWeek = new Date();
        pastWeek.setDate(pastWeek.getDate() - 7);
        const pastWeekStr = getLocalDateString(pastWeek);
        if (txDate < pastWeekStr || txDate > todayStr) return false;
      } else if (periodFilter === 'month') {
        const pastMonth = new Date();
        pastMonth.setDate(pastMonth.getDate() - 30);
        const pastMonthStr = getLocalDateString(pastMonth);
        if (txDate < pastMonthStr || txDate > todayStr) return false;
      }

      // Filter kata kunci pencarian
      if (!q) return true;
      const provider = (t.provider || '').toLowerCase();
      const dest = (t.destination || '').toLowerCase();
      const customName = (t.customTypeName || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      const idStr = (t.id || '').toLowerCase();

      return (
        provider.includes(q) ||
        dest.includes(q) ||
        customName.includes(q) ||
        notes.includes(q) ||
        idStr.includes(q)
      );
    });
  }, [digitalTransactions, search, periodFilter, categoryFilter, statusFilter, paymentFilter]);

  // 2. Ringkasan Keuangan dari Data yang Difilter
  const metrics = useMemo(() => {
    return summarizeDigitalTransactions(filteredTransactions);
  }, [filteredTransactions]);

  // Transaksi yang sedang pending (butuh perhatian)
  const pendingList = useMemo(() => {
    return (digitalTransactions || []).filter((t) => t.status === 'pending');
  }, [digitalTransactions]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = filteredTransactions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasFilter =
    search ||
    periodFilter !== 'semua' ||
    categoryFilter !== 'semua' ||
    statusFilter !== 'semua' ||
    paymentFilter !== 'semua';

  const resetFilter = () => {
    setSearch('');
    setPeriodFilter('semua');
    setCategoryFilter('semua');
    setStatusFilter('semua');
    setPaymentFilter('semua');
    setPage(1);
  };

  // Helper ikon kategori
  const getCategoryIcon = (type) => {
    switch (type) {
      case 'pulsa':
        return <PhoneCall className="h-4 w-4 text-blue-600" />;
      case 'paket_data':
        return <Globe className="h-4 w-4 text-indigo-600" />;
      case 'token_listrik':
        return <Zap className="h-4 w-4 text-amber-600" />;
      case 'transfer':
        return <Send className="h-4 w-4 text-emerald-600" />;
      case 'ewallet':
        return <Wallet className="h-4 w-4 text-purple-600" />;
      case 'tagihan':
        return <ReceiptText className="h-4 w-4 text-rose-600" />;
      default:
        return <Smartphone className="h-4 w-4 text-gray-600" />;
    }
  };

  // Helper badge status
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Selesai
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800 animate-pulse">
            <Clock className="h-3 w-3" /> Menunggu
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-800">
            <XCircle className="h-3 w-3" /> Gagal
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-extrabold text-gray-700 line-through">
            <X className="h-3 w-3" /> Dibatalkan
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Halaman */}
      <PageHeader
        title="Catatan Layanan Digital"
        subtitle="Pencatatan transaksi pulsa, paket data, token listrik, transfer uang, e-wallet, dan pembayaran tagihan dengan pemisahan mutlak dari stok warung."
      >
        <Btn
          icon={Plus}
          onClick={() => {
            setEditingTransaction(null);
            setFormModalOpen(true);
          }}
          className="shadow-soft"
        >
          Catat Transaksi
        </Btn>
      </PageHeader>

      {/* Banner Peringatan Transaksi Pending / Menunggu Konfirmasi */}
      {pendingList.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs shadow-soft transition">
          <div className="flex items-center gap-3 text-amber-950">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-800">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="font-extrabold text-sm text-amber-900">
                {pendingList.length} Transaksi Digital Sedang Menunggu Penyelesaian
              </p>
              <p className="mt-0.5 text-[11px] text-amber-800/90">
                Transaksi belum selesai tidak dihitung ke laba final warung sampai statusnya diubah menjadi Selesai.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('pending');
              setPage(1);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-200/90 px-3.5 py-2 font-bold text-amber-950 transition hover:bg-amber-300 text-xs shadow-xs"
          >
            Tinjau Transaksi Pending ({pendingList.length}) <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4 Kartu Ringkasan Metrik Finansial Transaksi Digital */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Layanan Selesai */}
        <div className="card flex flex-col justify-between p-4 border border-blue-200 shadow-soft bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800">Layanan Diproses</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Smartphone className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-blue-900 tracking-tight">
              {rupiah(metrics.totalServiceAmount)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {metrics.completedCount} transaksi sukses ({metrics.totalCount} total)
            </p>
          </div>
        </div>

        {/* Card 2: Uang Pelanggan Diterima */}
        <div className="card flex flex-col justify-between p-4 border border-violet-200 shadow-soft bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-violet-800">Uang Diterima</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Banknote className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-violet-900 tracking-tight">
              {rupiah(metrics.totalCustomerPaid)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Total kas masuk dari pelanggan
            </p>
          </div>
        </div>

        {/* Card 3: Total Modal & Biaya Aktual */}
        <div className="card flex flex-col justify-between p-4 border border-amber-200 shadow-soft bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800">Modal & Biaya</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-900 tracking-tight">
              {rupiah(metrics.totalCapital + metrics.totalProviderFee)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Saldo modal {rupiah(metrics.totalCapital)} + fee {rupiah(metrics.totalProviderFee)}
            </p>
          </div>
        </div>

        {/* Card 4: Keuntungan Bersih (Laba Riil) */}
        <div className="card flex flex-col justify-between p-4 border border-emerald-300 shadow-soft bg-white ring-1 ring-emerald-400/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800">Keuntungan Bersih (Laba)</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-700 tracking-tight">
              {rupiah(metrics.totalProfit)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              Margin riil tanpa mencampur stok barang
            </p>
          </div>
        </div>
      </div>

      {/* Bar Filter Pencarian & Kategori */}
      <div className="card p-4 shadow-soft space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari provider, nomor tujuan, catatan..."
              className="w-full sm:w-64"
            />

            {/* Filter Periode */}
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
              className="input h-9 text-xs font-bold text-ink"
              title="Filter rentang waktu transaksi"
            >
              <option value="semua">Semua Waktu</option>
              <option value="today">Hari Ini</option>
              <option value="week">7 Hari Terakhir</option>
              <option value="month">30 Hari Terakhir</option>
            </select>

            {/* Filter Kategori Layanan */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="input h-9 text-xs font-bold text-ink"
              title="Filter jenis layanan digital"
            >
              <option value="semua">Semua Kategori</option>
              {DIGITAL_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="input h-9 text-xs font-bold text-ink"
              title="Filter status transaksi"
            >
              <option value="semua">Semua Status</option>
              {DIGITAL_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Filter Metode Pembayaran */}
            <select
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setPage(1);
              }}
              className="input h-9 text-xs font-bold text-ink"
              title="Filter metode pembayaran"
            >
              <option value="semua">Semua Metode Bayar</option>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            {hasFilter && (
              <Btn size="sm" variant="soft" icon={FilterX} onClick={resetFilter}>
                Reset Filter
              </Btn>
            )}
          </div>

          <div className="text-xs font-bold text-ink-soft">
            Ditemukan: <span className="text-ink">{filteredTransactions.length}</span> transaksi
          </div>
        </div>
      </div>

      {/* Tabel Riwayat Transaksi Digital */}
      {filteredTransactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Smartphone}
            title="Belum ada transaksi digital"
            description={
              hasFilter
                ? 'Tidak ada transaksi yang cocok dengan filter atau kata kunci saat ini.'
                : 'Mulai catat transaksi pulsa, paket data, token PLN, transfer, dan tagihan warung.'
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden shadow-soft">
          <TableWrap minWidth="min-w-[950px]">
            <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink text-xs">
              <tr>
                <TH>Waktu & ID</TH>
                <TH>Jenis & Provider</TH>
                <TH>Tujuan / Identitas</TH>
                <TH className="text-right">Nominal Layanan</TH>
                <TH className="text-right">Modal & Fee</TH>
                <TH className="text-right">Uang Diterima</TH>
                <TH className="text-right">Keuntungan</TH>
                <TH className="text-center">Status & Bayar</TH>
                <TH className="text-center">Aksi</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white text-xs">
              {paginatedRows.map((t) => {
                const fin = calculateDigitalProfit(t);
                const isRevealed = revealedIds.has(t.id);
                return (
                  <tr key={t.id} className="transition hover:bg-primary-soft/20">
                    <TD>
                      <div className="font-bold text-ink">{formatDateTime(t.createdAt)}</div>
                      <div className="text-[10px] text-ink-soft font-mono">#{t.id.slice(-8)}</div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5 font-extrabold text-ink">
                        {getCategoryIcon(t.type)}
                        <span>{getCategoryLabel(t.type, t.customTypeName)}</span>
                      </div>
                      <div className="text-[11px] text-ink-soft font-semibold">{t.provider || '—'}</div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-ink">
                          {isRevealed ? t.destination || '—' : maskDestination(t.destination)}
                        </span>
                        {t.destination && (
                          <button
                            type="button"
                            onClick={() => toggleReveal(t.id)}
                            className="rounded p-1 text-ink-soft hover:bg-primary-soft hover:text-ink transition"
                            title={isRevealed ? 'Sembunyikan nomor' : 'Buka sensor nomor'}
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                      {t.notes && (
                        <p className="break-words text-[10px] text-ink-soft italic leading-tight">“{t.notes}”</p>
                      )}
                    </TD>
                    <TD className="text-right font-black text-ink">
                      {rupiah(fin.serviceAmount)}
                    </TD>
                    <TD className="text-right text-ink-soft">
                      <div className="font-semibold text-ink">{rupiah(fin.capital)}</div>
                      {fin.providerFee > 0 && (
                        <div className="text-[10px] text-rose-600">+fee {rupiah(fin.providerFee)}</div>
                      )}
                    </TD>
                    <TD className="text-right font-black text-ink">
                      <div>{rupiah(fin.customerPaid)}</div>
                      {fin.customerAdminFee > 0 && (
                        <div className="text-[10px] text-emerald-700">adm +{rupiah(fin.customerAdminFee)}</div>
                      )}
                    </TD>
                    <TD className="text-right">
                      {t.status === 'completed' ? (
                        <span className="font-black text-emerald-700">+{rupiah(fin.profit)}</span>
                      ) : t.status === 'pending' ? (
                        <span className="font-semibold text-amber-600 italic">
                          ({rupiah(fin.profit)})
                        </span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </TD>
                    <TD className="text-center space-y-1">
                      <div>{renderStatusBadge(t.status)}</div>
                      <div className="text-[10px] font-semibold text-ink-soft uppercase tracking-wider">
                        {t.paymentMethod || 'Tunai'}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailTransaction(t)}
                          className="rounded-lg p-1.5 text-ink-soft hover:bg-primary-soft hover:text-ink transition"
                          title="Lihat rincian transaksi"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusModalTarget(t)}
                          className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50 transition"
                          title="Ubah status transaksi"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTransaction(t);
                            setFormModalOpen(true);
                          }}
                          className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50 transition"
                          title="Edit transaksi"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 transition"
                          title="Hapus transaksi"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          {filteredTransactions.length > 0 && (
            <div className="border-t border-line bg-surface/30">
              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={filteredTransactions.length}
                from={(safePage - 1) * PAGE_SIZE + 1}
                to={Math.min(safePage * PAGE_SIZE, filteredTransactions.length)}
                onPage={setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal Form Tambah / Edit Transaksi Digital */}
      <DigitalTransactionFormModal
        open={formModalOpen}
        onClose={() => {
          setFormModalOpen(false);
          setEditingTransaction(null);
        }}
        transaction={editingTransaction}
        onSave={(payload) => {
          if (editingTransaction) {
            const res = updateDigitalTransaction(editingTransaction.id, payload);
            if (res.ok) setFormModalOpen(false);
          } else {
            const res = createDigitalTransaction(payload);
            if (res.ok) setFormModalOpen(false);
          }
        }}
      />

      {/* Modal Detail Transaksi Digital */}
      <DigitalTransactionDetailModal
        transaction={detailTransaction}
        onClose={() => setDetailTransaction(null)}
      />

      {/* Modal Cepat Ubah Status Transaksi */}
      <ChangeStatusModal
        target={statusModalTarget}
        onClose={() => setStatusModalTarget(null)}
        onSave={(newStatus, reason) => {
          if (statusModalTarget) {
            changeDigitalTransactionStatus(statusModalTarget.id, newStatus, reason);
            setStatusModalTarget(null);
          }
        }}
      />

      {/* Modal Konfirmasi Hapus Transaksi */}
      <ConfirmDeleteModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteDigitalTransaction(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}

/* =========================================================================
   Modal Formulir Input / Edit Transaksi Digital
   ========================================================================= */
function DigitalTransactionFormModal({ open, onClose, transaction, onSave }) {
  const [type, setType] = useState('pulsa');
  const [customTypeName, setCustomTypeName] = useState('');
  const [provider, setProvider] = useState('Telkomsel');
  const [destination, setDestination] = useState('');
  const [serviceAmount, setServiceAmount] = useState('20000');
  const [capital, setCapital] = useState('19000');
  const [providerFee, setProviderFee] = useState('0');
  const [customerAdminFee, setCustomerAdminFee] = useState('0');
  const [customerPaid, setCustomerPaid] = useState('20000');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [status, setStatus] = useState('completed');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inisialisasi form saat modal terbuka atau ganti target
  useState(() => {
    if (transaction) {
      setType(transaction.type || 'pulsa');
      setCustomTypeName(transaction.customTypeName || '');
      setProvider(transaction.provider || '');
      setDestination(transaction.destination || '');
      setServiceAmount(String(transaction.serviceAmount || ''));
      setCapital(String(transaction.capital || ''));
      setProviderFee(String(transaction.providerFee || '0'));
      setCustomerAdminFee(String(transaction.customerAdminFee || '0'));
      setCustomerPaid(String(transaction.customerPaid || ''));
      setPaymentMethod(transaction.paymentMethod || 'cash');
      setStatus(transaction.status || 'completed');
      setNotes(transaction.notes || '');
    }
  }, [transaction, open]);

  // Kalkulasi instan untuk pratinjau finansial
  const liveCalc = useMemo(() => {
    return calculateDigitalProfit({
      serviceAmount: Number(serviceAmount) || 0,
      capital: Number(capital) || 0,
      providerFee: Number(providerFee) || 0,
      customerAdminFee: Number(customerAdminFee) || 0,
      customerPaid: Number(customerPaid) || 0,
    });
  }, [serviceAmount, capital, providerFee, customerAdminFee, customerPaid]);

  if (!open) return null;

  // Handler otomatis menghitung customerPaid saat serviceAmount atau admin fee diubah
  const handleAmountChange = (val) => {
    setServiceAmount(val);
    const num = Number(val) || 0;
    const fee = Number(customerAdminFee) || 0;
    setCustomerPaid(String(num + fee));
  };

  const handleAdminFeeChange = (feeVal) => {
    setCustomerAdminFee(feeVal);
    const num = Number(serviceAmount) || 0;
    const fee = Number(feeVal) || 0;
    setCustomerPaid(String(num + fee));
  };

  const submit = () => {
    setError('');
    const sa = Number(serviceAmount);
    if (!sa || sa <= 0) {
      setError('Nominal layanan harus diisi berupa angka positif.');
      return;
    }
    if (type === 'lainnya' && !customTypeName.trim()) {
      setError('Nama layanan wajib diisi jika memilih kategori Lainnya.');
      return;
    }

    setIsSubmitting(true);
    try {
      onSave({
        type,
        customTypeName: customTypeName.trim(),
        provider: provider.trim(),
        destination: destination.trim(),
        serviceAmount: liveCalc.serviceAmount,
        capital: liveCalc.capital,
        providerFee: liveCalc.providerFee,
        customerAdminFee: liveCalc.customerAdminFee,
        customerPaid: liveCalc.customerPaid,
        paymentMethod,
        status,
        notes: notes.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={transaction ? 'Edit Transaksi Digital' : 'Catat Transaksi Layanan Digital'}
      subtitle="Pencatatan real-time transaksi pulsa, data, token, transfer, dan tagihan."
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Btn>
          <Btn icon={CheckCircle2} onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : transaction ? 'Perbarui Transaksi' : 'Simpan Transaksi'}
          </Btn>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Kategori Layanan */}
        <div className="space-y-1.5">
          <label className="font-bold text-ink">Kategori Layanan Digital *</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIGITAL_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setType(c.id)}
                className={`flex items-center gap-2 rounded-xl border p-2.5 font-bold transition text-left ${
                  type === c.id
                    ? 'border-primary bg-primary text-white shadow-soft'
                    : 'border-line bg-white text-ink hover:border-primary/40 hover:bg-primary-soft/30'
                }`}
              >
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {type === 'lainnya' && (
          <Field label="Nama Layanan Khusus *" required>
            <Input
              value={customTypeName}
              onChange={(e) => setCustomTypeName(e.target.value)}
              placeholder="contoh: Cetak Foto Digital, Top Up Game..."
            />
          </Field>
        )}

        {/* Provider / Biller */}
        <div className="space-y-1.5">
          <Field label="Nama Provider / Bank / Biller" required>
            <Input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="contoh: Telkomsel, PLN, Bank BRI, DANA..."
            />
          </Field>
          <div className="flex flex-wrap gap-1 pt-1">
            {QUICK_PROVIDERS.slice(0, 8).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className="rounded-lg border border-line bg-surface/50 px-2 py-0.5 text-[10px] font-semibold text-ink-soft hover:bg-white hover:text-ink transition"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Nomor Tujuan / ID Pelanggan */}
        <Field label="Nomor Tujuan / No Meteran / ID Pelanggan (opsional)">
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="contoh: 081234567890 atau 14235678901"
            className="font-mono text-xs"
          />
        </Field>

        {/* Nominal Layanan & Modal */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Field label="Nominal Layanan (Rp) *" required>
              <Input
                type="number"
                min="0"
                step="500"
                value={serviceAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="20000"
                className="font-extrabold text-sm"
              />
            </Field>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleAmountChange(String(amt))}
                  className="rounded border border-line bg-surface/50 px-1.5 py-0.5 text-[10px] font-bold text-ink-soft hover:bg-white hover:text-ink transition"
                >
                  {amt >= 1000 ? `${amt / 1000}rb` : amt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Field label="Biaya Modal Warung (Rp)" required>
              <Input
                type="number"
                min="0"
                step="100"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="19000"
                className="font-extrabold text-sm text-amber-900"
              />
            </Field>
            <p className="mt-1 text-[10px] text-ink-soft">
              Saldo modal / kas warung yang terpotong untuk transaksi ini.
            </p>
          </div>
        </div>

        {/* Admin Pelanggan & Fee Provider */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Admin Pelanggan (Rp)">
            <Input
              type="number"
              min="0"
              step="500"
              value={customerAdminFee}
              onChange={(e) => handleAdminFeeChange(e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Fee Provider (Rp)">
            <Input
              type="number"
              min="0"
              step="100"
              value={providerFee}
              onChange={(e) => setProviderFee(e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Total Uang Pelanggan (Rp)" required>
            <Input
              type="number"
              min="0"
              step="500"
              value={customerPaid}
              onChange={(e) => setCustomerPaid(e.target.value)}
              placeholder="20000"
              className="font-extrabold text-ink"
            />
          </Field>
        </div>

        {/* Kotak Pratinjau Finansial Real-time */}
        <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-3.5 space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wider text-primary">
            Pratinjau Kalkulasi Keuntungan
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-line/60 bg-white p-2">
              <span className="text-[10px] text-ink-soft">Total Biaya/Modal</span>
              <p className="font-extrabold text-ink">{rupiah(liveCalc.totalCost)}</p>
            </div>
            <div className="rounded-xl border border-line/60 bg-white p-2">
              <span className="text-[10px] text-ink-soft">Uang Pelanggan</span>
              <p className="font-extrabold text-ink">{rupiah(liveCalc.customerPaid)}</p>
            </div>
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-2">
              <span className="text-[10px] text-emerald-800 font-bold">Laba Riil Warung</span>
              <p className="font-black text-emerald-700 text-sm">{rupiah(liveCalc.profit)}</p>
            </div>
          </div>
        </div>

        {/* Metode Pembayaran & Status */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Metode Pembayaran">
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="text-xs font-semibold"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status Transaksi">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="text-xs font-bold"
            >
              {DIGITAL_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Catatan Transaksi (opsional)">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="contoh: Pembeli bayar uang pas, bukti SN pulsa..."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* =========================================================================
   Modal Rincian Transaksi Digital
   ========================================================================= */
function DigitalTransactionDetailModal({ transaction, onClose }) {
  if (!transaction) return null;
  const fin = calculateDigitalProfit(transaction);

  return (
    <Modal
      open={!!transaction}
      onClose={onClose}
      title="Rincian Transaksi Digital"
      subtitle={`ID: ${transaction.id}`}
      size="sm"
      footer={
        <Btn variant="outline" size="sm" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl border border-line bg-primary-soft/30 p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-ink text-sm">
              {getCategoryLabel(transaction.type, transaction.customTypeName)}
            </span>
            <span className="font-mono text-[11px] text-ink-soft">
              {formatDateTime(transaction.createdAt)}
            </span>
          </div>
          <p className="text-ink-soft">
            Provider / Bank: <strong className="text-ink">{transaction.provider || '—'}</strong>
          </p>
          {transaction.destination && (
            <p className="text-ink-soft font-mono">
              Tujuan: <strong className="text-ink">{transaction.destination}</strong>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-white p-3 space-y-2">
          <div className="flex justify-between border-b border-line/60 pb-1.5">
            <span className="text-ink-soft">Nominal Layanan</span>
            <span className="font-extrabold text-ink">{rupiah(fin.serviceAmount)}</span>
          </div>
          <div className="flex justify-between border-b border-line/60 pb-1.5">
            <span className="text-ink-soft">Modal Aktual</span>
            <span className="font-semibold text-ink">{rupiah(fin.capital)}</span>
          </div>
          {fin.providerFee > 0 && (
            <div className="flex justify-between border-b border-line/60 pb-1.5">
              <span className="text-ink-soft">Biaya Provider</span>
              <span className="font-semibold text-rose-600">+{rupiah(fin.providerFee)}</span>
            </div>
          )}
          {fin.customerAdminFee > 0 && (
            <div className="flex justify-between border-b border-line/60 pb-1.5">
              <span className="text-ink-soft">Biaya Admin Pelanggan</span>
              <span className="font-semibold text-emerald-700">+{rupiah(fin.customerAdminFee)}</span>
            </div>
          )}
          <div className="flex justify-between border-b border-line/60 pb-1.5">
            <span className="text-ink-soft">Uang Diterima Pelanggan</span>
            <span className="font-black text-ink">{rupiah(fin.customerPaid)}</span>
          </div>
          <div className="flex justify-between pt-1 text-sm font-black text-emerald-700">
            <span>Keuntungan Bersih</span>
            <span>+{rupiah(fin.profit)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-xl border border-line bg-surface/40 p-2.5">
            <span className="text-[10px] text-ink-soft font-bold">Metode Bayar</span>
            <p className="font-extrabold text-ink uppercase mt-0.5">{transaction.paymentMethod || 'cash'}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface/40 p-2.5">
            <span className="text-[10px] text-ink-soft font-bold">Status Transaksi</span>
            <p className="font-extrabold text-ink capitalize mt-0.5">{getStatusLabel(transaction.status)}</p>
          </div>
        </div>

        {transaction.notes && (
          <div className="rounded-lg border border-line bg-surface/20 p-2.5 text-ink-soft">
            <span className="font-bold text-[10px] text-ink">Catatan:</span>
            <p className="mt-0.5 italic">{transaction.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================================
   Modal Ubah Status Transaksi
   ========================================================================= */
function ChangeStatusModal({ target, onClose, onSave }) {
  const [selectedStatus, setSelectedStatus] = useState('completed');
  const [reason, setReason] = useState('');

  useState(() => {
    if (target) {
      setSelectedStatus(target.status || 'completed');
      setReason('');
    }
  }, [target]);

  if (!target) return null;

  const submit = () => {
    onSave(selectedStatus, reason.trim());
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Ubah Status Transaksi"
      subtitle={`Transaksi #${target.id.slice(-6)} • ${target.provider || target.type}`}
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn onClick={submit}>Simpan Status</Btn>
        </>
      }
    >
      <div className="space-y-3.5 text-xs">
        <Field label="Pilih Status Baru" required>
          <Select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs font-bold"
          >
            {DIGITAL_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Alasan / Catatan Perubahan Status (opsional)">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="contoh: Saldo telah terpotong dan pulsa sukses masuk..."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* =========================================================================
   Modal Konfirmasi Hapus Transaksi
   ========================================================================= */
function ConfirmDeleteModal({ target, onClose, onConfirm }) {
  if (!target) return null;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Hapus Transaksi Digital?"
      subtitle="Tindakan ini tidak dapat dibatalkan."
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn variant="danger" icon={Trash2} onClick={onConfirm}>
            Hapus Permanen
          </Btn>
        </>
      }
    >
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 space-y-1">
        <p className="font-extrabold">Konfirmasi Penghapusan</p>
        <p>
          Anda akan menghapus transaksi{' '}
          <strong>{getCategoryLabel(target.type, target.customTypeName)}</strong> senilai{' '}
          <strong>{rupiah(target.serviceAmount)}</strong> ({target.provider}).
        </p>
      </div>
    </Modal>
  );
}
