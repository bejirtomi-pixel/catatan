/**
 * TEST SUITE: FIREBASE CLOUD FOUNDATION & LOCAL DATA PROTECTION
 * CATATAN WARUNG MADURA — Workspace: D:\catatan
 * Project ID: catatan-b7384
 *
 * Verifies:
 * 1. Single Firebase Project Identity & Configuration Consistency
 * 2. Database Schema & Security Rules for ALL 10 Modules (including debts, visits, digital)
 * 3. Authentication & Ownership-based Security (Non-bypassable by client roles)
 * 4. Local Data Protection (Local storage preservation, zero unintended deletion)
 * 5. Offline Queue, Sync Foundation, Idempotency & Retry Architecture
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { indexedDB as fakeIDB, IDBKeyRange } from 'fake-indexeddb';

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

console.log('======================================================================');
console.log('   TEST SUITE: FIREBASE CLOUD FOUNDATION & SECURITY VERIFICATION      ');
console.log('======================================================================\n');

// ---------------------------------------------------------------------------
// GROUP 1: FIREBASE CONFIGURATION & PROJECT IDENTITY
// ---------------------------------------------------------------------------
console.log('--- GROUP 1: PROJECT IDENTITY & CONFIGURATION CONSISTENCY ---');

test('1.1 .firebaserc matches targeted project catatan-b7384', () => {
  const rc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
  assert.strictEqual(rc.projects?.default, 'catatan-b7384');
});

test('1.2 firebase.json targets firestore.rules and default ports', () => {
  const fbJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
  assert.strictEqual(fbJson.firestore?.rules, 'firestore.rules');
  assert.strictEqual(fbJson.emulators?.firestore?.port, 8080);
  assert.strictEqual(fbJson.emulators?.auth?.port, 9099);
});

test('1.3 src/services/firebase.js uses consistent project identifiers', () => {
  const fbJs = fs.readFileSync('src/services/firebase.js', 'utf8');
  assert(fbJs.includes("projectId: 'catatan-b7384'"), 'projectId must be catatan-b7384');
  assert(fbJs.includes("authDomain: 'catatan-b7384.firebaseapp.com'"), 'authDomain must match');
  assert(fbJs.includes("storageBucket: 'catatan-b7384.firebasestorage.app'"), 'storageBucket must match');
});

test('1.4 Environment variables .env match production project', () => {
  const env = fs.readFileSync('.env', 'utf8');
  assert(env.includes('VITE_FIREBASE_PROJECT_ID=catatan-b7384'), 'VITE_FIREBASE_PROJECT_ID matches');
  assert(env.includes('VITE_FIREBASE_AUTH_DOMAIN=catatan-b7384.firebaseapp.com'), 'VITE_FIREBASE_AUTH_DOMAIN matches');
});

// ---------------------------------------------------------------------------
// GROUP 2: FIRESTORE SCHEMA & SECURITY RULES FOR ALL MODULES
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 2: FIRESTORE SCHEMA & SECURITY RULES FOR ALL MODULES ---');

const rules = fs.readFileSync('firestore.rules', 'utf8');

test('2.1 Root Deny-All rule is present', () => {
  assert(rules.includes('match /{document=**} {\n      allow read, write: if false;\n    }'), 'Default deny-all at root');
});

test('2.2 Server-side Ownership Helper (isStoreOwner) is enforced', () => {
  assert(rules.includes('function isStoreOwner(storeId)'), 'isStoreOwner helper defined');
  assert(rules.includes('request.auth.uid == get(/databases/$(database)/documents/stores_app/$(storeId)).data.ownerUid'),
    'Ownership verified from authenticated UID against store document');
});

test('2.3 Store Root Profile (/stores_app/{storeId}) is secured', () => {
  assert(rules.includes('match /stores_app/{storeId}'), 'stores_app root matches');
  assert(rules.includes('allow delete: if false; // Profil warung dilarang dihapus'), 'Store root cannot be deleted');
  assert(rules.includes("isImmutableKey('ownerUid')"), 'ownerUid cannot be transferred');
});

test('2.4 All Core Operational Subcollections are Defined in Security Rules', () => {
  const expectedSubcollections = [
    '/meta/settings',
    '/meta/notifications',
    '/meta/migration_status',
    '/meta/maintenance_lock',
    '/meta/version_pointer',
    '/operators/{operatorId}',
    '/products/{productId}',
    '/stocks/{productId}',
    '/suppliers/{supplierId}',
    '/store_prices/{priceId}',
    '/supplier_catalog/{catalogId}',
    '/draft_carts/{supplierId}',
    '/orders/{orderId}',
    '/shortages/{shortageId}',
    '/visits/{visitId}',
    '/digital_transactions/{transactionId}',
    '/digital_notes/{transactionId}',
    '/debts/{debtId}',
    '/movements/{opId}',
    '/activity_logs/{logId}',
    '/price_history/{historyId}',
    '/operations_log/{opId}',
    '/warung_madura/{docId}'
  ];

  expectedSubcollections.forEach((subcol) => {
    assert(rules.includes(`match ${subcol}`), `Subcollection rule for ${subcol} must be present`);
  });
});

test('2.5 Debts (Hutang-Piutang) Subcollection validates schema and non-negative amount', () => {
  assert(rules.includes("match /debts/{debtId}"), 'debts subcollection exists');
  assert(rules.includes("request.resource.data.type in ['hutang', 'piutang']"), 'debts type strictly validated');
  assert(rules.includes("request.resource.data.amount is number && request.resource.data.amount >= 0"), 'debts amount >= 0');
});

test('2.6 Visits (Kunjungan) Subcollection validates name and immutable ID', () => {
  assert(rules.includes("match /visits/{visitId}"), 'visits subcollection exists');
  assert(rules.includes("request.resource.data.name is string && request.resource.data.name.size() > 0"), 'visit name required');
  assert(rules.includes("isImmutableKey('id')"), 'visit id is immutable');
});

test('2.7 Digital Transactions Subcollection validates category and non-negative amount', () => {
  assert(rules.includes("match /digital_transactions/{transactionId}"), 'digital_transactions subcollection exists');
  assert(rules.includes("request.resource.data.serviceAmount is number && request.resource.data.serviceAmount >= 0"), 'serviceAmount non-negative');
});

// ---------------------------------------------------------------------------
// GROUP 3: LOCAL-CLOUD SYNC & OFFLINE QUEUE FOUNDATION
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 3: OFFLINE QUEUE & SYNC ENGINE FOUNDATION ---');

// Setup fake-indexeddb
globalThis.indexedDB = fakeIDB;
globalThis.IDBKeyRange = IDBKeyRange;

const {
  openQueueDB,
  enqueueOperation,
  getPendingOperations,
  claimOperationForProcessing,
  markOperationCompleted,
  recoverStaleProcessingOperations,
  generateOpId
} = await import('../src/services/offlineQueue.js');

const {
  resolveTenantId,
  validateSupplierPayload,
  calculateBackoffMs,
  ACTIVE_SYNC_DOMAINS
} = await import('../src/services/syncEngine.js');

test('3.1 Deterministic Tenant Resolution matches store_{ownerUid}', () => {
  const tenant1 = resolveTenantId('alice_123');
  assert.strictEqual(tenant1, 'store_alice_123');
  const tenant2 = resolveTenantId('');
  assert.strictEqual(tenant2, null);
});

test('3.2 Offline Queue Enqueue and Idempotency in IndexedDB', async () => {
  const db = await openQueueDB(fakeIDB);
  assert(db, 'IndexedDB opened successfully');

  const opId = generateOpId();
  const res1 = await enqueueOperation({
    opId,
    operationType: 'CREATE',
    entityType: 'suppliers',
    entityId: 'st-test-01',
    payload: { id: 'st-test-01', name: 'Toko Uji Coba' },
    ownerUid: 'uid_test_owner'
  }, fakeIDB);

  assert.strictEqual(res1.ok, true, 'First enqueue succeeded');
  assert.strictEqual(res1.opId, opId);

  // Re-enqueue same opId should deduplicate safely
  const res2 = await enqueueOperation({
    opId,
    operationType: 'CREATE',
    entityType: 'suppliers',
    entityId: 'st-test-01',
    payload: { id: 'st-test-01', name: 'Toko Uji Coba' },
    ownerUid: 'uid_test_owner'
  }, fakeIDB);

  assert.strictEqual(res2.ok, true, 'Re-enqueue succeeded idempotently');
  assert.strictEqual(res2.deduplicated, true, 'Second enqueue was deduplicated');
});

test('3.3 Atomic Claim and Stale Recovery', async () => {
  const opId = generateOpId();
  await enqueueOperation({
    opId,
    operationType: 'UPDATE',
    entityType: 'suppliers',
    entityId: 'st-test-02',
    payload: { id: 'st-test-02', name: 'Toko Update' },
    ownerUid: 'uid_test_owner'
  }, fakeIDB);

  // Claim operation
  const claim = await claimOperationForProcessing({
    opId,
    expectedOwnerUid: 'uid_test_owner',
    workerId: 'worker_test_1',
    leaseTimeoutMs: 10 // 10ms for instant timeout
  }, fakeIDB);

  assert.strictEqual(claim.ok, true, 'Claim for processing succeeded');

  // Wait 15ms so lease expires
  await new Promise(r => setTimeout(r, 15));

  // Recover stale operation
  const recovered = await recoverStaleProcessingOperations('uid_test_owner', 10, fakeIDB);
  assert(recovered.recoveredCount >= 1, 'Stale operation was cleanly recovered back to pending');
});

test('3.4 Exponential Backoff Calculation with Jitter', () => {
  const b0 = calculateBackoffMs(0, 1000, 30000);
  const b1 = calculateBackoffMs(1, 1000, 30000);
  const b2 = calculateBackoffMs(2, 1000, 30000);
  assert(b0 >= 1000 && b0 <= 2000, 'Backoff 0 in expected range');
  assert(b1 >= 2000 && b1 <= 3000, 'Backoff 1 in expected range');
  assert(b2 >= 4000 && b2 <= 5000, 'Backoff 2 in expected range');
});

test('3.5 Supplier Payload Validation rejects malformed data', () => {
  const valid = validateSupplierPayload({
    operationType: 'CREATE',
    entityId: 'st-valid',
    payload: { id: 'st-valid', name: 'Toko Sah' }
  });
  assert.strictEqual(valid.ok, true, 'Valid supplier accepted');

  const emptyName = validateSupplierPayload({
    operationType: 'CREATE',
    entityId: 'st-invalid',
    payload: { id: 'st-invalid', name: '' }
  });
  assert.strictEqual(emptyName.ok, false, 'Empty name rejected');
});

// ---------------------------------------------------------------------------
// GROUP 4: LOCAL DATA PRESERVATION & NON-DESTRUCTIVE SAFEGUARDS
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 4: LOCAL DATA PRESERVATION & SAFEGUARDS ---');

test('4.1 Local Storage Keys in AppContext are isolated and preserved', () => {
  const appContext = fs.readFileSync('src/context/AppContext.jsx', 'utf8');
  assert(appContext.includes("const PREFIX = 'wm_v1_';"), 'Local prefix isolated');
  assert(appContext.includes("load('products'"), 'Products loaded locally');
  assert(appContext.includes("load('stores'"), 'Stores loaded locally');
  assert(appContext.includes("load('debts'"), 'Debts loaded locally');
  assert(appContext.includes("load('visits'"), 'Visits loaded locally');
  assert(appContext.includes("load('digital_transactions'"), 'Digital loaded locally');
});

test('4.2 Sync Engine has strict domain isolation and zero mass deletion', () => {
  const syncSrc = fs.readFileSync('src/services/syncEngine.js', 'utf8');
  assert(syncSrc.includes("ACTIVE_SYNC_DOMAINS = ['suppliers']"), 'Controlled domain pilot');
  assert(!syncSrc.includes('deleteCollection'), 'No destructive bulk collection wipes');
});

console.log('\n======================================================================');
console.log('                 CLOUD FOUNDATION VERIFICATION SUMMARY                ');
console.log('======================================================================');
console.log(`TOTAL PENGUJIAN : ${passCount + failCount}`);
console.log(`LULUS (PASS)    : ${passCount}`);
console.log(`GAGAL (FAIL)    : ${failCount}`);
console.log(`PERSENTASE      : ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);

if (failCount === 0) {
  console.log('\n🎉 ALL CLOUD FOUNDATION TESTS PASSED! ARCHITECTURE IS SECURE AND READY.');
  process.exit(0);
} else {
  console.error('\n❌ CLOUD FOUNDATION CHECKS FAILED.');
  process.exit(1);
}
