// Firebase Configuration & Service for Aplikasi Catatan Warung Madura
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB7McjvZznl0Ic8AXvxJkSxfrzjZ4YNe-w",
  authDomain: "catatan-b7384.firebaseapp.com",
  projectId: "catatan-b7384",
  storageBucket: "catatan-b7384.firebasestorage.app",
  messagingSenderId: "626148444697",
  appId: "1:626148444697:web:bc8ae07f060a5ccfcfb888"
};

// Inisialisasi Firebase App
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Simpan seluruh snapshot cadangan warung ke Cloud Firestore
 * Koleksi: warung_madura -> Dokumen: latest_backup
 */
export async function saveBackupToCloud(backupData) {
  try {
    const docRef = doc(db, 'warung_madura', 'latest_backup');
    await setDoc(docRef, {
      ...backupData,
      cloudSavedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Gagal menyimpan data cadangan ke Firebase Cloud.',
    };
  }
}

/**
 * Ambil snapshot cadangan terakhir dari Cloud Firestore
 */
export async function fetchBackupFromCloud() {
  try {
    const docRef = doc(db, 'warung_madura', 'latest_backup');
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { ok: false, reason: 'Belum ada data cadangan yang tersimpan di cloud Firebase.' };
    }
    const data = snap.data();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      reason: err?.message || 'Gagal mengambil data cadangan dari Firebase Cloud.',
    };
  }
}
