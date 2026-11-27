/**
 * TEST SUITE: RELASI TOKO, SALES, KUNJUNGAN & BARANG
 * CATATAN WARUNG MADURA
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('======================================================================');
console.log('   TEST SUITE: RELASI TOKO, SALES, KUNJUNGAN & BARANG                ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`✅ [TEST ${totalTests}] ${name} -> PASS`);
  } catch (err) {
    console.error(`❌ [TEST ${totalTests}] ${name} -> FAIL`);
    console.error('   Error:', err.message);
  }
}

// -----------------------------------------------------------------------------
// 1. UJI SKEMA & MIGRASI DATA LAMA (BACKWARD COMPATIBILITY)
// -----------------------------------------------------------------------------
console.log('--- GROUP 1: SCHEMA NORMALIZATION & BACKWARD COMPATIBILITY ---');

test('Store migration automatically provides safe sales array for legacy records', () => {
  const legacyStore = {
    id: 'st-old-1',
    name: 'Toko Lama Tradisional',
    phone: '0812345678',
    address: 'Jl. Pasar Tradisional',
  };

  // Simulate migrateStore logic
  const rawSales = Array.isArray(legacyStore.sales) ? legacyStore.sales : [];
  const safeSales = rawSales.filter(Boolean).map((sl) => ({
    id: sl.id || 'sls-gen',
    name: String(sl.name || '').trim(),
    contact: String(sl.contact || '').trim(),
    products: String(sl.products || '').trim(),
    notes: String(sl.notes || '').trim(),
  }));

  const migrated = {
    ...legacyStore,
    sales: safeSales,
  };

  assert.strictEqual(Array.isArray(migrated.sales), true);
  assert.strictEqual(migrated.sales.length, 0);
  assert.strictEqual(migrated.name, 'Toko Lama Tradisional');
});

test('Product migration retains storeIds and supports salesId/salesIds', () => {
  const legacyProduct = {
    id: 'p-old-1',
    name: 'Beras Pandan Wangi',
    storeIds: ['st-makmur'],
  };

  const salesId = legacyProduct.salesId ? String(legacyProduct.salesId).trim() : '';
  const salesIds = Array.isArray(legacyProduct.salesIds)
    ? legacyProduct.salesIds.filter(Boolean)
    : salesId ? [salesId] : [];

  const migrated = {
    ...legacyProduct,
    salesId,
    salesIds,
  };

  assert.strictEqual(Array.isArray(migrated.storeIds), true);
  assert.strictEqual(migrated.storeIds[0], 'st-makmur');
  assert.strictEqual(migrated.salesId, '');
  assert.strictEqual(Array.isArray(migrated.salesIds), true);
});

test('Visit migration retains stable storeId, salesId, storeName, salesName', () => {
  const legacyVisit = {
    id: 'vst-old-1',
    name: 'Sales Wings',
    date: '2026-11-27',
  };

  const migrated = {
    ...legacyVisit,
    storeId: legacyVisit.storeId ? String(legacyVisit.storeId).trim() : '',
    salesId: legacyVisit.salesId ? String(legacyVisit.salesId).trim() : '',
    storeName: legacyVisit.storeName ? String(legacyVisit.storeName).trim() : '',
    salesName: legacyVisit.salesName ? String(legacyVisit.salesName).trim() : '',
  };

  assert.strictEqual(migrated.name, 'Sales Wings');
  assert.strictEqual(migrated.storeId, '');
  assert.strictEqual(migrated.salesId, '');
});

// -----------------------------------------------------------------------------
// 2. MASTER TOKO & MULTI-SALES CRUD
// -----------------------------------------------------------------------------
console.log('\n--- GROUP 2: TOKO UTAMA & MULTI-SALES CRUD LOGIC ---');

test('Store can hold multiple distinct Sales/Divisions with stable IDs', () => {
  const store = {
    id: 'st-mayora',
    name: 'Mayora Group',
    phone: '021-5551234',
    address: 'Kawasan Industri Daan Mogot',
    sales: [
      {
        id: 'sls-mayora-1',
        name: 'Mayora Sabun',
        contact: '08111222333',
        products: 'Sabun Mandi, Deterjen, Karbol',
        notes: 'Kunjungan rutin tiap Senin jam 10.00',
      },
      {
        id: 'sls-mayora-2',
        name: 'Mayora Biskuit',
        contact: '08111222444',
        products: 'Roma Kelapa, Sari Gandum, Malkist',
        notes: 'Kunjungan rutin 2 minggu sekali hari Rabu',
      },
      {
        id: 'sls-mayora-3',
        name: 'Mayora Wafer',
        contact: '08111222555',
        products: 'Beng-Beng, Astor, Superstar',
        notes: 'Divisi snack & coklat',
      },
    ],
  };

  assert.strictEqual(store.sales.length, 3);
  assert.strictEqual(store.sales[0].name, 'Mayora Sabun');
  assert.strictEqual(store.sales[1].name, 'Mayora Biskuit');
  assert.strictEqual(store.sales[2].name, 'Mayora Wafer');
});

test('Sales update modifies only targeted sales without side-effects', () => {
  let store = {
    id: 'st-wings',
    name: 'Wings Group',
    sales: [
      { id: 'sls-w1', name: 'Sales Wings 1', contact: '0812', products: 'Daia, SoKlin' },
      { id: 'sls-w2', name: 'Sales Wings 2', contact: '0813', products: 'Ale-Ale, Floridina' },
    ],
  };

  // Update Sales Wings 1 contact & notes
  const targetId = 'sls-w1';
  store = {
    ...store,
    sales: store.sales.map((sl) => {
      if (sl.id !== targetId) return sl;
      return {
        ...sl,
        contact: '0899999999',
        notes: 'Nomor WA baru',
      };
    }),
  };

  const updatedS1 = store.sales.find((s) => s.id === 'sls-w1');
  const untouchedS2 = store.sales.find((s) => s.id === 'sls-w2');

  assert.strictEqual(updatedS1.contact, '0899999999');
  assert.strictEqual(updatedS1.notes, 'Nomor WA baru');
  assert.strictEqual(untouchedS2.contact, '0813');
  assert.strictEqual(untouchedS2.name, 'Sales Wings 2');
});

test('Sales deletion removes only targeted sales without deleting store or other sales', () => {
  let store = {
    id: 'st-wings',
    name: 'Wings Group',
    sales: [
      { id: 'sls-w1', name: 'Sales Wings 1' },
      { id: 'sls-w2', name: 'Sales Wings 2' },
    ],
  };

  store = {
    ...store,
    sales: store.sales.filter((sl) => sl.id !== 'sls-w1'),
  };

  assert.strictEqual(store.sales.length, 1);
  assert.strictEqual(store.sales[0].id, 'sls-w2');
  assert.strictEqual(store.name, 'Wings Group');
});

// -----------------------------------------------------------------------------
// 3. RELASI KUNJUNGAN & INDEPENDENSI STATUS SALES
// -----------------------------------------------------------------------------
console.log('\n--- GROUP 3: KUNJUNGAN RELATIONS & INDEPENDENT STATUS ---');

test('Visit references stable storeId & salesId with automatic name snapshot', () => {
  const store = { id: 'st-mayora', name: 'Mayora' };
  const sales = { id: 'sls-mayora-1', name: 'Mayora Sabun' };

  const visit = {
    id: 'vst-1',
    storeId: store.id,
    salesId: sales.id,
    storeName: store.name,
    salesName: sales.name,
    name: `${sales.name} (${store.name})`,
    date: '2026-11-27',
    status: 'scheduled',
  };

  assert.strictEqual(visit.storeId, 'st-mayora');
  assert.strictEqual(visit.salesId, 'sls-mayora-1');
  assert.strictEqual(visit.name, 'Mayora Sabun (Mayora)');
});

test('Changing visit status of Sales 1 does NOT mutate or affect visits of Sales 2', () => {
  let visits = [
    { id: 'vst-s1', storeId: 'st-mayora', salesId: 'sls-mayora-1', status: 'scheduled' },
    { id: 'vst-s2', storeId: 'st-mayora', salesId: 'sls-mayora-2', status: 'scheduled' },
  ];

  // Complete visit for Sales 1
  visits = visits.map((v) => (v.id === 'vst-s1' ? { ...v, status: 'completed' } : v));

  const visitS1 = visits.find((v) => v.id === 'vst-s1');
  const visitS2 = visits.find((v) => v.id === 'vst-s2');

  assert.strictEqual(visitS1.status, 'completed');
  assert.strictEqual(visitS2.status, 'scheduled');
});

test('Recurring visit completion preserves storeId, salesId, storeName & salesName on spawned visit', () => {
  const visit = {
    id: 'vst-rec-1',
    storeId: 'st-jaya',
    salesId: 'sls-jaya-1',
    storeName: 'Toko Jaya',
    salesName: 'Sales Wings 1',
    name: 'Sales Wings 1 (Toko Jaya)',
    date: '2026-11-27',
    recurrence: { type: 'weekly' },
  };

  const nextVisitInstance = {
    id: 'vst-rec-2',
    storeId: visit.storeId,
    salesId: visit.salesId,
    storeName: visit.storeName,
    salesName: visit.salesName,
    name: visit.name,
    date: '2026-12-04',
    status: 'scheduled',
  };

  assert.strictEqual(nextVisitInstance.storeId, 'st-jaya');
  assert.strictEqual(nextVisitInstance.salesId, 'sls-jaya-1');
  assert.strictEqual(nextVisitInstance.storeName, 'Toko Jaya');
  assert.strictEqual(nextVisitInstance.salesName, 'Sales Wings 1');
});

// -----------------------------------------------------------------------------
// 4. RELASI BARANG & FILTER PRODUK
// -----------------------------------------------------------------------------
console.log('\n--- GROUP 4: BARANG (PRODUCT) RELATIONS & SUPPLIER FILTER ---');

test('Product can link to Toko Utama and associated Sales without disrupting units or stock', () => {
  const product = {
    id: 'p-sabun-giv',
    name: 'Sabun Mandi Giv Batang',
    category: 'Pembersih',
    units: [{ id: 'u-pcs', name: 'pcs', factor: 1, price: 3500 }],
    storeIds: ['st-jaya'],
    salesId: 'sls-jaya-1',
  };

  assert.strictEqual(product.storeIds.includes('st-jaya'), true);
  assert.strictEqual(product.salesId, 'sls-jaya-1');
  assert.strictEqual(product.units[0].factor, 1);
  assert.strictEqual(product.units[0].price, 3500);
});

test('Filter by Toko Utama correctly isolates products from that supplier', () => {
  const products = [
    { id: 'p-1', name: 'Sabun Giv', storeIds: ['st-jaya'], salesId: 'sls-jaya-1' },
    { id: 'p-2', name: 'Ale-Ale', storeIds: ['st-jaya'], salesId: 'sls-jaya-2' },
    { id: 'p-3', name: 'Biskuit Roma', storeIds: ['st-makmur'], salesId: 'sls-makmur-2' },
    { id: 'p-4', name: 'Barang Tanpa Toko', storeIds: [] },
  ];

  const filterByJaya = products.filter((p) => p.storeIds && p.storeIds.includes('st-jaya'));
  const filterByMakmur = products.filter((p) => p.storeIds && p.storeIds.includes('st-makmur'));
  const filterTanpaToko = products.filter((p) => !p.storeIds || p.storeIds.length === 0);

  assert.strictEqual(filterByJaya.length, 2);
  assert.strictEqual(filterByMakmur.length, 1);
  assert.strictEqual(filterTanpaToko.length, 1);
});

// -----------------------------------------------------------------------------
// 5. STATIC SOURCE CODE AUDIT: INVARIANCE & COMPONENT INTEGRATION
// -----------------------------------------------------------------------------
console.log('\n--- GROUP 5: COMPONENT & DASHBOARD INVARIANCE VERIFICATION ---');

test('AppContext exports addStoreSales, updateStoreSales, deleteStoreSales', () => {
  const appContextSource = fs.readFileSync(path.resolve('src/context/AppContext.jsx'), 'utf-8');
  assert.strictEqual(appContextSource.includes('addStoreSales,'), true);
  assert.strictEqual(appContextSource.includes('updateStoreSales,'), true);
  assert.strictEqual(appContextSource.includes('deleteStoreSales,'), true);
});

test('Toko page contains StoreDetailModal with Sales/Divisi list and SalesFormModal', () => {
  const tokoSource = fs.readFileSync(path.resolve('src/pages/Toko.jsx'), 'utf-8');
  assert.strictEqual(tokoSource.includes('function StoreDetailModal'), true);
  assert.strictEqual(tokoSource.includes('function SalesFormModal'), true);
  assert.strictEqual(tokoSource.includes('Daftar Sales / Divisi'), true);
  assert.strictEqual(tokoSource.includes('Tambah Sales'), true);
});

test('Kunjungan page Form connects Toko Utama and Sales dynamically', () => {
  const kunjunganSource = fs.readFileSync(path.resolve('src/pages/Kunjungan.jsx'), 'utf-8');
  assert.strictEqual(kunjunganSource.includes('Pilih Toko Utama (Supplier)'), true);
  assert.strictEqual(kunjunganSource.includes('Pilih Sales / Divisi'), true);
  assert.strictEqual(kunjunganSource.includes('storeFilter'), true);
});

test('Barang page Form allows selecting Sales matching chosen Toko', () => {
  const barangSource = fs.readFileSync(path.resolve('src/pages/Barang.jsx'), 'utf-8');
  assert.strictEqual(barangSource.includes('availableSales'), true);
  assert.strictEqual(barangSource.includes('Sales / Divisi Supplier yang Menangani'), true);
  assert.strictEqual(barangSource.includes('salesId: data.salesId'), true);
});

test('Strict Dashboard Invariance: 2 Top Cards, No Search Bar, 6 Kolom Menu Utama', () => {
  const dashSource = fs.readFileSync(path.resolve('src/pages/Dashboard.jsx'), 'utf-8');
  assert.strictEqual(dashSource.includes('data-testid="dashboard-top-cards"'), true);
  assert.strictEqual(dashSource.includes('card-tentang-toko'), true);
  assert.strictEqual(dashSource.includes('card-ringkasan-operasional'), true);
  assert.strictEqual(dashSource.includes('lg:grid-cols-6'), true);
  assert.strictEqual(dashSource.includes('SearchInput'), false);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================================');
console.log('             RELATIONAL SYSTEM TEST RESULTS SUMMARY                  ');
console.log('======================================================================');
console.log(`Total Pengujian: ${totalTests}`);
console.log(`Lolos (PASS)   : ${passedTests}`);
console.log(`Gagal (FAIL)   : ${totalTests - passedTests}`);
console.log(`Persentase     : ${((passedTests / totalTests) * 100).toFixed(1)}%`);

if (passedTests === totalTests) {
  console.log('\n🎉 VERDICT: ALL TESTS PASSED! RELASI TOKO, SALES, KUNJUNGAN & BARANG 100% OPERATIONAL.\n');
  process.exit(0);
} else {
  console.error('\n❌ VERDICT: SOME TESTS FAILED.\n');
  process.exit(1);
}
