/**
 * Service Persistent Offline Queue & Idempotency (Fase 2)
 *
 * Menggunakan IndexedDB untuk menyimpan seluruh operasi lokal warung secara persisten.
 * Antrean ini tahan terhadap reload halaman dan restart browser.
 * Setiap operasi memiliki `opId` unik dan permanen untuk menjamin idempotensi lokal.
 */

export const DB_NAME = 'catatan_warung_offline_queue';
export const DB_VERSION = 1;
export const STORE_OPERATIONS = 'operations';

export const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  FAILED: 'failed',
  COMPLETED: 'completed',
};

/**
 * Helper untuk mengambil instance IndexedDB
 */
export function getIndexedDBInstance(customFactory) {
  if (customFactory) return customFactory;
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof globalThis !== 'undefined' && globalThis.indexedDB) {
    return globalThis.indexedDB;
  }
  return null;
}

/**
 * Inisialisasi dan buka koneksi IndexedDB dengan skema versi 1
 */
export function openQueueDB(customFactory) {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDBInstance(customFactory);
    if (!idb) {
      return reject(new Error('IndexedDB tidak didukung pada lingkungan runtime ini.'));
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_OPERATIONS)) {
        const store = db.createObjectStore(STORE_OPERATIONS, { keyPath: 'opId' });

        // Index untuk isolasi per akun pemilik
        store.createIndex('by_ownerUid', 'ownerUid', { unique: false });

        // Index untuk penyaringan status operasi
        store.createIndex('by_status', 'status', { unique: false });

        // Index gabungan untuk query operasi pending milik pemilik tertentu
        store.createIndex('by_owner_status', ['ownerUid', 'status'], { unique: false });

        // Index kronologis FIFO
        store.createIndex('by_createdAt', 'createdAt', { unique: false });

        // Index target entitas
        store.createIndex('by_entity', ['entityType', 'entityId'], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka database antrean IndexedDB.'));
    request.onblocked = () => reject(new Error('Koneksi IndexedDB diblokir oleh tab/jendela lain.'));
  });
}

/**
 * Generator opId unik berbasis timestamp dan string acak
 * Menghasilkan identifier yang chronologically sortable dan collision-resistant
 */
export function generateOpId() {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 10);
  return `op_${ts}_${rnd}`;
}

/**
 * Masukkan operasi baru ke dalam antrean IndexedDB (Enqueue)
 *
 * Menerapkan Idempotency Lokal:
 * - Jika opId yang sama sudah ada dan completed, operasi ditolak/diabaikan.
 * - Jika opId yang sama sudah pending/processing, data lama dipertahankan (deduplicate).
 */
export async function enqueueOperation(opData, customFactory) {
  if (!opData || typeof opData !== 'object') {
    return { ok: false, error: 'Payload data operasi tidak valid.' };
  }

  const {
    operationType,
    entityType,
    entityId,
    payload,
    ownerUid,
    operatorId,
    operatorName,
  } = opData;

  if (!operationType || typeof operationType !== 'string') {
    return { ok: false, error: 'Atribut operationType wajib diisi (misal: CREATE, UPDATE, DELETE).' };
  }
  if (!entityType || typeof entityType !== 'string') {
    return { ok: false, error: 'Atribut entityType wajib diisi (misal: products, stocks, orders).' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Atribut payload wajib berupa objek data yang sah.' };
  }
  if (!ownerUid || typeof ownerUid !== 'string') {
    return { ok: false, error: 'Atribut ownerUid wajib diisi untuk isolasi kepemilikan data.' };
  }

  // Gunakan opId yang diberikan atau buat baru jika operasi pertama kali dibuat
  const opId = opData.opId || generateOpId();
  const nowIso = new Date().toISOString();

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);

      // Periksa apakah operasi dengan opId ini sudah pernah masuk sebelumnya (Deduplikasi Idempotensi)
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          // Operasi duplikat terdeteksi
          if (existing.status === QUEUE_STATUS.COMPLETED) {
            resolve({
              ok: true,
              opId,
              deduplicated: true,
              message: 'Operasi dengan opId ini telah selesai sebelumnya.',
              operation: existing,
            });
            return;
          }
          resolve({
            ok: true,
            opId,
            deduplicated: true,
            message: 'Operasi duplikat terdeteksi dalam antrean, entri lama dipertahankan.',
            operation: existing,
          });
          return;
        }

        // Susun amplop operasi (envelope) standar Fase 2
        const operationEnvelope = {
          opId,
          schemaVersion: DB_VERSION,
          operationType: operationType.toUpperCase(),
          entityType,
          entityId: entityId ? String(entityId) : null,
          payload,
          ownerUid,
          operatorId: operatorId || 'op-default',
          operatorName: String(operatorName || 'Operator Warung').trim(),
          status: QUEUE_STATUS.PENDING,
          retryCount: 0,
          lastError: null,
          processingStartedAt: null,
          completedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const putReq = store.put(operationEnvelope);
        putReq.onsuccess = () => {
          resolve({
            ok: true,
            opId,
            operation: operationEnvelope,
          });
        };
        putReq.onerror = () => reject(putReq.error || new Error('Gagal menyimpan operasi ke IndexedDB.'));
      };

      getReq.onerror = () => reject(getReq.error || new Error('Gagal memeriksa keberadaan opId di IndexedDB.'));

      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error || new Error('Transaksi IndexedDB gagal.'));
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Ambil seluruh operasi berstatus pending untuk akun pemilik tertentu (FIFO)
 */
export async function getPendingOperations(ownerUid, customFactory) {
  if (!ownerUid) return [];

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readonly');
      const store = tx.objectStore(STORE_OPERATIONS);
      const index = store.index('by_owner_status');

      const query = IDBKeyRange.only([ownerUid, QUEUE_STATUS.PENDING]);
      const request = index.getAll(query);

      request.onsuccess = () => {
        const items = request.result || [];
        // Urutkan FIFO berdasarkan createdAt
        items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(items);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Tandai operasi mulai diproses (Status -> processing)
 */
export async function markOperationProcessing(opId, expectedOwnerUidOrFactory, customFactory) {
  if (!opId) return { ok: false, error: 'opId wajib diisi.' };

  let expectedOwnerUid = null;
  let factory = customFactory;
  if (typeof expectedOwnerUidOrFactory === 'string') {
    expectedOwnerUid = expectedOwnerUidOrFactory;
  } else if (expectedOwnerUidOrFactory && typeof expectedOwnerUidOrFactory === 'object') {
    factory = expectedOwnerUidOrFactory;
  }

  const db = await openQueueDB(factory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const op = getReq.result;
        if (!op) {
          resolve({ ok: false, error: `Operasi dengan opId ${opId} tidak ditemukan.` });
          return;
        }

        if (expectedOwnerUid && op.ownerUid !== expectedOwnerUid) {
          resolve({ ok: false, error: 'Akses ditolak: Operasi bukan milik owner yang aktif.' });
          return;
        }

        const nowIso = new Date().toISOString();
        op.status = QUEUE_STATUS.PROCESSING;
        op.processingStartedAt = nowIso;
        op.updatedAt = nowIso;

        const putReq = store.put(op);
        putReq.onsuccess = () => resolve({ ok: true, operation: op });
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Klaim operasi pending secara atomik untuk diproses oleh worker tertentu (Fase 3A)
 * Menggunakan transaksi IndexedDB readwrite untuk mencegah race condition antar-tab.
 */
export async function claimOperationForProcessing({ opId, expectedOwnerUid, workerId, leaseTimeoutMs = 60000 }, customFactory) {
  if (!opId) return { ok: false, error: 'opId wajib diisi.' };

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const op = getReq.result;
        if (!op) {
          resolve({ ok: false, reason: 'NOT_FOUND', error: `Operasi dengan opId ${opId} tidak ditemukan.` });
          return;
        }

        // 1. Validasi Kepemilikan Owner
        if (expectedOwnerUid && op.ownerUid !== expectedOwnerUid) {
          resolve({ ok: false, reason: 'OWNER_MISMATCH', error: 'Operasi bukan milik owner yang aktif.' });
          return;
        }

        // 2. Operasi yang sudah selesai dilarang diklaim ulang
        if (op.status === QUEUE_STATUS.COMPLETED) {
          resolve({ ok: false, reason: 'ALREADY_COMPLETED', error: 'Operasi telah selesai diproses sebelumnya.' });
          return;
        }

        const now = Date.now();
        const nowIso = new Date().toISOString();

        // 3. Pengecekan status processing dan masa kedaluwarsa lease
        if (op.status === QUEUE_STATUS.PROCESSING) {
          const startedAt = op.processingStartedAt ? new Date(op.processingStartedAt).getTime() : 0;
          const isLeaseExpired = now - startedAt > leaseTimeoutMs;

          if (!isLeaseExpired) {
            // Sedang diproses oleh worker lain yang aktif
            resolve({
              ok: false,
              reason: 'ALREADY_CLAIMED',
              claimedBy: op.claimedByWorkerId || 'unknown_worker',
              error: 'Operasi sedang diproses oleh worker lain.',
            });
            return;
          }
          // Lease kedaluwarsa: izinkan pengambilalihan klaim (stale recovery takeover)
        } else if (op.status !== QUEUE_STATUS.PENDING) {
          // Status FAILED atau lainnya tidak bisa diklaim langsung tanpa retry
          resolve({
            ok: false,
            reason: 'INVALID_STATUS',
            error: `Operasi berstatus "${op.status}" tidak dapat diklaim tanpa retry terlebih dahulu.`,
          });
          return;
        }

        // Klaim berhasil secara atomik di dalam transaksi IDB
        op.status = QUEUE_STATUS.PROCESSING;
        op.claimedByWorkerId = workerId || 'worker_default';
        op.processingStartedAt = nowIso;
        op.updatedAt = nowIso;

        const putReq = store.put(op);
        putReq.onsuccess = () => resolve({ ok: true, operation: op });
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Tandai operasi telah selesai diproses secara sukses (Status -> completed)
 */
export async function markOperationCompleted(opId, resultData, expectedOwnerUidOrFactory, customFactory) {
  if (!opId) return { ok: false, error: 'opId wajib diisi.' };

  let expectedOwnerUid = null;
  let factory = customFactory;
  if (typeof expectedOwnerUidOrFactory === 'string') {
    expectedOwnerUid = expectedOwnerUidOrFactory;
  } else if (expectedOwnerUidOrFactory && typeof expectedOwnerUidOrFactory === 'object') {
    factory = expectedOwnerUidOrFactory;
  }

  const db = await openQueueDB(factory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const op = getReq.result;
        if (!op) {
          resolve({ ok: false, error: `Operasi dengan opId ${opId} tidak ditemukan.` });
          return;
        }

        if (expectedOwnerUid && op.ownerUid !== expectedOwnerUid) {
          resolve({ ok: false, error: 'Akses ditolak: Operasi bukan milik owner yang aktif.' });
          return;
        }

        const nowIso = new Date().toISOString();
        op.status = QUEUE_STATUS.COMPLETED;
        op.completedAt = nowIso;
        op.updatedAt = nowIso;
        if (resultData !== undefined) {
          op.result = resultData;
        }

        const putReq = store.put(op);
        putReq.onsuccess = () => resolve({ ok: true, operation: op });
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Tandai operasi gagal diproses (Status -> failed)
 * Operasi gagal tetap disimpan utuh untuk ditinjau dan dicoba kembali
 */
export async function markOperationFailed(opId, errorMessage, expectedOwnerUidOrFactory, customFactory) {
  if (!opId) return { ok: false, error: 'opId wajib diisi.' };

  let expectedOwnerUid = null;
  let factory = customFactory;
  if (typeof expectedOwnerUidOrFactory === 'string') {
    expectedOwnerUid = expectedOwnerUidOrFactory;
  } else if (expectedOwnerUidOrFactory && typeof expectedOwnerUidOrFactory === 'object') {
    factory = expectedOwnerUidOrFactory;
  }

  const db = await openQueueDB(factory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const op = getReq.result;
        if (!op) {
          resolve({ ok: false, error: `Operasi dengan opId ${opId} tidak ditemukan.` });
          return;
        }

        if (expectedOwnerUid && op.ownerUid !== expectedOwnerUid) {
          resolve({ ok: false, error: 'Akses ditolak: Operasi bukan milik owner yang aktif.' });
          return;
        }

        const nowIso = new Date().toISOString();
        op.status = QUEUE_STATUS.FAILED;
        op.lastError = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);
        op.updatedAt = nowIso;

        const putReq = store.put(op);
        putReq.onsuccess = () => resolve({ ok: true, operation: op });
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Coba ulang operasi yang gagal (Retry)
 *
 * KRITIS UNTUK IDEMPOTENSI:
 * - opId dan payload TETAP SAMA (tidak membuat opId baru).
 * - retryCount bertambah 1.
 * - status kembali menjadi 'pending'.
 *
 * GUARD STATUS (FASE 3A):
 * - completed: DITOLAK
 * - pending: DITOLAK
 * - processing: DITOLAK
 * - failed: DIIZINKAN
 */
export async function retryOperation(opId, expectedOwnerUidOrFactory, customFactory) {
  if (!opId) return { ok: false, error: 'opId wajib diisi.' };

  let expectedOwnerUid = null;
  let factory = customFactory;
  if (typeof expectedOwnerUidOrFactory === 'string') {
    expectedOwnerUid = expectedOwnerUidOrFactory;
  } else if (expectedOwnerUidOrFactory && typeof expectedOwnerUidOrFactory === 'object') {
    factory = expectedOwnerUidOrFactory;
  }

  const db = await openQueueDB(factory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const getReq = store.get(opId);

      getReq.onsuccess = () => {
        const op = getReq.result;
        if (!op) {
          resolve({ ok: false, error: `Operasi dengan opId ${opId} tidak ditemukan.` });
          return;
        }

        // Validasi ownerUid jika disediakan
        if (expectedOwnerUid && op.ownerUid !== expectedOwnerUid) {
          resolve({ ok: false, error: 'Akses ditolak: Operasi bukan milik owner yang aktif.' });
          return;
        }

        // Guard Status Ketat:
        if (op.status === QUEUE_STATUS.COMPLETED) {
          resolve({ ok: false, error: 'Operasi berstatus completed tidak boleh di-retry.' });
          return;
        }
        if (op.status === QUEUE_STATUS.PENDING) {
          resolve({ ok: false, error: 'Operasi masih berstatus pending dan sedang menunggu antrean.' });
          return;
        }
        if (op.status === QUEUE_STATUS.PROCESSING) {
          resolve({ ok: false, error: 'Operasi sedang dalam status processing. Gunakan mekanisme recovery jika operasi menggantung.' });
          return;
        }

        const nowIso = new Date().toISOString();
        op.status = QUEUE_STATUS.PENDING;
        op.retryCount = (op.retryCount || 0) + 1;
        op.lastError = null;
        op.processingStartedAt = null;
        op.claimedByWorkerId = null;
        op.updatedAt = nowIso;

        const putReq = store.put(op);
        putReq.onsuccess = () => resolve({ ok: true, operation: op });
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Pemulihan Operasi Processing yang Tertinggal (Crash / Reload Recovery)
 * Jika aplikasi crash atau reload saat operasi sedang 'processing', operasi
 * yang melebihi batas waktu staleTimeoutMs (default: 60 detik) akan dikembalikan ke 'pending'.
 */
export async function recoverStaleProcessingOperations(ownerUid, staleTimeoutMs = 60000, customFactory) {
  if (!ownerUid) return { ok: true, recoveredCount: 0 };

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const index = store.index('by_owner_status');

      const query = IDBKeyRange.only([ownerUid, QUEUE_STATUS.PROCESSING]);
      const request = index.getAll(query);

      request.onsuccess = () => {
        const items = request.result || [];
        const now = Date.now();
        let recoveredCount = 0;

        for (const op of items) {
          const startedAt = op.processingStartedAt ? new Date(op.processingStartedAt).getTime() : 0;
          if (now - startedAt > staleTimeoutMs) {
            op.status = QUEUE_STATUS.PENDING;
            op.lastError = 'Operasi dipulihkan otomatis dari status processing yang menggantung (stale).';
            op.updatedAt = new Date().toISOString();
            store.put(op);
            recoveredCount++;
          }
        }

        resolve({ ok: true, recoveredCount });
      };

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Kebijakan Retensi: Hapus operasi completed yang sudah lewat masa retensi
 * Default masa retensi: 7 hari. Operasi 'failed' dilarang dihapus otomatis.
 */
export async function purgeCompletedOperations(ownerUid, retentionPeriodMs = 7 * 24 * 60 * 60 * 1000, customFactory) {
  if (!ownerUid) return { ok: true, deletedCount: 0 };

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const index = store.index('by_owner_status');

      const query = IDBKeyRange.only([ownerUid, QUEUE_STATUS.COMPLETED]);
      const request = index.getAll(query);

      request.onsuccess = () => {
        const items = request.result || [];
        const cutoff = Date.now() - retentionPeriodMs;
        let deletedCount = 0;

        for (const op of items) {
          const completedTime = op.completedAt ? new Date(op.completedAt).getTime() : new Date(op.updatedAt).getTime();
          if (completedTime < cutoff) {
            store.delete(op.opId);
            deletedCount++;
          }
        }

        resolve({ ok: true, deletedCount });
      };

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Ambil daftar seluruh item antrean berdasarkan filter
 */
export async function getQueueItems(filter = {}, customFactory) {
  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readonly');
      const store = tx.objectStore(STORE_OPERATIONS);
      const request = store.getAll();

      request.onsuccess = () => {
        let items = request.result || [];

        if (filter.ownerUid) {
          items = items.filter((x) => x.ownerUid === filter.ownerUid);
        }
        if (filter.status) {
          items = items.filter((x) => x.status === filter.status);
        }
        if (filter.entityType) {
          items = items.filter((x) => x.entityType === filter.entityType);
        }

        // Urutkan FIFO
        items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (filter.limit && Number(filter.limit) > 0) {
          items = items.slice(0, Number(filter.limit));
        }

        resolve(items);
      };

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Statistik ringkasan antrean untuk akun pemilik
 */
export async function getQueueStats(ownerUid, customFactory) {
  const items = await getQueueItems({ ownerUid }, customFactory);
  return {
    total: items.length,
    pending: items.filter((x) => x.status === QUEUE_STATUS.PENDING).length,
    processing: items.filter((x) => x.status === QUEUE_STATUS.PROCESSING).length,
    failed: items.filter((x) => x.status === QUEUE_STATUS.FAILED).length,
    completed: items.filter((x) => x.status === QUEUE_STATUS.COMPLETED).length,
  };
}

/**
 * Kosongkan seluruh antrean untuk pemilik tertentu (Safe Purge)
 */
export async function clearQueue(ownerUid, customFactory) {
  if (!ownerUid) return { ok: false, error: 'ownerUid wajib disertakan untuk membersihkan antrean.' };

  const db = await openQueueDB(customFactory);

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
      const index = store.index('by_ownerUid');

      const request = index.getAllKeys(IDBKeyRange.only(ownerUid));

      request.onsuccess = () => {
        const keys = request.result || [];
        for (const k of keys) {
          store.delete(k);
        }
        resolve({ ok: true, deletedCount: keys.length });
      };

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}
