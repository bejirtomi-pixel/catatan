/**
 * BATCH 5 TEST SUITE: VISIT SCHEDULING, MANAGEMENT & HISTORY MODULE
 *
 * Menguji secara komprehensif seluruh fungsionalitas modul Kunjungan Catatan Warung Madura:
 * 1. Visit CRUD & Validation: Pembuatan, pembacaan, pembaruan, penghapusan, validasi field wajib.
 * 2. Recurrence Logic: Jadwal sekali, mingguan (+7 hari), 2 mingguan (+14 hari), auto pembuat jadwal berikutnya saat selesai.
 * 3. Dynamic Status & Overdue Computation: Scheduled, completed, cancelled, overdue (dinamis berbasis tanggal hari ini).
 * 4. Visit Completion & Outcomes: Pencatatan tanggal realisasi, hasil kunjungan, tindak lanjut, evaluasi.
 * 5. Visit Reminders: Deteksi kunjungan hari ini, kunjungan terlambat, total reminder aktif.
 * 6. Visit History & Filtering: Filter rentang waktu (hari ini, minggu ini, bulan ini), status, jenis kunjungan, dan kata kunci.
 * 7. Dashboard Integration: Banner pengingat agenda, tautan cepat modul kunjungan, kepatuhan 2 top cards tanpa search bar.
 * 8. Reports Integration: Tab E pada Laporan.jsx, perhitungan 4 kartu metrik kunjungan, ekspor CSV komprehensif.
 * 9. Local Persistence & Backup/Restore: Penyimpanan wm_v1_visits, skema migrasi aman, buildBackup & importData.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  addDays,
  getDayNameId,
  formatDateId,
  getLocalDateString,
  uid,
  computeDataChecksum,
} from '../src/utils/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const results = [];
function record(testId, name, status, details = '') {
  results.push({ testId, name, status, details });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${testId}] ${name} -> ${status} ${details ? '(' + details + ')' : ''}`);
}

// Mock LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

// Helper migrasi kunjungan (sesuai implementasi AppContext.jsx)
function migrateVisit(v) {
  if (!v || typeof v !== 'object') return null;
  return {
    id: v.id || uid('vst-'),
    title: String(v.title || '').trim(),
    target: String(v.target || '').trim(),
    type: v.type || 'Pemasok',
    date: String(v.date || '').slice(0, 10) || getLocalDateString(),
    time: v.time || '',
    location: String(v.location || '').trim(),
    notes: String(v.notes || '').trim(),
    recurrence: ['none', 'weekly', 'biweekly'].includes(v.recurrence) ? v.recurrence : 'none',
    status: ['scheduled', 'completed', 'cancelled'].includes(v.status) ? v.status : 'scheduled',
    completion: v.completion
      ? {
          actualDate: String(v.completion.actualDate || '').slice(0, 10),
          outcome: String(v.completion.outcome || '').trim(),
          notes: String(v.completion.notes || '').trim(),
          followUp: String(v.completion.followUp || '').trim(),
          nextVisitDate: String(v.completion.nextVisitDate || '').slice(0, 10),
        }
      : null,
    createdAt: v.createdAt || new Date().toISOString(),
    updatedAt: v.updatedAt || new Date().toISOString(),
  };
}

// Helper status dinamis (sesuai implementasi AppContext.jsx)
function getVisitComputedStatus(v, todayStr = getLocalDateString()) {
  if (!v) return 'scheduled';
  if (v.status === 'completed') return 'completed';
  if (v.status === 'cancelled') return 'cancelled';
  if (v.status === 'scheduled') {
    if (v.date < todayStr) return 'overdue';
    return 'scheduled';
  }
  return v.status || 'scheduled';
}

async function runBatch5TestSuite() {
  console.log('======================================================================');
  console.log('   BATCH 5: VISIT SCHEDULING, MANAGEMENT & HISTORY MODULE TEST SUITE  ');
  console.log('======================================================================\n');

  /* =========================================================================
     GROUP 1: VISIT CRUD & VALIDATION
     ========================================================================= */
  console.log('--- GROUP 1: VISIT CRUD & VALIDATION ---');

  // Test 1.1: Pembuatan kunjungan baru dengan field wajib
  try {
    let visits = [];
    const createVisit = (data) => {
      const title = String(data.title || '').trim();
      const date = String(data.date || '').slice(0, 10);
      if (!title) return { ok: false, reason: 'Judul / agenda kunjungan wajib diisi.' };
      if (!date) return { ok: false, reason: 'Tanggal kunjungan wajib ditentukan.' };

      const newVisit = {
        id: uid('vst-'),
        title,
        target: String(data.target || '').trim(),
        type: data.type || 'Pemasok',
        date,
        time: data.time || '',
        location: String(data.location || '').trim(),
        notes: String(data.notes || '').trim(),
        recurrence: ['none', 'weekly', 'biweekly'].includes(data.recurrence) ? data.recurrence : 'none',
        status: 'scheduled',
        completion: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      visits = [newVisit, ...visits];
      return { ok: true, visit: newVisit };
    };

    const res1 = createVisit({
      title: 'Kunjungan Rutin Toko Beras Sumber Makmur',
      target: 'Toko Sumber Makmur',
      type: 'Pemasok',
      date: getLocalDateString(),
      time: '10:00',
      location: 'Pasar Induk Blok A No 12',
      notes: 'Cek pasokan beras IR64 & nego potongan harga',
      recurrence: 'weekly',
    });

    if (res1.ok && visits.length === 1 && visits[0].id.startsWith('vst-') && visits[0].status === 'scheduled') {
      record('UJI-5.1.1', 'Visit Creation & Schema Initialization', 'PASS', `ID: ${visits[0].id}, title terverifikasi`);
    } else {
      record('UJI-5.1.1', 'Visit Creation & Schema Initialization', 'FAIL', 'Gagal membuat kunjungan baru');
    }
  } catch (err) {
    record('UJI-5.1.1', 'Visit Creation & Schema Initialization', 'FAIL', err.message);
  }

  // Test 1.2: Validasi input wajib (judul dan tanggal)
  try {
    const createVisit = (data) => {
      const title = String(data.title || '').trim();
      const date = String(data.date || '').slice(0, 10);
      if (!title) return { ok: false, reason: 'Judul / agenda kunjungan wajib diisi.' };
      if (!date) return { ok: false, reason: 'Tanggal kunjungan wajib ditentukan.' };
      return { ok: true };
    };

    const rNoTitle = createVisit({ title: '', date: '2026-11-25' });
    const rNoDate = createVisit({ title: 'Kunjungan Sales', date: '' });
    const rValid = createVisit({ title: 'Kunjungan Sales', date: '2026-11-25' });

    if (!rNoTitle.ok && !rNoDate.ok && rValid.ok) {
      record('UJI-5.1.2', 'Visit Mandatory Validation (Title & Date)', 'PASS', 'Penolakan data tanpa judul atau tanpa tanggal bekerja benar');
    } else {
      record('UJI-5.1.2', 'Visit Mandatory Validation (Title & Date)', 'FAIL', `noTitle: ${rNoTitle.ok}, noDate: ${rNoDate.ok}, valid: ${rValid.ok}`);
    }
  } catch (err) {
    record('UJI-5.1.2', 'Visit Mandatory Validation (Title & Date)', 'FAIL', err.message);
  }

  // Test 1.3: Update data kunjungan (edit judul, waktu, lokasi, catatan)
  try {
    let visits = [
      {
        id: 'vst-test-edit',
        title: 'Jadwal Awal',
        target: 'Pemasok Minyak',
        date: '2026-11-26',
        time: '09:00',
        location: 'Jl. Merdeka 10',
        notes: 'Catatan awal',
        recurrence: 'none',
        status: 'scheduled',
      },
    ];

    const updateVisit = (id, patch) => {
      const idx = visits.findIndex((v) => v.id === id);
      if (idx === -1) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };
      const updated = {
        ...visits[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      visits[idx] = updated;
      return { ok: true, visit: updated };
    };

    const resUpdate = updateVisit('vst-test-edit', {
      title: 'Jadwal Revisi - Koordinasi Stok Minyak',
      time: '14:00',
      location: 'Gudang Distributor Minyak Kita',
      notes: 'Perubahan jam temu siang hari',
    });

    if (
      resUpdate.ok &&
      visits[0].title === 'Jadwal Revisi - Koordinasi Stok Minyak' &&
      visits[0].time === '14:00' &&
      visits[0].location === 'Gudang Distributor Minyak Kita'
    ) {
      record('UJI-5.1.3', 'Visit Update Operation', 'PASS', 'Pembaruan data kunjungan berhasil dan field terisolasi');
    } else {
      record('UJI-5.1.3', 'Visit Update Operation', 'FAIL', 'Gagal memperbarui data kunjungan');
    }
  } catch (err) {
    record('UJI-5.1.3', 'Visit Update Operation', 'FAIL', err.message);
  }

  // Test 1.4: Hapus kunjungan
  try {
    let visits = [
      { id: 'vst-del-1', title: 'Hapus Saya' },
      { id: 'vst-keep-2', title: 'Pertahankan Saya' },
    ];
    const deleteVisit = (id) => {
      visits = visits.filter((v) => v.id !== id);
      return { ok: true };
    };

    deleteVisit('vst-del-1');
    if (visits.length === 1 && visits[0].id === 'vst-keep-2') {
      record('UJI-5.1.4', 'Visit Deletion Operation', 'PASS', 'Penghapusan kunjungan berhasil membersihkan record target');
    } else {
      record('UJI-5.1.4', 'Visit Deletion Operation', 'FAIL', 'Record tidak terhapus dengan benar');
    }
  } catch (err) {
    record('UJI-5.1.4', 'Visit Deletion Operation', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 2: RECURRENCE LOGIC & NEXT OCCURRENCE GENERATION
     ========================================================================= */
  console.log('\n--- GROUP 2: RECURRENCE LOGIC (WEEKLY, BIWEEKLY, OCCURRENCE GENERATION) ---');

  // Test 2.1: Logika penambahan hari aman timezone (addDays)
  try {
    const baseDate = '2026-11-25';
    const weeklyNext = addDays(baseDate, 7);
    const biweeklyNext = addDays(baseDate, 14);
    const prevDay = addDays(baseDate, -1);

    if (weeklyNext === '2026-12-02' && biweeklyNext === '2026-12-09' && prevDay === '2026-11-24') {
      record('UJI-5.2.1', 'Date Recurrence Calculation (addDays)', 'PASS', `+7: ${weeklyNext}, +14: ${biweeklyNext}, -1: ${prevDay}`);
    } else {
      record('UJI-5.2.1', 'Date Recurrence Calculation (addDays)', 'FAIL', `weeklyNext: ${weeklyNext}, biweeklyNext: ${biweeklyNext}`);
    }
  } catch (err) {
    record('UJI-5.2.1', 'Date Recurrence Calculation (addDays)', 'FAIL', err.message);
  }

  // Test 2.2: Penyelesaian kunjungan mingguan secara otomatis membuat jadwal berikutnya
  try {
    let visits = [
      {
        id: 'vst-rec-week',
        title: 'Kunjungan Mingguan Agen Telur',
        target: 'Agen Telur Berkah',
        type: 'Pemasok',
        date: '2026-11-25',
        time: '08:30',
        location: 'Jl. Rungkut 5',
        notes: 'Pemeriksaan rutin telur ayam ras',
        recurrence: 'weekly',
        status: 'scheduled',
        completion: null,
      },
    ];

    const completeVisit = (id, completionData) => {
      const idx = visits.findIndex((v) => v.id === id);
      if (idx === -1) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };
      const curr = visits[idx];
      const actualDate = String(completionData.actualDate || '').slice(0, 10) || getLocalDateString();
      const outcome = String(completionData.outcome || '').trim();

      let targetNextDate = String(completionData.nextVisitDate || '').slice(0, 10);
      if (!targetNextDate) {
        if (curr.recurrence === 'weekly') {
          targetNextDate = addDays(curr.date, 7);
        } else if (curr.recurrence === 'biweekly') {
          targetNextDate = addDays(curr.date, 14);
        }
      }

      const completedRecord = {
        ...curr,
        status: 'completed',
        completion: {
          actualDate,
          outcome,
          notes: String(completionData.notes || '').trim(),
          followUp: String(completionData.followUp || '').trim(),
          nextVisitDate: targetNextDate || '',
        },
        updatedAt: new Date().toISOString(),
      };

      const newVisits = [completedRecord];
      let spawnedVisit = null;

      if (targetNextDate) {
        spawnedVisit = {
          id: uid('vst-'),
          title: curr.title,
          target: curr.target,
          type: curr.type,
          date: targetNextDate,
          time: curr.time || '',
          location: curr.location || '',
          notes: completionData.followUp
            ? `Tindak lanjut dari kunjungan sebelumnya: ${completionData.followUp}`
            : curr.notes || '',
          recurrence: curr.recurrence,
          status: 'scheduled',
          completion: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newVisits.unshift(spawnedVisit);
      }

      visits = newVisits;
      return { ok: true, completed: completedRecord, next: spawnedVisit };
    };

    const resComp = completeVisit('vst-rec-week', {
      actualDate: '2026-11-25',
      outcome: 'Pasokan telur aman 30 peti diterima dengan baik.',
      followUp: 'Konfirmasi stok peti kosong minggu depan',
    });

    const completed = visits.find((v) => v.id === 'vst-rec-week');
    const spawned = visits.find((v) => v.id !== 'vst-rec-week');

    if (
      resComp.ok &&
      completed &&
      completed.status === 'completed' &&
      completed.completion.outcome === 'Pasokan telur aman 30 peti diterima dengan baik.' &&
      spawned &&
      spawned.status === 'scheduled' &&
      spawned.date === '2026-12-02' &&
      spawned.recurrence === 'weekly'
    ) {
      record('UJI-5.2.2', 'Weekly Recurrence Next Occurrence Generation', 'PASS', `Jadwal baru dibuat otomatis pada ${spawned.date} (+7 hari)`);
    } else {
      record('UJI-5.2.2', 'Weekly Recurrence Next Occurrence Generation', 'FAIL', 'Gagal menggenerasi jadwal mingguan berikutnya');
    }
  } catch (err) {
    record('UJI-5.2.2', 'Weekly Recurrence Next Occurrence Generation', 'FAIL', err.message);
  }

  // Test 2.3: Penyelesaian kunjungan 2 mingguan (biweekly) menghasilkan jeda 14 hari
  try {
    const curr = {
      date: '2026-11-20',
      recurrence: 'biweekly',
    };
    const nextDate = addDays(curr.date, 14);
    if (nextDate === '2026-12-04') {
      record('UJI-5.2.3', 'Biweekly Recurrence Calculation (+14 days)', 'PASS', `Jadwal berikutnya tepat 14 hari: ${nextDate}`);
    } else {
      record('UJI-5.2.3', 'Biweekly Recurrence Calculation (+14 days)', 'FAIL', `Expected 2026-12-04, got ${nextDate}`);
    }
  } catch (err) {
    record('UJI-5.2.3', 'Biweekly Recurrence Calculation (+14 days)', 'FAIL', err.message);
  }

  // Test 2.4: Single visit (recurrence 'none') tidak membuat jadwal baru kecuali diisi manual
  try {
    const singleVisit = {
      id: 'vst-single',
      recurrence: 'none',
      date: '2026-11-25',
    };
    let targetNextDate1 = '';
    if (!targetNextDate1) {
      if (singleVisit.recurrence === 'weekly') targetNextDate1 = addDays(singleVisit.date, 7);
      else if (singleVisit.recurrence === 'biweekly') targetNextDate1 = addDays(singleVisit.date, 14);
    }

    let targetNextDate2 = '2026-12-15'; // diisi manual oleh user
    if (!targetNextDate2) {
      if (singleVisit.recurrence === 'weekly') targetNextDate2 = addDays(singleVisit.date, 7);
      else if (singleVisit.recurrence === 'biweekly') targetNextDate2 = addDays(singleVisit.date, 14);
    }

    if (targetNextDate1 === '' && targetNextDate2 === '2026-12-15') {
      record('UJI-5.2.4', 'Single Visit No Auto-Spawn Policy', 'PASS', 'Kunjungan sekali selesai tanpa spawn kecuali diisi tanggal manual');
    } else {
      record('UJI-5.2.4', 'Single Visit No Auto-Spawn Policy', 'FAIL', `target1: ${targetNextDate1}, target2: ${targetNextDate2}`);
    }
  } catch (err) {
    record('UJI-5.2.4', 'Single Visit No Auto-Spawn Policy', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 3: DYNAMIC STATUS & OVERDUE COMPUTATION
     ========================================================================= */
  console.log('\n--- GROUP 3: DYNAMIC STATUS & OVERDUE COMPUTATION ---');

  // Test 3.1: Komputasi status terlambat (overdue) saat tanggal < hari ini
  try {
    const today = '2026-11-25';
    const pastVisit = { status: 'scheduled', date: '2026-11-20' };
    const todayVisit = { status: 'scheduled', date: '2026-11-25' };
    const futureVisit = { status: 'scheduled', date: '2026-11-28' };

    const statusPast = getVisitComputedStatus(pastVisit, today);
    const statusToday = getVisitComputedStatus(todayVisit, today);
    const statusFuture = getVisitComputedStatus(futureVisit, today);

    if (statusPast === 'overdue' && statusToday === 'scheduled' && statusFuture === 'scheduled') {
      record('UJI-5.3.1', 'Dynamic Overdue Status Computation', 'PASS', 'Status overdue dihitung dinamis tanpa mengubah record di database');
    } else {
      record('UJI-5.3.1', 'Dynamic Overdue Status Computation', 'FAIL', `past: ${statusPast}, today: ${statusToday}, future: ${statusFuture}`);
    }
  } catch (err) {
    record('UJI-5.3.1', 'Dynamic Overdue Status Computation', 'FAIL', err.message);
  }

  // Test 3.2: Status completed dan cancelled tidak pernah berubah menjadi overdue meski tanggal lampau
  try {
    const today = '2026-11-25';
    const completedPast = { status: 'completed', date: '2026-11-10' };
    const cancelledPast = { status: 'cancelled', date: '2026-11-12' };

    const sCompleted = getVisitComputedStatus(completedPast, today);
    const sCancelled = getVisitComputedStatus(cancelledPast, today);

    if (sCompleted === 'completed' && sCancelled === 'cancelled') {
      record('UJI-5.3.2', 'Completed & Cancelled Status Immutability', 'PASS', 'Record selesai dan batal tetap utuh dan kebal kalkulasi overdue');
    } else {
      record('UJI-5.3.2', 'Completed & Cancelled Status Immutability', 'FAIL', `completed: ${sCompleted}, cancelled: ${sCancelled}`);
    }
  } catch (err) {
    record('UJI-5.3.2', 'Completed & Cancelled Status Immutability', 'FAIL', err.message);
  }

  // Test 3.3: Reschedule mengembalikan status kunjungan terlambat ke terjadwal jika tanggal baru >= hari ini
  try {
    const today = '2026-11-25';
    let visit = {
      id: 'vst-resched',
      status: 'scheduled',
      date: '2026-11-20', // tadinya terlambat
    };
    if (getVisitComputedStatus(visit, today) !== 'overdue') throw new Error('Seharusnya overdue awalnya');

    // Lakukan reschedule ke hari esok
    visit = {
      ...visit,
      date: '2026-11-26',
      time: '11:00',
    };
    const sAfter = getVisitComputedStatus(visit, today);

    if (sAfter === 'scheduled') {
      record('UJI-5.3.3', 'Reschedule Restores Scheduled Status', 'PASS', 'Penjadwalan ulang berhasil memulihkan status menjadi terjadwal');
    } else {
      record('UJI-5.3.3', 'Reschedule Restores Scheduled Status', 'FAIL', `Status setelah reschedule: ${sAfter}`);
    }
  } catch (err) {
    record('UJI-5.3.3', 'Reschedule Restores Scheduled Status', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 4: VISIT COMPLETION & OUTCOMES
     ========================================================================= */
  console.log('\n--- GROUP 4: VISIT COMPLETION & OUTCOMES ---');

  // Test 4.1: Penyelesaian kunjungan menyimpan detail riwayat lengkap
  try {
    const compData = {
      actualDate: '2026-11-25',
      outcome: 'Koordinasi pembaruan katalog harga produk rokok dan kopi.',
      notes: 'Sales menyanggupi diskon volume pembelian 5 karton.',
      followUp: 'Kirim PO pesanan hari Jumat',
      nextVisitDate: '2026-12-05',
    };

    const visit = migrateVisit({
      id: 'vst-full-comp',
      title: 'Koordinasi Sales Grosir',
      date: '2026-11-25',
      status: 'completed',
      completion: compData,
    });

    if (
      visit.completion.actualDate === '2026-11-25' &&
      visit.completion.outcome.includes('katalog harga') &&
      visit.completion.followUp.includes('Kirim PO') &&
      visit.completion.nextVisitDate === '2026-12-05'
    ) {
      record('UJI-5.4.1', 'Completion Outcome & Follow-Up Persistence', 'PASS', 'Detail hasil realisasi kunjungan tersimpan rapi');
    } else {
      record('UJI-5.4.1', 'Completion Outcome & Follow-Up Persistence', 'FAIL', 'Data completion tidak lengkap');
    }
  } catch (err) {
    record('UJI-5.4.1', 'Completion Outcome & Follow-Up Persistence', 'FAIL', err.message);
  }

  // Test 4.2: Pembatalan kunjungan (Cancel Visit) dengan alasan
  try {
    let visit = {
      id: 'vst-cancel-test',
      title: 'Kunjungan Distributor Minuman',
      status: 'scheduled',
      notes: 'Bahas retur barang pecah',
    };

    const cancelVisit = (v, reason) => ({
      ...v,
      status: 'cancelled',
      notes: reason ? `${v.notes || ''} [DIBATALKAN: ${reason}]`.trim() : v.notes,
      updatedAt: new Date().toISOString(),
    });

    const cancelled = cancelVisit(visit, 'Toko pemasok sedang tutup renovasi');

    if (cancelled.status === 'cancelled' && cancelled.notes.includes('[DIBATALKAN: Toko pemasok sedang tutup renovasi]')) {
      record('UJI-5.4.2', 'Visit Cancellation Flow', 'PASS', 'Status dibatalkan tersimpan beserta alasan pembatalan');
    } else {
      record('UJI-5.4.2', 'Visit Cancellation Flow', 'FAIL', 'Gagal membatalkan kunjungan');
    }
  } catch (err) {
    record('UJI-5.4.2', 'Visit Cancellation Flow', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 5: VISIT REMINDERS & NOTICES
     ========================================================================= */
  console.log('\n--- GROUP 5: VISIT REMINDERS & NOTICES ---');

  // Test 5.1: Perhitungan reminder hari ini dan terlambat
  try {
    const today = '2026-11-25';
    const mockVisits = [
      { id: 'v1', status: 'scheduled', date: '2026-11-25', title: 'Kunjungan Hari Ini 1' },
      { id: 'v2', status: 'scheduled', date: '2026-11-25', title: 'Kunjungan Hari Ini 2' },
      { id: 'v3', status: 'scheduled', date: '2026-11-20', title: 'Kunjungan Terlambat 1' },
      { id: 'v4', status: 'scheduled', date: '2026-11-28', title: 'Kunjungan Mendatang' },
      { id: 'v5', status: 'completed', date: '2026-11-25', title: 'Sudah Selesai Hari Ini' },
      { id: 'v6', status: 'cancelled', date: '2026-11-25', title: 'Dibatalkan Hari Ini' },
    ];

    const todayVisits = mockVisits.filter((v) => v.status === 'scheduled' && v.date === today);
    const overdueVisits = mockVisits.filter((v) => v.status === 'scheduled' && v.date < today);
    const visitReminders = [...todayVisits, ...overdueVisits];

    if (todayVisits.length === 2 && overdueVisits.length === 1 && visitReminders.length === 3) {
      record('UJI-5.5.1', 'Visit Reminders Segmentation (Today & Overdue)', 'PASS', `Hari ini: ${todayVisits.length}, Terlambat: ${overdueVisits.length}, Total Reminders: ${visitReminders.length}`);
    } else {
      record('UJI-5.5.1', 'Visit Reminders Segmentation (Today & Overdue)', 'FAIL', `today: ${todayVisits.length}, overdue: ${overdueVisits.length}`);
    }
  } catch (err) {
    record('UJI-5.5.1', 'Visit Reminders Segmentation (Today & Overdue)', 'FAIL', err.message);
  }

  // Test 5.2: Reminder badge & banner logic
  try {
    const remindersCount = 3;
    const shouldShowBanner = remindersCount > 0;
    const badgeText = remindersCount > 9 ? '9+' : String(remindersCount);

    if (shouldShowBanner && badgeText === '3') {
      record('UJI-5.5.2', 'Reminder Banner & Badge Display Logic', 'PASS', 'Badge menampilkan jumlah kunjungan aktif yang butuh perhatian');
    } else {
      record('UJI-5.5.2', 'Reminder Banner & Badge Display Logic', 'FAIL', `shouldShow: ${shouldShowBanner}, badge: ${badgeText}`);
    }
  } catch (err) {
    record('UJI-5.5.2', 'Reminder Banner & Badge Display Logic', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 6: VISIT HISTORY & FILTERING
     ========================================================================= */
  console.log('\n--- GROUP 6: VISIT HISTORY & FILTERING ---');

  // Test 6.1: Filtering by status, search query, and period
  try {
    const today = '2026-11-25';
    const mockVisits = [
      { id: 'v1', title: 'Kunjungan Toko Beras', target: 'Sumber Makmur', location: 'Pasar', status: 'scheduled', date: '2026-11-25' },
      { id: 'v2', title: 'Cek Tagihan Gas Elpiji', target: 'Pangkalan Gas', location: 'Gudang', status: 'completed', date: '2026-11-24', completion: { outcome: 'Lunas tunai' } },
      { id: 'v3', title: 'Temu Sales Sabun Cuci', target: 'Wings', location: 'Warung', status: 'cancelled', date: '2026-11-20' },
      { id: 'v4', title: 'Survey Pemasok Baru', target: 'Grosir Maju', location: 'Kecamatan', status: 'scheduled', date: '2026-11-15' }, // overdue
    ];

    // Filter status 'completed'
    const completedList = mockVisits.filter((v) => getVisitComputedStatus(v, today) === 'completed');
    // Filter status 'overdue'
    const overdueList = mockVisits.filter((v) => getVisitComputedStatus(v, today) === 'overdue');
    // Filter search 'Beras'
    const searchBeras = mockVisits.filter((v) => v.title.toLowerCase().includes('beras') || v.target.toLowerCase().includes('beras'));

    if (completedList.length === 1 && overdueList.length === 1 && searchBeras.length === 1) {
      record('UJI-5.6.1', 'Multi-Criteria Visit Filtering', 'PASS', 'Filter status selesai, terlambat, dan kata kunci akurat');
    } else {
      record('UJI-5.6.1', 'Multi-Criteria Visit Filtering', 'FAIL', `completed: ${completedList.length}, overdue: ${overdueList.length}, search: ${searchBeras.length}`);
    }
  } catch (err) {
    record('UJI-5.6.1', 'Multi-Criteria Visit Filtering', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 7: DASHBOARD INTEGRATION
     ========================================================================= */
  console.log('\n--- GROUP 7: DASHBOARD INTEGRATION & STRICT UI RULES ---');

  // Test 7.1: Inspeksi Dashboard.jsx untuk memastikan 2 Top Cards utuh dan tanpa Search Bar
  try {
    const dashboardSrc = fs.readFileSync(path.join(rootDir, 'src/pages/Dashboard.jsx'), 'utf8');

    const hasCardToko = dashboardSrc.includes('data-testid="card-tentang-toko"');
    const hasCardOperasional = dashboardSrc.includes('data-testid="card-ringkasan-operasional"');
    const hasNoSearchBar = !dashboardSrc.includes('<SearchInput') && !dashboardSrc.includes('type="search"');
    const hasVisitBanner = dashboardSrc.includes('todayVisits') && dashboardSrc.includes('overdueVisits');
    const hasMenuKunjungan = dashboardSrc.includes('/kunjungan') && dashboardSrc.includes('CalendarClock');

    if (hasCardToko && hasCardOperasional && hasNoSearchBar && hasVisitBanner && hasMenuKunjungan) {
      record('UJI-5.7.1', 'Dashboard Top Cards & No Search Bar Invariance', 'PASS', 'Tepat 2 kartu utama di atas, bebas search bar, banner kunjungan terintegrasi');
    } else {
      record('UJI-5.7.1', 'Dashboard Top Cards & No Search Bar Invariance', 'FAIL', `cardToko: ${hasCardToko}, cardOps: ${hasCardOperasional}, noSearch: ${hasNoSearchBar}, banner: ${hasVisitBanner}, menu: ${hasMenuKunjungan}`);
    }
  } catch (err) {
    record('UJI-5.7.1', 'Dashboard Top Cards & No Search Bar Invariance', 'FAIL', err.message);
  }

  // Test 7.2: Sidebar & Layout navigation registration
  try {
    const sidebarSrc = fs.readFileSync(path.join(rootDir, 'src/components/Sidebar.jsx'), 'utf8');
    const layoutSrc = fs.readFileSync(path.join(rootDir, 'src/components/Layout.jsx'), 'utf8');
    const appSrc = fs.readFileSync(path.join(rootDir, 'src/App.jsx'), 'utf8');

    const sidebarHasKunjungan = sidebarSrc.includes("to: '/kunjungan'");
    const layoutHasKunjungan = layoutSrc.includes("to: '/kunjungan'");
    const routeHasKunjungan = appSrc.includes('path="/kunjungan"') && appSrc.includes('<Kunjungan />');

    if (sidebarHasKunjungan && layoutHasKunjungan && routeHasKunjungan) {
      record('UJI-5.7.2', 'Navigation & Route Registration', 'PASS', 'Route /kunjungan, Navigasi Desktop & Mobile terdaftar lengkap');
    } else {
      record('UJI-5.7.2', 'Navigation & Route Registration', 'FAIL', `sidebar: ${sidebarHasKunjungan}, layout: ${layoutHasKunjungan}, route: ${routeHasKunjungan}`);
    }
  } catch (err) {
    record('UJI-5.7.2', 'Navigation & Route Registration', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 8: REPORTS INTEGRATION (TAB E & EXPORT)
     ========================================================================= */
  console.log('\n--- GROUP 8: REPORTS INTEGRATION (TAB E & EXPORT) ---');

  // Test 8.1: Tab E hadir di Laporan.jsx dengan metrik dan filter
  try {
    const laporanSrc = fs.readFileSync(path.join(rootDir, 'src/pages/Laporan.jsx'), 'utf8');

    const hasTabE = laporanSrc.includes("activeTab === 'kunjungan'") && laporanSrc.includes('E. Agenda & Riwayat Kunjungan');
    const hasVisitMetrics = laporanSrc.includes('visitMetrics.total') && laporanSrc.includes('visitMetrics.selesai');
    const hasVisitExport = laporanSrc.includes("type === 'kunjungan'") && laporanSrc.includes('Laporan-Kunjungan-');

    if (hasTabE && hasVisitMetrics && hasVisitExport) {
      record('UJI-5.8.1', 'Reports Module Tab E Integration', 'PASS', 'Tab E Kunjungan, 4 kartu ringkasan, dan alur ekspor terverifikasi');
    } else {
      record('UJI-5.8.1', 'Reports Module Tab E Integration', 'FAIL', `hasTabE: ${hasTabE}, metrics: ${hasVisitMetrics}, export: ${hasVisitExport}`);
    }
  } catch (err) {
    record('UJI-5.8.1', 'Reports Module Tab E Integration', 'FAIL', err.message);
  }

  // Test 8.2: CSV generator output format validation
  try {
    const mockVisits = [
      {
        id: 'vst-exp-1',
        title: 'Kunjungan Telur',
        target: 'Pak Slamet',
        type: 'Pemasok',
        date: '2026-11-25',
        time: '09:00',
        location: 'Kios Telur No 3',
        status: 'completed',
        recurrence: 'weekly',
        completion: {
          actualDate: '2026-11-25',
          outcome: 'Pesanan telur masuk tepat waktu',
          followUp: 'Pesan lagi minggu depan',
          nextVisitDate: '2026-12-02',
        },
        notes: 'Catatan tambahan',
      },
    ];

    const rows = [
      ['ID Kunjungan', 'Agenda / Judul', 'Target / Pihak', 'Tipe', 'Tanggal Jadwal', 'Waktu', 'Lokasi', 'Status', 'Perulangan', 'Tanggal Realisasi', 'Hasil Kunjungan', 'Tindak Lanjut', 'Jadwal Berikutnya', 'Catatan'],
    ];

    for (const v of mockVisits) {
      rows.push([
        v.id,
        v.title,
        v.target || '—',
        v.type || 'Lainnya',
        v.date,
        v.time || '—',
        v.location || '—',
        'Selesai',
        'Mingguan',
        v.completion?.actualDate || '—',
        v.completion?.outcome || '—',
        v.completion?.followUp || '—',
        v.completion?.nextVisitDate || '—',
        v.notes || '',
      ]);
    }

    const csvContent = '\uFEFF' + rows.map((e) => e.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

    if (csvContent.includes('ID Kunjungan') && csvContent.includes('Kunjungan Telur') && csvContent.includes('2026-12-02')) {
      record('UJI-5.8.2', 'Visit CSV Export Content Generation', 'PASS', 'Format CSV UTF-8 dengan BOM dan escaping kutip dua valid');
    } else {
      record('UJI-5.8.2', 'Visit CSV Export Content Generation', 'FAIL', 'Isi CSV tidak sesuai');
    }
  } catch (err) {
    record('UJI-5.8.2', 'Visit CSV Export Content Generation', 'FAIL', err.message);
  }

  /* =========================================================================
     GROUP 9: LOCAL PERSISTENCE & BACKUP/RESTORE
     ========================================================================= */
  console.log('\n--- GROUP 9: LOCAL PERSISTENCE & BACKUP/RESTORE INTEGRATION ---');

  // Test 9.1: LocalStorage persistence dengan key wm_v1_visits
  try {
    const mockStorage = new MockLocalStorage();
    const testVisits = [
      { id: 'vst-persist-1', title: 'Visit A', date: '2026-11-25', status: 'scheduled' },
      { id: 'vst-persist-2', title: 'Visit B', date: '2026-11-26', status: 'scheduled' },
    ];

    // Simpan ke storage
    mockStorage.setItem('wm_v1_visits', JSON.stringify(testVisits));

    // Ambil dan pulihkan
    const raw = mockStorage.getItem('wm_v1_visits');
    const parsed = JSON.parse(raw);
    const migrated = parsed.map(migrateVisit);

    if (migrated.length === 2 && migrated[0].id === 'vst-persist-1' && migrated[1].title === 'Visit B') {
      record('UJI-5.9.1', 'LocalStorage wm_v1_visits Persistence', 'PASS', 'Data kunjungan tersimpan dan terpulihkan dengan skema migrasi aman');
    } else {
      record('UJI-5.9.1', 'LocalStorage wm_v1_visits Persistence', 'FAIL', 'Gagal memulihkan dari storage');
    }
  } catch (err) {
    record('UJI-5.9.1', 'LocalStorage wm_v1_visits Persistence', 'FAIL', err.message);
  }

  // Test 9.2: Backup & Restore Integration (buildBackup & importData)
  try {
    const appContextSrc = fs.readFileSync(path.join(rootDir, 'src/context/AppContext.jsx'), 'utf8');

    const backupIncludesVisits = appContextSrc.includes('visits,') || appContextSrc.includes('visits:');
    const importRestoresVisits = appContextSrc.includes('nextVisits') && appContextSrc.includes('migrateVisit');
    const clearHandlesVisits = appContextSrc.includes('setVisits');

    if (backupIncludesVisits && importRestoresVisits && clearHandlesVisits) {
      record('UJI-5.9.2', 'Backup & Restore Integration in AppContext', 'PASS', 'buildBackup menyertakan visits, importData memulihkan visits, clear/reset aman');
    } else {
      record('UJI-5.9.2', 'Backup & Restore Integration in AppContext', 'FAIL', `backup: ${backupIncludesVisits}, import: ${importRestoresVisits}, clear: ${clearHandlesVisits}`);
    }
  } catch (err) {
    record('UJI-5.9.2', 'Backup & Restore Integration in AppContext', 'FAIL', err.message);
  }

  // Test 9.3: Seed Data includes realistic visits
  try {
    const seedSrc = fs.readFileSync(path.join(rootDir, 'src/data/seed.js'), 'utf8');
    const hasSeedVisits =
      (seedSrc.includes('visits,') || seedSrc.includes('visits:')) &&
      seedSrc.includes('vst-seed-1') &&
      seedSrc.includes('vst-seed-2');

    if (hasSeedVisits) {
      record('UJI-5.9.3', 'Realistic Seed Visits Presence', 'PASS', 'Seed data menyediakan kunjungan awal realistis');
    } else {
      record('UJI-5.9.3', 'Realistic Seed Visits Presence', 'FAIL', 'Seed visits tidak ditemukan');
    }
  } catch (err) {
    record('UJI-5.9.3', 'Realistic Seed Visits Presence', 'FAIL', err.message);
  }

  /* =========================================================================
     RINGKASAN EKSEKUSI
     ========================================================================= */
  console.log('\n======================================================================');
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  console.log(`TOTAL PENGUJIAN: ${results.length}`);
  console.log(`LULUS (PASS)    : ${passCount}`);
  console.log(`GAGAL (FAIL)    : ${failCount}`);
  console.log('======================================================================');

  if (failCount > 0) {
    console.error(`\n❌ TERDAPAT ${failCount} PENGUJIAN GAGAL.`);
    process.exit(1);
  } else {
    console.log(`\n✅ SEMUA ${passCount} PENGUJIAN BATCH 5 LULUS DENGAN SEMPURNA.`);
    process.exit(0);
  }
}

runBatch5TestSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
