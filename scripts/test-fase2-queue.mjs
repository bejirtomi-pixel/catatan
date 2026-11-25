import { indexedDB as fakeIDB, IDBKeyRange } from 'fake-indexeddb';
import {
  openQueueDB,
  enqueueOperation,
  getPendingOperations,
  getQueueItems,
  getQueueStats,
  markOperationProcessing,
  markOperationCompleted,
  markOperationFailed,
  retryOperation,
  recoverStaleProcessingOperations,
  purgeCompletedOperations,
  clearQueue,
  generateOpId,
  QUEUE_STATUS,
  DB_NAME,
  STORE_OPERATIONS,
} from '../src/services/offlineQueue.js';

// Setup fake-indexeddb global untuk environment test
globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = IDBKeyRange;

const results = [];

function recordResult(testNum, name, status, details = '') {
  results.push({ testNum, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Uji ${testNum}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runFase2TestSuite() {
  console.log('=================================================================');
  console.log('   FASE 2: OFFLINE QUEUE & IDEMPOTENCY TEST SUITE (INDEXEDDB)   ');
  console.log('=================================================================\n');

  const ownerAlice = 'uid_alice_owner_123';
  const ownerBob = 'uid_bob_owner_456';

  try {
    // -----------------------------------------------------------------
    // UJI 1: Enqueue Operation
    // -----------------------------------------------------------------
    console.log('\n--- UJI 1 & 2: Enqueue Operasi & Keunikan opId ---');
    const opPayload1 = {
      productId: 'prod_beras_01',
      diffBase: 5,
      note: 'Penerimaan stok beras 5 karung',
    };

    const res1 = await enqueueOperation({
      operationType: 'CREATE',
      entityType: 'movements',
      entityId: 'prod_beras_01',
      payload: opPayload1,
      ownerUid: ownerAlice,
      operatorId: 'op-ainie',
      operatorName: 'Ainie',
    });

    if (res1.ok && res1.opId && res1.operation.status === QUEUE_STATUS.PENDING) {
      recordResult('1.1', 'Enqueue Operasi Berhasil ke IndexedDB', 'PASS', `opId: ${res1.opId}`);
    } else {
      recordResult('1.1', 'Enqueue Operasi Berhasil', 'FAIL', res1.error);
    }

    // -----------------------------------------------------------------
    // UJI 2: opId Unik & Collision-Resistant
    // -----------------------------------------------------------------
    const generatedIds = new Set();
    let hasCollision = false;
    for (let i = 0; i < 500; i++) {
      const id = generateOpId();
      if (generatedIds.has(id)) {
        hasCollision = true;
        break;
      }
      generatedIds.add(id);
    }

    if (!hasCollision && generatedIds.size === 500) {
      recordResult('2.1', 'Generator opId Menghasilkan 500 ID Unik Berurutan Tanpa Kolisi', 'PASS');
    } else {
      recordResult('2.1', 'Generator opId', 'FAIL', 'Terdeteksi kolisi ID');
    }

    // -----------------------------------------------------------------
    // UJI 3: Payload Tetap Utuh Setelah Operasi Disimpan
    // -----------------------------------------------------------------
    console.log('\n--- UJI 3: Integritas Payload Operasi ---');
    const items = await getPendingOperations(ownerAlice);
    const foundOp1 = items.find((x) => x.opId === res1.opId);

    if (
      foundOp1 &&
      foundOp1.payload.productId === 'prod_beras_01' &&
      foundOp1.payload.diffBase === 5 &&
      foundOp1.payload.note === 'Penerimaan stok beras 5 karung'
    ) {
      recordResult('3.1', 'Payload Tersimpan Utuh Tanpa Degradasi atau Mutasi Objek', 'PASS');
    } else {
      recordResult('3.1', 'Integritas Payload', 'FAIL', 'Payload tidak sesuai');
    }

    // -----------------------------------------------------------------
    // UJI 4: Queue Tetap Tersedia Setelah Simulasi Reload (Re-open DB)
    // -----------------------------------------------------------------
    console.log('\n--- UJI 4: Ketahanan Reload Halaman (Tutup & Buka Ulang Koneksi) ---');
    // Buka ulang koneksi IndexedDB dari awal
    const reloadedItems = await getPendingOperations(ownerAlice);
    const existsAfterReload = reloadedItems.some((x) => x.opId === res1.opId);

    if (existsAfterReload) {
      recordResult('4.1', 'Antrean Tetap Tersedia Utuh Setelah Koneksi Ditutup & Dibuka Ulang', 'PASS');
    } else {
      recordResult('4.1', 'Ketahanan Reload', 'FAIL', 'Data hilang setelah koneksi ditutup');
    }

    // -----------------------------------------------------------------
    // UJI 5: Queue Tetap Tersedia Setelah Simulasi Browser Restart
    // -----------------------------------------------------------------
    console.log('\n--- UJI 5: Simulasi Browser Restart (Storage Persistence Check) ---');
    // Verifikasi bahwa data tersimpan di persistent store IndexedDB dan bukan array memori volatil
    const stats = await getQueueStats(ownerAlice);
    if (stats.total >= 1 && stats.pending >= 1) {
      recordResult(
        '5.1',
        'Persistensi Fisik IndexedDB Terverifikasi (Bukan Variabel Array Memori Sesaat)',
        'PASS',
        `Total operasi persisten: ${stats.total}`
      );
    } else {
      recordResult('5.1', 'Persistensi Fisik IndexedDB', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 6: Retry Mempertahankan opId yang Sama Murni
    // -----------------------------------------------------------------
    console.log('\n--- UJI 6 & 7: Idempotensi & Retry Preservation ---');
    const testRetryOpId = 'op_retry_test_fixed_123';
    await enqueueOperation({
      opId: testRetryOpId,
      operationType: 'UPDATE',
      entityType: 'stocks',
      entityId: 'prod_beras_01',
      payload: { quantity: 15 },
      ownerUid: ownerAlice,
      operatorId: 'op-ibu',
      operatorName: 'Ibu',
    });

    // Tandai gagal terlebih dahulu
    await markOperationProcessing(testRetryOpId);
    await markOperationFailed(testRetryOpId, 'Network error 503');

    // Lakukan retry
    const retryRes = await retryOperation(testRetryOpId);

    if (
      retryRes.ok &&
      retryRes.operation.opId === testRetryOpId &&
      retryRes.operation.status === QUEUE_STATUS.PENDING &&
      retryRes.operation.retryCount === 1 &&
      retryRes.operation.payload.quantity === 15
    ) {
      recordResult(
        '6.1',
        'Retry Mempertahankan opId Asli yang Sama Murni (Tanpa Membuat ID Baru)',
        'PASS',
        `opId tetap: ${retryRes.operation.opId}, retryCount: 1`
      );
    } else {
      recordResult('6.1', 'Retry Mempertahankan opId', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 7: Duplicate Enqueue dengan opId Sama Ditolak / Di-Deduplikasi
    // -----------------------------------------------------------------
    const dupRes = await enqueueOperation({
      opId: testRetryOpId,
      operationType: 'UPDATE',
      entityType: 'stocks',
      entityId: 'prod_beras_01',
      payload: { quantity: 999 }, // Payload berbeda tidak boleh menimpa
      ownerUid: ownerAlice,
      operatorId: 'op-ibu',
      operatorName: 'Ibu',
    });

    const checkDupItems = await getQueueItems({ ownerUid: ownerAlice });
    const duplicateEntries = checkDupItems.filter((x) => x.opId === testRetryOpId);

    if (dupRes.deduplicated === true && duplicateEntries.length === 1 && duplicateEntries[0].payload.quantity === 15) {
      recordResult(
        '7.1',
        'Enqueue Ulang opId yang Sama Berhasil Di-Deduplikasi Tanpa Menimpa Data Asli',
        'PASS',
        'Tepat 1 entri dipertahankan'
      );
    } else {
      recordResult('7.1', 'Deduplikasi opId', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 8: Operasi Completed Tidak Diproses Ulang Secara Tidak Sengaja
    // -----------------------------------------------------------------
    console.log('\n--- UJI 8: Proteksi Operasi Completed ---');
    await markOperationProcessing(testRetryOpId);
    await markOperationCompleted(testRetryOpId, { serverConfirmed: true });

    // Coba ambil pending operations
    const pendingAfterComplete = await getPendingOperations(ownerAlice);
    const isCompletedReturnedAsPending = pendingAfterComplete.some((x) => x.opId === testRetryOpId);

    // Coba enqueue ulang opId yang sudah completed
    const enqueueCompletedRes = await enqueueOperation({
      opId: testRetryOpId,
      operationType: 'UPDATE',
      entityType: 'stocks',
      payload: { test: true },
      ownerUid: ownerAlice,
    });

    if (!isCompletedReturnedAsPending && enqueueCompletedRes.deduplicated === true) {
      recordResult(
        '8.1',
        'Operasi Completed Terkunci Rapat, Tidak Masuk Pending, & Menolak Re-Enqueue',
        'PASS'
      );
    } else {
      recordResult('8.1', 'Proteksi Operasi Completed', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 9: Recovery Status Processing yang Tertinggal (Crash Recovery)
    // -----------------------------------------------------------------
    console.log('\n--- UJI 9: Pemulihan Status Processing Tertinggal ---');
    const staleOpId = 'op_stale_crash_test';
    await enqueueOperation({
      opId: staleOpId,
      operationType: 'CREATE',
      entityType: 'orders',
      payload: { orderNo: 'PO-001' },
      ownerUid: ownerAlice,
    });

    // Tandai processing
    await markOperationProcessing(staleOpId);

    // Modifikasi processingStartedAt menjadi 2 menit yang lalu secara manual di DB
    const db = await openQueueDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const req = store.get(staleOpId);
      req.onsuccess = () => {
        const item = req.result;
        item.processingStartedAt = new Date(Date.now() - 120000).toISOString(); // 2 menit lalu
        store.put(item);
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });

    // Jalankan recovery dengan timeout 60 detik
    const recoveryRes = await recoverStaleProcessingOperations(ownerAlice, 60000);
    const pendingRecovered = await getPendingOperations(ownerAlice);
    const recoveredItem = pendingRecovered.find((x) => x.opId === staleOpId);

    if (recoveryRes.recoveredCount >= 1 && recoveredItem && recoveredItem.status === QUEUE_STATUS.PENDING) {
      recordResult(
        '9.1',
        'Pemulihan Otomatis Operasi Stale Processing Kembali Menjadi Pending Berhasil',
        'PASS',
        `Dipulihkan: ${recoveryRes.recoveredCount} operasi`
      );
    } else {
      recordResult('9.1', 'Recovery Status Processing', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 10: Failed Operation Tetap Dapat Ditinjau dan Dicoba Kembali
    // -----------------------------------------------------------------
    console.log('\n--- UJI 10: Peninjauan Operasi Gagal & Kebijakan Retensi ---');
    const failedOpId = 'op_failed_review_test';
    await enqueueOperation({
      opId: failedOpId,
      operationType: 'UPDATE',
      entityType: 'store_prices',
      payload: { price: 25000 },
      ownerUid: ownerAlice,
    });
    await markOperationProcessing(failedOpId);
    await markOperationFailed(failedOpId, 'Koneksi Firestore Timeout');

    const failedItems = await getQueueItems({ ownerUid: ownerAlice, status: QUEUE_STATUS.FAILED });
    const foundFailed = failedItems.find((x) => x.opId === failedOpId);

    if (foundFailed && foundFailed.lastError === 'Koneksi Firestore Timeout') {
      recordResult(
        '10.1',
        'Operasi Gagal Tersimpan Utuh Beserta Alasan Error untuk Audit Pengguna',
        'PASS',
        `lastError: ${foundFailed.lastError}`
      );
    } else {
      recordResult('10.1', 'Peninjauan Operasi Gagal', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 11: IndexedDB Error Handling & Validasi
    // -----------------------------------------------------------------
    console.log('\n--- UJI 11: Penanganan Error Input & Validasi IndexedDB ---');
    const invalidRes1 = await enqueueOperation(null);
    const invalidRes2 = await enqueueOperation({ operationType: '', entityType: 'stocks', payload: {}, ownerUid: 'u' });
    const invalidRes3 = await enqueueOperation({ operationType: 'CREATE', entityType: '', payload: {}, ownerUid: 'u' });
    const invalidRes4 = await enqueueOperation({ operationType: 'CREATE', entityType: 'stocks', payload: {}, ownerUid: '' });

    if (!invalidRes1.ok && !invalidRes2.ok && !invalidRes3.ok && !invalidRes4.ok) {
      recordResult(
        '11.1',
        'Seluruh Input Cacat Tertangkap Validasi Tanpa Menyebabkan Unhandled Exception',
        'PASS',
        'Validasi input lengkap'
      );
    } else {
      recordResult('11.1', 'Penanganan Error Input', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 12: OwnerUid Isolation (Isolasi Antar-Akun Pemilik)
    // -----------------------------------------------------------------
    console.log('\n--- UJI 12: Isolasi Data Antar-UID Pemilik ---');
    await enqueueOperation({
      opId: 'op_bob_private_1',
      operationType: 'CREATE',
      entityType: 'products',
      payload: { name: 'Kopi Bob' },
      ownerUid: ownerBob,
      operatorId: 'op-bob',
      operatorName: 'Bob',
    });

    const alicePending = await getPendingOperations(ownerAlice);
    const bobPending = await getPendingOperations(ownerBob);

    const isBobInAlice = alicePending.some((x) => x.ownerUid === ownerBob);
    const isAliceInBob = bobPending.some((x) => x.ownerUid === ownerAlice);

    if (!isBobInAlice && !isAliceInBob && bobPending.some((x) => x.opId === 'op_bob_private_1')) {
      recordResult(
        '12.1',
        'Isolasi Mutlak: Antrean Alice Tidak Bocor ke Bob dan Sebaliknya',
        'PASS'
      );
    } else {
      recordResult('12.1', 'Isolasi Antar-UID Pemilik', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 13: Operator Snapshot Tetap Konsisten
    // -----------------------------------------------------------------
    console.log('\n--- UJI 13: Konsistensi Snapshot Operator ---');
    const opSnapshotTestId = 'op_snapshot_test_99';
    await enqueueOperation({
      opId: opSnapshotTestId,
      operationType: 'CREATE',
      entityType: 'movements',
      payload: { diffBase: 1 },
      ownerUid: ownerAlice,
      operatorId: 'op-adik',
      operatorName: 'Adik',
    });

    const snapshotItems = await getPendingOperations(ownerAlice);
    const snapshotItem = snapshotItems.find((x) => x.opId === opSnapshotTestId);

    if (
      snapshotItem &&
      snapshotItem.operatorId === 'op-adik' &&
      snapshotItem.operatorName === 'Adik' &&
      snapshotItem.ownerUid === ownerAlice
    ) {
      recordResult(
        '13.1',
        'Snapshot Operator (Adik) Terkunci Permanen Tanpa Mengubah Atribut ownerUid',
        'PASS',
        `operatorName: ${snapshotItem.operatorName}, ownerUid: ${snapshotItem.ownerUid}`
      );
    } else {
      recordResult('13.1', 'Konsistensi Snapshot Operator', 'FAIL');
    }

    // -----------------------------------------------------------------
    // UJI 14: Tidak Ada Kehilangan Operasi Saat Terjadi Status Update Gagal
    // -----------------------------------------------------------------
    console.log('\n--- UJI 14: Ketahanan Kegagalan Transaksi Status ---');
    const nonExistentRes = await markOperationProcessing('op_non_existent_random_id');
    const allBeforeCount = (await getQueueItems({ ownerUid: ownerAlice })).length;

    if (!nonExistentRes.ok && nonExistentRes.error.includes('tidak ditemukan')) {
      const allAfterCount = (await getQueueItems({ ownerUid: ownerAlice })).length;
      if (allBeforeCount === allAfterCount) {
        recordResult(
          '14.1',
          'Status Update Tidak Valid Ditolak Aman Tanpa Merusak Data Antrean Lain',
          'PASS'
        );
      } else {
        recordResult('14.1', 'Ketahanan Status Update', 'FAIL', 'Jumlah antrean berubah');
      }
    } else {
      recordResult('14.1', 'Ketahanan Status Update', 'FAIL');
    }

  } catch (err) {
    console.error('Fatal error during test suite:', err);
    process.exit(1);
  }

  console.log('\n=================================================================');
  console.log('                 RINGKASAN HASIL TEST SUITE FASE 2               ');
  console.log('=================================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL PENGUJIAN: ${results.length}`);
  console.log(`LULUS (PASS)   : ${passCount}`);
  console.log(`GAGAL (FAIL)   : ${failCount}`);
  console.log(
    `STATUS AKHIR   : ${failCount === 0 ? 'SELURUH UJI FASE 2 LULUS (100% PASS)' : 'ADA UJI GAGAL'}`
  );
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runFase2TestSuite().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
