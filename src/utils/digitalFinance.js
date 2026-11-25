/**
 * DIGITAL TRANSACTION & FINANCIAL CALCULATION ENGINE
 * Catatan Warung Madura — Domain Transaksi Layanan Digital
 *
 * Mengatur perhitungan finansial pulsa, paket data, token listrik, transfer uang,
 * top up e-wallet, dan pembayaran tagihan dengan pemisahan mutlak dari stok barang warung.
 */

export const DIGITAL_CATEGORIES = [
  { id: 'pulsa', label: 'Pulsa', color: 'blue' },
  { id: 'paket_data', label: 'Paket Data', color: 'indigo' },
  { id: 'token_listrik', label: 'Token Listrik', color: 'amber' },
  { id: 'transfer', label: 'Transfer Uang', color: 'emerald' },
  { id: 'ewallet', label: 'Top Up E-Wallet', color: 'purple' },
  { id: 'tagihan', label: 'Tagihan (PPOB)', color: 'rose' },
  { id: 'lainnya', label: 'Lainnya', color: 'gray' },
];

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'Tunai (Cash)' },
  { id: 'transfer', label: 'Transfer Bank' },
  { id: 'qris', label: 'QRIS' },
  { id: 'ewallet', label: 'Saldo E-Wallet' },
  { id: 'lainnya', label: 'Lainnya' },
];

export const DIGITAL_STATUSES = [
  { id: 'completed', label: 'Selesai', color: 'emerald' },
  { id: 'pending', label: 'Menunggu (Pending)', color: 'amber' },
  { id: 'failed', label: 'Gagal', color: 'rose' },
  { id: 'cancelled', label: 'Dibatalkan', color: 'gray' },
];

/**
 * Mesin kalkulasi laba dan biaya transaksi digital berbasis integer Rupiah.
 * Menghindari pembulatan desimal yang tidak konsisten.
 *
 * Formula:
 * - totalCost = capital + providerFee
 * - customerPaid = customerPaid || (serviceAmount + customerAdminFee)
 * - profit = customerPaid - totalCost
 */
export function calculateDigitalProfit({
  serviceAmount = 0,
  capital = 0,
  providerFee = 0,
  customerAdminFee = 0,
  customerPaid = 0,
} = {}) {
  const sa = Math.max(0, Math.round(Number(serviceAmount) || 0));
  const cap = Math.max(0, Math.round(Number(capital) || 0));
  const pf = Math.max(0, Math.round(Number(providerFee) || 0));
  const fee = Math.max(0, Math.round(Number(customerAdminFee) || 0));

  // Jika customerPaid diinput eksplisit dan > 0 gunakan nilai tersebut, bila tidak hitung sa + fee
  const paid =
    Number(customerPaid) > 0
      ? Math.round(Number(customerPaid))
      : sa + fee;

  const totalCost = cap + pf;
  const profit = paid - totalCost;

  return {
    serviceAmount: sa,
    capital: cap,
    providerFee: pf,
    customerAdminFee: fee,
    customerPaid: paid,
    totalCost,
    profit,
  };
}

/**
 * Sensor penyembunyi nomor identitas/tujuan untuk menjaga privasi pada tabel riwayat
 * Contoh: 081234567890 -> 0812****7890, 12345678 -> 12****78
 */
export function maskDestination(str) {
  if (!str) return '—';
  const clean = String(str).trim();
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) {
    return clean.slice(0, 2) + '****' + clean.slice(-2);
  }
  return clean.slice(0, 4) + '****' + clean.slice(-4);
}

/**
 * Validasi integritas data transaksi digital sebelum disimpan ke state/storage
 */
export function validateDigitalTransaction(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, valid: false, reason: 'Data transaksi digital tidak valid.', errors: ['Data transaksi digital tidak valid.'] };
  }

  const type = String(data.type || data.category || '').trim();
  const validTypes = DIGITAL_CATEGORIES.map((c) => c.id);
  if (!validTypes.includes(type)) {
    return { ok: false, valid: false, reason: 'Kategori layanan digital tidak dikenal.', errors: ['Kategori layanan digital tidak dikenal.'] };
  }

  if (type === 'lainnya' && !String(data.customTypeName || data.customCategoryName || '').trim()) {
    return { ok: false, valid: false, reason: 'Nama layanan wajib diisi untuk kategori Lainnya.', errors: ['Nama layanan wajib diisi untuk kategori Lainnya.'] };
  }

  const destination = String(data.destination || data.targetNumber || '').trim();
  if (!destination) {
    return { ok: false, valid: false, reason: 'Nomor tujuan / identitas pelanggan wajib diisi.', errors: ['Nomor tujuan / identitas pelanggan wajib diisi.'] };
  }

  const serviceAmount = Number(data.serviceAmount);
  if (isNaN(serviceAmount) || serviceAmount <= 0) {
    return { ok: false, valid: false, reason: 'Nominal layanan harus berupa angka positif lebih dari 0.', errors: ['Nominal layanan harus berupa angka positif lebih dari 0.'] };
  }

  const capital = Number(data.capital != null ? data.capital : 0);
  if (isNaN(capital) || capital < 0) {
    return { ok: false, valid: false, reason: 'Biaya modal tidak boleh bernilai negatif.', errors: ['Biaya modal tidak boleh bernilai negatif.'] };
  }

  const providerFee = Number(data.providerFee != null ? data.providerFee : 0);
  if (isNaN(providerFee) || providerFee < 0) {
    return { ok: false, valid: false, reason: 'Biaya provider tidak boleh bernilai negatif.', errors: ['Biaya provider tidak boleh bernilai negatif.'] };
  }

  const customerAdminFee = Number(data.customerAdminFee != null ? data.customerAdminFee : 0);
  if (isNaN(customerAdminFee) || customerAdminFee < 0) {
    return { ok: false, valid: false, reason: 'Biaya admin pelanggan tidak boleh bernilai negatif.', errors: ['Biaya admin pelanggan tidak boleh bernilai negatif.'] };
  }

  const customerPaid = Number(data.customerPaid != null ? data.customerPaid : 0);
  if (isNaN(customerPaid) || customerPaid < 0) {
    return { ok: false, valid: false, reason: 'Uang yang dibayarkan pelanggan tidak boleh bernilai negatif.', errors: ['Uang yang dibayarkan pelanggan tidak boleh bernilai negatif.'] };
  }

  return { ok: true, valid: true, reason: '', errors: [] };
}

/**
 * Agregator metrik ringkasan transaksi digital berdasarkan status transaksi
 * Menjamin transaksi pending, failed, dan cancelled tidak dihitung ke laba final
 */
export function summarizeDigitalTransactions(transactions = []) {
  let totalCount = 0;
  let completedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  let totalServiceAmount = 0;
  let totalCustomerPaid = 0;
  let totalCapital = 0;
  let totalProviderFee = 0;
  let totalProfit = 0;

  let pendingAmount = 0;
  let pendingPotentialProfit = 0;

  for (const t of transactions || []) {
    totalCount++;
    const fin = calculateDigitalProfit(t);

    if (t.status === 'completed') {
      completedCount++;
      totalServiceAmount += fin.serviceAmount;
      totalCustomerPaid += fin.customerPaid;
      totalCapital += fin.capital;
      totalProviderFee += fin.providerFee;
      totalProfit += fin.profit;
    } else if (t.status === 'pending') {
      pendingCount++;
      pendingAmount += fin.serviceAmount;
      pendingPotentialProfit += fin.profit;
    } else if (t.status === 'failed') {
      failedCount++;
    } else if (t.status === 'cancelled') {
      cancelledCount++;
    }
  }

  return {
    totalCount,
    completedCount,
    pendingCount,
    failedCount,
    cancelledCount,
    totalServiceAmount,
    totalCustomerPaid,
    totalCapital,
    totalProviderFee,
    totalCost: totalCapital + totalProviderFee,
    totalProfit,
    pendingAmount,
    pendingPotentialProfit,
    potentialPendingProfit: pendingPotentialProfit,
  };
}

/**
 * Dapatkan label nama layanan yang mudah dibaca
 */
export function getCategoryLabel(type, customName = '') {
  if (type === 'lainnya' && customName) return customName;
  const match = DIGITAL_CATEGORIES.find((c) => c.id === type);
  return match ? match.label : type || 'Lainnya';
}

/**
 * Dapatkan label status transaksi digital
 */
export function getStatusLabel(status) {
  const match = DIGITAL_STATUSES.find((s) => s.id === status);
  return match ? match.label : status || 'Menunggu';
}
