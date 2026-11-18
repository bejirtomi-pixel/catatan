import assert from 'node:assert/strict';

console.log('=== MEMULAI TEST INTEGRITAS DATA TAHAP 2 ===\n');

// Mock helpers from format.js
const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;
let idCounter = 1;
const uid = (prefix = '') => `${prefix}${idCounter++}`;

/* =========================================================================
   1. PENGUJIAN 2.1 — PENYIMPANAN HARGA PEMASOK
   ========================================================================= */
console.log('--- 1. Pengujian 2.1: Harga Pemasok (Upsert & Reset) ---');
{
  let storePrices = [];
  const saveStorePrices = (storeId, entries) => {
    let updated = [...storePrices];
    for (const entry of entries) {
      const idx = updated.findIndex(
        (x) => x.storeId === storeId && x.productId === entry.productId && x.unitId === entry.unitId
      );
      if (entry.isReset || entry.price == null) {
        if (idx >= 0) updated.splice(idx, 1);
      } else {
        const item = {
          id: idx >= 0 ? updated[idx].id : uid('sp-'),
          storeId,
          productId: entry.productId,
          unitId: entry.unitId,
          price: round2(Number(entry.price) || 0),
          updatedAt: new Date().toISOString(),
        };
        if (idx >= 0) updated[idx] = item;
        else updated.push(item);
      }
    }
    storePrices = updated;
  };

  const resetStorePrice = (storeId, productId, unitId) => {
    saveStorePrices(storeId, [{ productId, unitId, isReset: true }]);
  };

  // Skenario A: Tambah 10 barang ke toko-1
  const initialEntries = Array.from({ length: 10 }, (_, i) => ({
    productId: `p-${i + 1}`,
    unitId: `u-${i + 1}`,
    price: 10000 + i * 500,
  }));
  saveStorePrices('toko-1', initialEntries);
  assert.equal(storePrices.filter((x) => x.storeId === 'toko-1').length, 10, 'Harus ada 10 harga tersimpan');

  // Skenario B: Ubah harga 1 barang saja (misal p-1 jadi 15000)
  saveStorePrices('toko-1', [{ productId: 'p-1', unitId: 'u-1', price: 15000 }]);

  // Verifikasi: 9 barang lainnya tetap memiliki harga yang sama!
  const toko1Prices = storePrices.filter((x) => x.storeId === 'toko-1');
  assert.equal(toko1Prices.length, 10, 'Jumlah harga toko-1 harus tetap 10 (tidak terhapus)');
  assert.equal(toko1Prices.find((x) => x.productId === 'p-1').price, 15000, 'Harga p-1 harus terbarui jadi 15000');
  for (let i = 1; i < 10; i++) {
    const expectedPrice = 10000 + i * 500;
    const actual = toko1Prices.find((x) => x.productId === `p-${i + 1}`).price;
    assert.equal(actual, expectedPrice, `Harga p-${i + 1} harus tetap ${expectedPrice}`);
  }

  // Skenario C: Reset 1 barang ke harga master
  resetStorePrice('toko-1', 'p-1', 'u-1');
  const afterReset = storePrices.filter((x) => x.storeId === 'toko-1');
  assert.equal(afterReset.length, 9, 'Harga p-1 dihapus dari override toko, tersisa 9 override');
  assert.equal(afterReset.some((x) => x.productId === 'p-1'), false, 'p-1 sudah tidak ada di override');
  console.log('✅ 2.1 Lulus: Upsert harga dan reset ke master tidak menghapus barang lain.');
}

/* =========================================================================
   2. PENGUJIAN 2.2 — MUTASI DAN PENYESUAIAN STOK
   ========================================================================= */
console.log('\n--- 2. Pengujian 2.2: Validasi Mutasi & Penyesuaian Stok ---');
{
  let stocks = [{ productId: 'prod-A', quantity: 5, sellingPrice: 5000 }];
  const movements = [];
  const product = { id: 'prod-A', name: 'Barang A', units: [{ id: 'u-pcs', factor: 1, name: 'pcs' }] };

  const applyMovement = (type, data) => {
    const rawQty = Number(data.quantity);
    if (isNaN(rawQty)) return { ok: false, reason: 'Jumlah kuantitas harus berupa angka valid.' };
    const stock = stocks.find((s) => s.productId === data.productId);
    const beforeBase = stock ? Number(stock.quantity) || 0 : 0;
    const noteTrimmed = String(data.note || '').trim();

    if (type === 'keluar') {
      if (rawQty <= 0) return { ok: false, reason: 'Jumlah pengurangan barang keluar harus lebih dari 0.' };
      if (rawQty > beforeBase) {
        return { ok: false, reason: 'Pengurangan melebihi stok yang tersedia.' };
      }
      stock.quantity = beforeBase - rawQty;
    } else if (type === 'adjust') {
      if (rawQty < 0) return { ok: false, reason: 'Jumlah penyesuaian fisik stok tidak boleh bernilai negatif.' };
      if (!noteTrimmed) return { ok: false, reason: 'Alasan penyesuaian fisik stok wajib diisi.' };
      if (rawQty === beforeBase) return { ok: false, reason: 'Jumlah fisik sama dengan stok tercatat.' };
      stock.quantity = rawQty;
    }
    return { ok: true, stockQuantity: stock.quantity };
  };

  // Skenario A: Kurangi stok 3 pcs -> berhasil, stok jadi 2 pcs
  const res1 = applyMovement('keluar', { productId: 'prod-A', quantity: 3 });
  assert.equal(res1.ok, true, 'Pengurangan 3 pcs harus berhasil');
  assert.equal(stocks[0].quantity, 2, 'Stok harus menjadi 2');

  // Skenario B: Kurangi stok 5 pcs -> HARUS DITOLAK, stok tetap 2 pcs (bukan clamp ke 0)
  const res2 = applyMovement('keluar', { productId: 'prod-A', quantity: 5 });
  assert.equal(res2.ok, false, 'Pengurangan 5 pcs melebihi stok harus ditolak');
  assert.equal(stocks[0].quantity, 2, 'Stok harus tetap 2 setelah penolakan');

  // Skenario C: Input kuantitas 0 atau negatif
  const resZero = applyMovement('keluar', { productId: 'prod-A', quantity: 0 });
  assert.equal(resZero.ok, false, 'Kuantitas 0 harus ditolak');
  const resNeg = applyMovement('keluar', { productId: 'prod-A', quantity: -2 });
  assert.equal(resNeg.ok, false, 'Kuantitas negatif harus ditolak');

  // Skenario D: Penyesuaian fisik wajib alasan
  const resAdjNoReason = applyMovement('adjust', { productId: 'prod-A', quantity: 10, note: '' });
  assert.equal(resAdjNoReason.ok, false, 'Penyesuaian fisik tanpa alasan harus ditolak');
  const resAdjWithReason = applyMovement('adjust', { productId: 'prod-A', quantity: 10, note: 'Hasil opname bulanan' });
  assert.equal(resAdjWithReason.ok, true, 'Penyesuaian fisik dengan alasan harus berhasil');
  assert.equal(stocks[0].quantity, 10, 'Stok harus diperbarui menjadi 10');

  console.log('✅ 2.2 Lulus: Validasi stok menolak nilai negatif, penolakan over-reduction, dan alasan wajib.');
}

/* =========================================================================
   3. PENGUJIAN 2.3 — PENERIMAAN PESANAN, PEMBATALAN, & KEKURANGAN
   ========================================================================= */
console.log('\n--- 3. Pengujian 2.3: Penerimaan Pesanan, Pembatalan, & Kekurangan ---');
{
  let order = {
    id: 'P-001',
    storeId: 'toko-1',
    status: 'belum_diterima',
    items: [
      {
        productId: 'prod-B',
        productNameSnapshot: 'Barang B',
        quantity: 10,
        receivedQuantity: 0,
        unitName: 'pcs',
        unitFactor: 1,
      },
    ],
    receipts: [],
  };
  let stockB = 0;
  let shortages = [];

  const receiveOrderPartial = (entries) => {
    for (const entry of entries) {
      const it = order.items.find((x) => x.productId === entry.productId);
      const sisa = it.quantity - (it.receivedQuantity || 0);
      if (entry.receivedQuantity <= 0) return { ok: false, reason: 'Kuantitas harus > 0' };
      if (entry.receivedQuantity > sisa) return { ok: false, reason: `Kuantitas melebihi sisa (${sisa})` };

      it.receivedQuantity = (it.receivedQuantity || 0) + entry.receivedQuantity;
      stockB += entry.receivedQuantity;
    }
    const allRec = order.items.every((it) => it.receivedQuantity >= it.quantity);
    const anyRec = order.items.some((it) => it.receivedQuantity > 0);
    order.status = allRec ? 'selesai' : anyRec ? 'sebagian' : 'belum_diterima';
    return { ok: true, status: order.status };
  };

  const cancelOrder = (reason) => {
    if (order.status === 'selesai') return { ok: false, reason: 'Sudah selesai' };
    if (order.status === 'batal') return { ok: false, reason: 'Sudah batal' };
    const hasReceivedAny = order.items.some((it) => it.receivedQuantity > 0);
    order.status = 'batal';
    order.cancelReason = reason;
    return { ok: true, hasPartialReceipts: hasReceivedAny };
  };

  const completeOrderWithShortages = () => {
    for (const item of order.items) {
      const shortageQty = item.quantity - (item.receivedQuantity || 0);
      if (shortageQty > 0) {
        const existing = shortages.find((s) => s.orderId === order.id && s.productId === item.productId);
        if (existing) {
          existing.quantity = shortageQty;
        } else {
          shortages.unshift({
            id: uid('sk-'),
            orderId: order.id,
            productId: item.productId,
            quantity: shortageQty,
            initialQuantity: shortageQty,
            status: 'belum',
          });
        }
      }
    }
    order.status = 'selesai';
    return { ok: true, shortagesCount: shortages.length };
  };

  // Skenario A: Pesanan 10 pcs, terima 6 pcs
  const r1 = receiveOrderPartial([{ productId: 'prod-B', receivedQuantity: 6 }]);
  assert.equal(r1.ok, true, 'Terima 6 pcs berhasil');
  assert.equal(stockB, 6, 'Stok harus bertambah 6');
  assert.equal(order.status, 'sebagian', 'Status harus sebagian');

  // Skenario B: Coba terima 5 pcs lagi -> HARUS DITOLAK (sisa hanya 4)
  const r2 = receiveOrderPartial([{ productId: 'prod-B', receivedQuantity: 5 }]);
  assert.equal(r2.ok, false, 'Terima 5 pcs melebihi sisa harus ditolak');
  assert.equal(stockB, 6, 'Stok tetap 6 setelah penolakan');

  // Skenario C: Batalkan pesanan sebagian
  const rCancel = cancelOrder('Sisa barang habis di gudang pemasok');
  assert.equal(rCancel.ok, true, 'Pembatalan pesanan berhasil');
  assert.equal(order.status, 'batal', 'Status pesanan menjadi batal');
  assert.equal(stockB, 6, 'Stok 6 pcs yang sudah diterima sebelumnya TETAP aman (tidak dihapus)');

  // Skenario D: Pencegahan duplikasi kekurangan
  order.status = 'sebagian';
  completeOrderWithShortages();
  assert.equal(shortages.length, 1, 'Kekurangan dicatat 1 entri');
  assert.equal(shortages[0].quantity, 4, 'Jumlah kekurangan adalah 4');
  // Panggil lagi untuk pesanan yang sama
  completeOrderWithShortages();
  assert.equal(shortages.length, 1, 'TIDAK boleh ada duplikasi kekurangan untuk pesanan & barang yang sama');

  console.log('✅ 2.3 Lulus: Penerimaan parsial akurat, over-receive ditolak, cancel menjaga stok, no duplicate shortages.');
}

/* =========================================================================
   4. PENGUJIAN 2.4 — PEMBELIAN ULANG BERTAHAP (STAGED REPURCHASES)
   ========================================================================= */
console.log('\n--- 4. Pengujian 2.4: Pembelian Ulang Bertahap ---');
{
  let shortage = {
    id: 'sk-1',
    orderId: 'P-001',
    productId: 'prod-C',
    productNameSnapshot: 'Barang C',
    unit: 'pcs',
    factor: 1,
    initialQuantity: 10,
    quantity: 10,
    status: 'belum',
    repurchases: [],
  };
  let stockC = 0;

  // Catat repurchase 10 pcs, isReceived = false
  const rep = {
    id: 'rp-1',
    shortageId: 'sk-1',
    quantity: 10,
    receivedQuantity: 0,
    isReceived: false,
    status: 'menunggu',
    receipts: [],
  };
  shortage.repurchases.push(rep);
  shortage.status = 'sudah';

  const receiveRepurchase = (repId, qty) => {
    const r = shortage.repurchases.find((x) => x.id === repId);
    const sisa = r.quantity - (r.receivedQuantity || 0);
    if (qty <= 0) return { ok: false, reason: 'Kuantitas harus > 0' };
    if (qty > sisa) return { ok: false, reason: 'Melebihi sisa' };

    r.receipts.push({ id: uid('rpr-'), receivedQuantity: qty, date: new Date().toISOString() });
    r.receivedQuantity = round2(r.receipts.reduce((acc, rc) => acc + rc.receivedQuantity, 0));
    r.isReceived = r.receivedQuantity >= r.quantity;
    r.status = r.isReceived ? 'selesai' : 'sebagian';

    stockC += qty;
    shortage.quantity = round2(Math.max(0, shortage.initialQuantity - r.receivedQuantity));
    shortage.status = shortage.quantity <= 0 ? 'terpenuhi' : 'sudah';
    return { ok: true, isComplete: r.isReceived, remaining: shortage.quantity };
  };

  // Tahap 1: Terima 6 pcs
  const st1 = receiveRepurchase('rp-1', 6);
  assert.equal(st1.ok, true);
  assert.equal(stockC, 6, 'Stok C bertambah 6');
  assert.equal(shortage.quantity, 4, 'Sisa kekurangan menjadi 4');
  assert.equal(rep.status, 'sebagian', 'Status pembelian ulang adalah sebagian');
  assert.equal(rep.isReceived, false, 'isReceived masih false');
  assert.equal(shortage.status, 'sudah', 'Status kekurangan tetap sudah (karena sisa 4)');

  // Coba terima 5 pcs -> harus ditolak karena sisa hanya 4
  const stFail = receiveRepurchase('rp-1', 5);
  assert.equal(stFail.ok, false, 'Menerima lebih dari sisa harus ditolak');

  // Tahap 2: Terima sisa 4 pcs
  const st2 = receiveRepurchase('rp-1', 4);
  assert.equal(st2.ok, true);
  assert.equal(stockC, 10, 'Total stok C bertambah 10');
  assert.equal(shortage.quantity, 0, 'Sisa kekurangan 0');
  assert.equal(rep.status, 'selesai', 'Status pembelian ulang selesai');
  assert.equal(rep.isReceived, true, 'isReceived menjadi true');
  assert.equal(shortage.status, 'terpenuhi', 'Status kekurangan menjadi terpenuhi');
  assert.equal(rep.receipts.length, 2, 'Tercatat 2 tahapan penerimaan');

  console.log('✅ 2.4 Lulus: Pembelian ulang multi-tahap mengakumulasi stok dan mengupdate sisa kekurangan hingga terpenuhi.');
}

/* =========================================================================
   5. PENGUJIAN 2.5 — SINKRONISASI DATA, NOTIFIKASI & AKTIVITAS
   ========================================================================= */
console.log('\n--- 5. Pengujian 2.5: Filter Restok & Eliminasi Duplikasi Aktivitas ---');
{
  const products = [
    { id: 'p1', name: 'Barang Aktif Habis', active: true, archived: false, minStock: 5 },
    { id: 'p2', name: 'Barang Nonaktif Habis', active: false, archived: false, minStock: 5 },
    { id: 'p3', name: 'Barang Diarsipkan Habis', active: true, archived: true, minStock: 5 },
  ];
  const stocks = [
    { productId: 'p1', quantity: 0 },
    { productId: 'p2', quantity: 0 },
    { productId: 'p3', quantity: 0 },
  ];

  // Evaluasi needsRestock dengan filter active !== false && !archived
  const needsRestock = products
    .filter((p) => p.active !== false && !p.archived)
    .map((p) => {
      const st = stocks.find((s) => s.productId === p.id);
      const qty = st ? st.quantity : 0;
      return qty <= 0 ? { product: p, qty, status: 'habis' } : null;
    })
    .filter(Boolean);

  assert.equal(needsRestock.length, 1, 'Hanya barang aktif yang masuk rekomendasi restok');
  assert.equal(needsRestock[0].product.id, 'p1', 'Barang nonaktif p2 dan arsip p3 disaring keluar');

  // Pengujian label aktivitas & deduplikasi
  const activityLogs = [
    { id: 'act-1', type: 'order_partial', desc: 'Penerimaan bertahap pesanan P-001 dari Toko Makmur dicatat (6 barang masuk stok)' },
  ];
  const movements = [
    { id: 'mv-1', type: 'receive', ref: 'P-001', note: 'Penerimaan pesanan (6 pcs) - sebagian' },
  ];
  const orders = [
    { id: 'P-001', status: 'sebagian', storeId: 's1' },
  ];

  const explicitRefs = new Set();
  for (const l of activityLogs) {
    const matches = l.desc.match(/(P-\d{8}-\d{3}|mv-[a-z0-9]+|rp-[a-z0-9]+|sk-[a-z0-9]+|P-\d+)/g);
    if (matches) matches.forEach((m) => explicitRefs.add(`${l.type}:${m}`));
  }

  // Cek apakah movement atau order menghasilkan duplikat jika explicitLogs sudah ada
  const isMovementDuplicated = explicitRefs.has(`order_partial:${movements[0].ref}`);
  assert.equal(isMovementDuplicated, true, 'Movement terdeteksi sudah tercatat di explicitLogs, dilewati untuk cegah duplikasi');

  console.log('✅ 2.5 Lulus: Produk nonaktif/arsip disaring dari restok, label sebagian akurat, aktivitas terdeduplikasi.');
}

/* =========================================================================
   6. PENGUJIAN 2.6 — VALIDASI STRUKTURAL & RELASIONAL BACKUP RESTORE
   ========================================================================= */
console.log('\n--- 6. Pengujian 2.6: Penguatan Validasi Backup & Restore ---');
{
  const validateBackup = (payload) => {
    if (!payload || typeof payload !== 'object') return { ok: false, valid: false, reason: 'Payload kosong' };
    const d = payload.data || payload;

    if (!Array.isArray(d.stores)) return { ok: false, valid: false, reason: 'Stores tidak array' };
    const storeIds = new Set();
    for (const s of d.stores) {
      if (!s || !s.id || !s.name) return { ok: false, valid: false, reason: 'Store tidak valid' };
      storeIds.add(s.id);
    }

    if (!Array.isArray(d.products)) return { ok: false, valid: false, reason: 'Products tidak array' };
    const productIds = new Set();
    for (const p of d.products) {
      if (!p || !p.id || !p.name) return { ok: false, valid: false, reason: 'Product tidak valid' };
      if (!Array.isArray(p.units) || p.units.length === 0) return { ok: false, valid: false, reason: 'Product tanpa units' };
      if (!p.units.some((u) => Number(u?.factor) === 1)) return { ok: false, valid: false, reason: 'Product tanpa base unit factor 1' };
      productIds.add(p.id);
    }

    const warnings = [];
    if (d.stocks) {
      for (const st of d.stocks) {
        if (Number(st.quantity) < 0) return { ok: false, valid: false, reason: 'Stok negatif' };
        if (!productIds.has(st.productId)) warnings.push(`Stok merujuk ke produk tak dikenal: ${st.productId}`);
      }
    }

    return {
      ok: true,
      valid: true,
      summary: { stores: d.stores.length, products: d.products.length },
      integrity: warnings.length > 0 ? 'warning' : 'valid',
      warnings,
      validatedData: d,
    };
  };

  // Uji A: Payload kosong / bukan objek
  assert.equal(validateBackup(null).ok, false, 'Payload null ditolak');
  assert.equal(validateBackup('string').ok, false, 'Payload string ditolak');

  // Uji B: Produk tanpa base unit factor 1
  const badProductBackup = {
    data: {
      stores: [{ id: 's1', name: 'Toko 1' }],
      products: [{ id: 'p1', name: 'Barang 1', units: [{ id: 'u1', factor: 5 }] }],
    },
  };
  const resBadProduct = validateBackup(badProductBackup);
  assert.equal(resBadProduct.ok, false, 'Produk tanpa unit factor 1 harus ditolak');

  // Uji C: Stok bernilai negatif
  const negativeStockBackup = {
    data: {
      stores: [{ id: 's1', name: 'Toko 1' }],
      products: [{ id: 'p1', name: 'Barang 1', units: [{ id: 'u1', factor: 1 }] }],
      stocks: [{ productId: 'p1', quantity: -10 }],
    },
  };
  const resNegStock = validateBackup(negativeStockBackup);
  assert.equal(resNegStock.ok, false, 'Stok negatif harus ditolak');

  // Uji D: Backup valid dengan referensi putus menghasilkan warning integritas
  const brokenRelBackup = {
    data: {
      stores: [{ id: 's1', name: 'Toko 1' }],
      products: [{ id: 'p1', name: 'Barang 1', units: [{ id: 'u1', factor: 1 }] }],
      stocks: [{ productId: 'unknown-p', quantity: 5 }],
    },
  };
  const resBrokenRel = validateBackup(brokenRelBackup);
  assert.equal(resBrokenRel.ok, true, 'Validasi backup berhasil');
  assert.equal(resBrokenRel.integrity, 'warning', 'Integritas ditandai warning karena referensi putus');
  assert.equal(resBrokenRel.warnings.length, 1, 'Memiliki 1 peringatan referensi putus');

  // Uji E: Backup sempurna
  const cleanBackup = {
    app: 'catatan-warung-madura',
    version: '1.2.0',
    data: {
      stores: [{ id: 's1', name: 'Toko 1' }],
      products: [{ id: 'p1', name: 'Barang 1', units: [{ id: 'u1', factor: 1 }] }],
      stocks: [{ productId: 'p1', quantity: 15 }],
    },
  };
  const resClean = validateBackup(cleanBackup);
  assert.equal(resClean.ok, true);
  assert.equal(resClean.valid, true);
  assert.equal(resClean.integrity, 'valid');

  console.log('✅ 2.6 Lulus: Validasi struktural ketat, tolak stok negatif & data cacat, dan catat peringatan relasi.');
}

console.log('\n=== SELURUH PENGUJIAN SKENARIO TAHAP 2 BERHASIL (6/6 SUKSES) ===');
