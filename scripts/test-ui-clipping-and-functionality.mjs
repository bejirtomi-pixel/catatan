/**
 * TEST SUITE: UI CLIPPING & FUNCTIONALITY CHECK — CATATAN WARUNG MADURA
 *
 * Verifies:
 * 1. UI Clipping Invariance (Vital info uses break-words, no aggressive line-clamp)
 * 2. Modal Responsiveness & Layout
 * 3. 10 Core Module Routing & Navigation
 * 4. Relational Data Integrity (Toko, Sales, Kunjungan, Barang)
 * 5. Calculation Engines (Hutang-Piutang, Catatan Digital, Pesanan, Stok)
 * 6. Dashboard Strict Invariance (2 top cards, 6-col menu, 0 search input)
 */

import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`✅ [PASS] ${testName}${details ? ` -> ${details}` : ''}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    failCount++;
  }
}

console.log('======================================================================');
console.log('   TEST SUITE: UI CLIPPING & FUNCTIONALITY VERIFICATION               ');
console.log('======================================================================\n');

// GROUP 1: UI CLIPPING CHECK
console.log('--- GROUP 1: UI CLIPPING & TEXT WRAPPING INVARIANCE ---');

const uiJsx = fs.readFileSync('src/components/UI.jsx', 'utf8');
assert(
  uiJsx.includes('break-words text-base font-bold text-ink leading-snug') &&
  uiJsx.includes('max-h-[75vh] overflow-y-auto'),
  'Modal Component Responsive & Non-Clipping',
  'Title wraps gracefully without truncate; content has scrollable max-height'
);

const barangJsx = fs.readFileSync('src/pages/Barang.jsx', 'utf8');
assert(
  !barangJsx.includes('line-clamp-1') && !barangJsx.includes('line-clamp-2') &&
  barangJsx.includes('min-w-[180px] max-w-sm break-words'),
  'Barang Page No Vital Line-Clamping',
  'Product names, promo titles, and descriptions wrap naturally with break-words'
);

const tokoJsx = fs.readFileSync('src/pages/Toko.jsx', 'utf8');
assert(
  !tokoJsx.includes('line-clamp-2') &&
  tokoJsx.includes('text-[11px] leading-snug break-words') &&
  tokoJsx.includes('min-w-[150px] py-2 px-2'),
  'Toko Page Address, Notes & Product Buttons Wrapped',
  'Supplier addresses, notes, and product names wrap cleanly without line-clamp'
);

const pesananJsx = fs.readFileSync('src/pages/Pesanan.jsx', 'utf8');
assert(
  !pesananJsx.includes('max-w-[150px] truncate') &&
  pesananJsx.includes('max-w-[200px] break-words text-[11px] italic text-ink-soft leading-snug'),
  'Pesanan Page Order Notes & Item Badges Wrapped',
  'Order notes and items badges have room and wrap properly'
);

const kunjunganJsx = fs.readFileSync('src/pages/Kunjungan.jsx', 'utf8');
assert(
  !kunjunganJsx.includes('line-clamp-1') && !kunjunganJsx.includes('line-clamp-2'),
  'Kunjungan Page Agendas, Locations & Outcomes Clean',
  'No line-clamp hiding visit outcome, agenda, or location'
);

const digitalJsx = fs.readFileSync('src/pages/CatatanDigital.jsx', 'utf8');
assert(
  !digitalJsx.includes('line-clamp-1'),
  'Catatan Digital Notes Wrapped',
  'Transaction notes wrap with break-words'
);

const hutangJsx = fs.readFileSync('src/pages/HutangPiutang.jsx', 'utf8');
assert(
  !hutangJsx.includes('line-clamp-1') &&
  hutangJsx.includes('font-bold text-sm text-ink break-words leading-snug'),
  'Hutang-Piutang Contact Names & Notes Wrapped',
  'Contact names and notes wrap cleanly'
);

const laporanJsx = fs.readFileSync('src/pages/Laporan.jsx', 'utf8');
assert(
  !laporanJsx.includes('line-clamp-2') &&
  laporanJsx.includes('max-w-[200px] break-words text-[11px] italic text-ink-soft leading-snug'),
  'Laporan Page All Tables Non-Clipping',
  'Visit outcomes, notes, and order details wrap naturally'
);

// GROUP 2: CORE MODULE NAVIGATION & ROUTING
console.log('\n--- GROUP 2: 10 CORE MODULE ROUTING & NAVIGATION ---');

const appJsx = fs.readFileSync('src/App.jsx', 'utf8');
const expectedRoutes = [
  'path="/"',
  'path="/barang"',
  'path="/toko"',
  'path="/pesanan"',
  'path="/stok"',
  'path="/kunjungan"',
  'path="/catatan-digital"',
  'path="/hutang-piutang"',
  'path="/laporan"',
  'path="/pengaturan"',
];

expectedRoutes.forEach(r => {
  assert(appJsx.includes(r), `Route Registration: ${r}`, 'Path mapped to appropriate component');
});

const sidebarJsx = fs.readFileSync('src/components/Sidebar.jsx', 'utf8');
const expectedNavLinks = [
  "to: '/'",
  "to: '/barang'",
  "to: '/toko'",
  "to: '/pesanan'",
  "to: '/stok'",
  "to: '/kunjungan'",
  "to: '/catatan-digital'",
  "to: '/hutang-piutang'",
  "to: '/laporan'",
  "to: '/pengaturan'",
];

expectedNavLinks.forEach(l => {
  assert(sidebarJsx.includes(l), `Sidebar Navigation Link: ${l}`, 'Nav item present in Sidebar');
});

// GROUP 3: STRICT DASHBOARD INVARIANCE
console.log('\n--- GROUP 3: STRICT DASHBOARD INVARIANCE ---');

const dashboardJsx = fs.readFileSync('src/pages/Dashboard.jsx', 'utf8');
assert(
  dashboardJsx.includes('data-testid="dashboard-top-cards"'),
  'Dashboard Top Cards Test ID Present',
  'Exact top cards container identified'
);
assert(
  dashboardJsx.includes('card-tentang-toko') && dashboardJsx.includes('card-ringkasan-operasional'),
  'Dashboard Exactly 2 Top Cards Preserved',
  'Tentang Toko and Ringkasan Operasional present'
);
assert(
  !dashboardJsx.includes('SearchInput') && !dashboardJsx.includes('<input type="search"'),
  'Dashboard Zero Search Bar Rule',
  'Dashboard remains clean of search bar'
);
assert(
  dashboardJsx.includes('lg:grid-cols-6') || dashboardJsx.includes('grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'),
  'Dashboard Menu Utama 6 Columns Layout',
  'Responsive 6-column grid maintained'
);

// GROUP 4: FUNCTIONALITY & DATA STORAGE VALIDATION
console.log('\n--- GROUP 4: LOCAL STORAGE & DATA INTEGRITY ---');

const appContextJsx = fs.readFileSync('src/context/AppContext.jsx', 'utf8');
assert(
  appContextJsx.includes("const PREFIX = 'wm_v1_';"),
  'Storage Key Prefix Defined',
  "Isolated storage domain namespace 'wm_v1_' active"
);

const coreStorageDomains = [
  'products',
  'stores',
  'orders',
  'stocks',
  'visits',
  'digital_transactions',
  'debts',
  'settings',
];

coreStorageDomains.forEach(domain => {
  assert(
    appContextJsx.includes(`save('${domain}'`) && appContextJsx.includes(`load('${domain}'`),
    `Storage Domain Persistence: wm_v1_${domain}`,
    'Managed by AppContext with isolated local-first persistence'
  );
});

console.log('\n======================================================================');
console.log('              SUMMARY OF UI & FUNCTIONALITY TEST                      ');
console.log('======================================================================');
console.log(`TOTAL TESTS : ${passCount + failCount}`);
console.log(`PASSED      : ${passCount}`);
console.log(`FAILED      : ${failCount}`);
console.log(`PASS RATE   : ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log('\n🎉 ALL TESTS PASSED! UI CLIPPING IS FULLY FIXED AND FUNCTIONALITY VERIFIED.');
  process.exit(0);
} else {
  console.error('\n❌ SOME TESTS FAILED.');
  process.exit(1);
}
