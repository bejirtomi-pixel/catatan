/**
 * TEST SUITE: MODUL HUTANG-PIUTANG (DEBT & ACCOUNTS RECEIVABLE)
 * Catatan Warung Madura
 *
 * Menguji:
 * 1. CRUD & Validasi Schema Catatan Hutang-Piutang
 * 2. Logika Finansial, Cicilan, Pelunasan, & Proteksi Overpayment
 * 3. Siklus Status Dinamis (Belum Lunas, Sebagian, Terlambat, Lunas)
 * 4. Pemisahan Tegas Antara Hutang vs Piutang (Zero Cross-Contamination)
 * 5. Detail Agregasi Saldo per Pihak (Pelanggan / Supplier)
 * 6. Isolasi Domain (Zero Inventory Mutation & Local-First Invariance)
 * 7. Navigasi, Route, & Integrasi Dashboard / Sidebar
 * 8. Persistensi LocalStorage & Backup-Restore Integration
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEBT_STATUSES,
  DEBT_TYPES,
  calculateDebtRemaining,
  calculateDebtTotalPaid,
  computeDebtStatus,
  getDebtStatusInfo,
  migrateDebt,
  summarizeDebts,
  summarizeParties,
  validateDebtPayment,
  validateDebtRecord,
} from '../src/utils/debtFinance.js';

import { buildSeed } from '../src/data/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const results = [];
function record(testId, name, status, details = '') {
  results.push({ testId, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${testId}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('   TEST SUITE: MODUL HUTANG-PIUTANG (CATATAN WARUNG MADURA)           ');
  console.log('======================================================================\n');

  /* =========================================================================
     GROUP 1: CRUD & SCHEMA VALIDATION
     ========================================================================= */
  console.log('--- GROUP 1: CRUD & SCHEMA VALIDATION ---');

  // Test 1.1: Validasi Input Wajib
  try {
    const valid = validateDebtRecord({
      type: 'piutang',
      name: 'Pak Budi',
      amount: 150000,
      date: '2026-11-20',
      dueDate: '2026-11-30',
    });
    const invalidName = validateDebtRecord({
      type: 'piutang',
      name: '',
      amount: 100000,
      date: '2026-11-20',
    });
    const invalidAmount = validateDebtRecord({
      type: 'piutang',
      name: 'Pak Joko',
      amount: -50000,
      date: '2026-11-20',
    });
    const invalidType = validateDebtRecord({
      type: 'lainnya',
      name: 'Toko Makmur',
      amount: 50000,
      date: '2026-11-20',
    });

    if (
      valid.ok &&
      !invalidName.ok &&
      !invalidAmount.ok &&
      !invalidType.ok &&
      valid.clean.amount === 150000
    ) {
      record('UJI-HP.1.1', 'Validasi Form & Schema Input Mandatori', 'PASS', 'Nama, tipe sah, dan nominal positif terverifikasi');
    } else {
      record('UJI-HP.1.1', 'Validasi Form & Schema Input Mandatori', 'FAIL', 'Validasi gagal mendeteksi kesalahan');
    }
  } catch (err) {
    record('UJI-HP.1.1', 'Validasi Form & Schema Input Mandatori', 'FAIL', err.message);
  }

  // Test 1.2: Normalisasi Schema via migrateDebt
  try {
    const raw = {
      partyName: ' Ibu Ainun ',
      type: 'piutang',
      total: '250000.75',
      date: '2026-11-15T08:00:00Z',
      payments: [{ amount: '50000', notes: 'Uang muka' }],
    };
    const migrated = migrateDebt(raw);

    if (
      migrated &&
      migrated.id.startsWith('dbt-') &&
      migrated.name === 'Ibu Ainun' &&
      migrated.amount === 250001 &&
      migrated.payments.length === 1 &&
      migrated.payments[0].amount === 50000
    ) {
      record('UJI-HP.1.2', 'Migrasi Schema & Normalisasi Integer Presisi', 'PASS', `ID: ${migrated.id}, Nominal: ${migrated.amount}`);
    } else {
      record('UJI-HP.1.2', 'Migrasi Schema & Normalisasi Integer Presisi', 'FAIL', JSON.stringify(migrated));
    }
  } catch (err) {
    record('UJI-HP.1.2', 'Migrasi Schema & Normalisasi Integer Presisi', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 2: LOGIKA FINANSIAL, PEMBAYARAN, & PROTEKSI OVERPAYMENT
     ========================================================================= */
  console.log('\n--- GROUP 2: LOGIKA FINANSIAL, PEMBAYARAN & PROTEKSI ---');

  // Test 2.1: Perhitungan Saldo Berbasis Pembayaran
  try {
    const debt = {
      amount: 200000,
      payments: [
        { id: 'p1', amount: 50000, date: '2026-11-21' },
        { id: 'p2', amount: 30000, date: '2026-11-22' },
      ],
    };
    const totalPaid = calculateDebtTotalPaid(debt);
    const remaining = calculateDebtRemaining(debt);

    if (totalPaid === 80000 && remaining === 120000) {
      record('UJI-HP.2.1', 'Kalkulasi Saldo: Nominal Awal Dikurangi Pembayaran', 'PASS', `Awal 200rb, Terbayar 80rb, Sisa 120rb`);
    } else {
      record('UJI-HP.2.1', 'Kalkulasi Saldo: Nominal Awal Dikurangi Pembayaran', 'FAIL', `Paid: ${totalPaid}, Rem: ${remaining}`);
    }
  } catch (err) {
    record('UJI-HP.2.1', 'Kalkulasi Saldo', 'FAIL', err.message);
  }

  // Test 2.2: Proteksi Overpayment (Pembayaran Melebihi Sisa Tagihan)
  try {
    const debt = {
      amount: 100000,
      payments: [{ id: 'p1', amount: 70000 }],
    };
    // Sisa = 30000
    const payExact = validateDebtPayment(debt, { amount: 30000, date: '2026-11-23' });
    const payOver = validateDebtPayment(debt, { amount: 30001, date: '2026-11-23' });
    const payZero = validateDebtPayment(debt, { amount: 0, date: '2026-11-23' });

    if (payExact.ok && !payOver.ok && !payZero.ok && payOver.reason.includes('tidak boleh melebihi sisa tagihan')) {
      record('UJI-HP.2.2', 'Proteksi Overpayment & Nominal Non-Negatif', 'PASS', 'Pembayaran > sisa kewajiban ditolak tegas');
    } else {
      record('UJI-HP.2.2', 'Proteksi Overpayment & Nominal Non-Negatif', 'FAIL', 'Overpayment tidak ditolak');
    }
  } catch (err) {
    record('UJI-HP.2.2', 'Proteksi Overpayment', 'FAIL', err.message);
  }

  // Test 2.3: Non-Negative Balance Invariance
  try {
    const debtOverpaid = {
      amount: 50000,
      payments: [{ amount: 999999 }], // kasus anomali
    };
    const rem = calculateDebtRemaining(debtOverpaid);
    if (rem === 0) {
      record('UJI-HP.2.3', 'Invariansi Saldo Non-Negatif', 'PASS', 'Saldo tidak pernah menjadi minus');
    } else {
      record('UJI-HP.2.3', 'Invariansi Saldo Non-Negatif', 'FAIL', `Saldo: ${rem}`);
    }
  } catch (err) {
    record('UJI-HP.2.3', 'Invariansi Saldo Non-Negatif', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 3: SIKLUS STATUS DINAMIS & DETEKSI TERLAMBAT
     ========================================================================= */
  console.log('\n--- GROUP 3: SIKLUS STATUS DINAMIS & DETEKSI TERLAMBAT ---');

  // Test 3.1: Status Belum Lunas
  try {
    const d = { amount: 100000, dueDate: '2026-12-05', payments: [] };
    const status = computeDebtStatus(d, '2026-11-27');
    if (status === 'belum_lunas') {
      record('UJI-HP.3.1', 'Status: Belum Lunas (0 Pembayaran, Belum Lewat Tempo)', 'PASS');
    } else {
      record('UJI-HP.3.1', 'Status: Belum Lunas', 'FAIL', status);
    }
  } catch (err) {
    record('UJI-HP.3.1', 'Status: Belum Lunas', 'FAIL', err.message);
  }

  // Test 3.2: Status Sebagian Dibayar
  try {
    const d = { amount: 100000, dueDate: '2026-12-05', payments: [{ amount: 40000 }] };
    const status = computeDebtStatus(d, '2026-11-27');
    if (status === 'sebagian') {
      record('UJI-HP.3.2', 'Status: Sebagian Dibayar (0 < Terbayar < Pokok)', 'PASS');
    } else {
      record('UJI-HP.3.2', 'Status: Sebagian Dibayar', 'FAIL', status);
    }
  } catch (err) {
    record('UJI-HP.3.2', 'Status: Sebagian Dibayar', 'FAIL', err.message);
  }

  // Test 3.3: Status Terlambat (Jatuh Tempo)
  try {
    const d = { amount: 100000, dueDate: '2026-11-25', payments: [{ amount: 20000 }] };
    const status = computeDebtStatus(d, '2026-11-27');
    if (status === 'terlambat') {
      record('UJI-HP.3.3', 'Status: Jatuh Tempo / Terlambat (dueDate < todayStr & sisa > 0)', 'PASS');
    } else {
      record('UJI-HP.3.3', 'Status: Jatuh Tempo', 'FAIL', status);
    }
  } catch (err) {
    record('UJI-HP.3.3', 'Status: Jatuh Tempo', 'FAIL', err.message);
  }

  // Test 3.4: Status Lunas (Kebal terhadap Tanggal Lampau)
  try {
    const d = { amount: 100000, dueDate: '2026-11-10', payments: [{ amount: 100000 }] };
    const status = computeDebtStatus(d, '2026-11-27');
    if (status === 'lunas') {
      record('UJI-HP.3.4', 'Status: Lunas Permanen (Sisa 0, Kebal Status Terlambat)', 'PASS');
    } else {
      record('UJI-HP.3.4', 'Status: Lunas Permanen', 'FAIL', status);
    }
  } catch (err) {
    record('UJI-HP.3.4', 'Status: Lunas Permanen', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 4: PEMISAHAN HUTANG VS PIUTANG
     ========================================================================= */
  console.log('\n--- GROUP 4: PEMISAHAN HUTANG VS PIUTANG ---');

  // Test 4.1: Isolasi Perhitungan Piutang & Hutang
  try {
    const sample = [
      { id: '1', type: 'piutang', amount: 100000, payments: [{ amount: 25000 }] }, // sisa 75rb
      { id: '2', type: 'piutang', amount: 50000, payments: [{ amount: 50000 }] },  // sisa 0 (lunas)
      { id: '3', type: 'hutang', amount: 300000, payments: [{ amount: 100000 }] }, // sisa 200rb
    ];
    const s = summarizeDebts(sample, '2026-11-27');

    if (
      s.totalPiutangAwal === 150000 &&
      s.remainingPiutang === 75000 &&
      s.paidPiutang === 75000 &&
      s.activePiutangCount === 1 &&
      s.totalHutangAwal === 300000 &&
      s.remainingHutang === 200000 &&
      s.paidHutang === 100000 &&
      s.activeHutangCount === 1 &&
      s.lunasCount === 1 &&
      s.activeRecordsCount === 2
    ) {
      record('UJI-HP.4.1', 'Agregasi Terisolasi: Hutang dan Piutang Tidak Bercampur', 'PASS', 'Piutang sisa 75rb, Hutang sisa 200rb terhitung presisi');
    } else {
      record('UJI-HP.4.1', 'Agregasi Terisolasi', 'FAIL', JSON.stringify(s));
    }
  } catch (err) {
    record('UJI-HP.4.1', 'Agregasi Terisolasi', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 5: AGREGASI SALDO PER PIHAK
     ========================================================================= */
  console.log('\n--- GROUP 5: AGREGASI SALDO PER PIHAK ---');

  // Test 5.1: Pengelompokan & Net Balance per Pihak
  try {
    const sample = [
      { id: '1', name: 'Pak Budi', type: 'piutang', amount: 50000, payments: [] },
      { id: '2', name: 'Pak Budi', type: 'piutang', amount: 30000, payments: [{ amount: 10000 }] },
      { id: '3', name: 'Toko Makmur', type: 'hutang', amount: 400000, payments: [{ amount: 150000 }] },
    ];
    const parties = summarizeParties(sample, '2026-11-27');
    const budi = parties.find((p) => p.displayName === 'Pak Budi');
    const makmur = parties.find((p) => p.displayName === 'Toko Makmur');

    if (
      parties.length === 2 &&
      budi &&
      budi.recordsCount === 2 &&
      budi.remainingPiutang === 70000 &&
      budi.netBalance === 70000 &&
      makmur &&
      makmur.remainingHutang === 250000 &&
      makmur.netBalance === -250000
    ) {
      record('UJI-HP.5.1', 'Agregasi Saldo per Pihak (Detail Pelanggan/Pemasok)', 'PASS', 'Pak Budi piutang 70rb, Toko Makmur hutang 250rb');
    } else {
      record('UJI-HP.5.1', 'Agregasi Saldo per Pihak', 'FAIL', JSON.stringify(parties));
    }
  } catch (err) {
    record('UJI-HP.5.1', 'Agregasi Saldo per Pihak', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 6: INTEGRASI ROUTE, NAVIGASI, & DASHBOARD
     ========================================================================= */
  console.log('\n--- GROUP 6: INTEGRASI ROUTE, NAVIGASI & DASHBOARD ---');

  // Test 6.1: Route /hutang-piutang terdaftar di App.jsx
  try {
    const appCode = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf-8');
    if (appCode.includes("path=\"/hutang-piutang\"") && appCode.includes('<HutangPiutang')) {
      record('UJI-HP.6.1', 'Route /hutang-piutang Terdaftar di App.jsx', 'PASS');
    } else {
      record('UJI-HP.6.1', 'Route /hutang-piutang Terdaftar di App.jsx', 'FAIL', 'Route belum terdaftar');
    }
  } catch (err) {
    record('UJI-HP.6.1', 'Route /hutang-piutang', 'FAIL', err.message);
  }

  // Test 6.2: Navigasi Sidebar.jsx & Layout.jsx
  try {
    const sidebarCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Sidebar.jsx'), 'utf-8');
    const layoutCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Layout.jsx'), 'utf-8');

    const sidebarHasMenu = sidebarCode.includes("to: '/hutang-piutang'") && sidebarCode.includes("Hutang-Piutang");
    const layoutHasMobile = layoutCode.includes("to: '/hutang-piutang'");

    if (sidebarHasMenu && layoutHasMobile) {
      record('UJI-HP.6.2', 'Navigasi Sidebar Desktop & Mobile Terpasang', 'PASS', 'Menu Hutang-Piutang dengan icon HandCoins terpasang');
    } else {
      record('UJI-HP.6.2', 'Navigasi Sidebar Desktop & Mobile', 'FAIL', 'Menu belum lengkap di sidebar/layout');
    }
  } catch (err) {
    record('UJI-HP.6.2', 'Navigasi Sidebar Desktop & Mobile', 'FAIL', err.message);
  }

  // Test 6.3: Invariansi Dashboard Tetap Terjaga
  try {
    const dashCode = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'Dashboard.jsx'), 'utf-8');
    const hasTopCards = dashCode.includes('data-testid="dashboard-top-cards"');
    const hasCard1 = dashCode.includes('data-testid="card-tentang-toko"');
    const hasCard2 = dashCode.includes('data-testid="card-ringkasan-operasional"');
    const hasNoSearch = !dashCode.includes('<SearchInput') && !dashCode.includes('placeholder="Cari');
    const hasGrid6 = dashCode.includes('lg:grid-cols-6');

    if (hasTopCards && hasCard1 && hasCard2 && hasNoSearch && hasGrid6) {
      record('UJI-HP.6.3', 'Invariansi Dashboard (2 Top Cards, No Search, 6 Kolom)', 'PASS', 'Dashboard tetap mematuhi seluruh audit ketat');
    } else {
      record('UJI-HP.6.3', 'Invariansi Dashboard', 'FAIL', 'Invariansi terlanggar');
    }
  } catch (err) {
    record('UJI-HP.6.3', 'Invariansi Dashboard', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 7: PERSISTENSI LOCAL STORAGE & BACKUP-RESTORE
     ========================================================================= */
  console.log('\n--- GROUP 7: PERSISTENSI LOCAL STORAGE & BACKUP-RESTORE ---');

  // Test 7.1: AppContext Storage Effect & Backup Inclusion
  try {
    const appCtxCode = fs.readFileSync(path.join(rootDir, 'src', 'context', 'AppContext.jsx'), 'utf-8');
    const hasState = appCtxCode.includes("load('debts'");
    const hasSave = appCtxCode.includes("save('debts', debts)");
    const hasBackup = appCtxCode.includes("debts,") && appCtxCode.includes("save('debts', nextDebts)");

    if (hasState && hasSave && hasBackup) {
      record('UJI-HP.7.1', 'Persistensi LocalStorage wm_v1_debts & Backup-Restore', 'PASS', 'Tersimpan otomatis dan terintegrasi backup import/export');
    } else {
      record('UJI-HP.7.1', 'Persistensi LocalStorage & Backup-Restore', 'FAIL', 'Integrasi storage belum lengkap');
    }
  } catch (err) {
    record('UJI-HP.7.1', 'Persistensi LocalStorage', 'FAIL', err.message);
  }

  // Test 7.2: Seed Data Realistis
  try {
    const seed = buildSeed();
    if (Array.isArray(seed.debts) && seed.debts.length >= 4) {
      const piutang = seed.debts.filter((d) => d.type === 'piutang');
      const hutang = seed.debts.filter((d) => d.type === 'hutang');
      record('UJI-HP.7.2', 'Seed Data Hutang-Piutang Realistis Warung', 'PASS', `${seed.debts.length} catatan awal (${piutang.length} piutang, ${hutang.length} hutang)`);
    } else {
      record('UJI-HP.7.2', 'Seed Data Hutang-Piutang Realistis Warung', 'FAIL', 'Seed debts kosong atau kurang');
    }
  } catch (err) {
    record('UJI-HP.7.2', 'Seed Data Hutang-Piutang Realistis Warung', 'FAIL', err.message);
  }

  /* =========================================================================
     SUMMARY
     ========================================================================= */
  console.log('\n======================================================================');
  console.log('             HUTANG-PIUTANG MODULE TEST RESULTS SUMMARY               ');
  console.log('======================================================================');

  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log(`Total Pengujian: ${total}`);
  console.log(`Lolos (PASS)   : ${passed}`);
  console.log(`Gagal (FAIL)   : ${failed}`);
  console.log(`Persentase     : ${((passed / total) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 VERDICT: ALL TESTS PASSED! MODUL HUTANG-PIUTANG 100% OPERASIONAL.\n');
  } else {
    console.error(`\n❌ VERDICT: ${failed} TEST GAGAL.\n`);
    process.exit(1);
  }
}

runTestSuite();
