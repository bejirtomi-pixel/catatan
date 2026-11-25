# AUDIT EMULATOR FAIL-CLOSED VERIFICATION — FASE 3A.7.1
**Proyek:** Catatan Warung Madura  
**Firebase Project ID:** `catatan-b7384`  
**Mode:** STRICT READ-ONLY INVESTIGATION  
**Fokus Investigasi:** Analisis Ketahanan *Fail-Closed* pada Inisialisasi Emulator Guard (`src/services/firebase.js`)  
**Tanggal Audit:** 23 November 2026  

---

## 1. EXECUTIVE SUMMARY

Investigasi terarah ini dilakukan menyusul temuan pada *Independent Code Safety Review* (Fase 3A.7) terkait penanganan eksepsi tingkat atas (*top-level error handling*) pada `src/services/firebase.js`:

```javascript
if (shouldConnectEmulator) {
  try {
    connectEmulatorsSafely(db, auth);
  } catch (e) {
    console.error(e.message);
  }
}
```

Tujuan investigasi adalah memastikan secara matematis dan arsitektural: **Apakah aplikasi yang berjalan di bawah `npm run dev` dapat terus berjalan menggunakan endpoint default Cloud Production apabila konfigurasi emulator mengalami kegagalan?**

### Kesimpulan Investigasi:
1. **Status Arsitektur Saat Ini: FAIL-OPEN pada Kondisi Eksepsi Konfigurasi.**
   Meskipun fungsi `connectEmulatorsSafely()` melempar *Error* secara tegas (*throw*), blok penangkap tingkat atas (*top-level catch*) pada baris 79–81 menelan (*swallow*) eksepsi tersebut dan hanya mencatat pesan teks ke `console.error`.
2. **Kondisi Instance Sebelum Konfigurasi Emulator:**
   Objek `db` (`getFirestore(app)`) dan `auth` (`getAuth(app)`) dibuat pada baris 26–27 **sebelum** fungsi `connectEmulatorsSafely()` dipanggil. Secara bawaan di Firebase JS SDK, instance baru selalu terkonfigurasi ke host Cloud Production (`firestore.googleapis.com` dan `identitytoolkit.googleapis.com`).
3. **Dampak Penelanan Eksepsi:**
   Jika `connectFirestoreEmulator()` atau `connectAuthEmulator()` melempar eksepsi (misalnya akibat konflik status SDK, argumen tidak valid, atau kesalahan urutan), eksepsi tertelan dan pemuatan modul ES6 **tetap berlanjut**. Objek `db` dan/atau `auth` diekspor dalam keadaan masih terarah ke Google Cloud Production, sehingga interaksi pengguna di peramban pada mode `npm run dev` dapat langsung menyentuh cloud produksi.
4. **Risiko Partial Initialization (Split-Brain):**
   Jika `connectFirestoreEmulator()` berhasil tetapi `connectAuthEmulator()` gagal, Firestore terarah ke emulator lokal (`127.0.0.1:8080`) sementara Auth tetap terarah ke Google Cloud Production, memicu inkonsistensi perutean lingkungan.
5. **Kondisi Emulator Server Offline:**
   Apabila proses server emulator lokal belum dijalankan (mati/offline), pemanggilan `connectFirestoreEmulator()` **tidak melempar eksepsi** saat inisialisasi modul, karena fungsi ini hanya mengubah konfigurasi routing internal SDK ke `127.0.0.1`. Pada kondisi ini, request data berikutnya gagal secara lokal di `127.0.0.1` (*connection refused*) dan tidak jatuh ke cloud. Namun, jika terjadi *kesalahan konfigurasi SDK*, sistem jatuh ke kondisi *fail-open*.

**Putusan Akhir:** **`FAIL-CLOSED PROTECTION REQUIRED BEFORE CLOUD ACTIVATION`**  
Sebelum database Cloud Firestore Production dibuat atau diaktifkan, celah *fail-open* ini wajib diperbaiki agar aplikasi development berhenti total (*fail-stop*) jika konfigurasi emulator gagal.

---

## 2. ACTUAL INITIALIZATION FLOW (ALUR EKSEKUSI SUMBER KODE)

Penelusuran urutan eksekusi aktual pada `src/services/firebase.js`:

```text
[Langkah 1: L15-L22]  Mendefinisikan firebaseConfig dengan target project 'catatan-b7384'
          │
[Langkah 2: L25]      initializeApp(firebaseConfig) -> Instance FirebaseApp terbentuk
          │
[Langkah 3: L26]      export const db = getFirestore(app)
                      -> Firestore Client terbentuk dengan TARGET DEFAULT CLOUD (firestore.googleapis.com)
          │
[Langkah 4: L27]      export const auth = getAuth(app)
                      -> Auth Client terbentuk dengan TARGET DEFAULT CLOUD (identitytoolkit.googleapis.com)
          │
[Langkah 5: L42-L47]  Evaluasi flag lingkungan:
                      isViteDev = Boolean(import.meta.env?.DEV) -> true pada `npm run dev`
                      shouldConnectEmulator = true
          │
[Langkah 6: L76]      if (shouldConnectEmulator) masuk ke blok eksekusi otomatis
          │
[Langkah 7: L77-L81]  try {
                        connectEmulatorsSafely(db, auth);
                      } catch (e) {
                        console.error(e.message); // <-- TITIK KRITIS: EKSEPSI DITELAN
                      }
          │
[Langkah 8: L84-L98]  Eksekusi baris berikutnya: getEmulatorStatus, setPersistence(auth, ...)
          │
[Langkah 9]           Modul selesai dimuat dan mengekspor { db, auth, loginWithGoogle, ... }
```

---

## 3. FIRESTORE & AUTH ENDPOINT ANALYSIS

### A. Endpoint Firestore Sebelum Konfigurasi Emulator
- **Titik Waktu:** Baris 26 (`export const db = getFirestore(app);`).
- **Endpoint Default SDK:** `firestore.googleapis.com:443` dengan TLS/SSL aktif.
- **Mekanisme Perubahan:** Endpoint baru beralih ke emulator ketika fungsi `connectFirestoreEmulator(db, '127.0.0.1', 8080)` berhasil dieksekusi pada baris 59.
- **Konsekuensi Kegagalan:** Jika baris 59 gagal dieksekusi atau melempar eksepsi, objek `db` tidak mengalami mutasi konfigurasi dan **tetap mengarah ke `firestore.googleapis.com`**.

### B. Endpoint Auth Sebelum Konfigurasi Emulator
- **Titik Waktu:** Baris 27 (`export const auth = getAuth(app);`).
- **Endpoint Default SDK:** `https://identitytoolkit.googleapis.com` (autentikasi akun) dan `https://securetoken.googleapis.com` (refresh token).
- **Mekanisme Perubahan:** Endpoint baru beralih ke emulator ketika fungsi `connectAuthEmulator(auth, 'http://127.0.0.1:9099')` berhasil dieksekusi pada baris 60.
- **Konsekuensi Kegagalan:** Jika baris 60 dilewati atau gagal, objek `auth` **tetap mengarah ke Google Cloud Production Auth**.

### C. Analisis Interaksi Pasca-Kegagalan
Jika `connectEmulatorsSafely()` melempar error dan ditelan oleh `catch (e) { console.error(e.message); }`:
1. Peramban tidak menghentikan aplikasi (tidak ada *unhandled fatal error*).
2. React me-mount komponen `AuthProvider` (`src/context/AuthContext.jsx`) dan `AppProvider` (`src/context/AppContext.jsx`).
3. Pada `AuthContext.jsx:19`, `subscribeToAuth` memanggil `onAuthStateChanged(auth, ...)`. Request HTTP/WebSocket dikirimkan langsung ke `identitytoolkit.googleapis.com`.
4. Jika pengguna menekan tombol "Masuk dengan Google" pada halaman login, `signInWithPopup(auth, googleProvider)` membuka jendela otentikasi Google Cloud Production.
5. Jika pengguna menekan tombol "Sinkronkan Sekarang" pada halaman Pengaturan, `processQueueCycle()` memanggil `executeSupplierTransaction()` yang menggunakan `db` bawaan. Request `runTransaction()` dikirimkan ke endpoint produksi `firestore.googleapis.com`.

---

## 4. PARTIAL INITIALIZATION ANALYSIS (RISIKO SPLIT-BRAIN)

Pemeriksaan baris 58–65 pada `connectEmulatorsSafely()`:

```javascript
try {
  connectFirestoreEmulator(dbInstance, EMULATOR_CONFIG.host, EMULATOR_CONFIG.firestorePort);
  connectAuthEmulator(authInstance, EMULATOR_CONFIG.authUrl, { disableWarnings: true });
  g[EMULATOR_FLAG] = true;
  ...
  return { connected: true, alreadyConnected: false };
} catch (err) {
  console.error('[Firebase Emulator Guard] Gagal menghubungkan ke emulator lokal:', err);
  throw new Error(
    `[Firebase Emulator Guard] Gagal menghubungkan ke emulator lokal (${err.message}). Demi keamanan data, koneksi ke Production diblokir.`
  );
}
```

### Skenario Kegagalan Parsial:
- **Kasus 1: `connectFirestoreEmulator` Sukses, tetapi `connectAuthEmulator` Gagal.**
  1. `dbInstance` telah diubah host-nya ke `127.0.0.1:8080`.
  2. `connectAuthEmulator` melempar eksepsi (misal: format URL salah atau port tidak terjangkau).
  3. Baris 61 (`g[EMULATOR_FLAG] = true`) tidak tercapai.
  4. Eksepsi ditangkap oleh `catch (err)`, dilempar kembali, lalu ditelan oleh top-level catch di baris 80.
  5. **Hasil:** Sistem berada dalam kondisi *split-brain*:
     - Operasi database menulis ke Emulator Lokal.
     - Operasi login dan token autentikasi terhubung ke Google Cloud Production!

- **Kasus 2: `connectFirestoreEmulator` Gagal.**
  1. Baris 59 melempar eksepsi.
  2. Baris 60 (`connectAuthEmulator`) sama sekali tidak dieksekusi.
  3. Eksepsi ditelan oleh top-level catch.
  4. **Hasil:** KEDUA layanan (`db` dan `auth`) tetap terhubung 100% ke Google Cloud Production di lingkungan `npm run dev`.

---

## 5. FAIL-CLOSED VERIFICATION MATRIX

Tabel evaluasi jaminan keamanan arsitektural saat ini di lingkungan pengembangan (`DEVELOPMENT`):

| Skenario Pengujian Arsitektur | Ekspektasi Keamanan (*Fail-Closed Standard*) | Perilaku Kode Aktual Saat Ini | Status Verifikasi |
| :--- | :--- | :--- | :---: |
| **Emulator Configuration Berhasil** | Aplikasi lanjut dengan endpoint `127.0.0.1:8080/9099`. | Klien beralih ke `127.0.0.1:8080/9099`. | **VERIFIED GUARANTEED** |
| **Emulator Configuration Melempar Eksepsi** | Aplikasi **WAJIB BERHENTI (FAIL-STOP)** dan memblokir akses data. | Eksepsi ditelan `console.error`; aplikasi lanjut dengan endpoint Production. | **NOT VERIFIED (FAIL-OPEN)** |
| **Emulator Server Lokal Mati/Offline** | Request gagal di loopback lokal (`ECONNREFUSED`), tanpa fallback ke Cloud. | Konfigurasi routing sukses; request data gagal di `127.0.0.1`. Tidak ada fallback cloud. | **VERIFIED GUARANTEED** |
| **Kegagalan Parsial (Firestore OK, Auth Gagal)** | Aplikasi membatalkan seluruh inisialisasi dan memblokir kedua layanan. | Firestore terhubung ke emulator, Auth tetap di Production (*split-brain*). | **NOT VERIFIED (FAIL-OPEN)** |
| **Pencegahan Silent Fallback Cloud** | Tidak ada pengalihan diam-diam ke cloud saat emulator gagal. | Jika fungsi konfigurasi emulator gagal, instance tetap pada target Cloud. | **NOT VERIFIED (FAIL-OPEN)** |

---

## 6. FAIL-CLOSED VERDICT

Berdasarkan bukti aktual pada `src/services/firebase.js`:

```text
================================================================================
                    FAIL-CLOSED VERIFICATION VERDICT:
          FAIL-CLOSED PROTECTION REQUIRED BEFORE CLOUD ACTIVATION
================================================================================
```

### Dasar Keputusan:
Arsitektur saat ini memiliki celah *fail-open* di mana penelanan eksepsi pada level modul memungkinkan aplikasi development beroperasi menggunakan kredensial dan endpoint Cloud Production default apabila inisialisasi emulator gagal. Sebelum Cloud Firestore Production dibuat, celah ini harus ditutup dengan mekanisme *fail-closed* yang kokoh.

---

## 7. MINIMAL RECOMMENDED REMEDIATION (PROPOSAL PERBAIKAN MINIMAL)

*(Catatan: Sesuai aturan investigasi Fase 3A.7.1, rekomendasi ini **TIDAK DIIMPLEMENTASIKAN** pada fase ini dan hanya disajikan sebagai cetak biru perbaikan teknis).*

### Ruang Lingkup Perbaikan Terkecil (Hanya pada `src/services/firebase.js`):

#### 1. Hapus Penelanan Eksepsi (*Remove Swallowed Catch*)
Ubah baris 76–82 dari penelanan pasif menjadi pelemparan tegas:
```javascript
// SEBELUM (FAIL-OPEN):
if (shouldConnectEmulator) {
  try {
    connectEmulatorsSafely(db, auth);
  } catch (e) {
    console.error(e.message);
  }
}

// SESUDAH (FAIL-CLOSED / FAIL-STOP):
if (shouldConnectEmulator) {
  // Biarkan eksepsi melempar secara unhandled di lingkungan development.
  // Vite akan langsung menampilkan Error Overlay merah di browser,
  // menghentikan eksekusi komponen React, dan mencegah seluruh request jaringan.
  connectEmulatorsSafely(db, auth);
}
```

#### 2. Pertahanan Berlapis (*Poison Pill / Nullification Guard*)
Untuk memastikan bahwa instance `db` dan `auth` tidak dapat dipanggil sama sekali jika terjadi kegagalan inisialisasi emulator:
Tambahkan variabel status modul `isEmulatorIsolationActive = false`. Jika `shouldConnectEmulator` bernilai `true` tetapi koneksi emulator gagal, fungsi pembungkus seperti `loginWithGoogle()`, `saveBackupToCloud()`, dan `executeSupplierTransaction()` langsung melempar error:
> *"Akses Firebase diblokir: Emulator Guard gagal diinisialisasi pada mode development."*

Dengan dua langkah minimal di atas, sistem dijamin 100% *fail-closed*.

---

## 8. FINAL STOP

Investigasi selesai. Seluruh batasan *Strict Read-Only* dipatuhi secara absolut:
- Tidak ada file kode yang dimodifikasi.
- Tidak ada database Cloud Production yang dibuat.
- Tidak ada akses jaringan ke Google Cloud Production.
- Sistem berhenti dan menunggu tinjauan (*review*) pengguna.
