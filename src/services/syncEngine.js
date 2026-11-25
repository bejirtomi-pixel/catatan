/**
 * Service Firestore Sync Engine Core & Supplier Pilot (Fase 3A)
 *
 * Mengelola sinkronisasi data operasional antara IndexedDB Offline Queue dan Cloud Firestore.
 * Pada Fase 3A, hanya domain 'suppliers' (Toko Pemasok: wm_v1_stores) yang diaktifkan sebagai pilot.
 *
 * Fitur Utama:
 * 1. Multi-Tab Concurrency via Web Locks API (Leader Election) + Atomic IDB Claim.
 * 2. Tenant Path Resolution deterministik berdasarkan Firebase Auth UID: /stores_app/{store_ownerUid}/...
 * 3. Server-Side Idempotency via atomic transaction & immutable ledger /operations_log/{opId}.
 * 4. Exponential backoff with jitter untuk penanganan error transien.
 * 5. Local-First: localStorage tetap menjadi sumber data utama UI warung.
 */

import { db as defaultDb } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
} from 'firebase/firestore';
import {
  QUEUE_STATUS,
  enqueueOperation,
  getPendingOperations,
  getQueueItems,
  claimOperationForProcessing,
  markOperationCompleted,
  markOperationFailed,
  getQueueStats,
  recoverStaleProcessingOperations,
} from './offlineQueue.js';

// Domain yang aktif disinkronkan pada Fase 3A (HANYA pilot Toko Pemasok)
export const ACTIVE_SYNC_DOMAINS = ['suppliers'];

// Status Sinkronisasi Mesin
export const SYNC_ENGINE_STATUS = {
  STOPPED: 'stopped',
  IDLE: 'idle',
  SYNCING: 'syncing',
  OFFLINE: 'offline',
  ERROR: 'error',
};

// State reaktif internal
let syncState = {
  status: SYNC_ENGINE_STATUS.STOPPED,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isLeader: false,
  activeOwnerUid: null,
  activeDomains: [...ACTIVE_SYNC_DOMAINS],
  lastSyncAt: null,
  lastError: null,
  stats: {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  },
};

const listeners = new Set();
let lockAbortController = null;
let pollTimer = null;
let isCycleRunning = false;
const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Berlangganan perubahan state Sync Engine
 */
export function subscribeSyncState(callback) {
  listeners.add(callback);
  callback({ ...syncState });
  return () => listeners.delete(callback);
}

function notifyListeners() {
  const snapshot = { ...syncState };
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch (e) {
      console.error('[SyncEngine] Listener error:', e);
    }
  }
}

function updateState(partial) {
  syncState = { ...syncState, ...partial };
  notifyListeners();
}

/**
 * Resolusi Tenant ID deterministik berdasarkan Firebase Auth UID
 * Format: store_{ownerUid}
 */
export function resolveTenantId(ownerUid) {
  if (!ownerUid || typeof ownerUid !== 'string') return null;
  return `store_${ownerUid}`;
}

/**
 * Memastikan Dokumen Root Tenant (/stores_app/{tenantId}) Telah Terbentuk di Firestore.
 *
 * KRITIS UNTUK SECURITY RULES (Fase 3A.6: RSK-05):
 * Firestore Security Rules memeriksa:
 * `exists(/databases/$(database)/documents/stores_app/$(storeId))`
 * pada dokumen subcollection seperti `/suppliers/{supplierId}`.
 * Karena aturan dievaluasi terhadap kondisi database SEBELUM transaksi,
 * dokumen root tenant HARUS sudah ada dan di-commit sebelum transaksi subcollection pertama dijalankan.
 *
 * Fitur Keamanan:
 * - Anti-Takeover: Jika dokumen root sudah ada tetapi dimiliki oleh UID lain, eksekusi ditolak.
 * - Idempoten: Jika sudah ada dan valid milik owner, tidak melakukan write ulang yang tidak perlu.
 */
export async function ensureTenantRootProvisioned(ownerUid, options = {}) {
  if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) {
    return { ok: false, error: 'ownerUid wajib diisi untuk provisioning root tenant.' };
  }

  const expectedTenantId = resolveTenantId(ownerUid);
  const tenantId = options.tenantId || expectedTenantId;

  if (!tenantId) {
    return { ok: false, error: 'Tenant ID tidak dapat ditentukan dari ownerUid.' };
  }

  // Anti-takeover level argumen: Pengguna tidak boleh mem-provisioning tenant ID milik akun lain
  if (tenantId !== expectedTenantId) {
    return {
      ok: false,
      error: `Akses ditolak: Tenant ID ${tenantId} tidak sesuai dengan ownerUid pemanggil (${ownerUid}). Anti-takeover aktif.`,
    };
  }

  const firestoreDb = options.customDb || defaultDb;
  const tenantRef = doc(firestoreDb, 'stores_app', tenantId);

  // 1. Periksa apakah dokumen sudah ada
  try {
    const tenantSnap = await getDoc(tenantRef);

    if (tenantSnap.exists()) {
      const tenantData = tenantSnap.data() || {};
      if (tenantData.ownerUid && tenantData.ownerUid !== ownerUid) {
        return {
          ok: false,
          error: `Akses ditolak: Dokumen root ${tenantId} sudah dimiliki oleh ownerUid lain (${tenantData.ownerUid}). Anti-takeover aktif.`,
        };
      }
      return {
        ok: true,
        existed: true,
        tenantId,
        ownerUid,
      };
    }
  } catch (_readErr) {
    // Pada Firestore Rules, membaca dokumen yang belum ada (/stores_app/{storeId})
    // dapat menghasilkan permission-denied akibat pengecekan resource.data saat resource == null.
    // Kita lanjutkan untuk mencoba pembuatan dokumen (create) di bawah.
  }

  // 2. Inisialisasi awal dokumen root tenant baru (create)
  try {
    const nowIso = new Date().toISOString();
    await setDoc(tenantRef, {
      ownerUid,
      storeName: options.storeName || 'Warung Madura',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return {
      ok: true,
      created: true,
      tenantId,
      ownerUid,
    };
  } catch (createErr) {
    return {
      ok: false,
      error: `Gagal memastikan dokumen root tenant: ${createErr?.message || createErr}`,
    };
  }
}

/**
 * Ambil snapshot state saat ini
 */
export function getSyncState() {
  return { ...syncState };
}

/**
 * Validasi Payload untuk Entitas Pemasok (Suppliers)
 * Memastikan payload memenuhi aturan bisnis lokal dan firestore.rules
 */
export function validateSupplierPayload(operation) {
  if (!operation || typeof operation !== 'object') {
    return { ok: false, error: 'Operasi tidak valid.' };
  }

  const { operationType, payload, entityId } = operation;
  const opType = String(operationType).toUpperCase();

  if (opType !== 'CREATE' && opType !== 'UPDATE' && opType !== 'DELETE') {
    return { ok: false, error: `Tipe operasi ${operationType} tidak didukung pada domain suppliers.` };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload operasi supplier wajib berupa objek.' };
  }

  const id = payload.id || entityId;
  if (!id || typeof id !== 'string' || !id.trim()) {
    return { ok: false, error: 'ID supplier wajib diisi.' };
  }

  if (opType === 'DELETE') {
    return { ok: true, validatedData: { id: id.trim() } };
  }

  // Validasi CREATE dan UPDATE
  const name = String(payload.name || '').trim();
  if (!name) {
    return { ok: false, error: 'Nama supplier wajib diisi dan tidak boleh kosong.' };
  }

  const phone = payload.phone != null ? String(payload.phone).trim() : '';
  const address = payload.address != null ? String(payload.address).trim() : '';
  const note = payload.note != null ? String(payload.note).trim() : '';
  const nowIso = new Date().toISOString();
  const updatedAt = payload.updatedAt && String(payload.updatedAt).length >= 19 ? payload.updatedAt : nowIso;
  const createdAt = payload.createdAt || nowIso;

  return {
    ok: true,
    validatedData: {
      id: id.trim(),
      name,
      phone,
      address,
      note,
      createdAt,
      updatedAt,
    },
  };
}

/**
 * Menghitung jeda waktu percobaan ulang dengan eksponensial backoff dan jitter
 */
export function calculateBackoffMs(retryCount, baseMs = 1500, maxMs = 30000) {
  const exp = Math.min(retryCount, 5);
  const factor = Math.pow(2, exp);
  const jitter = Math.random() * 500;
  return Math.min(baseMs * factor + jitter, maxMs);
}

/**
 * Eksekusi Transaksi Atomik Firestore untuk Operasi Supplier Tunggal
 * Menjamin Idempotensi Server via /stores_app/{tenantId}/operations_log/{opId}
 */
export async function executeSupplierTransaction(operation, options = {}) {
  const { opId, ownerUid, operationType, entityId } = operation;
  const firestoreDb = options.customDb || defaultDb;
  const tenantId = options.tenantId || resolveTenantId(ownerUid);

  if (!tenantId) {
    throw new Error('Tenant ID tidak dapat ditentukan dari ownerUid.');
  }

  // 1. Validasi Payload
  const validation = validateSupplierPayload(operation);
  if (!validation.ok) {
    return {
      success: false,
      validationError: true,
      error: validation.error,
    };
  }
  const cleanData = validation.validatedData;

  // 2. Transaksi Atomik Firestore
  const result = await runTransaction(firestoreDb, async (transaction) => {
    // A. Pastikan dokumen root tenant warung ada
    const tenantRef = doc(firestoreDb, 'stores_app', tenantId);
    const tenantSnap = await transaction.get(tenantRef);
    if (!tenantSnap.exists()) {
      transaction.set(tenantRef, {
        ownerUid,
        storeName: 'Warung Madura',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const rootData = tenantSnap.data() || {};
      if (rootData.ownerUid && rootData.ownerUid !== ownerUid) {
        throw new Error(`Akses ditolak: Dokumen root ${tenantId} sudah dimiliki oleh ownerUid lain (${rootData.ownerUid}).`);
      }
    }

    // B. Periksa Buku Ledger Idempotensi Server (/operations_log/{opId})
    const opLogRef = doc(firestoreDb, 'stores_app', tenantId, 'operations_log', opId);
    const opLogSnap = await transaction.get(opLogRef);

    if (opLogSnap.exists()) {
      // Idempotensi: Operasi ini telah berhasil dieksekusi sebelumnya di server
      return {
        alreadyExecuted: true,
        opId,
        entityId: cleanData.id,
      };
    }

    // C. Mutasi Entitas Supplier
    const supplierRef = doc(firestoreDb, 'stores_app', tenantId, 'suppliers', cleanData.id);
    const opType = String(operationType).toUpperCase();

    if (opType === 'DELETE') {
      transaction.delete(supplierRef);
    } else {
      transaction.set(
        supplierRef,
        {
          id: cleanData.id,
          name: cleanData.name,
          phone: cleanData.phone,
          address: cleanData.address,
          note: cleanData.note,
          createdAt: cleanData.createdAt,
          updatedAt: cleanData.updatedAt,
        },
        { merge: true }
      );
    }

    // D. Catat Ledger Abadi Transaksi Server
    transaction.set(opLogRef, {
      opId,
      ownerUid,
      entityType: 'suppliers',
      entityId: cleanData.id,
      operationType: opType,
      clientTimestamp: operation.createdAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    });

    return {
      alreadyExecuted: false,
      opId,
      entityId: cleanData.id,
      operationType: opType,
    };
  });

  return { success: true, ...result };
}

/**
 * Satu Siklus Pengurasan Antrean (Queue Drain Cycle)
 * Mengambil operasi pending milik owner, mengklaim atomik, memproses, dan memperbarui status
 */
export async function processQueueCycle(ownerUid, options = {}) {
  if (!ownerUid) {
    return { ok: false, error: 'Tidak ada ownerUid yang aktif.' };
  }

  // Periksa konektivitas jaringan
  const isOnline = options.forceOnline !== undefined
    ? options.forceOnline
    : typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;

  if (!isOnline) {
    updateState({ status: SYNC_ENGINE_STATUS.OFFLINE, isOnline: false });
    return {
      ok: false,
      processedCount: 0,
      failedCount: 0,
      offline: true,
      error: 'Perangkat sedang dalam mode offline.',
    };
  }

  if (isCycleRunning) {
    return {
      ok: false,
      processedCount: 0,
      failedCount: 0,
      running: true,
      message: 'Siklus sinkronisasi sedang berjalan.',
    };
  }

  isCycleRunning = true;
  updateState({ status: SYNC_ENGINE_STATUS.SYNCING, isOnline: true });

  const customFactory = options.customFactory;
  let processedCount = 0;
  let failedCount = 0;
  const cycleErrors = [];

  try {
    // 0. Pemulihan Operasi Stale (Fase 3A.6: RSK-04)
    // Kembalikan operasi yang menggantung di status 'processing' akibat crash/reload ke 'pending'
    const staleTimeoutMs = options.staleTimeoutMs || options.leaseTimeoutMs || 60000;
    await recoverStaleProcessingOperations(ownerUid, staleTimeoutMs, customFactory);

    const pendingList = await getPendingOperations(ownerUid, customFactory);

    // Filter ketat: HANYA domain yang aktif (Fase 3A: suppliers)
    const eligibleOps = pendingList.filter((op) =>
      ACTIVE_SYNC_DOMAINS.includes(op.entityType)
    );

    // Pastikan dokumen root tenant warung sudah ter-provisioning sebelum memproses operasi subcollection (Fase 3A.6: RSK-05)
    if (eligibleOps.length > 0) {
      const provRes = await ensureTenantRootProvisioned(ownerUid, options);
      if (!provRes.ok) {
        updateState({
          status: SYNC_ENGINE_STATUS.ERROR,
          lastError: provRes.error,
        });
        return {
          ok: false,
          error: provRes.error,
          processedCount: 0,
          failedCount: eligibleOps.length,
          totalEligible: eligibleOps.length,
        };
      }
    }

    for (const op of eligibleOps) {
      // 1. Klaim Operasi Secara Atomik di IndexedDB
      const claimRes = await claimOperationForProcessing(
        {
          opId: op.opId,
          expectedOwnerUid: ownerUid,
          workerId: options.workerId || workerId,
          leaseTimeoutMs: options.leaseTimeoutMs || 60000,
        },
        customFactory
      );

      if (!claimRes.ok) {
        // Gagal klaim (sedang diproses oleh worker lain, mismatch, dll)
        continue;
      }

      const claimedOp = claimRes.operation;

      try {
        // 2. Eksekusi Transaksi Server
        const txResult = await executeSupplierTransaction(claimedOp, options);

        if (!txResult.success && txResult.validationError) {
          // Kesalahan validasi payload: tandai gagal permanen (tidak retry otomatis)
          await markOperationFailed(
            claimedOp.opId,
            `Validasi gagal: ${txResult.error}`,
            ownerUid,
            customFactory
          );
          failedCount++;
          cycleErrors.push({ opId: claimedOp.opId, error: txResult.error, type: 'validation' });
          updateState({ lastError: txResult.error });
          continue;
        }

        // 3. Konfirmasi Server Sukses: Tandai Completed
        await markOperationCompleted(claimedOp.opId, txResult, ownerUid, customFactory);
        processedCount++;
        updateState({ lastSyncAt: new Date().toISOString(), lastError: null });
      } catch (err) {
        // Kesalahan koneksi / Firestore
        const errMsg = err?.message || 'Gagal sinkronisasi ke Firestore.';
        await markOperationFailed(claimedOp.opId, errMsg, ownerUid, customFactory);
        failedCount++;
        cycleErrors.push({ opId: claimedOp.opId, error: errMsg, type: 'firestore' });
        updateState({ lastError: errMsg });
      }
    }

    // Refresh statistik antrean lokal
    const currentStats = await getQueueStats(ownerUid, customFactory);
    updateState({
      status: failedCount > 0 ? SYNC_ENGINE_STATUS.ERROR : SYNC_ENGINE_STATUS.IDLE,
      stats: currentStats,
    });

    const isSuccess = failedCount === 0;
    return {
      ok: isSuccess,
      processedCount,
      failedCount,
      totalEligible: eligibleOps.length,
      lastError: cycleErrors.length > 0 ? cycleErrors[cycleErrors.length - 1].error : null,
      errors: cycleErrors.length > 0 ? cycleErrors : undefined,
    };
  } catch (err) {
    updateState({
      status: SYNC_ENGINE_STATUS.ERROR,
      lastError: err?.message || 'Gagal menjalankan siklus antrean.',
    });
    return { ok: false, error: err?.message, processedCount: 0, failedCount: 0 };
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Pemeriksaan Pra-Sinkronisasi (Preview) Backfill Toko Pemasok Lokal
 *
 * Mengidentifikasi:
 * 1. Jumlah toko lokal di localStorage
 * 2. Toko yang sudah tersinkron (COMPLETED di IndexedDB)
 * 3. Toko yang sedang dalam antrean (PENDING/PROCESSING)
 * 4. Toko yang gagal sebelumnya (FAILED)
 * 5. Toko yang memenuhi syarat untuk dimasukkan ke antrean awal (ELIGIBLE)
 * 6. Toko dengan format ID atau nama tidak valid
 * 7. Deteksi ID duplikat
 */
export async function previewSupplierBackfill(localStores = [], ownerUid, customFactory) {
  if (!ownerUid || typeof ownerUid !== 'string') {
    return { ok: false, error: 'ownerUid wajib diisi untuk memeriksa backfill.' };
  }

  const storesList = Array.isArray(localStores) ? localStores : [];
  const existingOps = await getQueueItems({ ownerUid, entityType: 'suppliers' }, customFactory);

  // Peta operasi pemasok yang sudah tercatat di antrean IndexedDB berdasarkan entityId
  const opsBySupplierId = new Map();
  for (const op of existingOps) {
    if (op.entityId) {
      // Jika ada beberapa operasi pada supplier yang sama, prioritaskan COMPLETED > PROCESSING > PENDING > FAILED
      const current = opsBySupplierId.get(op.entityId);
      if (!current) {
        opsBySupplierId.set(op.entityId, op);
      } else if (op.status === QUEUE_STATUS.COMPLETED) {
        opsBySupplierId.set(op.entityId, op);
      } else if (current.status !== QUEUE_STATUS.COMPLETED && op.status === QUEUE_STATUS.PROCESSING) {
        opsBySupplierId.set(op.entityId, op);
      }
    }
  }

  const seenIds = new Set();
  const duplicateIds = new Set();
  const invalidStores = [];
  const eligibleStores = [];
  const alreadySyncedStores = [];
  const alreadyQueuedStores = [];
  const failedStores = [];

  for (const store of storesList) {
    if (!store || typeof store !== 'object') {
      invalidStores.push({ store, reason: 'Objek store tidak valid' });
      continue;
    }

    const id = String(store.id || '').trim();
    const name = String(store.name || '').trim();

    if (!id) {
      invalidStores.push({ store, reason: 'ID toko kosong' });
      continue;
    }
    if (!name) {
      invalidStores.push({ store, reason: 'Nama toko kosong' });
      continue;
    }

    if (seenIds.has(id)) {
      duplicateIds.add(id);
      continue;
    }
    seenIds.add(id);

    const existingOp = opsBySupplierId.get(id);

    if (existingOp) {
      if (existingOp.status === QUEUE_STATUS.COMPLETED) {
        alreadySyncedStores.push({ store, opId: existingOp.opId });
      } else if (existingOp.status === QUEUE_STATUS.PENDING || existingOp.status === QUEUE_STATUS.PROCESSING) {
        alreadyQueuedStores.push({ store, opId: existingOp.opId, status: existingOp.status });
      } else if (existingOp.status === QUEUE_STATUS.FAILED) {
        failedStores.push({ store, opId: existingOp.opId, lastError: existingOp.lastError });
      }
    } else {
      eligibleStores.push(store);
    }
  }

  return {
    ok: true,
    totalLocal: storesList.length,
    eligibleCount: eligibleStores.length,
    alreadySyncedCount: alreadySyncedStores.length,
    alreadyQueuedCount: alreadyQueuedStores.length,
    failedCount: failedStores.length,
    invalidCount: invalidStores.length,
    duplicateCount: duplicateIds.size,
    eligibleStores,
    alreadySyncedStores,
    alreadyQueuedStores,
    failedStores,
    invalidStores,
    duplicateIds: Array.from(duplicateIds),
  };
}

/**
 * Eksekusi Backfill Toko Pemasok Lokal ke Antrean IndexedDB
 *
 * Sifat Mutlak:
 * 1. Idempoten: Menggunakan deterministic opId (op_backfill_supp_{ownerUid}_{storeId}).
 * 2. Aman terhadap eksekusi berulang: Jika dipanggil berkali-kali, enqueueOperation men-deduplikasi.
 * 3. Menjaga ID asli toko: Tidak mengubah store.id lokal sama sekali.
 * 4. Tidak mengubah data localStorage lokal.
 * 5. Mengaitkan dengan ownerUid pengguna aktif.
 */
export async function executeSupplierBackfill(localStores = [], ownerUid, options = {}) {
  if (!ownerUid || typeof ownerUid !== 'string') {
    return { ok: false, error: 'ownerUid wajib diisi untuk menjalankan backfill.' };
  }

  const customFactory = options.customFactory;
  const operatorInfo = options.operator || { id: 'op-system', name: 'Inisialisasi Sistem' };

  // 1. Jalankan preview terlebih dahulu untuk verifikasi keamanan
  const preview = await previewSupplierBackfill(localStores, ownerUid, customFactory);
  if (!preview.ok) {
    return { ok: false, error: preview.error };
  }

  if (preview.eligibleStores.length === 0) {
    return {
      ok: true,
      enqueuedCount: 0,
      deduplicatedCount: preview.alreadyQueuedCount + preview.alreadySyncedCount,
      alreadySyncedCount: preview.alreadySyncedCount,
      alreadyQueuedCount: preview.alreadyQueuedCount,
      message: 'Tidak ada toko pemasok baru yang perlu dimasukkan ke antrean.',
      preview,
    };
  }

  const enqueuedOps = [];
  const nowIso = new Date().toISOString();

  // 2. Enqueue setiap toko yang eligible dengan opId deterministik
  for (const store of preview.eligibleStores) {
    const stableOpId = `op_backfill_supp_${ownerUid}_${store.id}`;
    const cleanPayload = {
      id: store.id,
      name: store.name,
      phone: store.phone || '',
      address: store.address || '',
      note: store.note || '',
      createdAt: store.createdAt || nowIso,
      updatedAt: store.updatedAt || store.createdAt || nowIso,
    };

    const enqueueRes = await enqueueOperation(
      {
        opId: stableOpId,
        operationType: 'CREATE',
        entityType: 'suppliers',
        entityId: store.id,
        payload: cleanPayload,
        ownerUid,
        operatorId: operatorInfo.id,
        operatorName: operatorInfo.name,
      },
      customFactory
    );

    if (enqueueRes.ok) {
      enqueuedOps.push({
        opId: stableOpId,
        storeId: store.id,
        storeName: store.name,
        deduplicated: Boolean(enqueueRes.deduplicated),
      });
    }
  }

  // 3. Refresh statistik antrean lokal
  const updatedStats = await getQueueStats(ownerUid, customFactory);
  updateState({ stats: updatedStats });

  return {
    ok: true,
    totalLocal: preview.totalLocal,
    enqueuedCount: enqueuedOps.filter((x) => !x.deduplicated).length,
    deduplicatedCount: enqueuedOps.filter((x) => x.deduplicated).length,
    enqueuedOps,
    preview,
  };
}

/**
 * Pemicu Sinkronisasi Segera (Manual atau Reaktif saat Enqueue)
 */
export async function triggerSyncNow({ ownerUid, customDb, customFactory } = {}) {
  const targetUid = ownerUid || syncState.activeOwnerUid;
  if (!targetUid) return { ok: false, reason: 'Belum terautentikasi' };
  return await processQueueCycle(targetUid, { customDb, customFactory });
}

/**
 * Mulai Siklus Hidup Sync Engine
 */
export function startSyncEngine({ ownerUid, customDb, customFactory, intervalMs = 15000 } = {}) {
  if (!ownerUid) {
    updateState({ status: SYNC_ENGINE_STATUS.STOPPED, activeOwnerUid: null });
    return;
  }

  stopSyncEngine();

  updateState({
    activeOwnerUid: ownerUid,
    status: SYNC_ENGINE_STATUS.IDLE,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  // Handler Event Jaringan Online/Offline
  const handleOnline = () => {
    updateState({ isOnline: true });
    triggerSyncNow({ ownerUid, customDb, customFactory });
  };

  const handleOffline = () => {
    updateState({ isOnline: false, status: SYNC_ENGINE_STATUS.OFFLINE });
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  // Multi-Tab Leader Election via Web Locks API
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    lockAbortController = new AbortController();
    navigator.locks
      .request('catatan_warung_sync_engine_lock', { signal: lockAbortController.signal }, async (lock) => {
        if (!lock) return;
        updateState({ isLeader: true });

        // Jalankan siklus pertama saat leader terpilih
        await triggerSyncNow({ ownerUid, customDb, customFactory });

        // Polling periodik untuk leader
        pollTimer = setInterval(() => {
          triggerSyncNow({ ownerUid, customDb, customFactory });
        }, intervalMs);

        // Pertahankan lock selama tab aktif
        return new Promise((resolve) => {
          lockAbortController.signal.addEventListener('abort', () => {
            clearInterval(pollTimer);
            updateState({ isLeader: false });
            resolve();
          });
        });
      })
      .catch(() => {
        updateState({ isLeader: false });
      });
  } else {
    // Lingkungan tanpa Web Locks (misal Node.js atau browser lama)
    updateState({ isLeader: true });
    triggerSyncNow({ ownerUid, customDb, customFactory });
    pollTimer = setInterval(() => {
      triggerSyncNow({ ownerUid, customDb, customFactory });
    }, intervalMs);
  }
}

/**
 * Hentikan Siklus Hidup Sync Engine (Logout / Cleanup)
 */
export function stopSyncEngine() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (lockAbortController) {
    lockAbortController.abort();
    lockAbortController = null;
  }
  updateState({
    status: SYNC_ENGINE_STATUS.STOPPED,
    isLeader: false,
    activeOwnerUid: null,
  });
}
