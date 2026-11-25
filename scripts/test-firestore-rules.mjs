import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'demo-catatan-test';
const RULES_PATH = path.resolve('firestore.rules');
const rules = fs.readFileSync(RULES_PATH, 'utf8');

let testEnv;
const results = [];

function recordResult(scenarioNum, testId, description, status, details = '') {
  results.push({ scenarioNum, testId, description, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [Skenario ${scenarioNum}] ${testId}: ${description} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

async function runTestSuite() {
  console.log('=================================================================');
  console.log('   FIRESTORE SECURITY RULES - AUTOMATED TEST SUITE (FASE 0)      ');
  console.log('=================================================================\n');

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080
    }
  });

  const nowIso = new Date().toISOString();

  try {
    // -----------------------------------------------------------------
    // SKENARIO 1: Akses Tanpa Autentikasi (Ditolak)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 1: Pengujian Akses Tanpa Autentikasi ---');
    const unauthDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(
      getDoc(doc(unauthDb, 'stores_app/store_alice/products/prod_1'))
    ).then(() => recordResult(1, '1.1', 'Baca subkoleksi produk tanpa login', 'PASS'))
     .catch(err => recordResult(1, '1.1', 'Baca subkoleksi produk tanpa login', 'FAIL', err.message));

    await assertFails(
      setDoc(doc(unauthDb, 'stores_app/store_alice/products/prod_1'), {
        name: 'Beras Unauth',
        units: [],
        updatedAt: nowIso
      })
    ).then(() => recordResult(1, '1.2', 'Tulis subkoleksi produk tanpa login', 'PASS'))
     .catch(err => recordResult(1, '1.2', 'Tulis subkoleksi produk tanpa login', 'FAIL', err.message));

    await assertFails(
      getDoc(doc(unauthDb, 'warung_madura/latest_backup'))
    ).then(() => recordResult(1, '1.3', 'Baca backup lama tanpa login', 'PASS'))
     .catch(err => recordResult(1, '1.3', 'Baca backup lama tanpa login', 'FAIL', err.message));

    await assertFails(
      setDoc(doc(unauthDb, 'warung_madura/latest_backup'), {
        data: 'backup_data',
        cloudSavedAt: nowIso
      })
    ).then(() => recordResult(1, '1.4', 'Tulis backup lama tanpa login', 'PASS'))
     .catch(err => recordResult(1, '1.4', 'Tulis backup lama tanpa login', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 2: Akses Valid Pemilik Toko (Diizinkan)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 2: Pengujian Akses Pemilik Toko yang Sah ---');
    const aliceDb = testEnv.authenticatedContext('uid_alice').firestore();

    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice'), {
        ownerUid: 'uid_alice',
        storeName: 'Toko Madura Alice',
        createdAt: nowIso,
        updatedAt: nowIso
      })
    ).then(() => recordResult(2, '2.1', 'Pemilik membuat profil warung dengan ownerUid cocok', 'PASS'))
     .catch(err => recordResult(2, '2.1', 'Pemilik membuat profil warung dengan ownerUid cocok', 'FAIL', err.message));

    await assertSucceeds(
      getDoc(doc(aliceDb, 'stores_app/store_alice'))
    ).then(() => recordResult(2, '2.2', 'Pemilik membaca profil warungnya sendiri', 'PASS'))
     .catch(err => recordResult(2, '2.2', 'Pemilik membaca profil warungnya sendiri', 'FAIL', err.message));

    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/products/prod_1'), {
        id: 'prod_1',
        name: 'Beras Pandan Wangi 5kg',
        units: [{ name: 'Karung', factor: 1 }],
        updatedAt: nowIso
      })
    ).then(() => recordResult(2, '2.3', 'Pemilik membuat master barang di subkoleksi products', 'PASS'))
     .catch(err => recordResult(2, '2.3', 'Pemilik membuat master barang di subkoleksi products', 'FAIL', err.message));

    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
        productId: 'prod_1',
        quantity: 10,
        updatedAt: nowIso
      })
    ).then(() => recordResult(2, '2.4', 'Pemilik membuat saldo stok awal (quantity: 10)', 'PASS'))
     .catch(err => recordResult(2, '2.4', 'Pemilik membuat saldo stok awal (quantity: 10)', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 3: Isolasi Antar-UID (Ditolak)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 3: Pengujian Isolasi Antar-UID (User Lain Ditolak) ---');
    const bobDb = testEnv.authenticatedContext('uid_bob').firestore();

    await assertFails(
      getDoc(doc(bobDb, 'stores_app/store_alice'))
    ).then(() => recordResult(3, '3.1', 'Bob membaca profil toko milik Alice', 'PASS'))
     .catch(err => recordResult(3, '3.1', 'Bob membaca profil toko milik Alice', 'FAIL', err.message));

    await assertFails(
      updateDoc(doc(bobDb, 'stores_app/store_alice'), {
        storeName: 'Dibajak Oleh Bob'
      })
    ).then(() => recordResult(3, '3.2', 'Bob mengedit profil toko milik Alice', 'PASS'))
     .catch(err => recordResult(3, '3.2', 'Bob mengedit profil toko milik Alice', 'FAIL', err.message));

    await assertFails(
      getDoc(doc(bobDb, 'stores_app/store_alice/products/prod_1'))
    ).then(() => recordResult(3, '3.3', 'Bob membaca barang milik Alice', 'PASS'))
     .catch(err => recordResult(3, '3.3', 'Bob membaca barang milik Alice', 'FAIL', err.message));

    await assertFails(
      setDoc(doc(bobDb, 'stores_app/store_alice/products/prod_bob'), {
        id: 'prod_bob',
        name: 'Barang Selundupan Bob',
        units: [],
        updatedAt: nowIso
      })
    ).then(() => recordResult(3, '3.4', 'Bob menyisipkan barang ke toko Alice', 'PASS'))
     .catch(err => recordResult(3, '3.4', 'Bob menyisipkan barang ke toko Alice', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 4: Immutabilitas Riwayat Mutasi & Audit Log (Ditolak)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 4: Pengujian Immutabilitas Movement & Log Audit ---');
    // Buat initial movement secara sah
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/movements/op_seed'), {
        productId: 'prod_1',
        diffBase: 10,
        operator: { operatorName: 'Alice' },
        timestamp: nowIso
      })
    ).then(() => recordResult(4, '4.1', 'Pemilik mencatat movement awal op_seed', 'PASS'))
     .catch(err => recordResult(4, '4.1', 'Pemilik mencatat movement awal op_seed', 'FAIL', err.message));

    await assertFails(
      updateDoc(doc(aliceDb, 'stores_app/store_alice/movements/op_seed'), {
        diffBase: 999
      })
    ).then(() => recordResult(4, '4.2', 'Upaya update/modifikasi movement op_seed', 'PASS'))
     .catch(err => recordResult(4, '4.2', 'Upaya update/modifikasi movement op_seed', 'FAIL', err.message));

    await assertFails(
      deleteDoc(doc(aliceDb, 'stores_app/store_alice/movements/op_seed'))
    ).then(() => recordResult(4, '4.3', 'Upaya delete movement op_seed', 'PASS'))
     .catch(err => recordResult(4, '4.3', 'Upaya delete movement op_seed', 'FAIL', err.message));

    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/activity_logs/log_01'), {
        action: 'LOGIN',
        operator: { operatorName: 'Alice' },
        timestamp: nowIso
      })
    ).then(() => recordResult(4, '4.4', 'Pemilik membuat activity_log baru', 'PASS'))
     .catch(err => recordResult(4, '4.4', 'Pemilik membuat activity_log baru', 'FAIL', err.message));

    await assertFails(
      deleteDoc(doc(aliceDb, 'stores_app/store_alice/activity_logs/log_01'))
    ).then(() => recordResult(4, '4.5', 'Upaya delete activity_log', 'PASS'))
     .catch(err => recordResult(4, '4.5', 'Upaya delete activity_log', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 5: Konsistensi Stok & Movement: Update Stok Tanpa Movement (Ditolak)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 5: Update Stok Tanpa Movement di Batch (Ditolak) ---');
    await assertFails(
      updateDoc(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
        quantity: 15,
        updatedAt: nowIso
      })
    ).then(() => recordResult(5, '5.1', 'Update quantity stok dari 10 ke 15 tanpa movement', 'PASS'))
     .catch(err => recordResult(5, '5.1', 'Update quantity stok dari 10 ke 15 tanpa movement', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 6: Konsistensi Stok & Movement: Update Stok Dengan Movement Valid di Batch (Diizinkan)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 6: Update Stok + Movement Bersamaan dalam Batch Atomik (Diizinkan) ---');
    const batch6 = writeBatch(aliceDb);
    batch6.update(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
      quantity: 15,
      lastReconciledOpId: 'op_batch_01',
      updatedAt: nowIso
    });
    batch6.set(doc(aliceDb, 'stores_app/store_alice/movements/op_batch_01'), {
      productId: 'prod_1',
      diffBase: 5,
      operator: { operatorName: 'Alice' },
      timestamp: nowIso
    });

    await assertSucceeds(
      batch6.commit()
    ).then(() => recordResult(6, '6.1', 'Commit batch: stok +5 dan movement op_batch_01 terpadu', 'PASS'))
     .catch(err => recordResult(6, '6.1', 'Commit batch: stok +5 dan movement op_batch_01 terpadu', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 7: Proteksi Manipulasi Anomali Stok Negatif
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 7: Proteksi Anomali Stok Negatif ---');

    // 7A: Stok >= 0 tapi memalsukan hasStockAnomaly: true
    const batch7A = writeBatch(aliceDb);
    batch7A.update(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
      quantity: 20,
      hasStockAnomaly: true, // Ilegal: stok positif dilarang ada anomali
      lastReconciledOpId: 'op_batch_7a',
      updatedAt: nowIso
    });
    batch7A.set(doc(aliceDb, 'stores_app/store_alice/movements/op_batch_7a'), {
      productId: 'prod_1',
      diffBase: 5,
      operator: { operatorName: 'Alice' },
      timestamp: nowIso
    });

    await assertFails(
      batch7A.commit()
    ).then(() => recordResult(7, '7.1', 'Manipulasi hasStockAnomaly: true saat kuantitas positif (20)', 'PASS'))
     .catch(err => recordResult(7, '7.1', 'Manipulasi hasStockAnomaly: true saat kuantitas positif (20)', 'FAIL', err.message));

    // 7B: Stok < 0 (-3) tapi TIDAK menyertakan hasStockAnomaly: true
    const batch7B = writeBatch(aliceDb);
    batch7B.update(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
      quantity: -3,
      // hasStockAnomaly tidak disertakan padahal stok negatif
      lastReconciledOpId: 'op_batch_7b',
      updatedAt: nowIso
    });
    batch7B.set(doc(aliceDb, 'stores_app/store_alice/movements/op_batch_7b'), {
      productId: 'prod_1',
      diffBase: -18,
      operator: { operatorName: 'Alice' },
      timestamp: nowIso
    });

    await assertFails(
      batch7B.commit()
    ).then(() => recordResult(7, '7.2', 'Stok negatif (-3) tanpa menyertakan flag hasStockAnomaly: true', 'PASS'))
     .catch(err => recordResult(7, '7.2', 'Stok negatif (-3) tanpa menyertakan flag hasStockAnomaly: true', 'FAIL', err.message));

    // 7C: Stok < 0 (-3) DENGAN menyertakan hasStockAnomaly: true secara sah
    const batch7C = writeBatch(aliceDb);
    batch7C.update(doc(aliceDb, 'stores_app/store_alice/stocks/prod_1'), {
      quantity: -3,
      hasStockAnomaly: true,
      lastReconciledOpId: 'op_batch_7c',
      updatedAt: nowIso
    });
    batch7C.set(doc(aliceDb, 'stores_app/store_alice/movements/op_batch_7c'), {
      productId: 'prod_1',
      diffBase: -18,
      operator: { operatorName: 'Alice' },
      timestamp: nowIso
    });

    await assertSucceeds(
      batch7C.commit()
    ).then(() => recordResult(7, '7.3', 'Stok negatif (-3) dengan hasStockAnomaly: true dan movement valid', 'PASS'))
     .catch(err => recordResult(7, '7.3', 'Stok negatif (-3) dengan hasStockAnomaly: true dan movement valid', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 8: Maintenance Lock Belum Ada (Tetap Aman Diizinkan)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 8: Keamanan Maintenance Lock Saat Dokumen Belum Pernah Ada ---');
    // Pastikan dokumen meta/maintenance_lock belum ada
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/suppliers/sup_01'), {
        name: 'Grosir Sembako Madura',
        updatedAt: nowIso
      })
    ).then(() => recordResult(8, '8.1', 'Operasi penulisan saat meta/maintenance_lock tidak ada (sukses tanpa crash)', 'PASS'))
     .catch(err => recordResult(8, '8.1', 'Operasi penulisan saat meta/maintenance_lock tidak ada', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 9: Maintenance Lock Aktif (Blokir Operasional, Buka Staging Restore)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 9: Perilaku Saat Maintenance Lock Aktif ---');
    // Set maintenance lock aktif
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/meta/maintenance_lock'), {
        inProgress: true,
        jobId: 'job_restore_001',
        lockedAt: nowIso
      })
    ).then(() => recordResult(9, '9.1', 'Pemilik mengaktifkan maintenance lock', 'PASS'))
     .catch(err => recordResult(9, '9.1', 'Pemilik mengaktifkan maintenance lock', 'FAIL', err.message));

    // Operasi operasional normal harus diblokir
    await assertFails(
      setDoc(doc(aliceDb, 'stores_app/store_alice/suppliers/sup_02'), {
        name: 'Supplier Terblokir',
        updatedAt: nowIso
      })
    ).then(() => recordResult(9, '9.2', 'Tulis data operasional normal saat maintenance lock aktif (diblokir)', 'PASS'))
     .catch(err => recordResult(9, '9.2', 'Tulis data operasional normal saat maintenance lock aktif', 'FAIL', err.message));

    // Area staging restore harus diizinkan saat lock aktif
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/restore_staging/job_restore_001/suppliers/sup_staged'), {
        name: 'Supplier Ter-staging',
        updatedAt: nowIso
      })
    ).then(() => recordResult(9, '9.3', 'Tulis ke restore_staging saat maintenance lock aktif (diizinkan)', 'PASS'))
     .catch(err => recordResult(9, '9.3', 'Tulis ke restore_staging saat maintenance lock aktif', 'FAIL', err.message));

    // Lepas maintenance lock
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/meta/maintenance_lock'), {
        inProgress: false,
        jobId: 'job_restore_001',
        unlockedAt: nowIso
      })
    ).then(() => recordResult(9, '9.4', 'Pemilik mematikan maintenance lock', 'PASS'))
     .catch(err => recordResult(9, '9.4', 'Pemilik mematikan maintenance lock', 'FAIL', err.message));

    // Operasional kembali normal
    await assertSucceeds(
      setDoc(doc(aliceDb, 'stores_app/store_alice/suppliers/sup_02'), {
        name: 'Supplier Normal Setelah Buka Lock',
        updatedAt: nowIso
      })
    ).then(() => recordResult(9, '9.5', 'Tulis data operasional setelah maintenance lock dimatikan (sukses)', 'PASS'))
     .catch(err => recordResult(9, '9.5', 'Tulis data operasional setelah maintenance lock dimatikan', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 10: Idempotensi Mutasi Stok (Retry Duplikat Ditolak)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 10: Pengujian Idempotensi Mutasi Stok ---');
    // Movement op_batch_01 sudah ada dari Skenario 6
    // Coba create ulang dokumen movement yang sama
    await assertFails(
      setDoc(doc(aliceDb, 'stores_app/store_alice/movements/op_batch_01'), {
        productId: 'prod_1',
        diffBase: 5,
        operator: { operatorName: 'Alice Replay' },
        timestamp: nowIso
      })
    ).then(() => recordResult(10, '10.1', 'Pengiriman ulang movement yang sama (op_batch_01 duplikat ditolak)', 'PASS'))
     .catch(err => recordResult(10, '10.1', 'Pengiriman ulang movement yang sama', 'FAIL', err.message));

    // -----------------------------------------------------------------
    // SKENARIO 11: Kompatibilitas Backup Lama (warung_madura/latest_backup)
    // -----------------------------------------------------------------
    console.log('\n--- SKENARIO 11: Pengujian Kompatibilitas Backup Lama ---');

    // 11.1 Tulis backup lama tanpa ownerUid (pola saveBackupToCloud lama) -> DITOLAK
    await assertFails(
      setDoc(doc(aliceDb, 'warung_madura/latest_backup'), {
        version: 1,
        exportedAt: nowIso,
        data: { test: true },
        cloudSavedAt: nowIso
        // TIDAK ADA ownerUid
      })
    ).then(() => recordResult(11, '11.1', 'Tulis backup tanpa menyertakan ownerUid (format lama saveBackupToCloud) ditolak', 'PASS'))
     .catch(err => recordResult(11, '11.1', 'Tulis backup tanpa menyertakan ownerUid', 'FAIL', err.message));

    // 11.2 Tulis backup dengan ownerUid Alice yang cocok -> DIIZINKAN
    await assertSucceeds(
      setDoc(doc(aliceDb, 'warung_madura/latest_backup'), {
        version: 1,
        ownerUid: 'uid_alice',
        exportedAt: nowIso,
        data: { test: true },
        cloudSavedAt: nowIso
      })
    ).then(() => recordResult(11, '11.2', 'Tulis backup lama dengan menyertakan ownerUid valid diizinkan', 'PASS'))
     .catch(err => recordResult(11, '11.2', 'Tulis backup lama dengan menyertakan ownerUid valid', 'FAIL', err.message));

    // 11.3 Bob mencoba membaca backup milik Alice -> DITOLAK
    await assertFails(
      getDoc(doc(bobDb, 'warung_madura/latest_backup'))
    ).then(() => recordResult(11, '11.3', 'Bob membaca dokumen backup milik Alice ditolak', 'PASS'))
     .catch(err => recordResult(11, '11.3', 'Bob membaca dokumen backup milik Alice', 'FAIL', err.message));

    // 11.4 Alice membaca backup miliknya sendiri -> DIIZINKAN
    await assertSucceeds(
      getDoc(doc(aliceDb, 'warung_madura/latest_backup'))
    ).then(() => recordResult(11, '11.4', 'Alice membaca dokumen backup miliknya sendiri diizinkan', 'PASS'))
     .catch(err => recordResult(11, '11.4', 'Alice membaca dokumen backup miliknya sendiri', 'FAIL', err.message));

  } finally {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }

  console.log('\n=================================================================');
  console.log('                    RINGKASAN HASIL TEST SUITE                   ');
  console.log('=================================================================');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL PENGUJIAN: ${results.length}`);
  console.log(`LULUS (PASS)   : ${passCount}`);
  console.log(`GAGAL (FAIL)   : ${failCount}`);
  console.log(`STATUS AKHIR   : ${failCount === 0 ? 'SEMUA SKENARIO LULUS (100% PASS)' : 'ADA SKENARIO GAGAL'}`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
