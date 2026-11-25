import { indexedDB as fakeIDB, IDBKeyRange } from 'fake-indexeddb';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';
import {
  openQueueDB,
  enqueueOperation,
  getPendingOperations,
  getQueueStats,
  markOperationProcessing,
  markOperationCompleted,
  markOperationFailed,
  retryOperation,
  claimOperationForProcessing,
  recoverStaleProcessingOperations,
  clearQueue,
  QUEUE_STATUS,
} from '../src/services/offlineQueue.js';
import {
  resolveTenantId,
  validateSupplierPayload,
  executeSupplierTransaction,
  processQueueCycle,
  triggerSyncNow,
  ACTIVE_SYNC_DOMAINS,
  SYNC_ENGINE_STATUS,
} from '../src/services/syncEngine.js';

// Setup fake-indexeddb untuk runtime Node.js
globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = IDBKeyRange;

const PROJECT_ID = 'demo-catatan-fase3a';
const RULES_PATH = path.resolve('firestore.rules');
const rules = fs.readFileSync(RULES_PATH, 'utf8');

const results = [];

function recordResult(testId, name, status, details = '') {
  results.push({ testId, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Uji ${testId}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runFase3aTestSuite() {
  console.log('=================================================================');
  console.log('   FASE 3A: FIRESTORE SYNC ENGINE CORE & SUPPLIER PILOT TEST     ');
  console.log('=================================================================\n');

  // 1. Inisialisasi Environment Testing Terautentikasi Firestore Emulator
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  const ownerAlice = 'uid_alice_owner_123';
  const ownerBob = 'uid_bob_owner_456';
  const tenantAlice = resolveTenantId(ownerAlice); // store_uid_alice_owner_123
  const tenantBob = resolveTenantId(ownerBob);

  const aliceDb = testEnv.authenticatedContext(ownerAlice).firestore();
  const bobDb = testEnv.authenticatedContext(ownerBob).firestore();

  try {
    await clearQueue(ownerAlice);
    await clearQueue(ownerBob);

    // =================================================================
    // KELOMPOK A: OFFLINE QUEUE SECURITY GUARDS & ATOMIC CLAIM
    // =================================================================
    console.log('--- KELOMPOK A: Pengamanan Antrean Offline & Klaim Atomik ---');

    // A1: Enqueue operasi uji
    const op1 = await enqueueOperation({
      opId: 'op_test_retry_completed_01',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-makmur',
      payload: { id: 'st-makmur', name: 'Toko Makmur' },
      ownerUid: ownerAlice,
      operatorId: 'op-ainie',
      operatorName: 'Ainie',
    });

    // Tandai completed
    await markOperationCompleted('op_test_retry_completed_01', { ok: true }, ownerAlice);

    // Uji A1: retryOperation pada status completed DITOLAK
    const retryCompRes = await retryOperation('op_test_retry_completed_01', ownerAlice);
    if (!retryCompRes.ok && retryCompRes.error.includes('completed tidak boleh di-retry')) {
      recordResult('A1', 'Retry Operasi Berstatus Completed Wajib Ditolak', 'PASS', retryCompRes.error);
    } else {
      recordResult('A1', 'Retry Completed Ditolak', 'FAIL', 'Operasi completed diizinkan retry');
    }

    // Uji A2: retryOperation pada status pending DITOLAK
    const op2 = await enqueueOperation({
      opId: 'op_test_retry_pending_02',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-jaya',
      payload: { id: 'st-jaya', name: 'Toko Jaya' },
      ownerUid: ownerAlice,
    });
    const retryPendRes = await retryOperation('op_test_retry_pending_02', ownerAlice);
    if (!retryPendRes.ok && retryPendRes.error.includes('masih berstatus pending')) {
      recordResult('A2', 'Retry Operasi Berstatus Pending Wajib Ditolak', 'PASS', retryPendRes.error);
    } else {
      recordResult('A2', 'Retry Pending Ditolak', 'FAIL', 'Operasi pending diizinkan retry');
    }

    // Uji A3: retryOperation pada status processing DITOLAK
    await markOperationProcessing('op_test_retry_pending_02', ownerAlice);
    const retryProcRes = await retryOperation('op_test_retry_pending_02', ownerAlice);
    if (!retryProcRes.ok && retryProcRes.error.includes('dalam status processing')) {
      recordResult('A3', 'Retry Operasi Berstatus Processing Wajib Ditolak', 'PASS', retryProcRes.error);
    } else {
      recordResult('A3', 'Retry Processing Ditolak', 'FAIL', 'Operasi processing diizinkan retry');
    }

    // Uji A4: retryOperation pada status failed DIIZINKAN & mempertahankan opId asli
    await markOperationFailed('op_test_retry_pending_02', 'Simulasi error jaringan 503', ownerAlice);
    const retryFailRes = await retryOperation('op_test_retry_pending_02', ownerAlice);
    if (
      retryFailRes.ok &&
      retryFailRes.operation.opId === 'op_test_retry_pending_02' &&
      retryFailRes.operation.status === QUEUE_STATUS.PENDING &&
      retryFailRes.operation.retryCount === 1
    ) {
      recordResult('A4', 'Retry Operasi Failed Diizinkan & Mempertahankan opId Murni', 'PASS', `retryCount: ${retryFailRes.operation.retryCount}`);
    } else {
      recordResult('A4', 'Retry Failed Mempertahankan opId', 'FAIL');
    }

    // Uji A5: Owner Mismatch Ditolak
    const mismatchRes = await markOperationCompleted('op_test_retry_pending_02', { ok: true }, ownerBob);
    if (!mismatchRes.ok && mismatchRes.error.includes('Akses ditolak')) {
      recordResult('A5', 'Perubahan Status Operasi dengan Owner Mismatch Ditolak Ketat', 'PASS', mismatchRes.error);
    } else {
      recordResult('A5', 'Owner Mismatch Ditolak', 'FAIL');
    }

    // Uji A6: claimOperationForProcessing Berhasil Klaim Atomik
    const claimRes1 = await claimOperationForProcessing({
      opId: 'op_test_retry_pending_02',
      expectedOwnerUid: ownerAlice,
      workerId: 'worker_tab_1',
      leaseTimeoutMs: 5000,
    });
    if (
      claimRes1.ok &&
      claimRes1.operation.status === QUEUE_STATUS.PROCESSING &&
      claimRes1.operation.claimedByWorkerId === 'worker_tab_1'
    ) {
      recordResult('A6', 'Klaim Operasi Pending Secara Atomik Berhasil dengan Lease Worker', 'PASS', `worker: ${claimRes1.operation.claimedByWorkerId}`);
    } else {
      recordResult('A6', 'Klaim Operasi Atomik', 'FAIL');
    }

    // Uji A7: Klaim Ganda Oleh Worker Lain Ditolak (Lease Belum Habis)
    const claimRes2 = await claimOperationForProcessing({
      opId: 'op_test_retry_pending_02',
      expectedOwnerUid: ownerAlice,
      workerId: 'worker_tab_2',
      leaseTimeoutMs: 5000,
    });
    if (!claimRes2.ok && claimRes2.reason === 'ALREADY_CLAIMED') {
      recordResult('A7', 'Klaim Ganda Operasi oleh Worker Lain Berhasil Dicegah (No Double Processing)', 'PASS', claimRes2.error);
    } else {
      recordResult('A7', 'Klaim Ganda Dicegah', 'FAIL');
    }

    // Uji A8: Pengambilalihan Klaim Kedaluwarsa (Stale Lease Recovery)
    await new Promise((r) => setTimeout(r, 50));
    const claimRes3 = await claimOperationForProcessing({
      opId: 'op_test_retry_pending_02',
      expectedOwnerUid: ownerAlice,
      workerId: 'worker_tab_2',
      leaseTimeoutMs: 20, // 20ms sudah lewat dari 50ms jeda
    });
    if (claimRes3.ok && claimRes3.operation.claimedByWorkerId === 'worker_tab_2') {
      recordResult('A8', 'Pengambilalihan Klaim Stale Processing Berhasil Setelah Lease Timeout', 'PASS', `newWorker: ${claimRes3.operation.claimedByWorkerId}`);
    } else {
      recordResult('A8', 'Stale Lease Takeover', 'FAIL');
    }

    // =================================================================
    // KELOMPOK B: SYNC ENGINE CORE & VALIDASI PAYLOAD
    // =================================================================
    console.log('\n--- KELOMPOK B: Validasi Payload & Keamanan Sync Engine ---');

    // Uji B1: Sync Engine Menolak Proses Tanpa ownerUid
    const unauthCycle = await processQueueCycle(null);
    if (!unauthCycle.ok && unauthCycle.error.includes('Tidak ada ownerUid')) {
      recordResult('B1', 'Sync Engine Menolak Memproses Antrean Tanpa Sesi Autentikasi', 'PASS', unauthCycle.error);
    } else {
      recordResult('B1', 'Sync Engine Unauth Blocked', 'FAIL');
    }

    // Uji B2: Validasi Payload Supplier yang Valid
    const validPayloadTest = validateSupplierPayload({
      operationType: 'CREATE',
      entityId: 'st-sumber',
      payload: {
        id: 'st-sumber',
        name: 'Toko Sumber Rejeki',
        phone: '081234567890',
        address: 'Jl. Pasar Baru No. 12',
        note: 'Pemasok sembako rutin',
      },
    });
    if (validPayloadTest.ok && validPayloadTest.validatedData.name === 'Toko Sumber Rejeki') {
      recordResult('B2', 'Validasi Payload Supplier Sah Lulus Sempurna', 'PASS');
    } else {
      recordResult('B2', 'Validasi Payload Sah', 'FAIL');
    }

    // Uji B3: Validasi Payload Supplier Cacat (Nama Kosong) Ditolak
    const invalidPayloadTest = validateSupplierPayload({
      operationType: 'CREATE',
      entityId: 'st-cacat',
      payload: {
        id: 'st-cacat',
        name: '   ', // Kosong
      },
    });
    if (!invalidPayloadTest.ok && invalidPayloadTest.error.includes('Nama supplier wajib diisi')) {
      recordResult('B3', 'Validasi Menolak Payload Supplier Cacat Tanpa Nama', 'PASS', invalidPayloadTest.error);
    } else {
      recordResult('B3', 'Validasi Menolak Payload Cacat', 'FAIL');
    }

    // =================================================================
    // KELOMPOK C: PILOT DOMAIN SUPPLIERS & SERVER IDEMPOTENCY
    // =================================================================
    console.log('\n--- KELOMPOK C: Pilot Domain Toko Pemasok & Idempotensi Server ---');

    // Persiapkan dokumen root warung di Firestore Emulator dengan akun Alice
    const tenantRef = doc(aliceDb, 'stores_app', tenantAlice);
    await setDoc(tenantRef, {
      ownerUid: ownerAlice,
      storeName: 'Warung Madura Alice',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Uji C1: Eksekusi CREATE Supplier ke Firestore + Pencatatan Ledger Idempotensi
    const createOp = {
      opId: 'op_supplier_pilot_create_001',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-berkah',
      ownerUid: ownerAlice,
      createdAt: new Date().toISOString(),
      payload: {
        id: 'st-berkah',
        name: 'Toko Berkah Grosir',
        phone: '082211334455',
        address: 'Komp. Ruko Blok B-3',
        note: 'Pemasok mie dan minyak',
      },
    };

    const createRes = await executeSupplierTransaction(createOp, {
      customDb: aliceDb,
      tenantId: tenantAlice,
    });

    const supplierSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-berkah'));
    const opLogSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'operations_log', createOp.opId));

    if (
      createRes.success &&
      supplierSnap.exists() &&
      supplierSnap.data().name === 'Toko Berkah Grosir' &&
      opLogSnap.exists() &&
      opLogSnap.data().opId === createOp.opId
    ) {
      recordResult('C1', 'Transaksi CREATE Supplier & Ledger Idempotensi Terbentuk Bersama di Cloud', 'PASS', `Doc: ${supplierSnap.data().name}`);
    } else {
      recordResult('C1', 'CREATE Supplier & Ledger Server', 'FAIL');
    }

    // Uji C2: Replay Transaksi dengan opId Sama (Server Idempotency Verified)
    const replayRes = await executeSupplierTransaction(createOp, {
      customDb: aliceDb,
      tenantId: tenantAlice,
    });

    if (replayRes.success && replayRes.alreadyExecuted === true) {
      recordResult('C2', 'Pengiriman Ulang opId yang Sama Dideteksi Server Sebagai Idempotent No-Op', 'PASS', 'alreadyExecuted: true');
    } else {
      recordResult('C2', 'Server Idempotency Replay', 'FAIL');
    }

    // Uji C3: UPDATE Supplier via Transaksi Atomik
    const updateOp = {
      opId: 'op_supplier_pilot_update_002',
      operationType: 'UPDATE',
      entityType: 'suppliers',
      entityId: 'st-berkah',
      ownerUid: ownerAlice,
      createdAt: new Date().toISOString(),
      payload: {
        id: 'st-berkah',
        name: 'Toko Berkah Grosir Utama',
        phone: '082211339999',
        address: 'Komp. Ruko Blok B-3 (Pindah Depan)',
        note: 'Pembaruan nomor telepon sales',
      },
    };

    const updateRes = await executeSupplierTransaction(updateOp, {
      customDb: aliceDb,
      tenantId: tenantAlice,
    });

    const supplierUpdateSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-berkah'));
    if (
      updateRes.success &&
      supplierUpdateSnap.exists() &&
      supplierUpdateSnap.data().name === 'Toko Berkah Grosir Utama' &&
      supplierUpdateSnap.data().phone === '082211339999'
    ) {
      recordResult('C3', 'Transaksi UPDATE Supplier Berhasil Mengubah Data di Cloud', 'PASS', supplierUpdateSnap.data().name);
    } else {
      recordResult('C3', 'UPDATE Supplier Cloud', 'FAIL');
    }

    // Uji C4: DELETE Supplier via Transaksi Atomik
    const deleteOp = {
      opId: 'op_supplier_pilot_delete_003',
      operationType: 'DELETE',
      entityType: 'suppliers',
      entityId: 'st-berkah',
      ownerUid: ownerAlice,
      createdAt: new Date().toISOString(),
      payload: {
        id: 'st-berkah',
      },
    };

    const deleteRes = await executeSupplierTransaction(deleteOp, {
      customDb: aliceDb,
      tenantId: tenantAlice,
    });

    const supplierDeleteSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-berkah'));
    const deleteOpLogSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'operations_log', deleteOp.opId));

    if (deleteRes.success && !supplierDeleteSnap.exists() && deleteOpLogSnap.exists()) {
      recordResult('C4', 'Transaksi DELETE Supplier Berhasil Menghapus Dokumen & Menyimpan Ledger Abadi', 'PASS', `Ledger audit: ${deleteOpLogSnap.data().operationType}`);
    } else {
      recordResult('C4', 'DELETE Supplier Cloud', 'FAIL');
    }

    // Uji C5: Isolasi Owner di Cloud Firestore (Bob dilarang mengklaim atau menulis ke data Alice)
    let bobBlocked = false;
    try {
      await assertFails(
        setDoc(doc(bobDb, 'stores_app', tenantAlice, 'suppliers', 'st-hacker'), {
          id: 'st-hacker',
          name: 'Toko Penyerang',
          updatedAt: new Date().toISOString(),
        })
      );
      bobBlocked = true;
    } catch {
      bobBlocked = false;
    }
    if (bobBlocked) {
      recordResult('C5', 'Isolasi Akun Cloud Terverifikasi (Bob Ditolak Menulis ke Tenant Milik Alice)', 'PASS', 'PERMISSION_DENIED');
    } else {
      recordResult('C5', 'Isolasi Akun Cloud', 'FAIL');
    }

    // =================================================================
    // KELOMPOK D: END-TO-END QUEUE DRAIN & MULTI-WORKER SIMULATION
    // =================================================================
    console.log('\n--- KELOMPOK D: Simulasi Alur End-to-End & Multi-Worker Drain ---');

    // D1: Enqueue operasi baru saat offline
    await clearQueue(ownerAlice);
    const queuedOp = await enqueueOperation({
      opId: 'op_drain_e2e_001',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-anugerah',
      payload: {
        id: 'st-anugerah',
        name: 'Toko Anugerah Baru',
        phone: '085566778899',
      },
      ownerUid: ownerAlice,
    });

    // Simulasi mode offline: proses antrean dengan forceOnline: false
    const offlineCycle = await processQueueCycle(ownerAlice, { forceOnline: false });
    const statsOffline = await getQueueStats(ownerAlice);
    if (offlineCycle.offline === true && statsOffline.pending === 1) {
      recordResult('D1', 'Mode Offline: Operasi Tetap Tersimpan Aman Tanpa Menghilang', 'PASS', `Pending di antrean: ${statsOffline.pending}`);
    } else {
      recordResult('D1', 'Offline Mode Persistence', 'FAIL');
    }

    // D2: Simulasi Reconnect Online & Pengurasan Otomatis (Drain)
    const onlineCycle = await processQueueCycle(ownerAlice, {
      customDb: aliceDb,
      forceOnline: true,
      tenantId: tenantAlice,
    });
    const statsOnline = await getQueueStats(ownerAlice);
    const cloudCheckSnap = await getDoc(doc(aliceDb, 'stores_app', tenantAlice, 'suppliers', 'st-anugerah'));

    if (
      onlineCycle.ok &&
      onlineCycle.processedCount === 1 &&
      statsOnline.completed === 1 &&
      statsOnline.pending === 0 &&
      cloudCheckSnap.exists()
    ) {
      recordResult('D2', 'Mode Online: Antrean Pending Berhasil Dikuras FIFO & Berstatus Completed', 'PASS', `Tersinkron ke cloud: ${cloudCheckSnap.data().name}`);
    } else {
      recordResult('D2', 'Online Drain & Confirmation', 'FAIL');
    }

    // D3: Simulasi Konkurensi 2 Tab/Worker Serentak Pada Antrean yang Sama
    await enqueueOperation({
      opId: 'op_concurrent_01',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-concurrent-1',
      payload: { id: 'st-concurrent-1', name: 'Toko Paralel 1' },
      ownerUid: ownerAlice,
    });
    await enqueueOperation({
      opId: 'op_concurrent_02',
      operationType: 'CREATE',
      entityType: 'suppliers',
      entityId: 'st-concurrent-2',
      payload: { id: 'st-concurrent-2', name: 'Toko Paralel 2' },
      ownerUid: ownerAlice,
    });

    // Eksekusi dua worker secara bersamaan (Promise.all)
    const [worker1Res, worker2Res] = await Promise.all([
      processQueueCycle(ownerAlice, { customDb: aliceDb, forceOnline: true, tenantId: tenantAlice, workerId: 'worker_tab_A' }),
      processQueueCycle(ownerAlice, { customDb: aliceDb, forceOnline: true, tenantId: tenantAlice, workerId: 'worker_tab_B' }),
    ]);

    const totalProcessedConcurrently = (worker1Res.processedCount || 0) + (worker2Res.processedCount || 0);
    const finalStats = await getQueueStats(ownerAlice);

    if (totalProcessedConcurrently === 2 && finalStats.completed === 3 && finalStats.pending === 0) {
      recordResult('D3', 'Konkurensi Multi-Worker: 2 Tab Memproses Antrean Tanpa Redudansi atau Kolisi', 'PASS', `Tepat 2 operasi diproses, 0 pending tersisa`);
    } else {
      recordResult('D3', 'Multi-Worker Concurrency', 'FAIL');
    }

    // =================================================================
    // RINGKASAN TEST SUITE FASE 3A
    // =================================================================
    console.log('\n=================================================================');
    console.log('                 RINGKASAN HASIL TEST SUITE FASE 3A              ');
    console.log('=================================================================');
    const total = results.length;
    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;

    console.log(`TOTAL PENGUJIAN: ${total}`);
    console.log(`LULUS (PASS)   : ${passed}`);
    console.log(`GAGAL (FAIL)   : ${failed}`);
    console.log(`STATUS AKHIR   : ${failed === 0 ? 'SELURUH UJI FASE 3A LULUS (100% PASS)' : 'BEBERAPA UJI GAGAL'}`);
    console.log('=================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await testEnv.cleanup();
  }
}

runFase3aTestSuite().catch((err) => {
  console.error('Fatal error in Fase 3A test suite:', err);
  process.exit(1);
});
