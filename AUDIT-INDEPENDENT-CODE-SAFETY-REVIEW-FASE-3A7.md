# AUDIT INDEPENDENT CODE SAFETY REVIEW — FASE 3A.7
**Proyek:** Catatan Warung Madura  
**Firebase Project ID:** `catatan-b7384`  
**Mode:** STRICT READ-ONLY AUDIT  
**Target:** Review Independen Hasil Fase 3A.6 Cloud Safety Hardening  
**Tanggal Audit:** 23 November 2026  

---

## A. EXECUTIVE SUMMARY

Audit independen terhadap implementasi Fase 3A.6 (*Cloud Safety Hardening*) telah dilakukan secara mendalam dan menyeluruh dengan prinsip *Strict Read-Only*. Pemeriksaan tidak hanya mengandalkan laporan pengujian sebelumnya, melainkan membedah kode sumber aktual, alur eksekusi, konfigurasi bundler Vite, integrasi Firebase SDK, aturan keamanan Firestore (*Security Rules*), serta batasan lingkungan runtime.

### Kesimpulan Utama:
1. **RSK-02 (Emulator Guard & Environment Isolation):**
   Terbukti aman secara arsitektur. Di lingkungan pengembangan (`npm run dev`), Firebase SDK secara deterministik diarahkan ke emulator lokal `127.0.0.1:8080` (Firestore) dan `127.0.0.1:9099` (Auth). Tidak ditemukan jalur eksekusi yang memungkinkan *silent fallback* ke Google Cloud Production. Mekanisme anti-duplikasi connection kebal terhadap Vite HMR.
2. **RSK-04 (Stale Queue Recovery):**
   Terbukti mengembalikan operasi yang tertinggal dalam status `processing` akibat crash/reload kembali ke `pending` tanpa mengubah `opId` asli. Integrasi pada awal siklus `processQueueCycle` menjamin idempotensi lokal dan server melalui buku ledger abadi `/stores_app/{tenantId}/operations_log/{opId}`. Isolasi kepemilikan data antar-`ownerUid` terverifikasi ketat.
3. **RSK-05 (Tenant Root Provisioning Dependency):**
   Fungsi `ensureTenantRootProvisioned()` berhasil mengeliminasi akar masalah penolakan transaksi Firestore Security Rules (`isStoreOwner`) pada database baru/kosong. Proteksi *anti-takeover* aktif di level validasi argumen (`tenantId === resolveTenantId(ownerUid)`), level dokumen data, dan diperkuat oleh aturan immutabilitas `isImmutableKey('ownerUid')` pada `firestore.rules`.
4. **Scope & Regression:**
   Tidak ditemukan pelanggaran batas lingkup (*scope creep*). Domain produk, transaksi, stok, pergerakan barang, dan laporan warung tetap 100% lokal di browser (`localStorage`). Sinkronisasi terbatas eksklusif pada domain pilot pemasok (`wm_v1_stores`).
5. **Kualitas Pengujian:**
   Sebagian besar skenario pengujian pada `test-fase3a6-hardening.mjs` merupakan pengujian perilaku riil (*behavioral testing*) menggunakan IndexedDB dan Firestore Rules unit testing. Namun, audit ini mengidentifikasi batasan pengujian Web Locks API pada lingkungan Node.js dan karakteristik flag `isConnected` pada `getEmulatorStatus()`.

**Status Kelayakan Produksi:** **CONDITIONAL PASS — MINOR FINDINGS**  
Sistem aman untuk melangkah ke gerbang pembuatan database Firestore Cloud dan penerbitan Security Rules secara terencana.

---

## B. FILE YANG DIPERIKSA

| File | Baris / Komponen | Fokus Pemeriksaan |
| :--- | :--- | :--- |
| `src/services/firebase.js` | L1–L100 | Inisialisasi Firebase App, `EMULATOR_CONFIG`, `connectEmulatorsSafely`, `shouldConnectEmulator`, `getEmulatorStatus` |
| `src/services/offlineQueue.js` | L300–L420, L565–L615 | `claimOperationForProcessing`, `recoverStaleProcessingOperations`, `retryOperation`, `markOperationCompleted` |
| `src/services/syncEngine.js` | L105–L188, L260–L330, L400–L440, L730–L770 | `ensureTenantRootProvisioned`, `resolveTenantId`, `executeSupplierTransaction`, `processQueueCycle`, Web Locks API |
| `firestore.rules` | L1–L90, L80–L85 | Aturan root `stores_app/{storeId}`, fungsi `isStoreOwner`, `isImmutableKey`, subkoleksi `suppliers` |
| `vite.config.js` | L1–L6 | Konfigurasi bundler dan deteksi environment |
| `package.json` | L6–L16 | Script eksekusi dan dependensi pengujian |
| `firebase.json` | L1–L17 | Konfigurasi port emulator lokal Firestore (8080) dan Auth (9099) |
| `src/context/AppContext.jsx` | L410–L450, L600–L810 | Siklus sinkronisasi pilot supplier, mutasi lokal warung, isolasi produk/stok |
| `src/pages/Pengaturan.jsx` | L160–L250, L1720–L1790 | Tombol sinkronisasi, modal backfill, isolasi umpan balik antrean kosong |
| `scripts/test-fase3a6-hardening.mjs` | L1–L512 | 13 skenario pengujian pengerasan Fase 3A.6 |

---

## C. REVIEW RSK-02 — EMULATOR GUARD

### 1. Keterhubungan `npm run dev` ke Emulator
- **Bukti Kode (`src/services/firebase.js:42, 47, 76`):**
  ```javascript
  const isViteDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
  export const shouldConnectEmulator = isViteDev || isExplicitEmulator;
  if (shouldConnectEmulator) {
    try {
      connectEmulatorsSafely(db, auth);
    } catch (e) {
      console.error(e.message);
    }
  }
  ```
- **Verifikasi:** Pada `npm run dev`, bundler Vite secara bawaan mengeset `import.meta.env.DEV = true`. Hal ini menyebabkan `shouldConnectEmulator` selalu bernilai `true` saat aplikasi dijalankan secara lokal di browser.

### 2. Jalur Potensial Terhubung ke Production pada Development
- **Analisis:** Pada level jaringan, fungsi `connectFirestoreEmulator(db, '127.0.0.1', 8080)` dan `connectAuthEmulator(auth, 'http://127.0.0.1:9099')` mengubah target endpoint internal Firebase SDK secara permanen ke host loopback lokal. Tidak ada jalur kode yang mengembalikan endpoint ke `firestore.googleapis.com` selama flag `shouldConnectEmulator` aktif.

### 3. Konsistensi Environment Auth dan Firestore
- **Bukti Kode (`src/services/firebase.js:59-60`):**
  Kedua layanan dikonfigurasikan secara serempak di dalam blok fungsi yang sama (`connectEmulatorsSafely`). Keduanya menggunakan target loopback `127.0.0.1` dengan port masing-masing yang terdaftar pada `firebase.json` (Firestore: `8080`, Auth: `9099`). Tidak ada skenario di mana Firestore terhubung ke emulator sedangkan Auth terhubung ke production, atau sebaliknya.

### 4. Waktu Eksekusi Emulator Guard
- **Verifikasi:** Di dalam arsitektur modul ES6, kode pada cakupan tingkat atas (*top-level scope*) dieksekusi secara sinkron saat berkas diimpor. `firebase.js` mengeksekusi `connectEmulatorsSafely()` sebelum modul consumer (`AppContext.jsx`, `syncEngine.js`, dll.) dapat memanggil fungsi database atau auth apa pun.

### 5. Perilaku Saat Emulator Offline atau Koneksi Ditolak
- **Analisis:** Pemanggilan `connectFirestoreEmulator` dan `connectAuthEmulator` pada Firebase JS SDK (v9/v13) merupakan konfigurasi routing internal sinkron yang tidak melakukan *handshake* jaringan seketika. Apabila emulator offline saat aplikasi melakukan pembacaan/penulisan data, request jaringan ke `127.0.0.1:8080` langsung ditolak oleh stack TCP browser (`ERR_CONNECTION_REFUSED`).

### 6. Pengecekan Silent Fallback
- **Verifikasi:** **TIDAK ADA.** Firebase SDK tidak memiliki mekanisme bawaan untuk beralih kembali ke host produksi Google apabila request ke emulator lokal gagal. Kegagalan menghasilkan exception jaringan yang tegas.

### 7. Keamanan Mekanisme Anti-Duplikasi pada Vite HMR
- **Bukti Kode (`src/services/firebase.js:49-56`):**
  ```javascript
  const EMULATOR_FLAG = '__CATATAN_FIREBASE_EMULATOR_CONNECTED__';
  export function connectEmulatorsSafely(dbInstance = db, authInstance = auth) {
    const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    if (g[EMULATOR_FLAG]) {
      return { connected: true, alreadyConnected: true };
    }
  ```
- **Verifikasi:** Objek `window[EMULATOR_FLAG]` bertahan di memori browser selama sesi halaman berlangsung. Ketika Vite melakukan Hot Module Replacement (HMR), fungsi mendeteksi flag ini dan keluar secara aman tanpa memicu crash `FirebaseError: Firestore has already been started`.

### 8. Perilaku Global Flag Terhadap Instance Baru
- **Analisis Temuan:** Flag `__CATATAN_FIREBASE_EMULATOR_CONNECTED__` berstatus global boolean tunggal. Pada aplikasi browser, `db` dan `auth` adalah instance singleton sehingga aman. Namun, jika lingkungan pengujian membuat instance Firebase baru yang berbeda tanpa mereset `globalThis`, flag ini dapat menyebabkan instance sekunder tidak otomatis terhubung ke emulator jika tidak dipanggil secara eksplisit (Lihat Temuan F-3A7-02).

### 9. Konfigurasi Production Build
- **Bukti Kode (`src/services/firebase.js:42, 47`):**
  Saat `npm run build` dijalankan, Vite menyetel `import.meta.env.DEV = false` dan `import.meta.env.PROD = true`. Akibatnya, `isViteDev` bernilai `false`, `shouldConnectEmulator` bernilai `false`, dan panggilan emulator dilewati secara bersih. Build hasil kompilasi siap terhubung ke endpoint produksi `catatan-b7384` tanpa perlu mengubah kode sumber.

### 10. Karakteristik Status `getEmulatorStatus()`
- **Bukti Kode (`src/services/firebase.js:84-91`):**
  `isConnected: Boolean(g[EMULATOR_FLAG])` mencerminkan status bahwa **klien Firebase telah dikonfigurasi ke endpoint emulator**, bukan representasi *live healthcheck/ping* bahwa proses emulator di server lokal sedang aktif menerima koneksi (Lihat Temuan F-3A7-01).

---

## D. REVIEW RSK-04 — STALE QUEUE RECOVERY

### 1. Isolasi Pemilik (`ownerUid`)
- **Bukti Kode (`src/services/offlineQueue.js:578-581`):**
  ```javascript
  const index = store.index('by_owner_status');
  const query = IDBKeyRange.only([ownerUid, QUEUE_STATUS.PROCESSING]);
  const request = index.getAll(query);
  ```
- **Verifikasi:** Kueri dibatasi secara ketat menggunakan indeks komposit `['ownerUid', 'status']`. Operasi milik pemilik lain tidak akan pernah terbaca atau terpengaruh.

### 2. Proteksi Lease Aktif
- **Bukti Kode (`src/services/offlineQueue.js:589-590`):**
  ```javascript
  const startedAt = op.processingStartedAt ? new Date(op.processingStartedAt).getTime() : 0;
  if (now - startedAt > staleTimeoutMs) {
    op.status = QUEUE_STATUS.PENDING;
    ...
  }
  ```
- **Verifikasi:** Jika selisih waktu `now - startedAt` masih berada dalam batas `staleTimeoutMs` (default: 60 detik), operasi tidak diubah dan status `processing` tetap dipertahankan.

### 3. Immutabilitas Status `completed`
- **Verifikasi:** Kueri hanya menargetkan status `QUEUE_STATUS.PROCESSING`. Status `completed` tidak berada di dalam rentang kueri. Selain itu, fungsi `retryOperation()` memiliki guard eksplisit: `if (op.status === QUEUE_STATUS.COMPLETED) return { ok: false }`.

### 4. Preservasi `opId` Murni
- **Verifikasi:** Selama proses pemulihan, atribut `opId` objek operasi tidak pernah diubah atau digenerate ulang. Nilai `opId` yang sama persis disimpan kembali ke IndexedDB (`store.put(op)`).

### 5. Ketahanan Terhadap Race Condition dan Double Recovery
- **Analisis:** Seluruh operasi pemulihan dijalankan di dalam transaksi IndexedDB mode `readwrite`. Spesifikasi W3C IndexedDB menjamin bahwa transaksi `readwrite` pada objek store yang sama dieksekusi secara serial (eksklusif) oleh peramban.

### 6. Interaksi Web Locks, Leader Election, dan Recovery
- **Bukti Kode (`src/services/syncEngine.js:633-656`):**
  Pada lingkungan browser dengan banyak tab, Web Locks API (`navigator.locks.request('catatan_warung_sync_engine_lock')`) memastikan hanya ada 1 tab yang bertindak sebagai *Leader*. Tab leader adalah satu-satunya yang menjalankan interval sinkronisasi otomatis. Hal ini meminimalkan persaingan klaim antar-tab.

### 7. Skenario Tab A Lambat vs Tab B Recovery (Ledger Safety)
- **Analisis Skenario Ekstrem:**
  Jika Tab A mengklaim operasi pada `t = 0` dan request transaksi Firestore menggantung selama > 60 detik (misal 65 detik). Pada `t = 61`, Tab B menjalankan `processQueueCycle`, mendeteksi operasi sebagai stale (> 60s), mengembalikan ke `pending`, lalu mengklaim dan mengirimkannya ke Firestore.
- **Hasil Verifikasi:**
  Server Firestore memiliki buku ledger abadi di `/stores_app/{tenantId}/operations_log/{opId}`. Ketika transaksi Tab A berhasil commit, ia mencatat ledger `opId`. Saat transaksi Tab B tiba di server, pengecekan `if (opLogSnap.exists())` pada `executeSupplierTransaction()` mendeteksi ledger tersebut dan langsung mengembalikan `alreadyExecuted: true` tanpa melakukan mutasi ganda pada dokumen supplier. **Sistem terbukti kebal terhadap duplikasi data.**

### 8. Risiko Duplikasi Mutasi Data saat Retry
- **Verifikasi:** Tidak ada risiko duplikasi data. Mekanisme idempotensi transaksi atomik Firestore menjamin bahwa mutasi hanya diterapkan 1 kali per `opId`.

### 9. Keamanan Penghapusan (Zero Data Loss)
- **Verifikasi:** Fungsi `recoverStaleProcessingOperations` hanya melakukan `store.put(op)`. Tidak ada instruksi `store.delete()` yang dipanggil. Jika transaksi IndexedDB gagal, operasi otomatis di-*rollback* oleh browser.

### 10. Karakteristik Timestamp dan Clock Skew
- **Verifikasi:** Baik `processingStartedAt` maupun `Date.now()` dihasilkan oleh mesin lokal yang sama pada browser pengguna. Karena antrean IndexedDB bersifat lokal pada perangkat tersebut, tidak ada risiko *clock skew* antar-server.

---

## E. REVIEW RSK-05 — TENANT ROOT PROVISIONING

### 1. Validasi Autentikasi Pemilik
- **Bukti Kode (`src/services/syncEngine.js:119-121` & `firestore.rules:82`):**
  - Klien: `if (!ownerUid || typeof ownerUid !== 'string' || !ownerUid.trim()) return { ok: false };`
  - Rules: `allow create: if isAuthenticated() && request.resource.data.ownerUid == request.auth.uid;`
  - Verifikasi: Root hanya dapat dibuat apabila pengguna terautentikasi dan `ownerUid` pada body request identik dengan `request.auth.uid`.

### 2. Pencegahan Manipulasi Tenant ID
- **Bukti Kode (`src/services/syncEngine.js:123-136`):**
  ```javascript
  const expectedTenantId = resolveTenantId(ownerUid);
  const tenantId = options.tenantId || expectedTenantId;
  if (tenantId !== expectedTenantId) {
    return {
      ok: false,
      error: `Akses ditolak: Tenant ID ${tenantId} tidak sesuai dengan ownerUid pemanggil (${ownerUid}). Anti-takeover aktif.`,
    };
  }
  ```
- **Verifikasi:** Jika parameter `tenantId` yang disuplai tidak sesuai dengan deterministik `store_${ownerUid}`, request langsung dibatalkan sebelum menyentuh jaringan.

### 3. Proteksi Pengambilalihan Tenant Milik Pengguna Lain
- **Verifikasi:** Jika akun jahat (Bob) mencoba membuat atau mengubah root milik Alice (`store_alice`):
  1. Validasi argumen klien menolaknya.
  2. Jika klien dibypass, Firestore Security Rules mengevaluasi `allow update: if isStoreOwner(storeId)`. Karena `request.auth.uid` Bob tidak cocok dengan `resource.data.ownerUid` Alice, Firestore melempar error `7 PERMISSION_DENIED`.

### 4. Idempotensi Root Dokumen
- **Bukti Kode (`src/services/syncEngine.js:142-159`):**
  Jika dokumen root `/stores_app/{tenantId}` sudah ada dan `tenantData.ownerUid === ownerUid`, fungsi langsung mengembalikan `{ ok: true, existed: true }` tanpa melakukan `setDoc` ulang.

### 5. Potensi Race Condition Pembuatan Root
- **Analisis:** Jika dua tab memanggil `ensureTenantRootProvisioned()` secara simultan pada basis data kosong:
  Keduanya mengirimkan payload yang identik (`ownerUid: ownerUid`, `storeName: 'Warung Madura'`). Panggilan pertama membuat dokumen (`create`), dan panggilan kedua memperbarui dokumen yang sama dengan data yang sama (`update`). Tidak ada kondisi inkonsistensi yang dapat terjadi.

### 6. Perlindungan Immutabilitas `ownerUid` di Security Rules
- **Bukti Kode (`firestore.rules:83` & L34–L38):**
  ```javascript
  allow update: if isStoreOwner(storeId) && isImmutableKey('ownerUid');
  function isImmutableKey(keyName) {
    return (keyName in request.resource.data) &&
           (keyName in resource.data) &&
           request.resource.data[keyName] == resource.data[keyName];
  }
  ```
- **Verifikasi:** Sekali dibuat, atribut `ownerUid` pada profil warung tidak dapat diubah oleh siapa pun, termasuk oleh pemiliknya sendiri.

### 7. Penjaminan Ketergantungan Supplier Write
- **Bukti Kode (`src/services/syncEngine.js:421-436`):**
  ```javascript
  if (eligibleOps.length > 0) {
    const provRes = await ensureTenantRootProvisioned(ownerUid, options);
    if (!provRes.ok) {
      updateState({ status: SYNC_ENGINE_STATUS.ERROR, lastError: provRes.error });
      return { ok: false, error: provRes.error, processedCount: 0, failedCount: eligibleOps.length };
    }
  }
  ```
- **Verifikasi:** `ensureTenantRootProvisioned` dipanggil dengan `await` **sebelum** loop pemrosesan operasi pemasok dimulai. Jika provisioning root gagal, loop tidak dijalankan dan antrean operasi tidak dikuras.

---

## F. TEST QUALITY AUDIT

Audit mendalam terhadap skrip pengujian pada `scripts/test-fase3a6-hardening.mjs` (13 skenario):

| Test ID | Klaim Pengujian | Tipe Uji | Evaluasi Audit | Status |
| :---: | :--- | :---: | :--- | :---: |
| **1.1** | Konfigurasi Endpoint Emulator Terdefinisi Eksplisit | Static Check | Memverifikasi nilai konstanta port `8080`, `9099`, dan host `127.0.0.1`. | **VERIFIED** |
| **1.2** | Koneksi Emulator Aman Terhadap Duplikasi / Vite HMR | Mock/Integration | Memanggil fungsi 2x dan memvalidasi respons idempotent `{ alreadyConnected: true }`. | **VERIFIED** |
| **1.3** | Pemeriksaan Bebas dari Kebocoran Kredensial | Property Check | Memeriksa objek kembalian tidak mengandung string API key atau field sensitif. | **VERIFIED** |
| **2.1** | Operasi Stale Terdeteksi & Dikembalikan ke Pending | Behavioral Test | Memanipulasi timestamp IndexedDB ke masa lalu, menjalankan fungsi recovery, memverifikasi status berubah kembali ke `pending`. | **VERIFIED** |
| **2.2** | Operasi dengan Lease Aktif Tidak Dipulihkan Prematur | Behavioral Test | Menguji operasi dengan lease aktif tetap berada dalam status `processing`. | **VERIFIED** |
| **2.3** | Isolasi Akun Terjamin (Alice vs Bob) | Behavioral Test | Memverifikasi recovery Alice tidak menyentuh operasi stale milik Bob. | **VERIFIED** |
| **2.4** | Integrasi `processQueueCycle` Menguras Operasi Stale | Behavioral End-to-End | Memverifikasi operasi stale dipulihkan secara otomatis lalu disinkronkan ke Firestore emulator hingga `completed`. | **VERIFIED** |
| **3.1** | Penolakan `ownerUid` Kosong | Behavioral Validation | Menguji input invalid ditolak dengan pesan error yang sesuai. | **VERIFIED** |
| **3.2** | Pembuatan Dokumen Root `/stores_app/{tenantId}` | Behavioral Cloud | Menulis dokumen root baru ke Firestore emulator dan memverifikasi eksistensinya via `getDoc`. | **VERIFIED** |
| **3.3** | Idempotensi `ensureTenantRootProvisioned` | Behavioral Cloud | Memanggil ulang fungsi dan memverifikasi `{ existed: true }` tanpa penimpaan data lama. | **VERIFIED** |
| **3.4** | Anti-Takeover Ditolak | Behavioral Security | Bob mencoba mem-provisioning tenant milik Alice, diverifikasi ditolak oleh validasi klien dan Rules. | **VERIFIED** |
| **3.5** | Validasi Subkoleksi Pasca-Provisioning | Behavioral Rules | Menjalankan transaksi supplier pada emulator dan membuktikan bahwa subcollection write diizinkan oleh rule `isStoreOwner`. | **VERIFIED** |
| **3.6** | Isolasi Akses Lintas Tenant Ditolak Rules | Behavioral Rules | Bob mencoba membaca subkoleksi supplier milik Alice, diverifikasi dilempar `PERMISSION_DENIED`. | **VERIFIED** |

### Batasan Pengujian Otomatis yang Teridentifikasi (Gaps):
1. **Pengujian Multi-Tab Sejati dengan Web Locks API:**
   Lingkungan Node.js tidak menyediakan objek bawaan `navigator.locks`. Pengujian konkurensi pada `test:hardening` dan `test:fase3a` berjalan dalam proses tunggal menggunakan simulasi `fake-indexeddb`. Integrasi Web Locks browser sejati belum diuji secara otomatis via headless browser (Lihat Temuan F-3A7-03).
2. **Kondisi Emulator Offline di Runtime Browser:**
   Pengujian otomatis selalu dijalankan dengan emulator aktif (`emulators:exec`). Perilaku tampilan antarmuka (UI toast/indikator) saat koneksi emulator lokal mati secara mendadak belum memiliki skenario tes otomatis (Lihat Temuan F-3A7-01).

---

## G. FINDINGS (TEMUAN AUDIT INDEPENDEN)

### [F-3A7-01] Status `isConnected` pada `getEmulatorStatus()` Merupakan Status Flag Klien, Bukan Live Healthcheck Socket
- **Tingkat Risiko:** **MEDIUM**
- **File & Fungsi:** `src/services/firebase.js` -> `getEmulatorStatus()` (L84–L91)
- **Bukti Aktual:**
  ```javascript
  export function getEmulatorStatus() {
    const g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    return {
      isConfiguredForEmulator: shouldConnectEmulator,
      isConnected: Boolean(g[EMULATOR_FLAG]),
      config: shouldConnectEmulator ? { ...EMULATOR_CONFIG } : null,
    };
  }
  ```
- **Skenario Risiko:**
  Jika pengembang menjalankan `npm run dev` di browser tanpa menyalakan emulator lokal (`firebase emulators:start`), fungsi `getEmulatorStatus()` tetap akan melaporkan `isConnected: true` karena fungsi `connectEmulatorsSafely()` berhasil mengeksekusi konfigurasi lokal di memori. Pengembang atau komponen UI dapat berasumsi bahwa emulator aktif padahal server lokal belum menerima koneksi.
- **Dampak:**
  Tidak menyebabkan kebocoran data ke cloud (karena rute SDK tetap terkunci ke `127.0.0.1:8080`), namun berpotensi menimbulkan kebingungan diagnostik di UI lokal.
- **Rekomendasi:**
  Ganti nama properti dari `isConnected` menjadi `isClientConfigured` atau tambahkan probe *ping* TCP/HTTP asinkron ringan ke `http://127.0.0.1:8080` jika diinginkan indikator status live di UI Pengaturan.

---

### [F-3A7-02] Penelanan Exception Global (*Swallowed Error*) pada Top-Level Module Guard
- **Tingkat Risiko:** **LOW**
- **File & Fungsi:** `src/services/firebase.js` -> Top-level execution (L76–L82)
- **Bukti Aktual:**
  ```javascript
  if (shouldConnectEmulator) {
    try {
      connectEmulatorsSafely(db, auth);
    } catch (e) {
      console.error(e.message);
    }
  }
  ```
- **Skenario Risiko:**
  Meskipun `connectEmulatorsSafely` secara tegas melempar `throw new Error(...)` ketika terjadi kegagalan koneksi internal SDK, blok penangkap tingkat atas (*top-level catch*) hanya mencatat error via `console.error` tanpa menghentikan pemuatan modul atau merender halaman *Fatal Error Overlay*.
- **Dampak:**
  Sangat rendah dalam praktik karena `connectFirestoreEmulator` tidak melakukan I/O saat inisialisasi, namun secara prinsip pertahanan berlapis (*defense-in-depth*), penelanan error mengurangi ketegasan prinsip *fail-fast*.
- **Rekomendasi:**
  Pada fase berikutnya, pertimbangkan untuk menyajikan indikator *fatal crash banner* jika proses isolasi emulator mengalami kegagalan inisialisasi saat pengembangan lokal.

---

### [F-3A7-03] Cakupan Pengujian Web Locks API Belum Termasuk Otomatisasi Multi-Tab Browser Riil
- **Tingkat Risiko:** **INFORMATIONAL**
- **File & Fungsi:** `src/services/syncEngine.js` -> `startSyncEngine()` (L733–L768)
- **Bukti Aktual:**
  Skrip pengujian `test-fase3a6-hardening.mjs` berjalan pada Node.js di mana `navigator.locks` bernilai `undefined`. Alur pengujian mengeksekusi blok fallback (`// Lingkungan tanpa Web Locks ... updateState({ isLeader: true })`).
- **Skenario Risiko:**
  Perilaku *leader election* Web Locks antar-tab browser nyata hanya terverifikasi melalui rancangan arsitektur dan penanganan konkurensi IndexedDB, bukan melalui otomasi multi-browser browser headless.
- **Dampak:**
  Di browser nyata, `navigator.locks` adalah standar modern peramban. Jika Web Locks gagal, lapisan pengaman kedua (transaksi atomik IndexedDB pada `claimOperationForProcessing`) tetap mencegah kolisi eksekusi ganda.
- **Rekomendasi:**
  Lakukan verifikasi manual membuka 2 tab browser pada tahap pengujian UI akhir sebelum rilis publik.

---

### [F-3A7-04] Potensi Request Transaksi Redundan ke Cloud pada Latensi Jaringan Ekstrem (> 60 Detik)
- **Tingkat Risiko:** **INFORMATIONAL**
- **File & Fungsi:** `src/services/syncEngine.js` (`executeSupplierTransaction`) & `src/services/offlineQueue.js` (`recoverStaleProcessingOperations`)
- **Bukti Aktual:**
  Batas waktu *stale lease* ditentukan sebesar 60.000 ms (60 detik).
- **Skenario Risiko:**
  Apabila sebuah perangkat mengalami lonjakan latensi ekstrem (request Firestore `runTransaction` membutuhkan waktu 65 detik untuk menerima respons dari server Google), siklus pemulihan pada tab lain di detik ke-61 akan menganggap operasi tersebut stale dan mengirimkannya kembali.
- **Dampak:**
  Tidak ada kerusakan data, korupsi saldo, atau duplikasi baris data karena buku ledger atomik `/operations_log/{opId}` akan mendeteksi commit pertama dan menolak commit kedua sebagai *no-op*. Namun, kuota operasi tulis/baca Firestore dapat terpakai secara ganda untuk satu operasi tersebut.
- **Rekomendasi:**
  Nilai 60 detik saat ini sudah seimbang dan tepat untuk aplikasi toko ritel kasir. Pertahankan nilai ini.

---

## H. PRODUCTION SAFETY VERDICT

Berdasarkan seluruh hasil analisis kode aktual, pembuktian arsitektur keamanan, verifikasi aturan keamanan Firestore, dan audit mutu pengujian otomatis:

```text
================================================================================
                    FINAL PRODUCTION SAFETY VERDICT:
                 CONDITIONAL PASS — MINOR FINDINGS
================================================================================
```

### Justifikasi Putusan:
1. **Tidak Ada Celah Keamanan Kritis (*Zero Critical/High Vulnerabilities*):** Seluruh celah kritis yang ditemukan pada Audit 3A.5 (RSK-02, RSK-04, RSK-05) telah ditutup secara solid.
2. **Isolasi Lingkungan Terjamin:** Mode development terisolasi 100% pada `127.0.0.1` tanpa silent fallback ke produksi.
3. **Idempotensi Sempurna:** Kombinasi `opId` stabil, klaim atomik IndexedDB, dan buku ledger server `/operations_log/{opId}` menjamin kebal terhadap duplikasi data mutasi.
4. **Temuan Bersifat Diagnostik & Pengujian:** Temuan F-3A7-01 hingga F-3A7-04 tidak menghalangi keamanan data cloud, melainkan berkaitan dengan peningkatan diagnostik status klien dan pengujian multi-tab di lingkungan Node.js.

---

## I. RECOMMENDED NEXT STEP

Satu-satunya langkah berikutnya yang direkomendasikan adalah:

> **Pengguna melakukan provisioning manual database Cloud Firestore `(default)` di region `asia-southeast2` (Jakarta) melalui Firebase Console, kemudian menerbitkan file `firestore.rules` teruji ke cloud menggunakan Firebase CLI.**

*(Catatan: Sesuai aturan Stop Condition Fase 3A.7, langkah ini tidak dijalankan oleh asisten AI dan menunggu persetujuan pengguna).*
