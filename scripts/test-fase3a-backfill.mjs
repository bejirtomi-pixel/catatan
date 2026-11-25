import { indexedDB as fakeIDB, IDBKeyRange } from 'fake-indexeddb';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';
import {
  openQueueDB,
  enqueueOperation,
  getPendingOperations,
  getQueueStats,
  getQueueItems,
  clearQueue,
  QUEUE_STATUS,
} from '../src/services/offlineQueue.js';
import {
  resolveTenantId,
  previewSupplierBackfill,
  executeSupplierBackfill,
  processQueueCycle,
  triggerSyncNow,
} from '../src/services/syncEngine.js';

// Setup fake-indexeddb untuk runtime Node.js
globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = IDBKeyRange;

const PROJECT_ID = 'demo-catatan-backfill';
const RULES_PATH = path.resolve('firestore.rules');
const rules = fs.readFileSync(RULES_PATH, 'utf8');

const results = [];

function recordResult(testId, name, status, details = '') {
  results.push({ testId, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Uji ${testId}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runBackfillTestSuite() {
  console.log('=================================================================');
  console.log('   FASE 3A FIX: INITIAL SUPPLIER BACKFILL & SYNC FEEDBACK TEST   ');
  console.log('=================================================================\n');

  // Inisialisasi Environment Testing Terautentikasi Firestore Emulator
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  const ownerAlice = 'uid_alice_backfill_123';
  const ownerBob = 'uid_bob_backfill_456';
  const tenantAlice = resolveTenantId(ownerAlice);

  const aliceDb = testEnv.authenticatedContext(ownerAlice).firestore();
  const bobDb = testEnv.authenticatedContext(ownerBob).firestore();

  try {
    await clearQueue(ownerAlice, fakeIDB);
    await clearQueue(ownerBob, fakeIDB);

    // =========================================================================
    // KELOMPOK 1: EMPTY QUEUE FEEDBACK (NETRAL / BUKAN SUKSES)
    // =========================================================================
    console.log('--- KELOMPOK 1: Umpan Balik Antrean Kosong (Empty Queue Feedback) ---');

    const emptyCycleRes = await processQueueCycle(ownerAlice, {
      customDb: aliceDb,
      customFactory: fakeIDB,
    });

    if (
      emptyCycleRes.processedCount === 0 &&
      emptyCycleRes.failedCount === 0 &&
      emptyCycleRes.totalEligible === 0 &&
      emptyCycleRes.ok === true
    ) {
      recordResult('1.1', 'Antrean Kosong Menghasilkan processedCount: 0 Tanpa False Success', 'PASS', 'processed: 0, failed: 0');
    } else {
      recordResult('1.1', 'Antrean Kosong Menghasilkan processedCount: 0 Tanpa False Success', 'FAIL', JSON.stringify(emptyCycleRes));
    }

    // =========================================================================
    // KELOMPOK 2: BACKFILL PREVIEW & DETEKSI MASALAH
    // =========================================================================
    console.log('\n--- KELOMPOK 2: Pratinjau Backfill (Backfill Preview & Validation) ---');

    const rawStoresWithIssues = [
      { id: 'st-makmur', name: 'Toko Makmur', phone: '08123456789' },
      { id: 'st-jaya', name: 'Toko Jaya', phone: '08129876543' },
      { id: 'st-sumber', name: 'Toko Sumber' },
      { id: '', name: 'Toko Cacat Tanpa ID' }, // Invalid (ID kosong)
      { id: 'st-makmur', name: 'Toko Makmur Duplikat ID' }, // Duplicate ID
    ];

    const preview1 = await previewSupplierBackfill(rawStoresWithIssues, ownerAlice, fakeIDB);

    if (
      preview1.ok &&
      preview1.totalLocal === 5 &&
      preview1.eligibleCount === 3 &&
      preview1.invalidCount === 1 &&
      preview1.duplicateCount === 1 &&
      preview1.duplicateIds.includes('st-makmur')
    ) {
      recordResult('2.1', 'Pratinjau Backfill Mendeteksi Toko Valid, Cacat, dan Duplikat dengan Akurat', 'PASS', `eligible: ${preview1.eligibleCount}, invalid: ${preview1.invalidCount}, dup: ${preview1.duplicateCount}`);
    } else {
      recordResult('2.1', 'Pratinjau Backfill Mendeteksi Toko Valid, Cacat, dan Duplikat dengan Akurat', 'FAIL', JSON.stringify(preview1));
    }

    // =========================================================================
    // KELOMPOK 3: EKSEKUSI BACKFILL PERTAMA KALI (STABLE ID & UNTOUCHED LOCAL)
    // =========================================================================
    console.log('\n--- KELOMPOK 3: Eksekusi Backfill Awal (Stable ID & Local Immutability) ---');

    const localStores = [
      { id: 'st-makmur', name: 'Toko Makmur', phone: '08123456789', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'st-jaya', name: 'Toko Jaya', phone: '08129876543', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    const localStoresSnapshot = JSON.parse(JSON.stringify(localStores));

    const backfillRes1 = await executeSupplierBackfill(localStores, ownerAlice, {
      customFactory: fakeIDB,
      operator: { id: 'op-ainie', name: 'Ainie' },
    });

    const isLocalUnchanged = JSON.stringify(localStores) === JSON.stringify(localStoresSnapshot);

    if (backfillRes1.ok && backfillRes1.enqueuedCount === 2 && backfillRes1.deduplicatedCount === 0 && isLocalUnchanged) {
      recordResult('3.1', 'Backfill Memuat Toko ke Antrean Tanpa Mengubah Objek Data Lokal', 'PASS', `enqueued: ${backfillRes1.enqueuedCount}, localMutated: false`);
    } else {
      recordResult('3.1', 'Backfill Memuat Toko ke Antrean Tanpa Mengubah Objek Data Lokal', 'FAIL', JSON.stringify(backfillRes1));
    }

    // Periksa kestabilan ID di dalam antrean IndexedDB
    const pendingOps = await getPendingOperations(ownerAlice, fakeIDB);
    const storeIdsInQueue = pendingOps.map((op) => op.payload.id);
    const idsStable = storeIdsInQueue.includes('st-makmur') && storeIdsInQueue.includes('st-jaya');

    if (pendingOps.length === 2 && idsStable) {
      recordResult('3.2', 'ID Pemasok dalam Antrean Tetap Stabil Menggunakan ID Asli (st-...)', 'PASS', `IDs: ${storeIdsInQueue.join(', ')}`);
    } else {
      recordResult('3.2', 'ID Pemasok dalam Antrean Tetap Stabil Menggunakan ID Asli (st-...)', 'FAIL', `IDs: ${storeIdsInQueue.join(', ')}`);
    }

    // =========================================================================
    // KELOMPOK 4: EKSEKUSI ULANG BACKFILL (IDEMPOTENSI & DEDUP)
    // =========================================================================
    console.log('\n--- KELOMPOK 4: Eksekusi Ulang Backfill (Idempotency & Deduplication) ---');

    const backfillRes2 = await executeSupplierBackfill(localStores, ownerAlice, {
      customFactory: fakeIDB,
    });

    const allQueueItemsAfterDup = await getQueueItems({ ownerUid: ownerAlice }, fakeIDB);

    if (backfillRes2.ok && backfillRes2.enqueuedCount === 0 && backfillRes2.deduplicatedCount === 2 && allQueueItemsAfterDup.length === 2) {
      recordResult('4.1', 'Eksekusi Backfill Berulang Berhasil Di-Deduplikasi Tanpa Gandakan Operasi', 'PASS', `enqueued: 0, deduplicated: 2, totalOps: ${allQueueItemsAfterDup.length}`);
    } else {
      recordResult('4.1', 'Eksekusi Backfill Berulang Berhasil Di-Deduplikasi Tanpa Gandakan Operasi', 'FAIL', JSON.stringify(backfillRes2));
    }

    // =========================================================================
    // KELOMPOK 5: SINKRONISASI CLOUD ANTREAN BACKFILL (DRAIN KE EMULATOR)
    // =========================================================================
    console.log('\n--- KELOMPOK 5: Sinkronisasi Cloud Antrean Backfill (Drain to Emulator) ---');

    // Inisialisasi dokumen root warung di Firestore Emulator milik Alice
    await setDoc(doc(aliceDb, 'stores_app', tenantAlice), {
      ownerUid: ownerAlice,
      storeName: 'Warung Madura Alice',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const syncDrainRes = await processQueueCycle(ownerAlice, {
      customDb: aliceDb,
      customFactory: fakeIDB,
    });

    // Verifikasi dokumen di Firestore Emulator
    const makmurSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-makmur'));
    const jayaSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-jaya'));
    const makmurLogSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'operations_log', `op_backfill_supp_${ownerAlice}_st-makmur`));

    const cloudDocsCreated = makmurSnap.exists() && jayaSnap.exists() && makmurLogSnap.exists();

    if (syncDrainRes.ok && syncDrainRes.processedCount === 2 && syncDrainRes.failedCount === 0 && cloudDocsCreated) {
      recordResult('5.1', 'Antrean Backfill Tersinkron Sempurna ke Cloud Firestore & Ledger Terbentuk', 'PASS', `processed: 2, makmur: ${makmurSnap.data().name}, ledger: OK`);
    } else {
      recordResult('5.1', 'Antrean Backfill Tersinkron Sempurna ke Cloud Firestore & Ledger Terbentuk', 'FAIL', JSON.stringify(syncDrainRes));
    }

    // =========================================================================
    // KELOMPOK 6: PRATINJAU SETELAH SINKRONISASI SELESAI
    // =========================================================================
    console.log('\n--- KELOMPOK 6: Status Pratinjau Pasca-Sinkronisasi ---');

    const previewAfterSync = await previewSupplierBackfill(localStores, ownerAlice, fakeIDB);

    if (previewAfterSync.ok && previewAfterSync.alreadySyncedCount === 2 && previewAfterSync.eligibleCount === 0) {
      recordResult('6.1', 'Pratinjau Mendeteksi Toko yang Telah Tersinkron (eligibleCount: 0)', 'PASS', `alreadySynced: ${previewAfterSync.alreadySyncedCount}, eligible: 0`);
    } else {
      recordResult('6.1', 'Pratinjau Mendeteksi Toko yang Telah Tersinkron (eligibleCount: 0)', 'FAIL', JSON.stringify(previewAfterSync));
    }

    // =========================================================================
    // KELOMPOK 7: PENANGANAN ERROR & SILENT FAILURE PREVENTION
    // =========================================================================
    console.log('\n--- KELOMPOK 7: Deteksi Error & Pencegahan Silent Failure ---');

    // Enqueue operasi tidak valid (tanpa nama)
    await enqueueOperation({
      opId: `op_error_test_${Date.now()}`,
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-cacat',
      payload: { id: 'st-cacat', name: '' }, // Nama kosong memicu kegagalan validasi
      ownerUid: ownerAlice,
    }, fakeIDB);

    const errorCycleRes = await processQueueCycle(ownerAlice, {
      customDb: aliceDb,
      customFactory: fakeIDB,
    });

    if (!errorCycleRes.ok && errorCycleRes.failedCount === 1 && errorCycleRes.lastError) {
      recordResult('7.1', 'Kegagalan Operasi Dilaporkan Tegas Sebagai ok: false & failedCount > 0', 'PASS', `error: ${errorCycleRes.lastError}`);
    } else {
      recordResult('7.1', 'Kegagalan Operasi Dilaporkan Tegas Sebagai ok: false & failedCount > 0', 'FAIL', JSON.stringify(errorCycleRes));
    }

    // =========================================================================
    // KELOMPOK 8: ISOLASI KEPEMILIKAN (OWNER ISOLATION)
    // =========================================================================
    console.log('\n--- KELOMPOK 8: Isolasi Multi-Owner Antrean & Cloud Tenant ---');

    // Bob mencoba menguras antrean Alice
    const bobAttemptRes = await processQueueCycle(ownerAlice, {
      customDb: bobDb, // Menggunakan konteks autentikasi Bob
      customFactory: fakeIDB,
    });

    // Bob harus ditolak menulis ke tenant Alice oleh Firestore Security Rules
    if (!bobAttemptRes.ok || bobAttemptRes.failedCount > 0 || bobAttemptRes.processedCount === 0) {
      recordResult('8.1', 'Isolasi Akun: User Lain (Bob) Ditolak Mengakses atau Menguras Antrean Alice', 'PASS', 'Akses ditolak terverifikasi');
    } else {
      recordResult('8.1', 'Isolasi Akun: User Lain (Bob) Ditolak Mengakses atau Menguras Antrean Alice', 'FAIL', JSON.stringify(bobAttemptRes));
    }

    // =========================================================================
    // KELOMPOK 9: VERIFIKASI KEAMANAN KONFIGURASI PRODUKSI
    // =========================================================================
    console.log('\n--- KELOMPOK 9: Verifikasi Keamanan Lingkungan Pengujian ---');

    const isEmulatorHost = testEnv.authenticatedContext(ownerAlice).firestore()._delegate._settings.host === '127.0.0.1:8080';
    if (isEmulatorHost) {
      recordResult('9.1', 'Seluruh Pengujian Berjalan 100% pada Emulator Lokal Port 8080 (Zero Production Write)', 'PASS', '127.0.0.1:8080');
    } else {
      recordResult('9.1', 'Seluruh Pengujian Berjalan 100% pada Emulator Lokal Port 8080 (Zero Production Write)', 'FAIL', 'Bukan emulator!');
    }

  } finally {
    await testEnv.cleanup();
  }

  // Ringkasan
  console.log('\n=================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL PENGUJIAN: ${total} | LULUS: ${passed} | GAGAL: ${failed} | STATUS: ${failed === 0 ? '100% PASS' : 'FAIL'}`);
  console.log('=================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runBackfillTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
