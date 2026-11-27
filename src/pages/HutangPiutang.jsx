import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Edit2,
  Eye,
  FileSpreadsheet,
  FilterX,
  Flame,
  HandCoins,
  History,
  Phone,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDate, formatDateId, formatDateTime, getLocalDateString, rupiah } from '../utils/format';
import {
  DEBT_STATUSES,
  DEBT_TYPES,
  calculateDebtRemaining,
  calculateDebtTotalPaid,
  computeDebtStatus,
  getDebtStatusInfo,
  summarizeDebts,
  summarizeParties,
} from '../utils/debtFinance';
import {
  Btn,
  Chip,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusPill,
  TableWrap,
  TD,
  TH,
  Textarea,
  cx,
} from '../components/UI';

const PAGE_SIZE = 10;
const QUICK_PAY_PRESETS = [25000, 50000, 100000, 200000, 500000];

export default function HutangPiutang() {
  const {
    debts = [],
    createDebt,
    updateDebt,
    deleteDebt,
    addDebtPayment,
    deleteDebtPayment,
    gasBorrows = [],
    gasBorrowsSummary = { totalUnreturnedTubes: 0, totalReturnedTubes: 0, completedCount: 0, activeCustomersCount: 0 },
    createGasBorrow,
    returnGasBorrow,
    updateGasBorrow,
    deleteGasBorrow,
    computeGasBorrowStatus,
    calculateGasBorrowRemaining,
    calculateGasBorrowTotalReturned,
    pushToast,
  } = useApp();

  const todayStr = getLocalDateString();

  // Tab Modul Utama: 'uang' (Hutang-Piutang Uang) vs 'tabung' (Pencatatan Pinjam Tabung Gas)
  const [mainTab, setMainTab] = useState('uang');

  // Filter states (Hutang-Piutang Uang)
  const [search, setSearch] = useState('');
  const [typeTab, setTypeTab] = useState('semua'); // 'semua' | 'piutang' | 'hutang' | 'rekap_pihak'
  const [statusFilter, setStatusFilter] = useState('semua'); // 'semua' | 'belum_lunas' | 'sebagian' | 'terlambat' | 'lunas'
  const [page, setPage] = useState(1);

  // Modal states (Hutang-Piutang Uang)
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Form input state (Hutang-Piutang Uang)
  const [formData, setFormData] = useState({
    type: 'piutang',
    name: '',
    contact: '',
    amount: '',
    date: todayStr,
    dueDate: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');

  // Payment modal state (Hutang-Piutang Uang)
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayStr);
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState('');

  // Gas Borrows Filter & Pagination states
  const [gasSearch, setGasSearch] = useState('');
  const [gasStatusFilter, setGasStatusFilter] = useState('semua'); // 'semua' | 'belum_kembali' | 'sebagian_kembali' | 'selesai'
  const [gasPage, setGasPage] = useState(1);

  // Gas Borrows Modal states
  const [gasFormOpen, setGasFormOpen] = useState(false);
  const [gasEditingTarget, setGasEditingTarget] = useState(null);
  const [gasReturnTarget, setGasReturnTarget] = useState(null);
  const [gasDetailTarget, setGasDetailTarget] = useState(null);
  const [gasDeleteTarget, setGasDeleteTarget] = useState(null);

  // Gas Form input data
  const [gasFormData, setGasFormData] = useState({
    customerName: '',
    customerPhone: '',
    quantity: '1',
    borrowDate: todayStr,
    notes: '',
  });
  const [gasFormError, setGasFormError] = useState('');

  // Gas Return input data
  const [gasReturnQty, setGasReturnQty] = useState('1');
  const [gasReturnDate, setGasReturnDate] = useState(todayStr);
  const [gasReturnNotes, setGasReturnNotes] = useState('');
  const [gasReturnError, setGasReturnError] = useState('');

  // Summary aggregation
  const summary = useMemo(() => summarizeDebts(debts, todayStr), [debts, todayStr]);
  const partySummaries = useMemo(() => summarizeParties(debts, todayStr), [debts, todayStr]);

  // Filtered debt list
  const filteredDebts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((d) => {
      // Filter Type
      if (typeTab === 'piutang' && d.type !== 'piutang') return false;
      if (typeTab === 'hutang' && d.type !== 'hutang') return false;

      // Filter Status
      const status = computeDebtStatus(d, todayStr);
      if (statusFilter !== 'semua' && status !== statusFilter) return false;

      // Filter Search Keyword
      if (q) {
        const matchName = (d.name || '').toLowerCase().includes(q);
        const matchContact = (d.contact || '').toLowerCase().includes(q);
        const matchNotes = (d.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchContact && !matchNotes) return false;
      }

      return true;
    });
  }, [debts, typeTab, statusFilter, search, todayStr]);

  // Filtered party list for 'rekap_pihak' tab
  const filteredParties = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partySummaries;
    return partySummaries.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        (p.contact && p.contact.toLowerCase().includes(q))
    );
  }, [partySummaries, search]);

  // Pagination for main table
  const totalPages = Math.max(1, Math.ceil(filteredDebts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedDebts = useMemo(() => {
    const from = (safePage - 1) * PAGE_SIZE;
    return filteredDebts.slice(from, from + PAGE_SIZE);
  }, [filteredDebts, safePage]);

  // Reset filters
  const hasFilter = search || typeTab !== 'semua' || statusFilter !== 'semua';
  const handleResetFilters = () => {
    setSearch('');
    setTypeTab('semua');
    setStatusFilter('semua');
    setPage(1);
  };

  // Open Form Modal (Create or Edit)
  const handleOpenForm = (debt = null) => {
    setFormError('');
    if (debt) {
      setEditingTarget(debt);
      setFormData({
        type: debt.type,
        name: debt.name,
        contact: debt.contact || '',
        amount: String(debt.amount),
        date: debt.date || todayStr,
        dueDate: debt.dueDate || '',
        notes: debt.notes || '',
      });
    } else {
      setEditingTarget(null);
      setFormData({
        type: typeTab === 'hutang' ? 'hutang' : 'piutang',
        name: '',
        contact: '',
        amount: '',
        date: todayStr,
        dueDate: '',
        notes: '',
      });
    }
    setFormOpen(true);
  };

  // Submit Form
  const handleSubmitForm = (e) => {
    e?.preventDefault();
    setFormError('');

    const rawAmount = Number(formData.amount);
    if (!formData.name.trim()) {
      setFormError('Nama pihak wajib diisi.');
      return;
    }
    if (isNaN(rawAmount) || rawAmount <= 0) {
      setFormError('Nominal pokok wajib diisi angka lebih besar dari Rp0.');
      return;
    }

    if (editingTarget) {
      const res = updateDebt(editingTarget.id, {
        type: formData.type,
        name: formData.name.trim(),
        contact: formData.contact.trim(),
        amount: rawAmount,
        date: formData.date,
        dueDate: formData.dueDate,
        notes: formData.notes.trim(),
      });
      if (!res.ok) {
        setFormError(res.reason);
        return;
      }
    } else {
      const res = createDebt({
        type: formData.type,
        name: formData.name.trim(),
        contact: formData.contact.trim(),
        amount: rawAmount,
        date: formData.date,
        dueDate: formData.dueDate,
        notes: formData.notes.trim(),
      });
      if (!res.ok) {
        setFormError(res.reason);
        return;
      }
    }

    setFormOpen(false);
  };

  // Open Payment Modal
  const handleOpenPayment = (debt) => {
    setPaymentTarget(debt);
    setPayError('');
    setPayAmount('');
    setPayDate(todayStr);
    setPayNotes('Pembayaran tunai');
  };

  // Submit Payment
  const handleSubmitPayment = (e) => {
    e?.preventDefault();
    setPayError('');

    if (!paymentTarget) return;
    const num = Number(payAmount);
    if (isNaN(num) || num <= 0) {
      setPayError('Nominal pembayaran harus lebih besar dari Rp0.');
      return;
    }

    const res = addDebtPayment(paymentTarget.id, {
      amount: num,
      date: payDate,
      notes: payNotes,
    });

    if (!res.ok) {
      setPayError(res.reason);
      return;
    }

    setPaymentTarget(null);
    if (detailTarget && detailTarget.id === paymentTarget.id) {
      // Perbarui target detail yang sedang terbuka
      const updated = debts.find((d) => d.id === paymentTarget.id);
      if (updated) setDetailTarget(updated);
    }
  };

  // ======================= GAS BORROWS HANDLERS =======================

  // Filter & Pagination Gas Borrows
  const filteredGasBorrows = useMemo(() => {
    const q = gasSearch.trim().toLowerCase();
    return gasBorrows.filter((gb) => {
      const status = computeGasBorrowStatus(gb);
      if (gasStatusFilter !== 'semua' && status !== gasStatusFilter) return false;
      if (q) {
        const matchName = (gb.customerName || '').toLowerCase().includes(q);
        const matchPhone = (gb.customerPhone || '').toLowerCase().includes(q);
        const matchNotes = (gb.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchNotes) return false;
      }
      return true;
    });
  }, [gasBorrows, gasStatusFilter, gasSearch, computeGasBorrowStatus]);

  const gasTotalPages = Math.max(1, Math.ceil(filteredGasBorrows.length / PAGE_SIZE));
  const safeGasPage = Math.min(gasPage, gasTotalPages);
  const pagedGasBorrows = useMemo(() => {
    const from = (safeGasPage - 1) * PAGE_SIZE;
    return filteredGasBorrows.slice(from, from + PAGE_SIZE);
  }, [filteredGasBorrows, safeGasPage]);

  const hasGasFilter = gasSearch || gasStatusFilter !== 'semua';
  const handleResetGasFilters = () => {
    setGasSearch('');
    setGasStatusFilter('semua');
    setGasPage(1);
  };

  // Open Gas Form
  const handleOpenGasForm = (gb = null) => {
    setGasFormError('');
    if (gb) {
      setGasEditingTarget(gb);
      setGasFormData({
        customerName: gb.customerName || '',
        customerPhone: gb.customerPhone || '',
        quantity: String(gb.quantity || 1),
        borrowDate: gb.borrowDate || todayStr,
        notes: gb.notes || '',
      });
    } else {
      setGasEditingTarget(null);
      setGasFormData({
        customerName: '',
        customerPhone: '',
        quantity: '1',
        borrowDate: todayStr,
        notes: '',
      });
    }
    setGasFormOpen(true);
  };

  // Submit Gas Form
  const handleSubmitGasForm = (e) => {
    e?.preventDefault();
    setGasFormError('');
    if (gasEditingTarget) {
      const res = updateGasBorrow(gasEditingTarget.id, {
        customerName: gasFormData.customerName,
        customerPhone: gasFormData.customerPhone,
        quantity: parseInt(gasFormData.quantity, 10),
        borrowDate: gasFormData.borrowDate,
        notes: gasFormData.notes,
      });
      if (!res.ok) { setGasFormError(res.reason); return; }
    } else {
      const res = createGasBorrow({
        customerName: gasFormData.customerName,
        customerPhone: gasFormData.customerPhone,
        quantity: parseInt(gasFormData.quantity, 10),
        borrowDate: gasFormData.borrowDate,
        notes: gasFormData.notes,
      });
      if (!res.ok) { setGasFormError(res.reason); return; }
    }
    setGasFormOpen(false);
  };

  // Open Gas Return Modal
  const handleOpenGasReturn = (gb) => {
    setGasReturnTarget(gb);
    setGasReturnError('');
    setGasReturnQty('1');
    setGasReturnDate(todayStr);
    setGasReturnNotes('');
  };

  // Submit Gas Return
  const handleSubmitGasReturn = (e) => {
    e?.preventDefault();
    setGasReturnError('');
    if (!gasReturnTarget) return;
    const res = returnGasBorrow(gasReturnTarget.id, {
      quantity: parseInt(gasReturnQty, 10),
      returnDate: gasReturnDate,
      notes: gasReturnNotes,
    });
    if (!res.ok) { setGasReturnError(res.reason); return; }
    // Update detail if open
    if (gasDetailTarget && gasDetailTarget.id === gasReturnTarget.id) {
      const updated = gasBorrows.find((g) => g.id === gasReturnTarget.id);
      if (updated) setGasDetailTarget(updated);
    }
    setGasReturnTarget(null);
  };

  const getGasStatusInfo = (status) => {
    switch (status) {
      case 'selesai': return { label: 'Selesai', color: 'bg-green-100 text-green-800' };
      case 'sebagian_kembali': return { label: 'Sebagian Kembali', color: 'bg-amber-100 text-amber-800' };
      default: return { label: 'Belum Kembali', color: 'bg-red-100 text-red-800' };
    }
  };

  // ======================= END GAS BORROWS HANDLERS =======================

  // Ekspor CSV Data Hutang Piutang
  const handleExportCSV = () => {
    const filename = `Catatan-Hutang-Piutang-${todayStr}.csv`;
    const headers = [
      'ID Catatan',
      'Jenis',
      'Nama Pihak',
      'No. Kontak',
      'Tanggal Catat',
      'Jatuh Tempo',
      'Nominal Awal (Rp)',
      'Total Dibayar (Rp)',
      'Sisa Saldo (Rp)',
      'Status',
      'Keterangan',
      'Riwayat Pembayaran',
    ];

    const rows = [headers];
    for (const d of filteredDebts) {
      const remaining = calculateDebtRemaining(d);
      const paid = calculateDebtTotalPaid(d);
      const status = computeDebtStatus(d, todayStr);
      const paymentsText = (d.payments || [])
        .map((p) => `${formatDate(p.date)}: ${rupiah(p.amount)} (${p.notes || '-'})`)
        .join(' | ');

      rows.push([
        d.id,
        d.type === 'piutang' ? 'Piutang Pelanggan' : 'Hutang Warung',
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${(d.contact || '').replace(/"/g, '""')}"`,
        d.date,
        d.dueDate || '-',
        d.amount,
        paid,
        remaining,
        getDebtStatusInfo(status).label,
        `"${(d.notes || '').replace(/"/g, '""')}"`,
        `"${paymentsText.replace(/"/g, '""')}"`,
      ]);
    }

    const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    pushToast(`Laporan CSV ${filename} berhasil diunduh`);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Halaman */}
      <PageHeader
        title="Hutang-Piutang"
        subtitle={
          mainTab === 'uang'
            ? 'Kelola pencatatan piutang pelanggan dan hutang warung ke pemasok / pihak lain.'
            : 'Catat tabung gas kosong warung yang masih dibawa pelanggan. Tanpa transaksi uang.'
        }
        action={
          <div className="flex items-center gap-2">
            {mainTab === 'uang' ? (
              <>
                <Btn
                  variant="outline"
                  size="sm"
                  icon={Download}
                  onClick={handleExportCSV}
                  disabled={filteredDebts.length === 0}
                  title="Unduh data dalam format CSV/Excel"
                >
                  Ekspor CSV
                </Btn>
                <Btn
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => handleOpenForm(null)}
                >
                  Tambah Hutang-Piutang
                </Btn>
              </>
            ) : (
              <Btn
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => handleOpenGasForm(null)}
              >
                Catat Pinjam Tabung
              </Btn>
            )}
          </div>
        }
      />

      {/* 1b. Tab Switcher Utama: Hutang-Piutang Uang vs Pinjaman Tabung Gas */}
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 w-full max-w-sm">
        <button
          type="button"
          onClick={() => setMainTab('uang')}
          className={cx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition',
            mainTab === 'uang' ? 'bg-white text-ink shadow-xs' : 'text-ink-soft hover:text-ink'
          )}
        >
          <Banknote className="h-3.5 w-3.5" />
          <span>Hutang-Piutang Uang</span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab('tabung')}
          className={cx(
            'flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition',
            mainTab === 'tabung' ? 'bg-white text-ink shadow-xs' : 'text-ink-soft hover:text-ink'
          )}
        >
          <Flame className="h-3.5 w-3.5" />
          <span>Pinjaman Tabung Gas</span>
          {gasBorrowsSummary.totalUnreturnedTubes > 0 && (
            <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-black text-white">
              {gasBorrowsSummary.totalUnreturnedTubes}
            </span>
          )}
        </button>
      </div>

      {mainTab === 'uang' ? (
        /* ============================================================ */
        /* TAB HUTANG-PIUTANG UANG                                      */
        /* ============================================================ */
        <>
      {/* 2. Empat Kartu Ringkasan Finansial */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Kartu 1: Piutang Pelanggan (Belum Diterima) */}
        <div className="card flex flex-col justify-between border-emerald-200/80 bg-emerald-50/50 p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
              Piutang Pelanggan
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ArrowDownLeft className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black text-emerald-900 tracking-tight sm:text-2xl">
              {rupiah(summary.remainingPiutang)}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-700">
              {summary.activePiutangCount} catatan aktif · Total {rupiah(summary.totalPiutangAwal)}
            </p>
          </div>
        </div>

        {/* Kartu 2: Hutang Warung (Kewajiban) */}
        <div className="card flex flex-col justify-between border-amber-200/80 bg-amber-50/50 p-4 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
              Hutang Warung
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black text-amber-900 tracking-tight sm:text-2xl">
              {rupiah(summary.remainingHutang)}
            </p>
            <p className="mt-0.5 text-[11px] text-amber-700">
              {summary.activeHutangCount} catatan aktif · Total {rupiah(summary.totalHutangAwal)}
            </p>
          </div>
        </div>

        {/* Kartu 3: Catatan Aktif */}
        <div className="card flex flex-col justify-between border-line p-4 shadow-soft bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Catatan Aktif
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <p className="text-xl font-black text-ink tracking-tight sm:text-2xl">
              {summary.activeRecordsCount}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft">
              {summary.lunasCount} catatan telah lunas ({summary.totalRecords} total)
            </p>
          </div>
        </div>

        {/* Kartu 4: Jatuh Tempo / Terlambat */}
        <div
          className={cx(
            'card flex flex-col justify-between p-4 shadow-soft',
            summary.overdueCount > 0
              ? 'border-red-300 bg-red-50/60'
              : 'border-line bg-white'
          )}
        >
          <div className="flex items-center justify-between">
            <span
              className={cx(
                'text-[11px] font-bold uppercase tracking-wider',
                summary.overdueCount > 0 ? 'text-red-700' : 'text-ink-soft'
              )}
            >
              Jatuh Tempo / Terlambat
            </span>
            <span
              className={cx(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                summary.overdueCount > 0
                  ? 'bg-red-100 text-red-600'
                  : 'bg-neutral-100 text-ink-soft'
              )}
            >
              <CalendarClock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2">
            <p
              className={cx(
                'text-xl font-black tracking-tight sm:text-2xl',
                summary.overdueCount > 0 ? 'text-red-900' : 'text-ink'
              )}
            >
              {summary.overdueCount}
            </p>
            <p
              className={cx(
                'mt-0.5 text-[11px]',
                summary.overdueCount > 0 ? 'font-semibold text-red-700' : 'text-ink-soft'
              )}
            >
              {summary.overdueCount > 0
                ? 'Melewati batas tempo pembayaran'
                : 'Semua tepat waktu / aman'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Tab Filter & Kontrol Pencarian */}
      <div className="card space-y-4 p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tab Kategori / Mode */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-neutral-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTypeTab('semua');
                setPage(1);
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition',
                typeTab === 'semua'
                  ? 'bg-white text-ink shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              )}
            >
              Semua ({debts.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeTab('piutang');
                setPage(1);
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5',
                typeTab === 'piutang'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-800 hover:bg-emerald-100/50'
              )}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              <span>Piutang Pelanggan</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeTab('hutang');
                setPage(1);
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5',
                typeTab === 'hutang'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-800 hover:bg-amber-100/50'
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>Hutang Warung</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeTab('rekap_pihak');
                setPage(1);
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5',
                typeTab === 'rekap_pihak'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              )}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Rekap per Pihak ({partySummaries.length})</span>
            </button>
          </div>

          {/* Filter Status (Hanya aktif saat bukan tab Rekap Pihak) */}
          {typeTab !== 'rekap_pihak' && (
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="w-48 text-xs font-semibold"
              >
                <option value="semua">Semua Status</option>
                <option value="belum_lunas">Belum Lunas</option>
                <option value="sebagian">Sebagian Dibayar</option>
                <option value="terlambat">Jatuh Tempo / Terlambat</option>
                <option value="lunas">Lunas</option>
              </Select>
            </div>
          )}
        </div>

        {/* Baris Pencarian & Reset */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={
                typeTab === 'rekap_pihak'
                  ? 'Cari nama pihak / pelanggan / toko...'
                  : 'Cari nama pihak, catatan, kontak...'
              }
              className="w-full text-xs"
            />
          </div>

          {hasFilter && (
            <Btn
              variant="ghost"
              size="sm"
              icon={FilterX}
              onClick={handleResetFilters}
              className="text-rose-600 hover:bg-rose-50"
            >
              Reset Filter
            </Btn>
          )}
        </div>
      </div>

      {/* 4. TAMPILAN KONTEN UTAMA */}
      {typeTab === 'rekap_pihak' ? (
        /* ================= TAMPILAN REKAP PER PIHAK ================= */
        <div className="space-y-4">
          {filteredParties.length === 0 ? (
            <div className="card p-8">
              <EmptyState
                icon={Users}
                title="Pihak tidak ditemukan"
                description={
                  search
                    ? `Tidak ada pelanggan atau pemasok yang cocok dengan kata kunci "${search}".`
                    : 'Belum ada pihak yang tercatat memiliki hutang atau piutang.'
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredParties.map((p) => {
                const hasReceivable = p.remainingPiutang > 0;
                const hasPayable = p.remainingHutang > 0;
                return (
                  <div
                    key={p.displayName}
                    className="card flex flex-col justify-between border-line p-4 shadow-soft transition hover:border-primary/40 bg-white"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-ink break-words leading-snug" title={p.displayName}>
                            {p.displayName}
                          </p>
                          {p.contact && (
                            <p className="flex items-center gap-1 text-[11px] text-ink-soft mt-0.5">
                              <Phone className="h-3 w-3" />
                              <span>{p.contact}</span>
                            </p>
                          )}
                        </div>
                        <span className="rounded-lg bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-ink-soft">
                          {p.recordsCount} catatan
                        </span>
                      </div>

                      <div className="mt-3 space-y-1.5 rounded-xl bg-neutral-50 p-2.5 text-xs">
                        <div className="flex items-center justify-between text-emerald-800">
                          <span className="text-[11px] font-medium flex items-center gap-1">
                            <ArrowDownLeft className="h-3 w-3" /> Sisa Piutang:
                          </span>
                          <span className="font-bold">{rupiah(p.remainingPiutang)}</span>
                        </div>
                        <div className="flex items-center justify-between text-amber-800">
                          <span className="text-[11px] font-medium flex items-center gap-1">
                            <ArrowUpRight className="h-3 w-3" /> Sisa Hutang:
                          </span>
                          <span className="font-bold">{rupiah(p.remainingHutang)}</span>
                        </div>
                      </div>

                      {p.overdueCount > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-200">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{p.overdueCount} catatan telah jatuh tempo</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-line flex items-center justify-between">
                      <div className="text-[11px]">
                        <span className="text-ink-soft">Posisi Saldo: </span>
                        <span
                          className={cx(
                            'font-black',
                            p.netBalance > 0
                              ? 'text-emerald-700'
                              : p.netBalance < 0
                              ? 'text-amber-700'
                              : 'text-ink-soft'
                          )}
                        >
                          {p.netBalance > 0
                            ? `+${rupiah(p.netBalance)} (Kita Piutang)`
                            : p.netBalance < 0
                            ? `-${rupiah(Math.abs(p.netBalance))} (Kita Hutang)`
                            : 'Lunas Seimbang'}
                        </span>
                      </div>
                      <Btn
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setSearch(p.displayName);
                          setTypeTab('semua');
                        }}
                      >
                        Lihat Rincian
                      </Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= TAMPILAN TABEL CATATAN ================= */
        <div className="space-y-4">
          {filteredDebts.length === 0 ? (
            <div className="card p-8">
              <EmptyState
                icon={HandCoins}
                title={hasFilter ? 'Catatan tidak ditemukan' : 'Belum ada catatan hutang-piutang'}
                description={
                  hasFilter
                    ? 'Coba atur ulang kata kunci pencarian atau filter status.'
                    : 'Gunakan tombol "Tambah Catatan" di atas untuk mencatat piutang pelanggan atau hutang warung.'
                }
                action={
                  hasFilter ? (
                    <Btn variant="outline" size="sm" onClick={handleResetFilters}>
                      Reset Filter
                    </Btn>
                  ) : (
                    <Btn
                      variant="primary"
                      size="sm"
                      icon={Plus}
                      onClick={() => handleOpenForm(null)}
                    >
                      Tambah Catatan Pertama
                    </Btn>
                  )
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden shadow-soft">
              <TableWrap>
                <thead>
                  <tr className="border-b border-line bg-neutral-50/70 text-left text-xs font-bold text-ink-soft">
                    <TH>Pihak &amp; Jenis</TH>
                    <TH>Tanggal &amp; Tempo</TH>
                    <TH className="text-right">Nominal Awal</TH>
                    <TH className="text-right">Terbayar</TH>
                    <TH className="text-right">Sisa Saldo</TH>
                    <TH className="text-center">Status</TH>
                    <TH className="text-center">Aksi</TH>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-xs">
                  {pagedDebts.map((debt) => {
                    const remaining = calculateDebtRemaining(debt);
                    const totalPaid = calculateDebtTotalPaid(debt);
                    const status = computeDebtStatus(debt, todayStr);
                    const statusInfo = getDebtStatusInfo(status);
                    const isLunas = status === 'lunas';
                    const isOverdue = status === 'terlambat';

                    return (
                      <tr key={debt.id} className="transition hover:bg-neutral-50/60">
                        {/* Pihak & Jenis */}
                        <TD>
                          <div className="flex items-start gap-2.5">
                            <span
                              className={cx(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
                                debt.type === 'piutang'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              )}
                              title={debt.type === 'piutang' ? 'Piutang Pelanggan' : 'Hutang Warung'}
                            >
                              {debt.type === 'piutang' ? (
                                <ArrowDownLeft className="h-4 w-4" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-ink">{debt.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span
                                  className={cx(
                                    'inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                                    debt.type === 'piutang'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  )}
                                >
                                  {debt.type === 'piutang' ? 'Piutang' : 'Hutang'}
                                </span>
                                {debt.contact && (
                                  <span className="text-[11px] text-ink-soft">
                                    · {debt.contact}
                                  </span>
                                )}
                              </div>
                              {debt.notes && (
                                <p className="text-[11px] text-ink-soft break-words leading-tight mt-0.5" title={debt.notes}>
                                  {debt.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </TD>

                        {/* Tanggal & Jatuh Tempo */}
                        <TD>
                          <div className="space-y-0.5">
                            <p className="text-ink font-medium">{formatDateId(debt.date)}</p>
                            {debt.dueDate ? (
                              <p
                                className={cx(
                                  'text-[11px] flex items-center gap-1 font-semibold',
                                  isOverdue ? 'text-red-600' : 'text-ink-soft'
                                )}
                              >
                                <Clock className="h-3 w-3" />
                                <span>Tempo: {formatDateId(debt.dueDate)}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-ink-soft">Tanpa tempo</p>
                            )}
                          </div>
                        </TD>

                        {/* Nominal Awal */}
                        <TD className="text-right font-medium text-ink">
                          {rupiah(debt.amount)}
                        </TD>

                        {/* Terbayar */}
                        <TD className="text-right">
                          <p className="font-semibold text-emerald-700">{rupiah(totalPaid)}</p>
                          <p className="text-[10px] text-ink-soft">
                            {(debt.payments || []).length}x pembayaran
                          </p>
                        </TD>

                        {/* Sisa Saldo */}
                        <TD className="text-right">
                          <p
                            className={cx(
                              'text-sm font-black',
                              isLunas
                                ? 'text-emerald-700'
                                : isOverdue
                                ? 'text-red-700'
                                : 'text-ink'
                            )}
                          >
                            {rupiah(remaining)}
                          </p>
                        </TD>

                        {/* Status */}
                        <TD className="text-center">
                          <span
                            className={cx(
                              'inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border',
                              statusInfo.color
                            )}
                          >
                            {statusInfo.label}
                          </span>
                        </TD>

                        {/* Aksi */}
                        <TD className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {!isLunas && (
                              <Btn
                                variant="soft"
                                size="sm"
                                icon={Banknote}
                                onClick={() => handleOpenPayment(debt)}
                                title="Catat pembayaran cicilan / pelunasan"
                                className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                              >
                                Bayar
                              </Btn>
                            )}
                            <Btn
                              variant="ghost"
                              size="sm"
                              icon={Eye}
                              onClick={() => setDetailTarget(debt)}
                              title="Lihat rincian & riwayat pembayaran"
                            />
                            <Btn
                              variant="ghost"
                              size="sm"
                              icon={Edit2}
                              onClick={() => handleOpenForm(debt)}
                              title="Edit catatan"
                            />
                            <Btn
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              onClick={() => setDeleteTarget(debt)}
                              className="text-rose-600 hover:bg-rose-50"
                              title="Hapus catatan"
                            />
                          </div>
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>

              {/* Pagination */}
              {filteredDebts.length > PAGE_SIZE && (
                <div className="border-t border-line p-3">
                  <Pagination
                    page={safePage}
                    totalPages={totalPages}
                    total={filteredDebts.length}
                    from={(safePage - 1) * PAGE_SIZE + 1}
                    to={Math.min(safePage * PAGE_SIZE, filteredDebts.length)}
                    onPage={setPage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MODAL FORM: TAMBAH / EDIT CATATAN                                      */}
      {/* ========================================================================= */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingTarget ? 'Edit Catatan Hutang-Piutang' : 'Tambah Catatan Baru'}
      >
        <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
          {formError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Pilihan Jenis (Piutang vs Hutang) */}
          <Field label="Jenis Catatan">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'piutang' }))}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-xl border p-3 font-bold transition text-xs',
                  formData.type === 'piutang'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-xs'
                    : 'border-line bg-white text-ink-soft hover:bg-neutral-50'
                )}
              >
                <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                <span>Piutang (Pelanggan)</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, type: 'hutang' }))}
                className={cx(
                  'flex items-center justify-center gap-2 rounded-xl border p-3 font-bold transition text-xs',
                  formData.type === 'hutang'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-line bg-white text-ink-soft hover:bg-neutral-50'
                )}
              >
                <ArrowUpRight className="h-4 w-4 text-amber-600" />
                <span>Hutang (Warung)</span>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              {formData.type === 'piutang'
                ? 'Pelanggan mengambil barang dan belum membayar (uang warung di luar).'
                : 'Warung mengambil barang dari supplier/pihak lain dan belum melunasi.'}
            </p>
          </Field>

          {/* Nama Pihak */}
          <Field label="Nama Pihak (Pelanggan / Pemasok)" required>
            <Input
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Contoh: Pak Budi, Toko Makmur, dll."
              required
            />
          </Field>

          {/* Kontak / Telepon */}
          <Field label="Nomor Kontak / WhatsApp (Opsional)">
            <Input
              value={formData.contact}
              onChange={(e) => setFormData((prev) => ({ ...prev, contact: e.target.value }))}
              placeholder="Contoh: 081234567890"
            />
          </Field>

          {/* Nominal Pokok */}
          <Field label="Nominal Pokok (Rp)" required>
            <Input
              type="number"
              min="1"
              step="1"
              value={formData.amount}
              onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Contoh: 150000"
              required
            />
          </Field>

          {/* Tanggal Pencatatan & Jatuh Tempo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Tanggal Pencatatan" required>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </Field>

            <Field label="Jatuh Tempo (Opsional)">
              <Input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
              />
            </Field>
          </div>

          {/* Keterangan */}
          <Field label="Keterangan / Keperluan Barang">
            <Textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Contoh: Ambil beras 5kg dan minyak goreng 2L belum bayar..."
            />
          </Field>

          {/* Tombol Aksi */}
          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Btn variant="outline" size="sm" onClick={() => setFormOpen(false)}>
              Batal
            </Btn>
            <Btn variant="primary" size="sm" type="submit">
              {editingTarget ? 'Simpan Perubahan' : 'Tambah Catatan'}
            </Btn>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. MODAL PEMBAYARAN CICILAN / PELUNASAN                                   */}
      {/* ========================================================================= */}
      <Modal
        open={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        title="Catat Pembayaran / Cicilan"
      >
        {paymentTarget && (
          <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
            {payError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{payError}</span>
              </div>
            )}

            {/* Info Rincian Target */}
            <div className="rounded-2xl border border-line bg-neutral-50 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-ink">{paymentTarget.name}</p>
                  <p className="text-[11px] text-ink-soft">
                    {paymentTarget.type === 'piutang' ? 'Piutang Pelanggan' : 'Hutang Warung'} ·{' '}
                    {formatDateId(paymentTarget.date)}
                  </p>
                </div>
                <span
                  className={cx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                    getDebtStatusInfo(computeDebtStatus(paymentTarget, todayStr)).color
                  )}
                >
                  {getDebtStatusInfo(computeDebtStatus(paymentTarget, todayStr)).label}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-center">
                <div>
                  <p className="text-[10px] text-ink-soft">Nominal Awal</p>
                  <p className="font-bold text-ink">{rupiah(paymentTarget.amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-soft">Telah Dibayar</p>
                  <p className="font-bold text-emerald-700">
                    {rupiah(calculateDebtTotalPaid(paymentTarget))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-soft">Sisa Tagihan</p>
                  <p className="font-black text-rose-700">
                    {rupiah(calculateDebtRemaining(paymentTarget))}
                  </p>
                </div>
              </div>
            </div>

            {/* Input Nominal Pembayaran */}
            <Field label="Nominal Pembayaran (Rp)" required>
              <Input
                type="number"
                min="1"
                max={calculateDebtRemaining(paymentTarget)}
                step="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Masukkan jumlah yang dibayarkan..."
                required
              />

              {/* Preset Tombol Cepat */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {QUICK_PAY_PRESETS.filter(
                  (val) => val <= calculateDebtRemaining(paymentTarget)
                ).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPayAmount(String(val))}
                    className="rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary hover:bg-primary-soft transition"
                  >
                    +{rupiah(val)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPayAmount(String(calculateDebtRemaining(paymentTarget)))}
                  className="rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 text-[11px] font-bold hover:bg-emerald-200 transition"
                >
                  Lunaskan Semua ({rupiah(calculateDebtRemaining(paymentTarget))})
                </button>
              </div>
            </Field>

            {/* Live Preview Sisa Saldo */}
            {Number(payAmount) > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-blue-900">
                    Sisa Saldo Setelah Pembayaran Ini:
                  </p>
                  <p className="text-sm font-black text-blue-950">
                    {rupiah(
                      Math.max(
                        0,
                        calculateDebtRemaining(paymentTarget) - Number(payAmount)
                      )
                    )}
                  </p>
                </div>
                {Number(payAmount) >= calculateDebtRemaining(paymentTarget) && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-lg">
                    <CheckCircle2 className="h-4 w-4" /> Lunas Penuh
                  </span>
                )}
              </div>
            )}

            {/* Tanggal & Keterangan Pembayaran */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tanggal Pembayaran" required>
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </Field>

              <Field label="Metode / Catatan">
                <Input
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Contoh: Tunai, Transfer BCA, dll."
                />
              </Field>
            </div>

            {/* Tombol Simpan */}
            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Btn variant="outline" size="sm" onClick={() => setPaymentTarget(null)}>
                Batal
              </Btn>
              <Btn variant="primary" size="sm" type="submit" icon={CheckCircle2}>
                Simpan Pembayaran
              </Btn>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 7. MODAL DETAIL & RIWAYAT PEMBAYARAN                                      */}
      {/* ========================================================================= */}
      <Modal
        open={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title="Detail & Riwayat Pembayaran"
      >
        {detailTarget && (
          <div className="space-y-4 text-xs">
            {/* Header Ringkasan Target */}
            <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                        detailTarget.type === 'piutang'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {detailTarget.type === 'piutang' ? 'Piutang Pelanggan' : 'Hutang Warung'}
                    </span>
                    <span
                      className={cx(
                        'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                        getDebtStatusInfo(computeDebtStatus(detailTarget, todayStr)).color
                      )}
                    >
                      {getDebtStatusInfo(computeDebtStatus(detailTarget, todayStr)).label}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-black text-ink">{detailTarget.name}</h3>
                  {detailTarget.contact && (
                    <p className="flex items-center gap-1 text-[11px] text-ink-soft mt-0.5">
                      <Phone className="h-3 w-3" />
                      <span>{detailTarget.contact}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Rincian Finansial 3 Kolom */}
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 p-3 text-center border border-line/60">
                <div>
                  <p className="text-[10px] text-ink-soft uppercase font-semibold">Nominal Pokok</p>
                  <p className="text-sm font-bold text-ink mt-0.5">{rupiah(detailTarget.amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-soft uppercase font-semibold">Total Terbayar</p>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">
                    {rupiah(calculateDebtTotalPaid(detailTarget))}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-ink-soft uppercase font-semibold">Sisa Tagihan</p>
                  <p className="text-sm font-black text-rose-700 mt-0.5">
                    {rupiah(calculateDebtRemaining(detailTarget))}
                  </p>
                </div>
              </div>

              {/* Metadata Tanggal & Keterangan */}
              <div className="space-y-1 text-[11px] text-ink-soft border-t border-line/60 pt-2">
                <p>
                  <span className="font-semibold text-ink">Tanggal Dicatat:</span>{' '}
                  {formatDateId(detailTarget.date)}
                </p>
                <p>
                  <span className="font-semibold text-ink">Batas Jatuh Tempo:</span>{' '}
                  {detailTarget.dueDate ? formatDateId(detailTarget.dueDate) : 'Tidak ditentukan'}
                </p>
                {detailTarget.notes && (
                  <p>
                    <span className="font-semibold text-ink">Keterangan:</span> {detailTarget.notes}
                  </p>
                )}
              </div>
            </div>

            {/* Riwayat Pembayaran (Cicilan) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-sm text-ink flex items-center gap-1.5">
                  <History className="h-4 w-4 text-primary" />
                  <span>Riwayat Pembayaran Cicilan ({(detailTarget.payments || []).length})</span>
                </p>
                {calculateDebtRemaining(detailTarget) > 0 && (
                  <Btn
                    variant="soft"
                    size="sm"
                    icon={Plus}
                    onClick={() => handleOpenPayment(detailTarget)}
                  >
                    Bayar Cicilan
                  </Btn>
                )}
              </div>

              {(detailTarget.payments || []).length === 0 ? (
                <div className="rounded-2xl border border-line bg-neutral-50 p-6 text-center text-ink-soft">
                  <Banknote className="h-8 w-8 mx-auto text-ink-soft/40 mb-1" />
                  <p className="font-semibold">Belum ada riwayat pembayaran.</p>
                  <p className="text-[11px] mt-0.5">
                    Catatan ini belum pernah dicicil atau dilunasi.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-line">
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50 border-b border-line text-ink-soft font-bold text-left">
                      <tr>
                        <th className="p-2.5">Tanggal</th>
                        <th className="p-2.5 text-right">Nominal</th>
                        <th className="p-2.5">Catatan</th>
                        <th className="p-2.5 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {detailTarget.payments.map((p, idx) => (
                        <tr key={p.id || idx} className="hover:bg-neutral-50/50">
                          <TD className="font-medium text-ink">{formatDateId(p.date)}</TD>
                          <TD className="text-right font-bold text-emerald-700">
                            {rupiah(p.amount)}
                          </TD>
                          <TD className="text-ink-soft">
                            {p.notes || '-'}
                            {p.operatorName && (
                              <span className="text-[10px] block text-ink-soft/70">
                                Dicatat: {p.operatorName}
                              </span>
                            )}
                          </TD>
                          <TD className="text-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Hapus riwayat pembayaran sebesar ${rupiah(p.amount)}?`
                                  )
                                ) {
                                  deleteDebtPayment(detailTarget.id, p.id);
                                  const updated = debts.find((d) => d.id === detailTarget.id);
                                  if (updated) setDetailTarget(updated);
                                }
                              }}
                              className="rounded p-1 text-ink-soft hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Hapus riwayat pembayaran ini"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Tombol Tutup */}
            <div className="flex justify-end pt-2 border-t border-line">
              <Btn variant="outline" size="sm" onClick={() => setDetailTarget(null)}>
                Tutup
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 8. MODAL KONFIRMASI HAPUS                                                 */}
      {/* ========================================================================= */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteDebt(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Hapus Catatan Hutang-Piutang"
        message={`Apakah Anda yakin ingin menghapus catatan ${
          deleteTarget?.type === 'piutang' ? 'piutang' : 'hutang'
        } atas nama "${deleteTarget?.name}" senilai ${rupiah(
          deleteTarget?.amount || 0
        )}? Tindakan ini akan menghapus catatan dan riwayat pembayarannya.`}
        confirmText="Hapus Permanen"
        danger
      />
    </div>
  );
}
