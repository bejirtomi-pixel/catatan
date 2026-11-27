/**
 * CATATAN WARUNG MADURA — UTILS: DEBT & ACCOUNTS RECEIVABLE (HUTANG-PIUTANG)
 * 
 * Modul kalkulasi finansial, aturan akuntansi, status siklus hidup,
 * dan validasi catatan hutang (kewajiban warung) & piutang (tagihan warung ke pelanggan).
 */

import { getLocalDateString, rupiah, uid } from './format.js';

export const DEBT_TYPES = [
  {
    id: 'piutang',
    label: 'Piutang Pelanggan',
    sublabel: 'Uang yang belum dibayar pelanggan kepada warung',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    color: 'emerald',
  },
  {
    id: 'hutang',
    label: 'Hutang Warung',
    sublabel: 'Kewajiban warung yang belum dibayar ke pemasok/orang lain',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    color: 'amber',
  },
];

export const DEBT_STATUSES = [
  { id: 'belum_lunas', label: 'Belum Lunas', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { id: 'sebagian', label: 'Sebagian Dibayar', color: 'text-sky-700 bg-sky-50 border-sky-200' },
  { id: 'terlambat', label: 'Jatuh Tempo / Terlambat', color: 'text-red-700 bg-red-50 border-red-200' },
  { id: 'lunas', label: 'Lunas', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
];

/**
 * Hitung total pembayaran yang telah dicicil/dilunasi pada suatu catatan
 */
export function calculateDebtTotalPaid(record) {
  if (!record || !Array.isArray(record.payments)) return 0;
  return record.payments.reduce((sum, p) => {
    const val = Math.round(Number(p?.amount) || 0);
    return sum + Math.max(0, val);
  }, 0);
}

/**
 * Hitung sisa saldo hutang/piutang (nominal awal - total pembayaran)
 * Menjamin saldo tidak pernah bernilai negatif.
 */
export function calculateDebtRemaining(record) {
  if (!record) return 0;
  const initial = Math.max(0, Math.round(Number(record.amount) || 0));
  const paid = calculateDebtTotalPaid(record);
  return Math.max(0, initial - paid);
}

/**
 * Komputasi status dinamis catatan hutang/piutang
 * Status dihitung real-time terhadap tanggal hari ini tanpa membuat record usang.
 */
export function computeDebtStatus(record, todayStr = getLocalDateString()) {
  if (!record) return 'belum_lunas';
  const remaining = calculateDebtRemaining(record);
  const paid = calculateDebtTotalPaid(record);

  if (remaining <= 0) {
    return 'lunas';
  }

  const rawDueDate = record.dueDate ? String(record.dueDate).slice(0, 10) : '';
  if (rawDueDate && rawDueDate < todayStr && remaining > 0) {
    return 'terlambat';
  }

  if (paid > 0) {
    return 'sebagian';
  }

  return 'belum_lunas';
}

/**
 * Helper label status ramah pengguna
 */
export function getDebtStatusInfo(statusKey) {
  return (
    DEBT_STATUSES.find((s) => s.id === statusKey) || {
      id: statusKey,
      label: statusKey,
      color: 'text-ink-soft bg-neutral-100 border-line',
    }
  );
}

/**
 * Validasi form pencatatan hutang/piutang baru atau perbaruan data
 */
export function validateDebtRecord(data) {
  const name = String(data?.name || '').trim();
  if (!name) {
    return { ok: false, reason: 'Nama pihak (pelanggan / pemasok / pihak terkait) wajib diisi.' };
  }

  const type = data?.type;
  if (!type || !['piutang', 'hutang'].includes(type)) {
    return { ok: false, reason: 'Jenis catatan wajib dipilih: Piutang atau Hutang.' };
  }

  const amount = Math.round(Number(data?.amount) || 0);
  if (isNaN(amount) || amount <= 0) {
    return { ok: false, reason: 'Nominal wajib berupa angka positif lebih besar dari Rp0.' };
  }

  const date = data?.date ? String(data.date).slice(0, 10) : '';
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: 'Tanggal pencatatan wajib diisi dalam format YYYY-MM-DD.' };
  }

  const dueDate = data?.dueDate ? String(data.dueDate).slice(0, 10) : '';
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, reason: 'Format tanggal jatuh tempo tidak valid (YYYY-MM-DD).' };
  }

  return { ok: true, clean: { name, type, amount, date, dueDate } };
}

/**
 * Validasi pembayaran cicilan / pelunasan
 */
export function validateDebtPayment(record, paymentData) {
  if (!record) {
    return { ok: false, reason: 'Catatan hutang/piutang target tidak ditemukan.' };
  }

  const remaining = calculateDebtRemaining(record);
  if (remaining <= 0) {
    return { ok: false, reason: 'Catatan ini sudah lunas. Tidak ada sisa kewajiban untuk dibayar.' };
  }

  const payAmount = Math.round(Number(paymentData?.amount) || 0);
  if (isNaN(payAmount) || payAmount <= 0) {
    return { ok: false, reason: 'Nominal pembayaran harus lebih besar dari Rp0.' };
  }

  if (payAmount > remaining) {
    return {
      ok: false,
      reason: `Nominal pembayaran (${rupiah(payAmount)}) tidak boleh melebihi sisa tagihan (${rupiah(remaining)}).`,
    };
  }

  const date = paymentData?.date ? String(paymentData.date).slice(0, 10) : getLocalDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: 'Format tanggal pembayaran tidak valid (YYYY-MM-DD).' };
  }

  return { ok: true, clean: { amount: payAmount, date } };
}

/**
 * Rekapitulasi agregat seluruh catatan hutang & piutang
 */
export function summarizeDebts(records = [], todayStr = getLocalDateString()) {
  let totalPiutangAwal = 0;
  let remainingPiutang = 0;
  let paidPiutang = 0;
  let activePiutangCount = 0;

  let totalHutangAwal = 0;
  let remainingHutang = 0;
  let paidHutang = 0;
  let activeHutangCount = 0;

  let overdueCount = 0;
  let lunasCount = 0;
  let totalPaymentsCount = 0;

  for (const r of records) {
    const status = computeDebtStatus(r, todayStr);
    const initial = Math.max(0, Math.round(Number(r.amount) || 0));
    const paid = calculateDebtTotalPaid(r);
    const rem = calculateDebtRemaining(r);
    const pCount = Array.isArray(r.payments) ? r.payments.length : 0;
    totalPaymentsCount += pCount;

    if (r.type === 'piutang') {
      totalPiutangAwal += initial;
      paidPiutang += paid;
      remainingPiutang += rem;
      if (rem > 0) activePiutangCount++;
    } else {
      totalHutangAwal += initial;
      paidHutang += paid;
      remainingHutang += rem;
      if (rem > 0) activeHutangCount++;
    }

    if (status === 'lunas') {
      lunasCount++;
    } else if (status === 'terlambat') {
      overdueCount++;
    }
  }

  return {
    totalRecords: records.length,
    activeRecordsCount: activePiutangCount + activeHutangCount,
    lunasCount,
    overdueCount,
    totalPaymentsCount,

    // Piutang metrics (Uang yang ada di pelanggan)
    totalPiutangAwal,
    remainingPiutang, // Saldo piutang yang belum diterima
    paidPiutang,
    activePiutangCount,

    // Hutang metrics (Kewajiban warung ke pemasok/orang lain)
    totalHutangAwal,
    remainingHutang, // Saldo hutang yang belum dibayar warung
    paidHutang,
    activeHutangCount,

    // Net balance position (Piutang - Hutang)
    netReceivableBalance: remainingPiutang - remainingHutang,
  };
}

/**
 * Agregasi detail saldo per pihak (Pelanggan / Pemasok)
 */
export function summarizeParties(records = [], todayStr = getLocalDateString()) {
  const partyMap = new Map();

  for (const r of records) {
    const rawName = String(r.name || '').trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();

    if (!partyMap.has(key)) {
      partyMap.set(key, {
        displayName: rawName,
        contact: r.contact || '',
        recordsCount: 0,
        activeCount: 0,
        overdueCount: 0,
        totalPiutangAwal: 0,
        remainingPiutang: 0,
        totalHutangAwal: 0,
        remainingHutang: 0,
        records: [],
      });
    }

    const item = partyMap.get(key);
    item.recordsCount++;
    item.records.push(r);
    if (!item.contact && r.contact) {
      item.contact = r.contact;
    }

    const rem = calculateDebtRemaining(r);
    const initial = Math.max(0, Math.round(Number(r.amount) || 0));
    const status = computeDebtStatus(r, todayStr);

    if (rem > 0) {
      item.activeCount++;
    }
    if (status === 'terlambat') {
      item.overdueCount++;
    }

    if (r.type === 'piutang') {
      item.totalPiutangAwal += initial;
      item.remainingPiutang += rem;
    } else {
      item.totalHutangAwal += initial;
      item.remainingHutang += rem;
    }
  }

  return Array.from(partyMap.values()).map((p) => ({
    ...p,
    netBalance: p.remainingPiutang - p.remainingHutang,
  }));
}

/**
 * Normalisasi data migrasi skema hutang-piutang
 */
export function migrateDebt(d) {
  if (!d || typeof d !== 'object') return null;

  const now = new Date().toISOString();
  const rawType = d.type === 'hutang' ? 'hutang' : 'piutang';
  const name = String(d.name || d.partyName || d.target || '').trim();
  if (!name) return null;

  const amount = Math.max(0, Math.round(Number(d.amount || d.initialAmount || d.total) || 0));
  const rawDate = d.date ? String(d.date).slice(0, 10) : getLocalDateString();
  const dueDate = d.dueDate ? String(d.dueDate).slice(0, 10) : '';

  const payments = Array.isArray(d.payments)
    ? d.payments
        .map((p) => {
          if (!p || typeof p !== 'object') return null;
          const pAmount = Math.max(0, Math.round(Number(p.amount) || 0));
          if (pAmount <= 0) return null;
          return {
            id: p.id || uid('pmt-'),
            amount: pAmount,
            date: p.date ? String(p.date).slice(0, 10) : rawDate,
            notes: String(p.notes || '').trim(),
            operatorId: p.operatorId || '',
            operatorName: p.operatorName || '',
            createdAt: p.createdAt || now,
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: d.id || uid('dbt-'),
    type: rawType,
    name,
    contact: String(d.contact || d.phone || '').trim(),
    amount,
    date: rawDate,
    dueDate,
    notes: String(d.notes || d.description || '').trim(),
    payments,
    createdAt: d.createdAt || now,
    updatedAt: d.updatedAt || now,
  };
}
