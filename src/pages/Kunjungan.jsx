import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FilterX,
  History,
  ListFilter,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  addDays,
  formatDate,
  formatDateId,
  formatDateTime,
  getDayNameId,
  getLocalDateString,
  uid,
} from '../utils/format';
import {
  Btn,
  Chip,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  cx,
} from '../components/UI';

const VISIT_TYPES = [
  { id: 'supplier', label: 'Supplier / Pemasok', icon: Store, color: 'text-violet-600 bg-violet-50 border-violet-200' },
  { id: 'pengiriman', label: 'Pengambilan / Pengiriman', icon: Truck, color: 'text-sky-600 bg-sky-50 border-sky-200' },
  { id: 'keperluan_usaha', label: 'Keperluan Usaha', icon: Briefcase, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { id: 'lainnya', label: 'Lainnya', icon: Building2, color: 'text-amber-600 bg-amber-50 border-amber-200' },
];

export default function Kunjungan() {
  const {
    stores,
    visits,
    todayVisits,
    overdueVisits,
    upcomingVisits,
    completedVisits,
    cancelledVisits,
    visitReminders,
    getVisitComputedStatus,
    createVisit,
    updateVisit,
    completeVisit,
    cancelVisit,
    rescheduleVisit,
    deleteVisit,
    pushToast,
  } = useApp();

  const todayStr = getLocalDateString();

  // Filter states
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('semua'); // 'semua' | 'hari_ini' | 'minggu_ini' | 'bulan_ini'
  const [statusFilter, setStatusFilter] = useState('semua'); // 'semua' | 'scheduled' | 'overdue' | 'completed' | 'cancelled'
  const [typeFilter, setTypeFilter] = useState('semua'); // 'semua' | 'supplier' | 'pengiriman' | 'keperluan_usaha' | 'lainnya'
  const [storeFilter, setStoreFilter] = useState('semua');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'calendar'

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Calendar state
  const [calDate, setCalDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedCalDay, setSelectedCalDay] = useState(todayStr);

  // Reset all filters
  const resetFilters = () => {
    setSearch('');
    setPeriodFilter('semua');
    setStatusFilter('semua');
    setTypeFilter('semua');
    setStoreFilter('semua');
  };

  const hasFilter =
    search.trim() !== '' ||
    periodFilter !== 'semua' ||
    statusFilter !== 'semua' ||
    typeFilter !== 'semua' ||
    storeFilter !== 'semua';

  // Filtered visits
  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    // Start & end of week (Senin - Minggu)
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Senin, 6=Minggu
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const startOfWeekStr = getLocalDateString(startOfWeek);
    const endOfWeekStr = addDays(startOfWeekStr, 6);

    // Start & end of month
    const startOfMonthStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(currYear, currMonth + 1, 0).getDate();
    const endOfMonthStr = `${currYear}-${String(currMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    return visits.filter((v) => {
      const computedStatus = getVisitComputedStatus(v);

      // Filter status
      if (statusFilter !== 'semua') {
        if (statusFilter === 'scheduled' && v.status !== 'scheduled') return false;
        if (statusFilter === 'overdue' && computedStatus !== 'overdue') return false;
        if (statusFilter === 'completed' && v.status !== 'completed') return false;
        if (statusFilter === 'cancelled' && v.status !== 'cancelled') return false;
      }

      // Filter jenis
      if (typeFilter !== 'semua' && v.type !== typeFilter) return false;

      // Filter toko utama (supplier)
      if (storeFilter !== 'semua') {
        if (v.storeId !== storeFilter) return false;
      }

      // Filter periode
      if (periodFilter === 'hari_ini') {
        if (v.date !== todayStr) return false;
      } else if (periodFilter === 'minggu_ini') {
        if (v.date < startOfWeekStr || v.date > endOfWeekStr) return false;
      } else if (periodFilter === 'bulan_ini') {
        if (v.date < startOfMonthStr || v.date > endOfMonthStr) return false;
      }

      // Filter search
      if (!q) return true;
      const name = (v.name || '').toLowerCase();
      const agenda = (v.agenda || '').toLowerCase();
      const location = (v.location || '').toLowerCase();
      const notes = (v.notes || '').toLowerCase();
      const outcome = (v.completion?.outcome || '').toLowerCase();
      const sName = (v.storeName || '').toLowerCase();
      const slName = (v.salesName || '').toLowerCase();
      return (
        name.includes(q) ||
        agenda.includes(q) ||
        location.includes(q) ||
        notes.includes(q) ||
        outcome.includes(q) ||
        sName.includes(q) ||
        slName.includes(q)
      );
    }).sort((a, b) => {
      // Urutkan: Terjadwal aktif / terlambat terlebih dahulu berdasarkan tanggal, kemudian riwayat
      if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
      if (a.status !== 'scheduled' && b.status === 'scheduled') return 1;
      return (a.date || '').localeCompare(b.date || '');
    });
  }, [visits, search, periodFilter, statusFilter, typeFilter, storeFilter, todayStr, getVisitComputedStatus]);

  // Calendar computation
  const calDays = useMemo(() => {
    const { year, month } = calDate;
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0=Min, 1=Sen
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Map offset: let's start week on Monday (Senin=0 .. Minggu=6)
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const cells = [];

    // Prev month padding
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = month === 0 ? 12 : month;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr, isCurrentMonth: true });
    }

    // Next month padding (complete grid to multiple of 7)
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const m = month === 11 ? 1 : month + 2;
        const y = month === 11 ? year + 1 : year;
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ day: d, dateStr, isCurrentMonth: false });
      }
    }

    return cells;
  }, [calDate]);

  // Map visits per date for calendar dot indicators
  const visitsByDate = useMemo(() => {
    const map = new Map();
    for (const v of visits) {
      const d = v.date;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(v);
    }
    return map;
  }, [visits]);

  // Visits on selected calendar day
  const visitsOnSelectedDay = useMemo(() => {
    return visitsByDate.get(selectedCalDay) || [];
  }, [visitsByDate, selectedCalDay]);

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  const prevMonth = () => {
    setCalDate((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  const nextMonth = () => {
    setCalDate((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  const jumpToToday = () => {
    const d = new Date();
    setCalDate({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedCalDay(todayStr);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ============================================================ */}
      {/* 1. HEADER HALAMAN & TOMBOL TAMBAH JADWAL                     */}
      {/* ============================================================ */}
      <PageHeader
        title="Kunjungan"
        subtitle="Kelola jadwal kunjungan sales/supplier, agenda warung, catatan hasil, dan pengulangan berkala."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            icon={Plus}
            onClick={() => {
              setEditingTarget(null);
              setFormOpen(true);
            }}
          >
            Tambah Kunjungan
          </Btn>
        </div>
      </PageHeader>

      {/* ============================================================ */}
      {/* 2. PENGINGAT INTERNAL KUNJUNGAN HARI INI & OVERDUE           */}
      {/* ============================================================ */}
      {visitReminders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs shadow-soft transition">
          <div className="flex items-start gap-3 text-amber-950">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-200/80 text-amber-800">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="font-extrabold text-sm text-amber-950">
                Pengingat Agenda Kunjungan Warung
              </p>
              <p className="mt-0.5 text-xs text-amber-900/90 leading-relaxed">
                Terdapat <b>{todayVisits.length} kunjungan hari ini</b>
                {overdueVisits.length > 0 ? (
                  <> dan <span className="font-bold text-rose-700">{overdueVisits.length} kunjungan melewati jadwal (terlambat)</span> yang memerlukan penanganan atau penjadwalan ulang.</>
                ) : (
                  <> yang siap dilaksanakan sesuai jadwal.</>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusFilter(overdueVisits.length > 0 ? 'overdue' : 'scheduled');
              setPeriodFilter(overdueVisits.length > 0 ? 'semua' : 'hari_ini');
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-200/90 px-3.5 py-1.5 font-bold text-amber-950 hover:bg-amber-300 transition text-xs shadow-xs"
          >
            Tampilkan Agenda Ini <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. 4 KARTU RINGKASAN AKTIVITAS KUNJUNGAN                      */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Hari Ini */}
        <button
          type="button"
          onClick={() => {
            setPeriodFilter('hari_ini');
            setStatusFilter('scheduled');
          }}
          className={cx(
            'card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft',
            periodFilter === 'hari_ini' ? 'ring-2 ring-primary border-primary' : ''
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Hari Ini
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Calendar className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-black text-ink">{todayVisits.length}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Agenda aktif hari ini</p>
          </div>
        </button>

        {/* Terlambat (Overdue) */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter('overdue');
            setPeriodFilter('semua');
          }}
          className={cx(
            'card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft',
            statusFilter === 'overdue' ? 'ring-2 ring-rose-500 border-rose-500' : ''
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
              Terlambat
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-black text-rose-700">{overdueVisits.length}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Melewati tanggal</p>
          </div>
        </button>

        {/* Mendatang */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter('scheduled');
            setPeriodFilter('semua');
          }}
          className={cx(
            'card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft',
            statusFilter === 'scheduled' && periodFilter === 'semua' ? 'ring-2 ring-sky-500 border-sky-500' : ''
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Mendatang
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-black text-sky-700">{upcomingVisits.length}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Jadwal yang akan datang</p>
          </div>
        </button>

        {/* Selesai Dilaksanakan */}
        <button
          type="button"
          onClick={() => {
            setStatusFilter('completed');
            setPeriodFilter('semua');
          }}
          className={cx(
            'card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft',
            statusFilter === 'completed' ? 'ring-2 ring-emerald-500 border-emerald-500' : ''
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Selesai
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2.5">
            <p className="text-2xl font-black text-emerald-700">{completedVisits.length}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">Riwayat terlaksana</p>
          </div>
        </button>
      </div>

      {/* ============================================================ */}
      {/* 4. FILTER BAR & TAMPILAN VIEW (LIST / KALENDER)             */}
      {/* ============================================================ */}
      <div className="card p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama pihak, agenda, lokasi, hasil..."
              className="w-full sm:w-64"
            />

            {/* Filter Periode */}
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="input text-xs py-2 px-3 w-auto min-w-[9rem]"
            >
              <option value="semua">Semua Periode</option>
              <option value="hari_ini">Hari Ini</option>
              <option value="minggu_ini">Minggu Ini</option>
              <option value="bulan_ini">Bulan Ini</option>
            </select>

            {/* Filter Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input text-xs py-2 px-3 w-auto min-w-[9rem]"
            >
              <option value="semua">Semua Status</option>
              <option value="scheduled">Terjadwal Aktif</option>
              <option value="overdue">Terlambat (Overdue)</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Dibatalkan</option>
            </select>

            {/* Filter Jenis */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input text-xs py-2 px-3 w-auto min-w-[9rem]"
            >
              <option value="semua">Semua Jenis</option>
              {VISIT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {/* Filter Toko Utama (Supplier) */}
            {stores.length > 0 && (
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="input text-xs py-2 px-3 w-auto min-w-[9rem]"
              >
                <option value="semua">Semua Supplier</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    🏪 {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle: List vs Calendar */}
            <div className="flex rounded-xl border border-line bg-surface/50 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg py-1 px-3 font-bold transition',
                  viewMode === 'list'
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                )}
              >
                <ListFilter className="h-3.5 w-3.5" />
                Daftar
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={cx(
                  'flex items-center gap-1.5 rounded-lg py-1 px-3 font-bold transition',
                  viewMode === 'calendar'
                    ? 'bg-primary text-white shadow-soft'
                    : 'text-ink-soft hover:text-ink'
                )}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Kalender
              </button>
            </div>

            {hasFilter && (
              <Btn size="sm" variant="ghost" icon={FilterX} onClick={resetFilters}>
                Reset
              </Btn>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5A. VIEW MODE: KALENDER BULANAN INTERAKTIF                   */}
      {/* ============================================================ */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            {/* Kalender Header: Navigasi Bulan */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <CalendarDays className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-ink">
                    {monthNames[calDate.month]} {calDate.year}
                  </h3>
                  <p className="text-[11px] text-ink-soft">
                    Pilih tanggal untuk melihat jadwal dan agenda pada hari tersebut.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:bg-primary-soft transition"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-xl border border-line bg-white p-2 text-ink hover:bg-primary-soft transition"
                  title="Bulan sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-xl border border-line bg-white p-2 text-ink hover:bg-primary-soft transition"
                  title="Bulan berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Nama Hari (Senin - Minggu) */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-soft pb-2 border-b border-line/50">
              <span>Sen</span>
              <span>Sel</span>
              <span>Rab</span>
              <span>Kam</span>
              <span>Jum</span>
              <span className="text-amber-700">Sab</span>
              <span className="text-rose-700">Min</span>
            </div>

            {/* Grid Tanggal Kalender */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-2">
              {calDays.map((c, idx) => {
                const dayVisits = visitsByDate.get(c.dateStr) || [];
                const isSelected = selectedCalDay === c.dateStr;
                const isToday = c.dateStr === todayStr;
                const hasOverdue = dayVisits.some((v) => v.status === 'scheduled' && v.date < todayStr);
                const hasScheduled = dayVisits.some((v) => v.status === 'scheduled');

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCalDay(c.dateStr)}
                    className={cx(
                      'relative flex flex-col items-center justify-between rounded-xl p-2 min-h-[58px] sm:min-h-[70px] border transition text-left',
                      !c.isCurrentMonth
                        ? 'opacity-35 bg-surface/30 border-transparent text-ink-soft'
                        : isSelected
                        ? 'bg-primary-soft/80 border-primary ring-2 ring-primary/30 text-ink'
                        : isToday
                        ? 'bg-amber-50/60 border-amber-300 text-ink'
                        : 'bg-white border-line/60 hover:border-primary/40 text-ink'
                    )}
                  >
                    <span
                      className={cx(
                        'text-xs font-black flex h-6 w-6 items-center justify-center rounded-lg',
                        isToday
                          ? 'bg-amber-500 text-white'
                          : isSelected
                          ? 'bg-primary text-white'
                          : ''
                      )}
                    >
                      {c.day}
                    </span>

                    {/* Indikator Titik Kunjungan */}
                    {dayVisits.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {hasOverdue && (
                          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" title="Ada jadwal terlambat" />
                        )}
                        {hasScheduled && !hasOverdue && (
                          <span className="h-2 w-2 rounded-full bg-primary" title="Ada jadwal kunjungan" />
                        )}
                        <span className="text-[10px] font-bold text-ink-soft">
                          {dayVisits.length}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel Rincian Hari yang Dipilih di Kalender */}
          <div className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Agenda Tanggal Terpilih
                </p>
                <h4 className="text-base font-extrabold text-ink">
                  {formatDateId(selectedCalDay)}
                </h4>
              </div>
              <Btn
                size="sm"
                icon={Plus}
                onClick={() => {
                  setEditingTarget({ date: selectedCalDay });
                  setFormOpen(true);
                }}
              >
                Tambah di Tanggal Ini
              </Btn>
            </div>

            <div className="mt-3.5">
              {visitsOnSelectedDay.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-soft">
                  Tidak ada agenda kunjungan yang tercatat pada tanggal ini.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visitsOnSelectedDay.map((v) => (
                    <VisitCard
                      key={v.id}
                      visit={v}
                      computedStatus={getVisitComputedStatus(v)}
                      onDetail={() => setDetailTarget(v)}
                      onEdit={() => {
                        setEditingTarget(v);
                        setFormOpen(true);
                      }}
                      onComplete={() => setCompletionTarget(v)}
                      onReschedule={() => setRescheduleTarget(v)}
                      onCancel={() => setCancelTarget(v)}
                      onDelete={() => setDeleteTarget(v)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5B. VIEW MODE: DAFTAR KUNJUNGAN (LIST VIEW)                 */}
      {/* ============================================================ */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {filteredVisits.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={CalendarClock}
                title={hasFilter ? 'Kunjungan tidak ditemukan' : 'Belum ada jadwal kunjungan'}
                description={
                  hasFilter
                    ? 'Coba ubah kata kunci pencarian atau sesuaikan pilihan filter status dan periode.'
                    : 'Jadwalkan kunjungan pertama Anda untuk pemasok barang, agenda pengiriman, atau keperluan usaha warung.'
                }
                action={
                  hasFilter ? (
                    <Btn variant="soft" size="sm" onClick={resetFilters}>
                      Reset Filter
                    </Btn>
                  ) : (
                    <Btn
                      icon={Plus}
                      size="sm"
                      onClick={() => {
                        setEditingTarget(null);
                        setFormOpen(true);
                      }}
                    >
                      Buat Jadwal Kunjungan
                    </Btn>
                  )
                }
              />
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredVisits.map((v) => (
                <VisitCard
                  key={v.id}
                  visit={v}
                  computedStatus={getVisitComputedStatus(v)}
                  onDetail={() => setDetailTarget(v)}
                  onEdit={() => {
                    setEditingTarget(v);
                    setFormOpen(true);
                  }}
                  onComplete={() => setCompletionTarget(v)}
                  onReschedule={() => setRescheduleTarget(v)}
                  onCancel={() => setCancelTarget(v)}
                  onDelete={() => setDeleteTarget(v)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. MODALS: FORM, DETAIL, COMPLETION, RESCHEDULE, CANCEL     */}
      {/* ============================================================ */}

      {/* Form Tambah / Edit Kunjungan */}
      <VisitFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingTarget(null);
        }}
        initialData={editingTarget}
        onSave={(data) => {
          if (editingTarget?.id) {
            updateVisit(editingTarget.id, data);
          } else {
            createVisit(data);
          }
          setFormOpen(false);
          setEditingTarget(null);
        }}
      />

      {/* Modal Catat Hasil Kunjungan Selesai */}
      <VisitCompletionModal
        open={!!completionTarget}
        visit={completionTarget}
        onClose={() => setCompletionTarget(null)}
        onComplete={(id, data) => {
          completeVisit(id, data);
          setCompletionTarget(null);
        }}
      />

      {/* Modal Reschedule Kunjungan */}
      <VisitRescheduleModal
        open={!!rescheduleTarget}
        visit={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onReschedule={(id, data) => {
          rescheduleVisit(id, data);
          setRescheduleTarget(null);
        }}
      />

      {/* Modal Batalkan Kunjungan */}
      <VisitCancelModal
        open={!!cancelTarget}
        visit={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancel={(id, reason) => {
          cancelVisit(id, reason);
          setCancelTarget(null);
        }}
      />

      {/* Modal Detail Kunjungan */}
      <VisitDetailModal
        open={!!detailTarget}
        visit={detailTarget}
        computedStatus={detailTarget ? getVisitComputedStatus(detailTarget) : ''}
        onClose={() => setDetailTarget(null)}
        onEdit={() => {
          setEditingTarget(detailTarget);
          setDetailTarget(null);
          setFormOpen(true);
        }}
        onComplete={() => {
          setCompletionTarget(detailTarget);
          setDetailTarget(null);
        }}
        onReschedule={() => {
          setRescheduleTarget(detailTarget);
          setDetailTarget(null);
        }}
        onCancel={() => {
          setCancelTarget(detailTarget);
          setDetailTarget(null);
        }}
        onDelete={() => {
          setDeleteTarget(detailTarget);
          setDetailTarget(null);
        }}
      />

      {/* Modal Konfirmasi Hapus Kunjungan */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Jadwal Kunjungan"
        message={`Apakah Anda yakin ingin menghapus jadwal kunjungan “${deleteTarget?.name}”? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus Kunjungan"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteVisit(deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// =========================================================================
// SUB-KOMPONEN KARTU KUNJUNGAN (VISIT CARD)
// =========================================================================
function VisitCard({
  visit,
  computedStatus,
  onDetail,
  onEdit,
  onComplete,
  onReschedule,
  onCancel,
  onDelete,
}) {
  const typeObj = VISIT_TYPES.find((t) => t.id === visit.type) || VISIT_TYPES[0];
  const TypeIcon = typeObj.icon;
  const isScheduled = visit.status === 'scheduled';
  const isCompleted = visit.status === 'completed';
  const isCancelled = visit.status === 'cancelled';
  const isOverdue = computedStatus === 'overdue';
  const isToday = computedStatus === 'today';

  const isWeekly = visit.recurrence?.type === 'weekly';
  const isBiweekly = visit.recurrence?.type === 'biweekly';

  return (
    <div
      className={cx(
        'card flex flex-col justify-between p-4 transition shadow-soft hover:shadow-card',
        isOverdue
          ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-200'
          : isToday
          ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-200'
          : isCompleted
          ? 'border-line/70 bg-white'
          : 'border-line bg-white'
      )}
    >
      <div>
        {/* Header Kartu: Status badge & Jenis Kunjungan */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-extrabold border',
                isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isCancelled
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : isOverdue
                  ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                  : isToday
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              )}
            >
              {isCompleted ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Selesai
                </>
              ) : isCancelled ? (
                <>
                  <Ban className="h-3 w-3" /> Dibatalkan
                </>
              ) : isOverdue ? (
                <>
                  <AlertTriangle className="h-3 w-3" /> Terlambat
                </>
              ) : isToday ? (
                <>
                  <Clock className="h-3 w-3" /> Hari Ini
                </>
              ) : (
                <>
                  <Calendar className="h-3 w-3" /> Mendatang
                </>
              )}
            </span>

            {/* Recurrence badge */}
            {(isWeekly || isBiweekly) && (
              <span
                className="inline-flex items-center gap-1 rounded-lg bg-primary-soft/80 border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary"
                title={`Jadwal berulang: ${isWeekly ? 'Setiap Minggu' : 'Setiap 2 Minggu'}`}
              >
                <RefreshCw className="h-2.5 w-2.5" />
                {isWeekly ? '1 Mgg' : '2 Mgg'}
              </span>
            )}
          </div>

          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold border',
              typeObj.color
            )}
          >
            <TypeIcon className="h-3 w-3" />
            {typeObj.label.split(' ')[0]}
          </span>
        </div>

        {/* Nama Pihak & Waktu Kunjungan */}
        <div className="mt-2.5">
          <h4
            className="text-sm font-black text-ink leading-snug break-words cursor-pointer hover:text-primary transition"
            onClick={onDetail}
            title={visit.name}
          >
            {visit.name}
          </h4>

          {(visit.storeName || visit.salesName) && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {visit.storeName && (
                <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  🏪 {visit.storeName}
                </span>
              )}
              {visit.salesName && (
                <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                  👤 {visit.salesName}
                </span>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
            <span className="flex items-center gap-1 font-semibold text-ink">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {formatDateId(visit.date)}
            </span>
            {visit.time && (
              <span className="flex items-center gap-1 font-medium">
                <Clock className="h-3.5 w-3.5 text-ink-soft" />
                {visit.time} WIB
              </span>
            )}
          </div>
        </div>

        {/* Agenda / Tujuan Kunjungan */}
        {visit.agenda && (
          <p className="mt-2 text-xs text-ink/80 leading-relaxed break-words">
            <span className="font-semibold text-ink">Agenda:</span> {visit.agenda}
          </p>
        )}

        {/* Lokasi jika ada */}
        {visit.location && (
          <p className="mt-1 flex items-start gap-1 text-[11px] text-ink-soft break-words">
            <MapPin className="h-3 w-3 shrink-0 text-primary mt-0.5" />
            <span>{visit.location}</span>
          </p>
        )}

        {/* Hasil Kunjungan jika Selesai */}
        {isCompleted && visit.completion?.outcome && (
          <div className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-xs text-emerald-950">
            <p className="font-bold text-[11px] text-emerald-800">Hasil Kunjungan:</p>
            <p className="leading-relaxed mt-0.5 text-emerald-900 break-words">
              {visit.completion.outcome}
            </p>
            {visit.completion.nextVisitDate && (
              <p className="mt-1 text-[10px] font-bold text-emerald-700">
                Lanjutan: {formatDate(visit.completion.nextVisitDate)}
              </p>
            )}
          </div>
        )}

        {/* Alasan Pembatalan jika Dibatalkan */}
        {isCancelled && visit.cancelReason && (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Alasan Batal:</span> {visit.cancelReason}
          </div>
        )}
      </div>

      {/* Footer Tombol Aksi */}
      <div className="mt-3.5 pt-2.5 border-t border-line/60 flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={onDetail}
          className="text-xs font-bold text-ink-soft hover:text-primary transition inline-flex items-center gap-1"
        >
          <Eye className="h-3.5 w-3.5" /> Rincian
        </button>

        <div className="flex items-center gap-1">
          {isScheduled && (
            <>
              <button
                type="button"
                title="Catat Hasil Kunjungan"
                onClick={onComplete}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Selesai
              </button>
              <button
                type="button"
                title="Jadwalkan Ulang"
                onClick={onReschedule}
                className="rounded-lg p-1 text-ink-soft hover:bg-sky-50 hover:text-sky-600 transition"
              >
                <CalendarClock className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Batalkan Kunjungan"
                onClick={onCancel}
                className="rounded-lg p-1 text-ink-soft hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <Ban className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            type="button"
            title="Edit Kunjungan"
            onClick={onEdit}
            className="rounded-lg p-1 text-ink-soft hover:bg-primary-soft hover:text-primary transition"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Hapus Kunjungan"
            onClick={onDelete}
            className="rounded-lg p-1 text-ink-soft hover:bg-rose-50 hover:text-rose-600 transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// MODAL FORM: TAMBAH / EDIT KUNJUNGAN
// =========================================================================
function VisitFormModal({ open, onClose, initialData, onSave }) {
  const { stores } = useApp();
  const [storeId, setStoreId] = useState('');
  const [salesId, setSalesId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('supplier');
  const [date, setDate] = useState(() => getLocalDateString());
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [agenda, setAgenda] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrenceType, setRecurrenceType] = useState('none'); // 'none' | 'weekly' | 'biweekly'
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Sync state saat modal dibuka
  useEffect(() => {
    if (!open) return;
    if (initialData && initialData.id) {
      setStoreId(initialData.storeId || '');
      setSalesId(initialData.salesId || '');
      setName(initialData.name || '');
      setType(initialData.type || 'supplier');
      setDate(initialData.date || getLocalDateString());
      setTime(initialData.time || '');
      setLocation(initialData.location || '');
      setAgenda(initialData.agenda || '');
      setNotes(initialData.notes || '');
      setRecurrenceType(initialData.recurrence?.type || 'none');
      setEndDate(initialData.recurrence?.endDate || '');
    } else {
      const defaultDate = initialData?.date || getLocalDateString();
      const firstStore = stores[0];
      const firstSales = firstStore?.sales?.[0];
      const initStoreId = firstStore?.id || '';
      const initSalesId = firstSales?.id || '';

      setStoreId(initStoreId);
      setSalesId(initSalesId);
      setName(
        firstSales && firstStore
          ? `${firstSales.name} (${firstStore.name})`
          : firstStore
          ? firstStore.name
          : ''
      );
      setType('supplier');
      setDate(defaultDate);
      setTime('');
      setLocation(firstStore?.address || '');
      setAgenda('');
      setNotes('');
      setRecurrenceType('none');
      setEndDate('');
    }
    setErrors({});
    setSubmitting(false);
  }, [open, initialData, stores]);

  const handleStoreChange = (e) => {
    const sid = e.target.value;
    setStoreId(sid);
    const targetStore = stores.find((s) => s.id === sid);
    if (targetStore) {
      const firstSales = targetStore.sales?.[0];
      if (firstSales) {
        setSalesId(firstSales.id);
        setName(`${firstSales.name} (${targetStore.name})`);
      } else {
        setSalesId('');
        setName(targetStore.name);
      }
      if (targetStore.address && !location) {
        setLocation(targetStore.address);
      }
    } else {
      setSalesId('');
    }
  };

  const handleSalesChange = (e) => {
    const slId = e.target.value;
    setSalesId(slId);
    const targetStore = stores.find((s) => s.id === storeId);
    const targetSales = targetStore?.sales?.find((sl) => sl.id === slId);
    if (targetSales && targetStore) {
      setName(`${targetSales.name} (${targetStore.name})`);
    } else if (targetStore) {
      setName(targetStore.name);
    }
  };

  if (!open) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (submitting) return;

    const targetStore = stores.find((s) => s.id === storeId);
    const targetSales = targetStore?.sales?.find((sl) => sl.id === salesId);
    const finalName =
      name.trim() ||
      (targetSales && targetStore
        ? `${targetSales.name} (${targetStore.name})`
        : targetStore?.name || '');

    const errs = {};
    if (!finalName) errs.name = 'Nama pihak / kunjungan wajib diisi.';
    if (!date) errs.date = 'Tanggal kunjungan wajib diisi.';

    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    onSave({
      storeId: targetStore?.id || '',
      salesId: targetSales?.id || '',
      storeName: targetStore?.name || '',
      salesName: targetSales?.name || '',
      name: finalName,
      type,
      date,
      time: time.trim(),
      location: location.trim(),
      agenda: agenda.trim(),
      notes: notes.trim(),
      recurrence: {
        type: recurrenceType,
        startDate: date,
        endDate: endDate ? endDate : null,
        intervalWeeks: recurrenceType === 'biweekly' ? 2 : recurrenceType === 'weekly' ? 1 : 0,
      },
    });
    setSubmitting(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialData?.id ? 'Edit Jadwal Kunjungan' : 'Tambah Jadwal Kunjungan'}
      subtitle="Atur rencana kunjungan, pihak supplier / sales yang dikunjungi, agenda, dan pola pengulangan berkala."
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn onClick={handleSubmit} disabled={submitting}>
            {initialData?.id ? 'Simpan Perubahan' : 'Tambah Kunjungan'}
          </Btn>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {/* Pilihan Toko Utama & Sales / Divisi */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-3">
          <div className="flex items-center gap-1.5 text-indigo-900">
            <Store className="h-4 w-4 text-indigo-700" />
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">
              Master Data Supplier &amp; Sales
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Pilih Toko Utama (Supplier)">
              <select
                value={storeId}
                onChange={handleStoreChange}
                className="input w-full text-xs"
              >
                <option value="">-- Pilih Toko Utama --</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.sales?.length || 0} Sales)
                  </option>
                ))}
                <option value="__custom__">Manual / Non-Supplier</option>
              </select>
            </Field>

            <Field label="Pilih Sales / Divisi">
              {(() => {
                const selectedStore = stores.find((s) => s.id === storeId);
                const sales = selectedStore?.sales || [];
                if (!selectedStore) {
                  return (
                    <select disabled className="input w-full text-xs opacity-60">
                      <option>Pilih toko terlebih dahulu</option>
                    </select>
                  );
                }
                if (sales.length === 0) {
                  return (
                    <p className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11px] text-ink-soft">
                      Belum ada sales (menggunakan nama toko)
                    </p>
                  );
                }
                return (
                  <select
                    value={salesId}
                    onChange={handleSalesChange}
                    className="input w-full text-xs"
                  >
                    <option value="">-- Pilih Sales / Divisi --</option>
                    {sales.map((sl) => (
                      <option key={sl.id} value={sl.id}>
                        {sl.name} {sl.products ? `(${sl.products})` : ''}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </Field>
          </div>
        </div>

        <Field label="Nama Pihak / Judul Kunjungan" required error={errors.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="contoh: Sales Wings 1 (Toko Jaya), Sales Unilever, dsb."
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Jenis Kunjungan">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input w-full"
            >
              {VISIT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tanggal Kunjungan" required error={errors.date}>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Waktu Kunjungan (Opsional)">
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="09:00"
            />
          </Field>

          <Field label="Lokasi / Alamat (Opsional)">
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="contoh: Warung Utama, Jl. Pasar Baru"
            />
          </Field>
        </div>

        <Field label="Agenda / Tujuan Kunjungan">
          <Input
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="contoh: Negosiasi harga minyak, ambil pesanan beras, setor uang"
          />
        </Field>

        <Field label="Catatan Tambahan (Opsional)">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan hal penting yang perlu dibawa atau diingat..."
          />
        </Field>

        {/* Pengaturan Pengulangan (Recurrence) */}
        <div className="rounded-xl border border-line bg-primary-soft/30 p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold text-ink">Pengulangan Jadwal (Berkala)</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="label text-xs">Pola Pengulangan</span>
              <select
                value={recurrenceType}
                onChange={(e) => setRecurrenceType(e.target.value)}
                className="input w-full text-xs"
              >
                <option value="none">Tidak Berulang (Sekali)</option>
                <option value="weekly">Setiap Minggu ({getDayNameId(date)})</option>
                <option value="biweekly">Setiap 2 Minggu ({getDayNameId(date)})</option>
              </select>
            </div>

            {recurrenceType !== 'none' && (
              <div>
                <span className="label text-xs">Berhenti Setelah (Opsional)</span>
                <Input
                  type="date"
                  value={endDate}
                  min={date}
                  onChange={(e) => setEndDate(e.target.value)}
                  placeholder="Pilih tanggal selesai"
                />
              </div>
            )}
          </div>

          {recurrenceType !== 'none' && (
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Jadwal ini akan berulang secara otomatis setiap{' '}
              <b>{recurrenceType === 'weekly' ? '1 minggu' : '2 minggu'}</b> pada hari{' '}
              <b>{getDayNameId(date)}</b>. Ketika kunjungan ditandai selesai, sistem akan
              otomatis menyiapkan agenda kunjungan berikutnya.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}

// =========================================================================
// MODAL: CATAT HASIL KUNJUNGAN SELESAI
// =========================================================================
function VisitCompletionModal({ open, visit, onClose, onComplete }) {
  const [actualDate, setActualDate] = useState(() => getLocalDateString());
  const [outcome, setOutcome] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');
  const [notes, setNotes] = useState('');

  useState(() => {
    if (visit) {
      setActualDate(getLocalDateString());
      setOutcome('');
      setFollowUp('');
      setNotes('');
      // Auto suggestion next visit date if recurring
      if (visit.recurrence?.type === 'weekly') {
        setNextVisitDate(addDays(visit.date, 7));
      } else if (visit.recurrence?.type === 'biweekly') {
        setNextVisitDate(addDays(visit.date, 14));
      } else {
        setNextVisitDate('');
      }
    }
  }, [open, visit]);

  if (!open || !visit) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    onComplete(visit.id, {
      actualDate,
      outcome: outcome.trim(),
      followUp: followUp.trim(),
      nextVisitDate,
      notes: notes.trim(),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Catat Hasil Kunjungan"
      subtitle={`Catat apa yang terjadi dan evaluasi hasil kunjungan dengan “${visit.name}”.`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={CheckCircle2} onClick={handleSubmit}>
            Simpan Hasil &amp; Selesaikan
          </Btn>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="rounded-xl border border-line bg-surface p-3 text-xs">
          <p className="font-extrabold text-ink">{visit.name}</p>
          <p className="text-ink-soft mt-0.5">
            Rencana: {formatDateId(visit.date)} {visit.time ? `• ${visit.time} WIB` : ''}
          </p>
          {visit.agenda && <p className="mt-1 text-ink/80">Agenda: {visit.agenda}</p>}
        </div>

        <Field label="Tanggal Aktual Pelaksanaan" required>
          <Input
            type="date"
            value={actualDate}
            onChange={(e) => setActualDate(e.target.value)}
          />
        </Field>

        <Field label="Hasil / Kesepakatan Kunjungan">
          <Textarea
            rows={2}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="contoh: Disepakati pengiriman 10 dus minyak goreng besok, diskon 3% didapatkan."
            autoFocus
          />
        </Field>

        <Field label="Hal yang Perlu Ditindaklanjuti (Follow-up)">
          <Input
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="contoh: Siapkan uang pas, cek faktur pembelian"
          />
        </Field>

        <Field label="Rencana Tanggal Kunjungan Berikutnya (Opsional)">
          <Input
            type="date"
            value={nextVisitDate}
            min={actualDate}
            onChange={(e) => setNextVisitDate(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            {visit.recurrence?.type !== 'none'
              ? `Jadwal berulang (${visit.recurrence.type === 'weekly' ? 'Mingguan' : '2 Mingguan'}). Tanggal di atas disarankan secara otomatis.`
              : 'Jika diisi, aplikasi akan otomatis menjadwalkan agenda kunjungan berikutnya.'}
          </p>
        </Field>

        <Field label="Catatan Evaluasi">
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Catatan tambahan untuk evaluasi..."
          />
        </Field>
      </form>
    </Modal>
  );
}

// =========================================================================
// MODAL: JADWALKAN ULANG (RESCHEDULE)
// =========================================================================
function VisitRescheduleModal({ open, visit, onClose, onReschedule }) {
  const [newDate, setNewDate] = useState(() => addDays(getLocalDateString(), 1));
  const [newTime, setNewTime] = useState('');
  const [reason, setReason] = useState('');

  useState(() => {
    if (visit) {
      setNewDate(addDays(visit.date, 1));
      setNewTime(visit.time || '');
      setReason('');
    }
  }, [open, visit]);

  if (!open || !visit) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!newDate) return;
    onReschedule(visit.id, { newDate, newTime, reason });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Jadwalkan Ulang Kunjungan"
      subtitle={`Ubah waktu pelaksanaan kunjungan “${visit.name}”.`}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={CalendarClock} onClick={handleSubmit}>
            Jadwalkan Ulang
          </Btn>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
          Jadwal saat ini: <b>{formatDateId(visit.date)}</b> {visit.time ? `(${visit.time} WIB)` : ''}
        </div>

        <Field label="Tanggal Baru" required>
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Waktu Baru (Opsional)">
          <Input
            type="time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
          />
        </Field>

        <Field label="Alasan Penjadwalan Ulang (Opsional)">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="contoh: Pihak sales berhalangan, toko tutup, dsb."
          />
        </Field>
      </form>
    </Modal>
  );
}

// =========================================================================
// MODAL: BATALKAN KUNJUNGAN
// =========================================================================
function VisitCancelModal({ open, visit, onClose, onCancel }) {
  const [reason, setReason] = useState('');

  if (!open || !visit) return null;

  const handleSubmit = (e) => {
    e?.preventDefault();
    onCancel(visit.id, reason);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Batalkan Kunjungan"
      subtitle={`Tandai jadwal kunjungan dengan “${visit.name}” sebagai dibatalkan.`}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Kembali
          </Btn>
          <Btn variant="soft" className="!text-rose-600 hover:!bg-rose-50" icon={Ban} onClick={handleSubmit}>
            Ya, Batalkan Jadwal
          </Btn>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-ink-soft">
          Jadwal yang dibatalkan akan tetap tersimpan di riwayat pembukuan kunjungan dan tidak
          akan menghapus riwayat masa lalu.
        </p>

        <Field label="Alasan Pembatalan">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="contoh: Pihak pemasok batal datang, stok sudah cukup"
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

// =========================================================================
// MODAL: RINCIAN LENGKAP KUNJUNGAN (VISIT DETAIL MODAL)
// =========================================================================
function VisitDetailModal({
  open,
  visit,
  computedStatus,
  onClose,
  onEdit,
  onComplete,
  onReschedule,
  onCancel,
  onDelete,
}) {
  if (!open || !visit) return null;

  const typeObj = VISIT_TYPES.find((t) => t.id === visit.type) || VISIT_TYPES[0];
  const isScheduled = visit.status === 'scheduled';
  const isCompleted = visit.status === 'completed';
  const isCancelled = visit.status === 'cancelled';
  const isOverdue = computedStatus === 'overdue';
  const isToday = computedStatus === 'today';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rincian Lengkap Kunjungan"
      subtitle={`Informasi menyeluruh terkait jadwal dan evaluasi kunjungan ${visit.name}.`}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {isScheduled && (
              <>
                <Btn size="sm" icon={CheckCircle2} onClick={onComplete}>
                  Catat Selesai
                </Btn>
                <Btn size="sm" variant="outline" icon={CalendarClock} onClick={onReschedule}>
                  Reschedule
                </Btn>
                <Btn size="sm" variant="ghost" className="!text-rose-600" icon={Ban} onClick={onCancel}>
                  Batal
                </Btn>
              </>
            )}
            <Btn size="sm" variant="outline" icon={Pencil} onClick={onEdit}>
              Edit
            </Btn>
            <Btn size="sm" variant="ghost" className="!text-rose-600" icon={Trash2} onClick={onDelete}>
              Hapus
            </Btn>
          </div>
          <Btn variant="outline" size="sm" onClick={onClose}>
            Tutup
          </Btn>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Header Rincian */}
        <div className="rounded-xl border border-line bg-primary-soft/40 p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {typeObj.label}
              </span>
              <h3 className="text-base font-black text-ink">{visit.name}</h3>
            </div>
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold border',
                isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isCancelled
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : isOverdue
                  ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                  : isToday
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-sky-50 text-sky-700 border-sky-200'
              )}
            >
              {isCompleted
                ? 'Selesai Dilaksanakan'
                : isCancelled
                ? 'Dibatalkan'
                : isOverdue
                ? 'Terlambat (Overdue)'
                : isToday
                ? 'Hari Ini'
                : 'Mendatang'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-2 border-t border-line/60 sm:grid-cols-2 text-ink-soft">
            <p>
              <span className="font-semibold text-ink">Tanggal Rencana:</span> {formatDateId(visit.date)}
            </p>
            <p>
              <span className="font-semibold text-ink">Waktu:</span> {visit.time ? `${visit.time} WIB` : 'Tidak ditentukan'}
            </p>
            {visit.location && (
              <p className="sm:col-span-2">
                <span className="font-semibold text-ink">Lokasi / Alamat:</span> {visit.location}
              </p>
            )}
          </div>
        </div>

        {/* Master Data Supplier & Sales Relasi */}
        {(visit.storeName || visit.salesName) && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
              Relasi Master Data Supplier &amp; Sales
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
              {visit.storeName && (
                <div>
                  <span className="text-ink-soft">Toko Utama:</span>{' '}
                  <span className="font-bold text-ink">🏪 {visit.storeName}</span>
                </div>
              )}
              {visit.salesName && (
                <div>
                  <span className="text-ink-soft">Sales / Divisi:</span>{' '}
                  <span className="font-bold text-ink">👤 {visit.salesName}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agenda */}
        {visit.agenda && (
          <div className="rounded-xl border border-line bg-white p-3.5 space-y-1">
            <p className="font-bold text-ink">Agenda &amp; Tujuan Kunjungan:</p>
            <p className="text-ink-soft leading-relaxed">{visit.agenda}</p>
          </div>
        )}

        {/* Catatan Rencana */}
        {visit.notes && (
          <div className="rounded-xl border border-line bg-white p-3.5 space-y-1">
            <p className="font-bold text-ink">Catatan Persiapan / Instruksi:</p>
            <p className="text-ink-soft leading-relaxed">{visit.notes}</p>
          </div>
        )}

        {/* Pola Pengulangan jika ada */}
        {visit.recurrence?.type && visit.recurrence.type !== 'none' && (
          <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-3.5 space-y-1">
            <p className="flex items-center gap-1.5 font-bold text-primary">
              <RefreshCw className="h-3.5 w-3.5" />
              Pola Pengulangan Berkala:
            </p>
            <p className="text-ink-soft leading-relaxed">
              Jadwal ini berulang{' '}
              <b>{visit.recurrence.type === 'weekly' ? 'Setiap Minggu' : 'Setiap 2 Minggu'}</b>{' '}
              pada hari <b>{getDayNameId(visit.date)}</b>.
              {visit.recurrence.endDate && ` Berhenti setelah ${formatDate(visit.recurrence.endDate)}.`}
            </p>
          </div>
        )}

        {/* Laporan Hasil Pelaksanaan jika sudah selesai */}
        {isCompleted && visit.completion && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 space-y-2 text-emerald-950">
            <p className="flex items-center gap-1.5 font-extrabold text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              Laporan Hasil Pelaksanaan
            </p>
            <div className="space-y-1 text-xs">
              <p>
                <b>Tanggal Terlaksana:</b> {formatDateId(visit.completion.actualDate)}
              </p>
              {visit.completion.outcome && (
                <p>
                  <b>Hasil / Kesepakatan:</b> {visit.completion.outcome}
                </p>
              )}
              {visit.completion.followUp && (
                <p>
                  <b>Tindak Lanjut:</b> {visit.completion.followUp}
                </p>
              )}
              {visit.completion.nextVisitDate && (
                <p>
                  <b>Rencana Lanjutan:</b> {formatDateId(visit.completion.nextVisitDate)}
                </p>
              )}
              {visit.completion.notes && (
                <p>
                  <b>Catatan Evaluasi:</b> {visit.completion.notes}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Alasan Pembatalan */}
        {isCancelled && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
            <p className="font-bold text-rose-800">Alasan Pembatalan:</p>
            <p className="mt-0.5">{visit.cancelReason || 'Dibatalkan oleh pengguna.'}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
