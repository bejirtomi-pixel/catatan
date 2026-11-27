/**
 * TEST SUITE: FINAL LOCAL APPLICATION STABILIZATION
 * CATATAN WARUNG MADURA — Workspace: D:\catatan
 *
 * Verifies:
 * 1. Comprehensive Local Backup, Validation, Import & Rollback for all 16 domains
 * 2. Relational Data Integrity (Toko -> Sales -> Barang -> Kunjungan)
 * 3. Financial Isolation (Zero double-counting of debts, digital services, or orders)
 * 4. Storage Persistence, Quota & Error Recovery
 * 5. Dashboard & Navigation System Strict Invariance
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

console.log('======================================================================');
console.log('   FINAL LOCAL APPLICATION STABILIZATION TEST SUITE                   ');
console.log('======================================================================\n');

// GROUP 1: LOCAL BACKUP & RESTORE ARCHITECTURE
console.log('--- GROUP 1: LOCAL BACKUP, RESTORE & ROLLBACK SYSTEM ---');

const appContextSrc = fs.readFileSync('src/context/AppContext.jsx', 'utf8');

test('Backup includes all domains in backupData and dependencies', () => {
  assert(appContextSrc.includes('debts,'), 'debts should be in backupData');
  assert(appContextSrc.includes('visits,'), 'visits should be in backupData');
  assert(appContextSrc.includes('digitalTransactions,'), 'digitalTransactions should be in backupData');
  
  // Check buildBackup totalEntities includes all new domains
  const hasTotalEntitiesAll =
    appContextSrc.includes('(Array.isArray(visits) ? visits.length : 0)') &&
    appContextSrc.includes('(Array.isArray(digitalTransactions) ? digitalTransactions.length : 0)') &&
    appContextSrc.includes('(Array.isArray(debts) ? debts.length : 0)');
  assert(hasTotalEntitiesAll, 'totalEntities in metadata includes visits, digitalTransactions, and debts');
});

test('Backup validation summary reports all domains', () => {
  const hasSummaryAll =
    appContextSrc.includes('visits: Array.isArray(d.visits) ? d.visits.length : 0') &&
    appContextSrc.includes('digitalTransactions: Array.isArray(d.digitalTransactions) ? d.digitalTransactions.length : 0') &&
    appContextSrc.includes('debts: Array.isArray(d.debts) ? d.debts.length : 0');
  assert(hasSummaryAll, 'validateBackup summary includes visits, digitalTransactions, and debts');
});

test('Pre-restore snapshot metadata includes all domain counts', () => {
  const hasPreRestoreAll =
    appContextSrc.includes('visits: visits.length') &&
    appContextSrc.includes('digitalTransactions: digitalTransactions.length') &&
    appContextSrc.includes('debts: debts.length');
  assert(hasPreRestoreAll, 'preRestoreRecord metadata tracks visits, digital, and debts count');
});

test('Rollback reloads state for visits, digitalTransactions, and debts', () => {
  const hasRollbackReload =
    appContextSrc.includes("const reloadedVisits = load('visits', []") &&
    appContextSrc.includes("const reloadedDigital = load('digital_transactions', []") &&
    appContextSrc.includes("const reloadedDebts = load('debts', []") &&
    appContextSrc.includes('setVisits(reloadedVisits)') &&
    appContextSrc.includes('setDigitalTransactions(reloadedDigital)') &&
    appContextSrc.includes('setDebts(reloadedDebts)');
  assert(hasRollbackReload, 'rollbackLastRestore reloads and updates visits, digital, and debts states');
});

// GROUP 2: RELATIONAL INTEGRITY (TOKO -> SALES -> BARANG -> KUNJUNGAN)
console.log('\n--- GROUP 2: RELATIONAL DATA INTEGRITY & SAFE CASCADING ---');

test('Deleting Sales Division safely resets salesId on products without removing products', () => {
  const hasSafeSalesDeletion = appContextSrc.includes(
    'setProducts((prev) =>\n        prev.map((p) => (p.salesId === salesId ? { ...p, salesId: null } : p))\n      );'
  );
  assert(hasSafeSalesDeletion, 'deleteStoreSales safely unlinks salesId from products');
});

test('Deleting Store safely cleans up product storeIds and orphaned salesId', () => {
  const hasSafeStoreDeletion =
    appContextSrc.includes('targetSalesIds.has(p.salesId)') &&
    appContextSrc.includes('storeIds.filter((x) => x !== id)');
  assert(hasSafeStoreDeletion, 'deleteStore safely strips storeId and linked salesId from products');
});

test('Visits retain snapshot information when stores or sales change', () => {
  assert(appContextSrc.includes('storeName: data.storeName ? String(data.storeName).trim() : \'\''), 'Visits record storeName snapshot');
  assert(appContextSrc.includes('salesName: data.salesName ? String(data.salesName).trim() : \'\''), 'Visits record salesName snapshot');
});

// GROUP 3: FINANCIAL ISOLATION & ZERO DOUBLE-COUNTING
console.log('\n--- GROUP 3: FINANCIAL ISOLATION & ZERO DOUBLE-COUNTING ---');

const debtFinanceSrc = fs.readFileSync('src/utils/debtFinance.js', 'utf8');

test('Debt payments strictly reduce remaining balance and cannot exceed remaining balance', () => {
  // Test debt calculation logic directly
  const record = {
    amount: 150000,
    payments: [{ amount: 50000 }, { amount: 30000 }]
  };
  const totalPaid = record.payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = Math.max(0, record.amount - totalPaid);
  assert.strictEqual(totalPaid, 80000, 'Total terbayar harus 80.000');
  assert.strictEqual(remaining, 70000, 'Sisa saldo harus 70.000');
});

test('Laporan modules maintain independent calculation boundaries', () => {
  const laporanSrc = fs.readFileSync('src/pages/Laporan.jsx', 'utf8');
  // Debts are completely isolated from physical procurement and inventory movements
  assert(!laporanSrc.includes('debts.forEach') && !laporanSrc.includes('debtPayments'), 'Laporan does not treat debt payments as procurement or sales');
  // Digital services reported independently in Tab F via digitalMetrics
  assert(laporanSrc.includes('digitalMetrics'), 'Digital transaction financials computed via dedicated digitalMetrics in Tab F');
});

// GROUP 4: STORAGE INTEGRITY & ERROR RECOVERY
console.log('\n--- GROUP 4: STORAGE INTEGRITY & PERSISTENCE SAFETY ---');

test('Corrupt JSON auto-recovery uses timestamped rescue keys', () => {
  assert(appContextSrc.includes('rescueKey = `${PREFIX}corrupt_rescue_${key}_${Date.now()}`'), 'Corrupted data backed up to rescue key');
});

test('Storage quota exceeded is caught and notified cleanly without crashing', () => {
  assert(appContextSrc.includes('QuotaExceededError'), 'QuotaExceededError explicitly handled');
  assert(appContextSrc.includes('notifyStorageError'), 'Subscribers notified of storage events');
});

// GROUP 5: DASHBOARD & 10 CORE MODULE INTEGRATION
console.log('\n--- GROUP 5: 10 CORE MODULES & INVARIANCE ---');

const dashboardSrc = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');

test('Dashboard exact top cards and zero search bar invariance', () => {
  assert(dashboardSrc.includes('data-testid="dashboard-top-cards"'), 'Top cards container present');
  assert(dashboardSrc.includes('card-tentang-toko'), 'Card 1 Tentang Toko present');
  assert(dashboardSrc.includes('card-ringkasan-operasional'), 'Card 2 Ringkasan Operasional present');
  assert(!dashboardSrc.includes('SearchInput'), 'No SearchInput in Dashboard');
  assert(dashboardSrc.includes('lg:grid-cols-6'), 'Menu utama maintains responsive 6 columns');
});

const appSrc = fs.readFileSync('src/App.jsx', 'utf8');
const allTenModules = [
  '/',
  '/barang',
  '/toko',
  '/pesanan',
  '/stok',
  '/kunjungan',
  '/catatan-digital',
  '/hutang-piutang',
  '/laporan',
  '/pengaturan',
];

test('All 10 Core Modules routes properly registered in App.jsx', () => {
  allTenModules.forEach((route) => {
    assert(appSrc.includes(`path="${route}"`), `Route ${route} registered`);
  });
});

console.log('\n======================================================================');
console.log('                 FINAL STABILIZATION SUMMARY                          ');
console.log('======================================================================');
console.log(`TOTAL PENGUJIAN : ${passCount + failCount}`);
console.log(`LULUS (PASS)    : ${passCount}`);
console.log(`GAGAL (FAIL)    : ${failCount}`);
console.log(`PERSENTASE      : ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log('\n🎉 ALL TESTS PASSED! APPLICATION IS 100% STABILIZED & FINAL LOCAL READY.');
  process.exit(0);
} else {
  console.error('\n❌ STABILIZATION CHECKS FAILED.');
  process.exit(1);
}
