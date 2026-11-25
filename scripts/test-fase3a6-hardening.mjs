/**
 * Test Suite: FASE 3A.6 CLOUD SAFETY HARDENING
 *
 * Menguji tiga area pengerasan kritis:
 * 1. RSK-02: Emulator Guard & Environment Isolation (firebase.js)
 * 2. RSK-04: Stale Queue Recovery (offlineQueue.js & syncEngine.js)
 * 3. RSK-05: Tenant Root Provisioning Dependency (syncEngine.js & firestore.rules)
 */

import { indexedDB as fakeIDB, IDBKeyRange } from 'fake-indexeddb';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

import {
  EMULATOR_CONFIG,
  connectEmulatorsSafely,
  getEmulatorStatus,
} from '../src/services/firebase.js';

import {
  openQueueDB,
  enqueueOperation,
  getPendingOperations,
  claimOperationForProcessing,
  markOperationCompleted,
  markOperationFailed,
  getQueueItems,
  getQueueStats,
  clearQueue,
  recoverStaleProcessingOperations,
  QUEUE_STATUS,
} from '../src/services/offlineQueue.js';

import {
  resolveTenantId,
  ensureTenantRootProvisioned,
  processQueueCycle,
  executeSupplierTransaction,
} from '../src/services/syncEngine.js';

// Setup fake-indexeddb untuk lingkungan Node.js
globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = IDBKeyRange;

const PROJECT_ID = 'demo-catatan-hardening';
const RULES_PATH = path.resolve('firestore.rules');
const rules = fs.readFileSync(RULES_PATH, 'utf8');

const results = [];

function recordResult(testId, name, status, details = '') {
  results.push({ testId, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Uji ${testId}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runHardeningTestSuite() {
  console.log('=================================================================');
  console.log('      FASE 3A.6: CLOUD SAFETY HARDENING VERIFICATION SUITE       ');
  console.log('=================================================================\n');

  // Inisialisasi Environment Testing Firestore Emulator dengan Rules aktual
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: EMULATOR_CONFIG.host,
      port: EMULATOR_CONFIG.firestorePort,
    },
  });

  const ownerAlice = 'uid_alice_hardening_123';
  const ownerBob = 'uid_bob_hardening_456';
  const ownerCharlie = 'uid_charlie_hardening_789';
  const tenantAlice = resolveTenantId(ownerAlice);
  const tenantBob = resolveTenantId(ownerBob);
  const tenantCharlie = resolveTenantId(ownerCharlie);

  const aliceDb = testEnv.authenticatedContext(ownerAlice).firestore();
  const bobDb = testEnv.authenticatedContext(ownerBob).firestore();
  const charlieDb = testEnv.authenticatedContext(ownerCharlie).firestore();

  try {
    await clearQueue(ownerAlice, fakeIDB);
    await clearQueue(ownerBob, fakeIDB);

    // =========================================================================
    // KELOMPOK 1: RSK-02 — EMULATOR GUARD & ENVIRONMENT ISOLATION
    // =========================================================================
    console.log('--- KELOMPOK 1: RSK-02 — Emulator Guard & Environment Isolation ---');

    // Uji 1.1: Validasi konfigurasi target emulator
    if (
      EMULATOR_CONFIG.host === '127.0.0.1' &&
      EMULATOR_CONFIG.firestorePort === 8080 &&
      EMULATOR_CONFIG.authPort === 9099 &&
      EMULATOR_CONFIG.authUrl === 'http://127.0.0.1:9099'
    ) {
      recordResult('1.1', 'Konfigurasi Endpoint Emulator Terdefinisi Eksplisit & Benar', 'PASS');
    } else {
      recordResult('1.1', 'Konfigurasi Endpoint Emulator Terdefinisi Eksplisit & Benar', 'FAIL', JSON.stringify(EMULATOR_CONFIG));
    }

    // Uji 1.2: Status Emulator dan pencegahan duplikasi koneksi (Idempotensi Guard)
    const conn1 = connectEmulatorsSafely();
    const conn2 = connectEmulatorsSafely();
    const statusObj = getEmulatorStatus();

    if (
      conn1.connected === true &&
      conn2.connected === true &&
      conn2.alreadyConnected === true &&
      statusObj.isConnected === true
    ) {
      recordResult('1.2', 'Koneksi Emulator Aman Terhadap Duplikasi / Vite HMR', 'PASS');
    } else {
      recordResult('1.2', 'Koneksi Emulator Aman Terhadap Duplikasi / Vite HMR', 'FAIL', JSON.stringify({ conn1, conn2, statusObj }));
    }

    // Uji 1.3: Tidak ada kebocoran API Key / kredensial sensitif pada getEmulatorStatus
    const statusKeys = Object.keys(statusObj);
    const hasSensitiveLeak = JSON.stringify(statusObj).includes('AIzaSy') || statusKeys.includes('apiKey');
    if (!hasSensitiveLeak) {
      recordResult('1.3', 'Pemeriksaan getEmulatorStatus Bebas dari Kebocoran Kredensial', 'PASS');
    } else {
      recordResult('1.3', 'Pemeriksaan getEmulatorStatus Bebas dari Kebocoran Kredensial', 'FAIL', 'Ditemukan kebocoran kredensial');
    }

    // =========================================================================
    // KELOMPOK 2: RSK-04 — STALE QUEUE RECOVERY
    // =========================================================================
    console.log('\n--- KELOMPOK 2: RSK-04 — Stale Queue Recovery ---');

    // Uji 2.1: Operasi dengan status 'processing' kadaluwarsa (lewat lease) berhasil dipulihkan ke 'pending'
    const staleOpId = 'op_stale_test_001';
    await enqueueOperation(
      {
        opId: staleOpId,
        operationType: 'CREATE',
        entityType: 'suppliers',
        entityId: 'supp_stale_1',
        payload: { id: 'supp_stale_1', name: 'Toko Stale 1' },
        ownerUid: ownerAlice,
      },
      fakeIDB
    );

    // Klaim operasi untuk menjadikannya 'processing'
    await claimOperationForProcessing(
      {
        opId: staleOpId,
        expectedOwnerUid: ownerAlice,
        workerId: 'crashed_worker',
        leaseTimeoutMs: 1000,
      },
      fakeIDB
    );

    // Manipulasi timestamp processingStartedAt menjadi 120 detik yang lalu di IndexedDB
    const dbInst = await openQueueDB(fakeIDB);
    await new Promise((resolve, reject) => {
      const tx = dbInst.transaction('operations', 'readwrite');
      const store = tx.objectStore('operations');
      const getReq = store.get(staleOpId);
      getReq.onsuccess = () => {
        const item = getReq.result;
        item.processingStartedAt = new Date(Date.now() - 120000).toISOString();
        store.put(item);
      };
      tx.oncomplete = () => {
        dbInst.close();
        resolve();
      };
      tx.onerror = () => {
        dbInst.close();
        reject(tx.error);
      };
    });

    // Jalankan recovery dengan timeout 60 detik (seharusnya mendeteksi 120s > 60s)
    const recRes = await recoverStaleProcessingOperations(ownerAlice, 60000, fakeIDB);
    const staleOps = await getQueueItems({ ownerUid: ownerAlice }, fakeIDB);
    const recoveredOp = staleOps.find((x) => x.opId === staleOpId);

    if (
      recRes.ok === true &&
      recRes.recoveredCount === 1 &&
      recoveredOp &&
      recoveredOp.status === QUEUE_STATUS.PENDING &&
      recoveredOp.lastError &&
      recoveredOp.lastError.includes('stale')
    ) {
      recordResult('2.1', 'Operasi Stale Terdeteksi & Berhasil Dikembalikan ke Pending', 'PASS');
    } else {
      recordResult('2.1', 'Operasi Stale Terdeteksi & Berhasil Dikembalikan ke Pending', 'FAIL', JSON.stringify({ recRes, recoveredOp }));
    }

    // Uji 2.2: Operasi yang masih dalam lease aktif TIDAK dipulihkan
    const activeOpId = 'op_active_lease_002';
    await enqueueOperation(
      {
        opId: activeOpId,
        operationType: 'CREATE',
        entityType: 'suppliers',
        entityId: 'supp_active_2',
        payload: { id: 'supp_active_2', name: 'Toko Active 2' },
        ownerUid: ownerAlice,
      },
      fakeIDB
    );

    await claimOperationForProcessing(
      {
        opId: activeOpId,
        expectedOwnerUid: ownerAlice,
        workerId: 'active_worker',
        leaseTimeoutMs: 60000,
      },
      fakeIDB
    );

    const recActiveRes = await recoverStaleProcessingOperations(ownerAlice, 60000, fakeIDB);
    const activeOps = await getQueueItems({ ownerUid: ownerAlice }, fakeIDB);
    const stillActiveOp = activeOps.find((x) => x.opId === activeOpId);

    if (
      recActiveRes.recoveredCount === 0 &&
      stillActiveOp &&
      stillActiveOp.status === QUEUE_STATUS.PROCESSING
    ) {
      recordResult('2.2', 'Operasi dengan Lease Aktif TIDAK Boleh Dipulihkan Prematur', 'PASS');
    } else {
      recordResult('2.2', 'Operasi dengan Lease Aktif TIDAK Boleh Dipulihkan Prematur', 'FAIL', JSON.stringify({ recActiveRes, stillActiveOp }));
    }

    // Uji 2.3: Isolasi Stale Recovery berdasarkan ownerUid (tidak memulihkan milik owner lain)
    const bobStaleOpId = 'op_bob_stale_003';
    await enqueueOperation(
      {
        opId: bobStaleOpId,
        operationType: 'CREATE',
        entityType: 'suppliers',
        entityId: 'supp_bob_3',
        payload: { id: 'supp_bob_3', name: 'Toko Bob 3' },
        ownerUid: ownerBob,
      },
      fakeIDB
    );

    await claimOperationForProcessing(
      {
        opId: bobStaleOpId,
        expectedOwnerUid: ownerBob,
        workerId: 'bob_crashed_worker',
        leaseTimeoutMs: 1000,
      },
      fakeIDB
    );

    // Manipulasi timestamp Bob menjadi 120s yang lalu
    const dbBob = await openQueueDB(fakeIDB);
    await new Promise((resolve, reject) => {
      const tx = dbBob.transaction('operations', 'readwrite');
      const store = tx.objectStore('operations');
      const getReq = store.get(bobStaleOpId);
      getReq.onsuccess = () => {
        const item = getReq.result;
        item.processingStartedAt = new Date(Date.now() - 120000).toISOString();
        store.put(item);
      };
      tx.oncomplete = () => {
        dbBob.close();
        resolve();
      };
      tx.onerror = () => {
        dbBob.close();
        reject(tx.error);
      };
    });

    // Jalankan recovery untuk ALICE (bukan Bob)
    const recAliceForBob = await recoverStaleProcessingOperations(ownerAlice, 60000, fakeIDB);
    const bobOps = await getQueueItems({ ownerUid: ownerBob }, fakeIDB);
    const bobOpStillProcessing = bobOps.find((x) => x.opId === bobStaleOpId);

    if (
      recAliceForBob.recoveredCount === 0 &&
      bobOpStillProcessing &&
      bobOpStillProcessing.status === QUEUE_STATUS.PROCESSING
    ) {
      recordResult('2.3', 'Isolasi Akun Terjamin: Stale Recovery Milik Alice Tidak Mengganggu Milik Bob', 'PASS');
    } else {
      recordResult('2.3', 'Isolasi Akun Terjamin: Stale Recovery Milik Alice Tidak Mengganggu Milik Bob', 'FAIL', JSON.stringify({ recAliceForBob, bobOpStillProcessing }));
    }

    // Uji 2.4: Integrasi Otomatis Stale Recovery dalam processQueueCycle
    // Bersihkan antrean agar terisolasi
    await clearQueue(ownerAlice, fakeIDB);

    // Masukkan operasi dan buat menjadi stale
    const cycleStaleOpId = 'op_cycle_stale_004';
    await enqueueOperation(
      {
        opId: cycleStaleOpId,
        operationType: 'CREATE',
        entityType: 'suppliers',
        entityId: 'supp_cycle_4',
        payload: { id: 'supp_cycle_4', name: 'Toko Cycle 4' },
        ownerUid: ownerAlice,
      },
      fakeIDB
    );

    await claimOperationForProcessing(
      {
        opId: cycleStaleOpId,
        expectedOwnerUid: ownerAlice,
        workerId: 'dead_tab_worker',
        leaseTimeoutMs: 1000,
      },
      fakeIDB
    );

    // Buat timestamp usang
    const dbCycle = await openQueueDB(fakeIDB);
    await new Promise((resolve, reject) => {
      const tx = dbCycle.transaction('operations', 'readwrite');
      const store = tx.objectStore('operations');
      const getReq = store.get(cycleStaleOpId);
      getReq.onsuccess = () => {
        const item = getReq.result;
        item.processingStartedAt = new Date(Date.now() - 120000).toISOString();
        store.put(item);
      };
      tx.oncomplete = () => {
        dbCycle.close();
        resolve();
      };
      tx.onerror = () => {
        dbCycle.close();
        reject(tx.error);
      };
    });

    // Panggil processQueueCycle secara normal; harus memulihkan operasi stale dan memprosesnya hingga completed!
    const cycleDrainRes = await processQueueCycle(ownerAlice, {
      customDb: aliceDb,
      customFactory: fakeIDB,
      staleTimeoutMs: 60000,
    });

    const finalOps = await getQueueItems({ ownerUid: ownerAlice }, fakeIDB);
    const finalCycleOp = finalOps.find((x) => x.opId === cycleStaleOpId);

    if (
      cycleDrainRes.ok === true &&
      cycleDrainRes.processedCount === 1 &&
      finalCycleOp &&
      finalCycleOp.status === QUEUE_STATUS.COMPLETED
    ) {
      recordResult('2.4', 'Integrasi processQueueCycle Menguras Operasi Stale Hingga Selesai', 'PASS');
    } else {
      recordResult('2.4', 'Integrasi processQueueCycle Menguras Operasi Stale Hingga Selesai', 'FAIL', JSON.stringify({ cycleDrainRes, finalCycleOp }));
    }

    // =========================================================================
    // KELOMPOK 3: RSK-05 — TENANT ROOT PROVISIONING DEPENDENCY
    // =========================================================================
    console.log('\n--- KELOMPOK 3: RSK-05 — Tenant Root Provisioning Dependency ---');

    // Uji 3.1: Validasi input ownerUid pada ensureTenantRootProvisioned
    const provInvalid = await ensureTenantRootProvisioned('');
    if (provInvalid.ok === false && provInvalid.error.includes('ownerUid wajib')) {
      recordResult('3.1', 'ensureTenantRootProvisioned Menolak ownerUid Kosong', 'PASS');
    } else {
      recordResult('3.1', 'ensureTenantRootProvisioned Menolak ownerUid Kosong', 'FAIL', JSON.stringify(provInvalid));
    }

    // Uji 3.2: Inisialisasi awal (pembuatan) dokumen root tenant baru
    const provCharlie1 = await ensureTenantRootProvisioned(ownerCharlie, {
      customDb: charlieDb,
      storeName: 'Warung Madura Charlie',
    });

    const tenantCharlieSnap = await getDoc(doc(charlieDb, 'stores_app', tenantCharlie));

    if (
      provCharlie1.ok === true &&
      provCharlie1.created === true &&
      tenantCharlieSnap.exists() &&
      tenantCharlieSnap.data().ownerUid === ownerCharlie &&
      tenantCharlieSnap.data().storeName === 'Warung Madura Charlie'
    ) {
      recordResult('3.2', 'Pembuatan Dokumen Root /stores_app/{tenantId} Berhasil & Terverifikasi', 'PASS');
    } else {
      recordResult('3.2', 'Pembuatan Dokumen Root /stores_app/{tenantId} Berhasil & Terverifikasi', 'FAIL', JSON.stringify({ provCharlie1, snap: tenantCharlieSnap.data() }));
    }

    // Uji 3.3: Idempotensi: Panggilan kedua tidak menimpa atau gagal jika sudah ada
    const provCharlie2 = await ensureTenantRootProvisioned(ownerCharlie, {
      customDb: charlieDb,
      storeName: 'Warung Madura Charlie Berganti', // Harusnya tidak ditimpa
    });

    const tenantCharlieSnap2 = await getDoc(doc(charlieDb, 'stores_app', tenantCharlie));

    if (
      provCharlie2.ok === true &&
      provCharlie2.existed === true &&
      tenantCharlieSnap2.data().storeName === 'Warung Madura Charlie'
    ) {
      recordResult('3.3', 'ensureTenantRootProvisioned Idempoten & Mempertahankan Data Lama', 'PASS');
    } else {
      recordResult('3.3', 'ensureTenantRootProvisioned Idempoten & Mempertahankan Data Lama', 'FAIL', JSON.stringify({ provCharlie2, snap: tenantCharlieSnap2.data() }));
    }

    // Uji 3.4: Anti-Takeover: Ditolak jika dokumen root dimiliki oleh ownerUid lain atau tenantId mismatch
    // Simulasi: Bob mencoba memanggil ensureTenantRootProvisioned untuk tenant Alice
    const takeoverAttempt = await ensureTenantRootProvisioned(ownerBob, {
      customDb: bobDb,
      tenantId: tenantAlice, // Sengaja menargetkan tenant Alice
    });

    if (
      takeoverAttempt.ok === false &&
      (takeoverAttempt.error.includes('Anti-takeover') || takeoverAttempt.error.includes('PERMISSION_DENIED'))
    ) {
      recordResult('3.4', 'Anti-Takeover Aktif: Upaya Mengklaim Dokumen Root Pengguna Lain Ditolak', 'PASS');
    } else {
      recordResult('3.4', 'Anti-Takeover Aktif: Upaya Mengklaim Dokumen Root Pengguna Lain Ditolak', 'FAIL', JSON.stringify(takeoverAttempt));
    }

    // Uji 3.5: Verifikasi Aturan Keamanan (Rules) untuk Subcollection Supplier dengan Root Provisioned
    // Sebelum root ada, subcollection write ditolak oleh isStoreOwner.
    // Sekarang dengan root yang sudah ada, transaksi supplier Alice harus sukses!
    const supplierWriteOp = {
      opId: 'op_supp_rules_test_001',
      ownerUid: ownerAlice,
      operationType: 'CREATE',
      entityId: 'supp_rules_001',
      payload: {
        id: 'supp_rules_001',
        name: 'Agen Sembako Makmur',
        phone: '081234567890',
        address: 'Jl. Madura Indah No. 5',
      },
    };

    const txRes = await executeSupplierTransaction(supplierWriteOp, {
      customDb: aliceDb,
    });

    const suppSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'supp_rules_001'));
    const ledgerSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'operations_log', 'op_supp_rules_test_001'));

    if (
      txRes.success === true &&
      suppSnap.exists() &&
      suppSnap.data().name === 'Agen Sembako Makmur' &&
      ledgerSnap.exists()
    ) {
      recordResult('3.5', 'Security Rules isStoreOwner Berhasil Memvalidasi Subcollection Setelah Root Provisioning', 'PASS');
    } else {
      recordResult('3.5', 'Security Rules isStoreOwner Berhasil Memvalidasi Subcollection Setelah Root Provisioning', 'FAIL', JSON.stringify({ txRes }));
    }

    // Uji 3.6: Isolasi Antar-Pengguna pada Level Firestore Subcollection
    // Bob mencoba mengakses data supplier Alice -> Harus ditolak PERMISSION_DENIED oleh rules
    let bobReadBlocked = false;
    try {
      await getDoc(doc(bobDb, 'stores_app', tenantAlice, 'suppliers', 'supp_rules_001'));
    } catch (e) {
      bobReadBlocked = true;
    }

    if (bobReadBlocked) {
      recordResult('3.6', 'Akses Lintas Tenant Ditolak Secara Tegas oleh Firestore Rules', 'PASS');
    } else {
      recordResult('3.6', 'Akses Lintas Tenant Ditolak Secara Tegas oleh Firestore Rules', 'FAIL', 'Bob berhasil membaca data Alice!');
    }

    // =========================================================================
    // RINGKASAN AKHIR
    // =========================================================================
    console.log('\n=================================================================');
    console.log('                 RINGKASAN HASIL PENGUJIAN                       ');
    console.log('=================================================================');
    const total = results.length;
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;
    console.log(`Total Uji   : ${total}`);
    console.log(`Lulus (PASS): ${passed}`);
    console.log(`Gagal (FAIL): ${failed}`);

    if (failed > 0) {
      console.error('\n⚠️ TERDAPAT PENGUJIAN YANG GAGAL!');
      process.exit(1);
    } else {
      console.log('\n🎉 SEMUA PENGUJIAN HARDENING FASE 3A.6 LULUS SEMPURNA (100%)!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal Test Error:', err);
    process.exit(1);
  } finally {
    await testEnv.cleanup();
  }
}

runHardeningTestSuite();
