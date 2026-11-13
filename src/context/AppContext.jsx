import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeed } from '../data/seed';
import { dateCompact, dateKey, formatQty, getLocalDateString, localDateToISO, round2, uid } from '../utils/format';

const PREFIX = 'wm_v1_';

export const DEFAULT_NOTIFICATIONS = {
  stockLow: true,
  stockEmpty: true,
  stockRestocked: true,
  orderCreated: true,
  orderReceiving: true,
  orderPartial: true,
  orderCompleted: true,
  orderUnfulfilled: true,
  repurchasePending: true,
  repurchaseInDelivery: true,
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return fallback;
}

const save = (key, data) => {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

/* ---------- Migrasi model lama -> baru ---------- */
const migrateStore = (s) => {
  if (!s || typeof s !== 'object') return null;
  return {
    id: s.id || uid('st-'),
    name: String(s.name || '').trim(),
    phone: s.phone ? String(s.phone).trim() : '',
    address: s.address ? String(s.address).trim() : '',
    note: s.note ? String(s.note).trim() : '',
    createdAt: s.createdAt || new Date().toISOString(),
  };
};

const migrateProduct = (p) => {
  if (!p || typeof p !== 'object') return null;

  // Pastikan storeIds selalu berformat array aman
  const storeIds = Array.isArray(p.storeIds) ? p.storeIds.filter(Boolean) : [];

  // Pastikan units selalu memiliki minimal 1 satuan dan terdapat satuan dasar (factor === 1)
  let rawUnits = Array.isArray(p.units) && p.units.length > 0 ? p.units.slice() : [];
  if (!rawUnits.some((x) => Number(x?.factor) === 1)) {
    if (rawUnits.length > 0 && rawUnits[0]) {
      rawUnits[0] = { ...rawUnits[0], factor: 1 };
    } else {
      rawUnits = [
        { id: uid('u-'), name: p.unit || 'pcs', factor: 1, price: Number(p.purchasePrice) || 0 },
      ];
    }
  }

  const safeUnits = rawUnits.map((u, idx) => ({
    id: u.id || uid('u-'),
    name: String(u.name || (idx === 0 ? 'pcs' : 'satuan')).trim(),
    factor: Number(u.factor) > 0 ? Number(u.factor) : 1,
    price: Number(u.price) >= 0 ? Number(u.price) : 0,
  }));

  const isArchived = !!p.archived || p.active === false;

  return {
    ...p,
    id: p.id || uid('p-'),
    name: String(p.name || '').trim(),
    category: p.category ? String(p.category).trim() : '',
    minStock: p.minStock != null ? Number(p.minStock) : null,
    storeIds,
    units: safeUnits,
    featured: !!p.featured,
    description: p.description || '',
    promo: !!p.promo,
    advertisement: !!p.advertisement,
    promoTitle: p.promoTitle || '',
    promoDescription: p.promoDescription || '',
    advertisementDescription: p.advertisementDescription || '',
    active: !isArchived,
    archived: isArchived,
    createdAt: p.createdAt || new Date().toISOString(),
  };
};

// Fitur Buy 1 Get 1 dihapus total. Sapu sisa field pada data lama agar tidak membisukan logika apa pun.
const stripBuyOneGetOne = (p) => {
  if (p && typeof p === 'object' && 'buyOneGetOne' in p) {
    const { buyOneGetOne, b1g1Description, ...rest } = p;
    return rest;
  }
  return p;
};

const migrateOrderItem = (it) => ({
  productId: it.productId,
  productNameSnapshot: it.productNameSnapshot || '',
  unitId: it.unitId || '',
  unitName: it.unitName || it.unit || 'pcs',
  unitFactor: Number(it.unitFactor) || 1,
  quantity: Number(it.quantity) || 0,
  receivedQuantity: it.receivedQuantity != null ? Number(it.receivedQuantity) : 0,
  priceRef: it.priceRef != null ? Number(it.priceRef) : it.priceSnapshot != null ? Number(it.priceSnapshot) : 0,
  priceActual:
    it.priceActual != null ? Number(it.priceActual) : it.priceSnapshot != null ? Number(it.priceSnapshot) : 0,
  subtotal: it.subtotal != null ? Number(it.subtotal) : (Number(it.quantity) || 0) * (it.priceActual ?? it.priceSnapshot ?? 0),
});

const migrateOrder = (o) => {
  if (!o || typeof o !== 'object') return null;
  const items = (o.items || []).map(migrateOrderItem);
  let receipts = Array.isArray(o.receipts) ? o.receipts : [];
  if (receipts.length === 0 && o.receipt && typeof o.receipt === 'object') {
    receipts = [
      {
        id: uid('rcp-'),
        receivedAt: o.receipt.completedAt || o.createdAt || new Date().toISOString(),
        note: o.receipt.note || '',
        photo: o.receipt.photo || '',
        items: (o.receipt.items || []).map((ri) => ({
          productId: ri.productId,
          productNameSnapshot: ri.productNameSnapshot || '',
          receivedQuantity: Number(ri.receivedQuantity) || 0,
          unitName: ri.receivedUnitName || ri.orderedUnitName || 'pcs',
          unitFactor: Number(ri.receivedUnitFactor) || 1,
          note: ri.note || '',
        })),
      },
    ];
  }

  for (const it of items) {
    if (it.receivedQuantity == null || it.receivedQuantity === 0) {
      if (receipts.length > 0) {
        const sumRec = receipts.reduce((acc, r) => {
          const found = (r.items || []).find((ri) => ri.productId === it.productId);
          return acc + (found ? Number(found.receivedQuantity) || 0 : 0);
        }, 0);
        it.receivedQuantity = round2(sumRec);
      } else if (o.status === 'selesai' || o.status === 'diterima') {
        it.receivedQuantity = it.quantity;
      } else {
        it.receivedQuantity = 0;
      }
    }
  }

  let status = o.status;
  if (!status || status === 'active' || status === 'pending' || status === 'menunggu') {
    const anyRec = items.some((it) => (it.receivedQuantity || 0) > 0);
    const allRec = items.length > 0 && items.every((it) => (it.receivedQuantity || 0) >= it.quantity);
    if (allRec) status = 'selesai';
    else if (anyRec) status = 'sebagian';
    else status = 'belum_diterima';
  } else if (status === 'diproses' || status === 'proses' || status === 'kirim') {
    status = 'sebagian';
  } else if (status === 'diterima') {
    status = 'selesai';
  } else if (status === 'dibatalkan') {
    status = 'batal';
  }

  return {
    ...o,
    items,
    totalCost: o.totalCost != null ? Number(o.totalCost) : o.totalPrice || 0,
    totalPrice: o.totalPrice != null ? Number(o.totalPrice) : items.reduce((a, b) => a + b.subtotal, 0),
    totalItems: o.totalItems != null ? Number(o.totalItems) : items.reduce((a, b) => a + b.quantity, 0),
    receipts,
    receipt: o.receipt || (receipts[0] || null),
    status,
    cancelReason: o.cancelReason || '',
    updatedAt: o.updatedAt || (receipts.length > 0 ? receipts[receipts.length - 1].receivedAt : o.createdAt) || '',
  };
};

// Harga jual Warung per satuan disimpan di stock.sellingPrices (map unitId -> harga).
// Bila belum ada, turunkan dari sellingPrice lama agar data lama tetap terbaca.
const sellingPricesFor = (stock, product) => {
  if (stock && stock.sellingPrices && typeof stock.sellingPrices === 'object') {
    return { ...stock.sellingPrices };
  }
  const units = (product && product.units) || [];
  const base = units.find((u) => Number(u.factor) === 1) || units[0];
  const out = {};
  if (base && Number(stock && stock.sellingPrice) > 0) out[base.id] = Number(stock.sellingPrice);
  return out;
};

const migrateStocks = (stocks, products) => {
  if (!Array.isArray(stocks)) return [];
  const hasLegacy = stocks.some((s) => s.storeId);
  const productOf = (pid) => products.find((p) => p.id === pid);
  if (!hasLegacy) {
    return stocks.map((s) => ({
      id: s.id || uid('k-'),
      productId: s.productId,
      quantity: round2(Number(s.quantity) || 0),
      sellingPrice: Number(s.sellingPrice) || 0,
      sellingPrices: sellingPricesFor(s, productOf(s.productId)),
      note: s.note || '',
    }));
  }
  const map = {};
  for (const s of stocks) {
    const pid = s.productId;
    if (!map[pid]) {
      map[pid] = {
        id: s.id || uid('k-'),
        productId: pid,
        quantity: 0,
        sellingPrice: 0,
        note: s.note || '',
      };
    }
    map[pid].quantity = round2(map[pid].quantity + (Number(s.quantity) || 0));
    if (!map[pid].sellingPrice && s.sellingPrice) map[pid].sellingPrice = Number(s.sellingPrice);
  }
  return Object.values(map).map((s) => {
    const product = products.find((p) => p.id === s.productId);
    const basePrice = product && Array.isArray(product.units) && product.units[0]
      ? Number(product.units[0].price) || 0
      : 0;
    const sellingPrice = s.sellingPrice || basePrice;
    return {
      ...s,
      sellingPrice,
      sellingPrices: sellingPricesFor({ ...s, sellingPrice }, product),
    };
  });
};

const migrateStorePrice = (sp) => {
  if (!sp || typeof sp !== 'object') return null;
  if (!sp.storeId || !sp.productId || !sp.unitId) return null;
  return {
    id: sp.id || uid('sp-'),
    storeId: sp.storeId,
    productId: sp.productId,
    unitId: sp.unitId,
    price: round2(Number(sp.price) || 0),
    updatedAt: sp.updatedAt || '',
  };
};

// Riwayat perubahan harga beli pemasok. Rekam-only: tidak memengaruhi harga jual atau pesanan lama.
const migratePriceHistory = (h) => {
  if (!h || typeof h !== 'object') return null;
  if (!h.storeId || !h.productId || !h.unitId) return null;
  return {
    id: h.id || uid('ph-'),
    storeId: h.storeId,
    storeNameSnapshot: h.storeNameSnapshot || '',
    productId: h.productId,
    productNameSnapshot: h.productNameSnapshot || '',
    unitId: h.unitId,
    unitName: h.unitName || '',
    oldPrice: round2(Number(h.oldPrice) || 0),
    newPrice: round2(Number(h.newPrice) || 0),
    changedAt: h.changedAt || '',
  };
};

// Migrasi data kekurangan barang dari pesanan
const migrateShortage = (s) => {
  if (!s || typeof s !== 'object') return null;
  const initialQuantity =
    s.initialQuantity != null ? Number(s.initialQuantity) : Number(s.quantity) || 0;
  const repurchases = Array.isArray(s.repurchases)
    ? s.repurchases
    : s.status === 'sudah' && s.statusChangedAt
    ? [
        {
          id: uid('rp-'),
          shortageId: s.id,
          orderId: s.orderId || '',
          productId: s.productId,
          productName: s.productNameSnapshot || '',
          unit: s.unit || 'pcs',
          factor: s.factor || 1,
          date: s.statusChangedAt || s.createdAt || new Date().toISOString(),
          quantity: initialQuantity,
          receivedQuantity: initialQuantity,
          actualPrice: 0,
          isReceived: true,
          note: s.statusNote || 'Tercatat sudah dibeli sebelumnya',
          createdAt: s.statusChangedAt || s.createdAt || new Date().toISOString(),
        },
      ]
    : [];

  const totalRec = round2(
    repurchases.reduce((acc, r) => acc + (r.isReceived ? Number(r.receivedQuantity) || 0 : 0), 0)
  );
  const remainingQty = round2(Math.max(0, initialQuantity - totalRec));

  let status = s.status;
  if (remainingQty <= 0 && repurchases.length > 0) {
    status = 'terpenuhi';
  } else if (repurchases.length > 0) {
    status = 'sudah';
  } else if (status === 'sudah') {
    status = 'sudah';
  } else {
    status = 'belum';
  }

  return {
    id: s.id || uid('sk-'),
    orderId: s.orderId || '',
    productId: s.productId,
    productNameSnapshot: s.productNameSnapshot || '',
    storeId: s.storeId || '',
    storeNameSnapshot: s.storeNameSnapshot || '',
    initialQuantity,
    quantity: remainingQty,
    unit: s.unit || 'pcs',
    factor: Number(s.factor) || 1,
    status,
    statusChangedAt: s.statusChangedAt || '',
    statusNote: s.statusNote || '',
    resolvedByOrderId: s.resolvedByOrderId || '',
    repurchases,
    statusHistory: Array.isArray(s.statusHistory)
      ? s.statusHistory
      : [
          {
            status: 'belum',
            timestamp: s.createdAt || new Date().toISOString(),
            note: 'Kekurangan dicatat dari pesanan ' + (s.orderId || ''),
          },
        ],
    createdAt: s.createdAt || new Date().toISOString(),
  };
};

/* ---------- Konteks ---------- */
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const seed = useMemo(() => buildSeed(), []);
  const [stores, setStores] = useState(() => load('stores', seed.stores).map(migrateStore).filter(Boolean));
  const [products, setProducts] = useState(() =>
    load('products', seed.products)
      .map(migrateProduct)
      .map(stripBuyOneGetOne)
      .filter(Boolean)
  );
  const [orders, setOrders] = useState(() => load('orders', seed.orders).map(migrateOrder));
  const [storePrices, setStorePrices] = useState(() =>
    load('storePrices', []).map(migrateStorePrice).filter(Boolean)
  );
  const [stocks, setStocks] = useState(() => migrateStocks(load('stocks', seed.stocks), products));
  const [movements, setMovements] = useState(() => load('movements', seed.movements));
  const [shortages, setShortages] = useState(() =>
    load('shortages', seed.shortages).map(migrateShortage).filter(Boolean)
  );
  const [priceHistory, setPriceHistory] = useState(() =>
    load('priceHistory', []).map(migratePriceHistory).filter(Boolean)
  );
  const [settings, setSettings] = useState(() => load('settings', seed.settings));
  const [activityLogs, setActivityLogs] = useState(() => load('activityLogs', []));
  const [readNotifIds, setReadNotifIds] = useState(() => load('readNotifIds', []));
  const [toasts, setToasts] = useState([]);
  const completedRef = useRef(new Set());

  useEffect(() => save('stores', stores), [stores]);
  useEffect(() => save('products', products), [products]);
  useEffect(() => save('orders', orders), [orders]);
  useEffect(() => save('storePrices', storePrices), [storePrices]);
  useEffect(() => save('stocks', stocks), [stocks]);
  useEffect(() => save('movements', movements), [movements]);
  useEffect(() => save('shortages', shortages), [shortages]);
  useEffect(() => save('priceHistory', priceHistory), [priceHistory]);
  useEffect(() => save('settings', settings), [settings]);
  useEffect(() => save('activityLogs', activityLogs), [activityLogs]);
  useEffect(() => save('readNotifIds', readNotifIds), [readNotifIds]);

  const addActivityLog = useCallback(({ title, desc, timestamp, type }) => {
    const log = {
      id: uid('act-'),
      title,
      desc,
      timestamp: timestamp || new Date().toISOString(),
      type: type || 'info',
    };
    setActivityLogs((prev) => [log, ...prev].slice(0, 100));
  }, []);

  /* ---------- helper ---------- */
  const pushToast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const storeById = useCallback((id) => (id ? stores.find((s) => s.id === id) : undefined), [stores]);
  const productById = useCallback((id) => (id ? products.find((p) => p.id === id) : undefined), [products]);
  const productsOfStore = useCallback(
    (storeId) => products.filter((p) => p.storeIds.includes(storeId)),
    [products]
  );
  const stockOfProduct = useCallback(
    (productId) => stocks.find((s) => s.productId === productId),
    [stocks]
  );
  const baseNameOf = useCallback((product) => {
    if (!product || !Array.isArray(product.units)) return 'pcs';
    const base = product.units.find((x) => x.factor === 1);
    return base ? base.name : product.units[0].name;
  }, []);

  // Harga referensi pembelian per relasi barang-pemasok.
  // Prioritas: override harga pemasok (wm_v1_storePrices) -> harga master produk.
  const priceOfStore = useCallback(
    (storeId, productId, unitId) => {
      const sp = storePrices.find(
        (x) => x.storeId === storeId && x.productId === productId && x.unitId === unitId
      );
      if (sp) return Number(sp.price) || 0;
      const p = products.find((x) => x.id === productId);
      const u = (p?.units || []).find((x) => x.id === unitId);
      return u ? Number(u.price) || 0 : 0;
    },
    [storePrices, products]
  );

  const saveStorePrices = useCallback((storeId, entries) => {
    const now = new Date().toISOString();
    const storeName = stores.find((s) => s.id === storeId)?.name || '';
    const currentPrice = (productId, unitId) => {
      const found = storePrices.find(
        (x) => x.storeId === storeId && x.productId === productId && x.unitId === unitId
      );
      if (found) return Number(found.price) || 0;
      const product = products.find((p) => p.id === productId);
      const u = (product?.units || []).find((x) => x.id === unitId);
      return u ? Number(u.price) || 0 : 0;
    };

    const historyAdds = [];
    for (const e of entries || []) {
      const price = round2(Number(e.price) || 0);
      if (!(price > 0)) continue;
      const oldPrice = round2(currentPrice(e.productId, e.unitId));
      if (round2(price) === round2(oldPrice)) continue;
      const product = products.find((p) => p.id === e.productId);
      const unit = (product?.units || []).find((x) => x.id === e.unitId);
      historyAdds.push({
        id: uid('ph-'),
        storeId,
        storeNameSnapshot: storeName,
        productId: e.productId,
        productNameSnapshot: product ? product.name : '',
        unitId: e.unitId,
        unitName: unit ? unit.name : '',
        oldPrice,
        newPrice: price,
        changedAt: now,
      });
    }

    setStorePrices((prev) => {
      const rest = prev.filter((x) => x.storeId !== storeId);
      const next = rest.slice();
      for (const e of entries) {
        const price = round2(Number(e.price) || 0);
        if (!(price > 0)) continue;
        const found = next.find(
          (x) => x.storeId === storeId && x.productId === e.productId && x.unitId === e.unitId
        );
        if (found) {
          next[next.indexOf(found)] = {
            ...found,
            price,
            updatedAt: now,
          };
        } else {
          next.push({
            id: uid('sp-'),
            storeId,
            productId: e.productId,
            unitId: e.unitId,
            price,
            updatedAt: now,
          });
        }
      }
      return next;
    });

    if (historyAdds.length) {
      setPriceHistory((prev) => [...historyAdds, ...prev].slice(0, 500));
    }
  }, [stores, products, storePrices]);

  const upsertStock = useCallback((prev, data, mode = 'set') => {
    const idx = prev.findIndex((s) => s.productId === data.productId);
    if (idx < 0) return [...prev, { id: uid('k-'), ...data }];
    const next = prev.map((s) => ({ ...s }));
    const cur = next[idx];
    if (mode === 'add') {
      next[idx] = {
        ...cur,
        quantity: round2((Number(cur.quantity) || 0) + (Number(data.quantity) || 0)),
        sellingPrice: data.sellingPrice != null ? data.sellingPrice : cur.sellingPrice,
        note: data.note != null ? data.note : cur.note,
      };
    } else {
      next[idx] = { ...cur, ...data };
    }
    return next;
  }, []);

  /* ---------- Toko ---------- */
  const createStore = useCallback(
    (input, extra = {}) => {
      const isObj = typeof input === 'object' && input !== null;
      const name = isObj ? input.name : input;
      const phone = isObj ? input.phone || '' : extra.phone || '';
      const address = isObj ? input.address || '' : extra.address || '';
      const note = isObj ? input.note || '' : extra.note || '';
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      if (stores.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return null;
      const store = {
        id: uid('st-'),
        name: trimmed,
        phone: String(phone).trim(),
        address: String(address).trim(),
        note: String(note).trim(),
        createdAt: new Date().toISOString(),
      };
      setStores((prev) => [...prev, store]);
      addActivityLog({
        title: 'Toko Pemasok Ditambahkan',
        desc: `Toko “${store.name}” berhasil didaftarkan`,
        type: 'store_add',
      });
      return store;
    },
    [stores, addActivityLog]
  );

  const updateStore = useCallback(
    (id, input) => {
      const isObj = typeof input === 'object' && input !== null;
      const name = isObj ? input.name : input;
      const trimmed = String(name || '').trim();
      if (!trimmed) return { ok: false, reason: 'Nama toko tidak boleh kosong.' };
      if (stores.some((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
        return { ok: false, reason: 'Nama toko sudah digunakan oleh toko lain.' };
      }
      setStores((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                name: trimmed,
                phone: isObj && input.phone !== undefined ? String(input.phone).trim() : s.phone || '',
                address: isObj && input.address !== undefined ? String(input.address).trim() : s.address || '',
                note: isObj && input.note !== undefined ? String(input.note).trim() : s.note || '',
              }
            : s
        )
      );
      addActivityLog({
        title: 'Toko Pemasok Diperbarui',
        desc: `Data toko “${trimmed}” berhasil diperbarui`,
        type: 'store_edit',
      });
      return { ok: true, reason: '' };
    },
    [stores, addActivityLog]
  );

  const deleteStore = useCallback(
    (id) => {
      const target = stores.find((s) => s.id === id);
      const count = orders.filter((o) => o.storeId === id).length;
      if (count > 0) {
        return { ok: false, reason: `Toko masih memiliki ${count} pesanan. Hapus tidak diizinkan demi keamanan data.` };
      }
      setStores((prev) => prev.filter((s) => s.id !== id));
      setProducts((prev) =>
        prev.map((p) => (p.storeIds.includes(id) ? { ...p, storeIds: p.storeIds.filter((x) => x !== id) } : p))
      );
      setStorePrices((prev) => prev.filter((x) => x.storeId !== id));
      if (target) {
        addActivityLog({
          title: 'Toko Pemasok Dihapus',
          desc: `Toko “${target.name}” berhasil dihapus`,
          type: 'store_delete',
        });
      }
      return { ok: true };
    },
    [orders, stores, addActivityLog]
  );

  /* ---------- Barang ---------- */
  // Pastikan barang punya catatan stok tanpa menimpa stok / harga jual yang sudah ada.
  const keepStockFor = useCallback((productId, units) => {
    const basePrice = units && units[0] ? Number(units[0].price) || 0 : 0;
    setStocks((prev) => {
      if (prev.some((s) => s.productId === productId)) return prev;
      return [
        { id: uid('k-'), productId, quantity: 0, sellingPrice: basePrice, sellingPrices: {}, note: '' },
        ...prev,
      ];
    });
  }, []);
  const addStockRow = useCallback((productId, units) => {
    const basePrice = units && units[0] ? Number(units[0].price) || 0 : 0;
    setStocks((prev) => {
      if (prev.some((s) => s.productId === productId)) return prev;
      return [{ id: uid('k-'), productId, quantity: 0, sellingPrice: basePrice, sellingPrices: {}, note: '' }, ...prev];
    });
  }, []);

  const saveProduct = useCallback(
    (data) => {
      if (data.id) {
        setProducts((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        keepStockFor(data.id, data.units);
        return data;
      }
      const product = { ...data, id: uid('p-'), createdAt: new Date().toISOString() };
      setProducts((prev) => [...prev, product]);
      addStockRow(product.id, product.units);
      return product;
    },
    [addStockRow, keepStockFor]
  );

  // Tambah barang baru langsung ke inventaris stok (dengan stok awal & harga jual) tanpa melalui pembelian.
  const addProductWithStock = useCallback(
    ({
      productData,
      initialStock = 0,
      initialUnitId = null,
      sellingPrices = {},
      stockNote = '',
    }) => {
      const pid = uid('p-');
      const units = (productData.units || []).map((u) => ({
        id: u.id || uid('u-'),
        name: (u.name || '').trim(),
        factor: Number(u.factor) || 1,
        price: Number(u.price) || 0,
      }));
      const baseUnit = units.find((u) => Number(u.factor) === 1) || units[0];
      const targetUnit = units.find((u) => u.id === initialUnitId) || baseUnit;
      const factor = Number(targetUnit?.factor) || 1;
      const baseQty = round2((Number(initialStock) || 0) * factor);

      const sp = { ...(sellingPrices || {}) };
      const mainPrice =
        baseUnit && sp[baseUnit.id] != null
          ? Number(sp[baseUnit.id])
          : baseUnit
          ? Number(baseUnit.price)
          : 0;

      const product = {
        ...productData,
        id: pid,
        units,
        storeIds: Array.isArray(productData.storeIds) ? productData.storeIds : [],
        createdAt: new Date().toISOString(),
      };

      const stock = {
        id: uid('k-'),
        productId: pid,
        quantity: baseQty,
        sellingPrice: mainPrice,
        sellingPrices: sp,
        note: stockNote ? stockNote.trim() : (baseQty > 0 ? 'Stok awal manual' : ''),
      };

      setProducts((prev) => [...prev, product]);
      setStocks((prev) => [stock, ...prev]);

      if (baseQty > 0) {
        const movement = {
          id: uid('mv-'),
          type: 'masuk',
          productId: pid,
          productNameSnapshot: product.name,
          unitBaseName: baseUnit ? baseUnit.name : 'pcs',
          beforeBase: 0,
          afterBase: baseQty,
          diffBase: baseQty,
          ref: '',
          note: stockNote ? stockNote.trim() : 'Stok awal barang baru',
          timestamp: new Date().toISOString(),
        };
        setMovements((prev) => [movement, ...prev]);
      }

      addActivityLog({
        title: 'Barang Baru Ditambahkan',
        desc: `Barang “${product.name}” berhasil didaftarkan ke inventaris warung`,
        type: 'product_add',
      });

      return { product, stock };
    },
    [addActivityLog]
  );

  // Pengecekan referensi transaksi riwayat barang (pesanan, mutasi stok, kekurangan, stok aktif)
  const checkProductReferences = useCallback(
    (id) => {
      const orderCount = orders.filter((o) => (o.items || []).some((it) => it.productId === id)).length;
      const movementCount = movements.filter((m) => m.productId === id).length;
      const shortageCount = shortages.filter((s) => s.productId === id).length;
      const currentStock = stocks.find((s) => s.productId === id);
      const stockQty = currentStock ? Number(currentStock.quantity) || 0 : 0;
      const hasReferences = orderCount > 0 || movementCount > 0 || shortageCount > 0 || stockQty > 0;
      return {
        hasReferences,
        orderCount,
        movementCount,
        shortageCount,
        stockQty,
      };
    },
    [orders, movements, shortages, stocks]
  );

  const deleteProduct = useCallback(
    (id) => {
      const target = products.find((p) => p.id === id);
      if (!target) return { ok: false, reason: 'Barang tidak ditemukan.' };

      const refCheck = checkProductReferences(id);
      if (refCheck.hasReferences) {
        const details = [];
        if (refCheck.orderCount > 0) details.push(`${refCheck.orderCount} riwayat pesanan`);
        if (refCheck.movementCount > 0) details.push(`${refCheck.movementCount} riwayat mutasi stok`);
        if (refCheck.shortageCount > 0) details.push(`${refCheck.shortageCount} catatan kekurangan`);
        if (refCheck.stockQty > 0) details.push(`stok fisik masih tersisa (${formatQty(refCheck.stockQty)})`);
        return {
          ok: false,
          reason: `Barang “${target.name}” masih memiliki ${details.join(', ')}. Penghapusan permanen tidak diizinkan demi menjaga keutuhan riwayat audit & pembukuan warung. Silakan gunakan fitur Arsipkan / Nonaktifkan.`,
          refCheck,
        };
      }

      setProducts((prev) => prev.filter((p) => p.id !== id));
      setStocks((prev) => prev.filter((s) => s.productId !== id));
      setStorePrices((prev) => prev.filter((x) => x.productId !== id));
      setPriceHistory((prev) => prev.filter((x) => x.productId !== id));

      addActivityLog({
        title: 'Barang Dihapus Permanen',
        desc: `Barang “${target.name}” (tanpa riwayat transaksi) berhasil dihapus permanen`,
        type: 'product_delete',
      });

      return { ok: true };
    },
    [products, checkProductReferences, addActivityLog]
  );

  const archiveProduct = useCallback(
    (id, shouldArchive = true) => {
      const target = products.find((p) => p.id === id);
      if (!target) return { ok: false, reason: 'Barang tidak ditemukan.' };

      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, archived: shouldArchive, active: !shouldArchive }
            : p
        )
      );

      addActivityLog({
        title: shouldArchive ? 'Barang Diarsipkan' : 'Barang Dipulihkan dari Arsip',
        desc: `Barang “${target.name}” telah ${
          shouldArchive
            ? 'diarsipkan (tidak muncul pada daftar pesanan aktif)'
            : 'diaktifkan kembali ke inventaris aktif'
        }`,
        type: shouldArchive ? 'product_archive' : 'product_restore',
      });

      return { ok: true, archived: shouldArchive };
    },
    [products, addActivityLog]
  );

  const updateProduct = useCallback(
    (id, patch) => {
      const target = products.find((p) => p.id === id);
      if (target) {
        addActivityLog({
          title: 'Informasi Barang Diperbarui',
          desc: `Informasi barang “${patch.name || target.name}” berhasil diperbarui`,
          type: 'product_edit',
        });
      }
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    },
    [products, addActivityLog]
  );

  const deleteStock = useCallback((id) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Simpan harga jual Warung per satuan. entries: [{ unitId, price }].
  // Harga satuan dasar dipakai sebagai harga jual utama. Harga beli pemasok tidak disentuh.
  const updateStockPrices = useCallback(
    (productId, entries) => {
      setStocks((prev) =>
        prev.map((s) => {
          if (s.productId !== productId) return s;
          const sellingPrices = { ...(s.sellingPrices || {}) };
          for (const e of entries || []) {
            if (!e || !e.unitId) continue;
            const price = round2(Number(e.price) || 0);
            if (price > 0) sellingPrices[e.unitId] = price;
            else delete sellingPrices[e.unitId];
          }
          const product = products.find((p) => p.id === productId);
          const units = (product && product.units) || [];
          const base = units.find((u) => Number(u.factor) === 1) || units[0];
          const main = base && sellingPrices[base.id] != null ? sellingPrices[base.id] : s.sellingPrice;
          return { ...s, sellingPrices, sellingPrice: Number(main) || 0 };
        })
      );
    },
    [products]
  );

  /* ---------- Pesanan ---------- */
  const createOrder = useCallback(
    ({ storeId, items, note }) => {
      const now = new Date();
      const prefix = 'P-' + dateCompact(now);
      const count = orders.filter((o) => o.id.startsWith(prefix)).length;
      const mappedItems = items.map((it) => {
        const product = products.find((p) => p.id === it.productId);
        const unit = (product?.units || []).find((x) => x.id === it.unitId);
        const factor = unit ? Number(unit.factor) : 1;
        const priceRef = it.priceRef != null ? Number(it.priceRef) : Number(unit ? unit.price : 0);
        const priceActual = it.priceActual != null ? Number(it.priceActual) : priceRef;
        return {
          productId: it.productId,
          productNameSnapshot: product ? product.name : it.name || '',
          unitId: unit ? unit.id : '',
          unitName: unit ? unit.name : it.unitName || 'pcs',
          unitFactor: factor,
          quantity: Number(it.quantity) || 0,
          receivedQuantity: 0,
          priceRef,
          priceActual,
          subtotal: round2((Number(it.quantity) || 0) * priceActual),
        };
      });

      const order = {
        id: prefix + '-' + String(count + 1).padStart(3, '0'),
        storeId,
        items: mappedItems,
        totalItems: mappedItems.reduce((a, b) => a + (Number(b.quantity) || 0), 0),
        totalPrice: mappedItems.reduce((a, b) => a + b.subtotal, 0),
        totalCost: 0,
        note: note ? String(note).trim() : '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        status: 'belum_diterima',
        receipts: [],
        receipt: null,
        cancelReason: '',
      };
      setOrders((prev) => [order, ...prev]);
      addActivityLog({
        title: 'Pesanan Baru Dibuat',
        desc: `Pesanan ${order.id} dibuat untuk ${storeById(storeId)?.name || 'toko pemasok'} (${order.totalItems} barang)`,
        type: 'order_created',
      });
      return order;
    },
    [orders, products, addActivityLog, storeById]
  );

  const receiveOrderPartial = useCallback(
    (orderId, { items: receivedEntries, note = '', receivedAt } = {}) => {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return { ok: false, reason: 'Pesanan tidak ditemukan.' };
      if (target.status === 'selesai') return { ok: false, reason: 'Pesanan sudah selesai diterima.' };
      if (target.status === 'batal') return { ok: false, reason: 'Pesanan sudah dibatalkan.' };

      if (!Array.isArray(receivedEntries) || receivedEntries.length === 0) {
        return { ok: false, reason: 'Daftar barang yang diterima tidak boleh kosong.' };
      }

      // Validasi ketat seluruh entri sebelum melakukan mutasi stok atau status
      let totalReceivedQty = 0;
      for (const entry of receivedEntries) {
        const item = (target.items || []).find((x) => x.productId === entry.productId);
        if (!item) {
          return { ok: false, reason: `Barang dengan ID ${entry.productId} tidak terdaftar pada pesanan ${orderId}.` };
        }
        const qtyNum = Number(entry.receivedQuantity);
        if (isNaN(qtyNum) || qtyNum < 0) {
          return {
            ok: false,
            reason: `Jumlah penerimaan untuk “${item.productNameSnapshot}” tidak boleh berupa angka negatif atau kosong.`,
          };
        }
        const alreadyReceived = Number(item.receivedQuantity) || 0;
        const remaining = round2(Math.max(0, item.quantity - alreadyReceived));
        if (qtyNum > round2(remaining + 1e-6)) {
          return {
            ok: false,
            reason: `Jumlah diterima untuk “${item.productNameSnapshot}” (${formatQty(qtyNum)} ${item.unitName}) melebihi sisa pesanan yang belum datang (${formatQty(remaining)} ${item.unitName}).`,
          };
        }
        totalReceivedQty += qtyNum;
      }

      if (totalReceivedQty <= 0) {
        return { ok: false, reason: 'Jumlah barang yang diterima harus lebih dari 0.' };
      }

      const now = receivedAt
        ? (receivedAt.includes('T') ? receivedAt : localDateToISO(receivedAt))
        : new Date().toISOString();

      const stockUpdates = [];
      const movementsToAdd = [];
      const receiptItems = [];

      const nextItems = target.items.map((it) => {
        const entry = receivedEntries.find((x) => x.productId === it.productId);
        const recQty = entry ? round2(Number(entry.receivedQuantity) || 0) : 0;
        if (recQty <= 0) return { ...it };

        const currentRec = Number(it.receivedQuantity) || 0;
        const newRec = round2(currentRec + recQty);

        const factor = Number(it.unitFactor) || 1;
        const baseQty = round2(recQty * factor);

        const product = products.find((p) => p.id === it.productId);
        const stock = stocks.find((s) => s.productId === it.productId);
        const beforeBase = stock ? Number(stock.quantity) || 0 : 0;
        const afterBase = round2(beforeBase + baseQty);

        stockUpdates.push({
          productId: it.productId,
          quantity: baseQty,
          sellingPrice: stock ? stock.sellingPrice : product && product.units[0] ? Number(product.units[0].price) : it.priceActual,
          note: stock ? stock.note : '',
        });

        movementsToAdd.push({
          id: uid('mv-'),
          type: 'receive',
          productId: it.productId,
          productNameSnapshot: it.productNameSnapshot,
          unitBaseName: product ? baseNameOf(product) : it.unitName,
          beforeBase,
          afterBase,
          diffBase: baseQty,
          ref: orderId,
          note: `Penerimaan pesanan (${formatQty(recQty)} ${it.unitName})${note ? ` - ${note}` : ''}`,
          timestamp: now,
        });

        receiptItems.push({
          productId: it.productId,
          productNameSnapshot: it.productNameSnapshot,
          receivedQuantity: recQty,
          unitName: it.unitName,
          unitFactor: factor,
          note: entry.note || '',
        });

        return {
          ...it,
          receivedQuantity: newRec,
        };
      });

      // Lakukan pembaruan stok dan mutasi inventaris
      setStocks((prev) => stockUpdates.reduce((acc, upd) => upsertStock(acc, upd, 'add'), prev));
      setMovements((prev) => [...movementsToAdd, ...prev].filter(Boolean));

      const allFulfilled = nextItems.length > 0 && nextItems.every((it) => (it.receivedQuantity || 0) >= it.quantity);
      const newStatus = allFulfilled ? 'selesai' : 'sebagian';

      const newReceipt = {
        id: uid('rcp-'),
        receivedAt: now,
        note: note ? String(note).trim() : '',
        items: receiptItems,
      };

      const updatedReceipts = [...(target.receipts || []), newReceipt];
      const newTotalCost = round2(
        nextItems.reduce((acc, it) => acc + (Number(it.receivedQuantity) || 0) * (Number(it.priceActual) || 0), 0)
      );

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                items: nextItems,
                status: newStatus,
                receipts: updatedReceipts,
                receipt: newReceipt,
                totalCost: newTotalCost,
                updatedAt: now,
              }
            : o
        )
      );

      const storeName = storeById(target.storeId)?.name || 'toko pemasok';
      if (newStatus === 'selesai') {
        addActivityLog({
          title: 'Pesanan Selesai Diterima',
          desc: `Seluruh barang pesanan ${orderId} dari ${storeName} telah lengkap diterima & masuk stok`,
          type: 'order_done',
        });
      } else {
        addActivityLog({
          title: 'Penerimaan Barang Sebagian',
          desc: `Penerimaan bertahap pesanan ${orderId} dari ${storeName} dicatat (${formatQty(totalReceivedQty)} barang masuk stok)`,
          type: 'order_partial',
        });
      }

      return { ok: true, status: newStatus, receipt: newReceipt };
    },
    [orders, products, stocks, upsertStock, baseNameOf, storeById, addActivityLog]
  );

  const cancelOrder = useCallback(
    (orderId, reason = '') => {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return { ok: false, reason: 'Pesanan tidak ditemukan.' };
      if (target.status === 'selesai') {
        return { ok: false, reason: 'Pesanan sudah selesai diterima dan tidak dapat dibatalkan.' };
      }
      if (target.status === 'batal') {
        return { ok: false, reason: 'Pesanan sudah dibatalkan sebelumnya.' };
      }

      const trimmedReason = String(reason || '').trim() || 'Dibatalkan oleh pengguna';
      const cancelTime = new Date().toISOString();

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'batal',
                cancelReason: trimmedReason,
                updatedAt: cancelTime,
              }
            : o
        )
      );

      const storeName = storeById(target.storeId)?.name || 'toko pemasok';
      addActivityLog({
        title: 'Pesanan Dibatalkan',
        desc: `Pesanan ${orderId} (${storeName}) dibatalkan: ${trimmedReason}. Stok barang yang telah diterima tetap tersimpan aman.`,
        type: 'order_cancel',
      });

      return { ok: true };
    },
    [orders, storeById, addActivityLog]
  );

  // Selesaikan pesanan dengan mencatat sisa barang yang belum terpenuhi sebagai kekurangan
  const completeOrderWithShortages = useCallback(
    (orderId, { note = '', reason = '' } = {}) => {
      const target = orders.find((o) => o.id === orderId);
      if (!target) return { ok: false, reason: 'Pesanan tidak ditemukan.' };
      if (target.status === 'selesai') return { ok: false, reason: 'Pesanan sudah selesai diterima.' };
      if (target.status === 'batal') return { ok: false, reason: 'Pesanan sudah dibatalkan.' };

      const now = new Date().toISOString();
      const newShortages = [];
      const storeName = storeById(target.storeId)?.name || 'toko pemasok';

      for (const item of target.items || []) {
        const ordered = Number(item.quantity) || 0;
        const received = Number(item.receivedQuantity) || 0;
        const shortageQty = round2(Math.max(0, ordered - received));

        if (shortageQty > 0) {
          newShortages.push({
            id: uid('sk-'),
            orderId: target.id,
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            storeId: target.storeId,
            storeNameSnapshot: storeName,
            initialQuantity: shortageQty,
            quantity: shortageQty,
            unit: item.unitName,
            factor: Number(item.unitFactor) || 1,
            status: 'belum',
            statusChangedAt: '',
            statusNote: reason || note || 'Kekurangan dari pesanan yang diselesaikan',
            resolvedByOrderId: '',
            repurchases: [],
            statusHistory: [
              {
                status: 'belum',
                timestamp: now,
                note: `Kekurangan dicatat saat pesanan ${target.id} ditutup (${formatQty(shortageQty)} ${item.unitName})`,
              },
            ],
            createdAt: now,
          });
        }
      }

      if (newShortages.length > 0) {
        setShortages((prev) => [...newShortages, ...prev]);
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'selesai',
                completionNote: reason || note || '',
                updatedAt: now,
              }
            : o
        )
      );

      addActivityLog({
        title: 'Pesanan Selesai dengan Kekurangan',
        desc: `Pesanan ${target.id} dari ${storeName} telah diselesaikan. ${
          newShortages.length > 0
            ? `${newShortages.length} jenis barang kekurangan otomatis dicatat ke Laporan untuk dibeli kembali.`
            : 'Seluruh barang telah lengkap.'
        }`,
        type: 'order_done',
      });

      return {
        ok: true,
        orderId,
        shortagesCreated: newShortages.length,
      };
    },
    [orders, storeById, addActivityLog]
  );

  const completeOrder = useCallback(
    (orderId, receiptInput) => {
      // Menyelaraskan completeOrder agar menggunakan sistem penerimaan aktif
      if (receiptInput?.items && receiptInput.items.length > 0) {
        return receiveOrderPartial(orderId, receiptInput);
      }
      return completeOrderWithShortages(orderId, { note: receiptInput?.note || '' });
    },
    [receiveOrderPartial, completeOrderWithShortages]
  );

  /* ---------- Stok ---------- */
  const applyMovement = useCallback((type, data) => {
    const product = products.find((p) => p.id === data.productId);
    if (!product) return null;
    const unit = (product.units || []).find((x) => x.id === data.unitId) || product.units[0];
    const rawQty = Number(data.quantity) || 0;
    const factor = Number(unit ? unit.factor : 1) || 1;
    const baseAmount = round2(Math.abs(rawQty) * factor);
    const stock = stocks.find((s) => s.productId === data.productId);
    const beforeBase = stock ? stock.quantity : 0;

    let afterBase = beforeBase;
    if (type === 'adjust') {
      afterBase = round2(rawQty * factor);
    } else if (type === 'keluar') {
      afterBase = Math.max(0, round2(beforeBase - baseAmount));
    } else {
      afterBase = round2(beforeBase + baseAmount);
    }

    setStocks((prev) =>
      upsertStock(prev, {
        productId: data.productId,
        quantity: afterBase,
        sellingPrice: stock ? stock.sellingPrice : product.units[0] ? Number(product.units[0].price) : 0,
        note: stock ? stock.note : '',
      }, 'set')
    );

    const movement = {
      id: uid('mv-'),
      type,
      productId: data.productId,
      productNameSnapshot: product.name,
      unitBaseName: baseNameOf(product),
      beforeBase,
      afterBase,
      diffBase: round2(afterBase - beforeBase),
      ref: data.ref || '',
      note: data.note || '',
      timestamp: new Date().toISOString(),
    };
    setMovements((prev) => [movement, ...prev]);

    if (type === 'masuk') {
      addActivityLog({
        title: 'Stok Barang Bertambah',
        desc: `${product.name}: +${formatQty(movement.diffBase)} ${movement.unitBaseName}${movement.note ? ` (${movement.note})` : ''}`,
        type: 'stock_in',
      });
    } else if (type === 'keluar') {
      addActivityLog({
        title: 'Stok Barang Berkurang',
        desc: `${product.name}: ${formatQty(movement.diffBase)} ${movement.unitBaseName}${movement.note ? ` (${movement.note})` : ''}`,
        type: 'stock_out',
      });
    } else if (type === 'adjust') {
      addActivityLog({
        title: 'Penyesuaian Stok Dilakukan',
        desc: `${product.name}: ${formatQty(beforeBase)} → ${formatQty(afterBase)} ${movement.unitBaseName}${movement.note ? ` (${movement.note})` : ''}`,
        type: 'stock_adjust',
      });
    }

    return movement;
  }, [products, stocks, upsertStock, baseNameOf, addActivityLog]);

  const addBarangMasuk = useCallback((data) => applyMovement('masuk', data), [applyMovement]);
  const addBarangKeluar = useCallback((data) => applyMovement('keluar', data), [applyMovement]);
  const adjustStock = useCallback((data) => applyMovement('adjust', data), [applyMovement]);

  /* ---------- Barang Kosong & Pembelian Ulang ---------- */
  const recordRepurchase = useCallback(
    ({ shortageId, quantity, actualPrice = 0, date, note = '', isReceived = false }) => {
      const target = shortages.find((s) => s.id === shortageId);
      if (!target) return { ok: false, reason: 'Data kekurangan tidak ditemukan.' };

      const qtyNum = round2(Number(quantity) || 0);
      if (qtyNum <= 0) return { ok: false, reason: 'Jumlah pembelian harus lebih dari 0.' };

      const now = date ? new Date(date).toISOString() : new Date().toISOString();
      const priceNum = round2(Number(actualPrice) || 0);
      const receivedQty = isReceived ? qtyNum : 0;

      // Jika langsung diterima, masukkan ke stok warung dan catat mutasi penerimaan
      if (isReceived && receivedQty > 0) {
        const factor = Number(target.factor) || 1;
        const baseQty = round2(receivedQty * factor);
        const product = products.find((p) => p.id === target.productId);
        const stock = stocks.find((s) => s.productId === target.productId);
        const beforeBase = stock ? Number(stock.quantity) || 0 : 0;
        const afterBase = round2(beforeBase + baseQty);

        setStocks((prev) =>
          upsertStock(
            prev,
            {
              productId: target.productId,
              quantity: baseQty,
              sellingPrice:
                stock ? stock.sellingPrice : product && product.units[0] ? Number(product.units[0].price) : priceNum,
              note: stock ? stock.note : '',
            },
            'add'
          )
        );

        const movement = {
          id: uid('mv-'),
          type: 'receive',
          productId: target.productId,
          productNameSnapshot: target.productNameSnapshot,
          unitBaseName: product ? baseNameOf(product) : target.unit,
          beforeBase,
          afterBase,
          diffBase: baseQty,
          ref: target.orderId || target.id,
          note: `Pembelian ulang kekurangan (${formatQty(receivedQty)} ${target.unit})${note ? ` - ${note}` : ''}`,
          timestamp: now,
        };
        setMovements((prev) => [movement, ...prev]);

        addActivityLog({
          title: 'Pembelian Ulang Diterima',
          desc: `${formatQty(receivedQty)} ${target.unit} “${target.productNameSnapshot}” telah tiba & masuk stok`,
          type: 'repurchase_received',
        });
      } else {
        addActivityLog({
          title: 'Pembelian Ulang Dicatat',
          desc: `${formatQty(qtyNum)} ${target.unit} “${target.productNameSnapshot}” dicatat dibeli ulang (menunggu kedatangan)`,
          type: 'repurchase_logged',
        });
      }

      const repurchase = {
        id: uid('rp-'),
        shortageId,
        orderId: target.orderId,
        productId: target.productId,
        productName: target.productNameSnapshot,
        unit: target.unit,
        factor: target.factor,
        date: now,
        quantity: qtyNum,
        receivedQuantity: receivedQty,
        actualPrice: priceNum,
        isReceived: Boolean(isReceived),
        note: note ? String(note).trim() : '',
        createdAt: new Date().toISOString(),
      };

      let updatedShortage = null;
      setShortages((prev) =>
        prev.map((s) => {
          if (s.id !== shortageId) return s;
          const initial = s.initialQuantity != null ? Number(s.initialQuantity) : Number(s.quantity) || 0;
          const existingReps = Array.isArray(s.repurchases) ? s.repurchases : [];
          const allReps = [...existingReps, repurchase];
          const totalRec = round2(
            allReps.reduce((acc, r) => acc + (r.isReceived ? Number(r.receivedQuantity) || 0 : 0), 0)
          );
          const remainingQty = round2(Math.max(0, initial - totalRec));

          const newStatus = remainingQty <= 0 ? 'terpenuhi' : 'sudah';
          const historyEntry = {
            status: newStatus,
            timestamp: now,
            note: isReceived
              ? `Dibeli & langsung diterima ${formatQty(qtyNum)} ${s.unit}`
              : `Dibeli ulang ${formatQty(qtyNum)} ${s.unit} (belum tiba)`,
          };

          updatedShortage = {
            ...s,
            initialQuantity: initial,
            quantity: remainingQty,
            status: newStatus,
            statusChangedAt: now,
            statusNote: note ? String(note).trim() : s.statusNote,
            repurchases: allReps,
            statusHistory: [...(s.statusHistory || []), historyEntry],
          };
          return updatedShortage;
        })
      );

      return { ok: true, shortage: updatedShortage, repurchase };
    },
    [shortages, products, stocks, upsertStock, baseNameOf, addActivityLog]
  );

  const receiveRepurchase = useCallback(
    ({ shortageId, repurchaseId, receivedQuantity, date, note = '' }) => {
      const target = shortages.find((s) => s.id === shortageId);
      if (!target) return { ok: false, reason: 'Data kekurangan tidak ditemukan.' };

      const rep = (target.repurchases || []).find((r) => r.id === repurchaseId);
      if (!rep) return { ok: false, reason: 'Data pembelian ulang tidak ditemukan.' };
      if (rep.isReceived) return { ok: false, reason: 'Barang sudah dicatat diterima sebelumnya.' };

      const recQty = receivedQuantity != null ? round2(Number(receivedQuantity) || 0) : rep.quantity;
      if (recQty <= 0) return { ok: false, reason: 'Jumlah yang diterima harus lebih dari 0.' };

      const now = date ? new Date(date).toISOString() : new Date().toISOString();
      const factor = Number(target.factor) || 1;
      const baseQty = round2(recQty * factor);

      const product = products.find((p) => p.id === target.productId);
      const stock = stocks.find((s) => s.productId === target.productId);
      const beforeBase = stock ? Number(stock.quantity) || 0 : 0;
      const afterBase = round2(beforeBase + baseQty);

      setStocks((prev) =>
        upsertStock(
          prev,
          {
            productId: target.productId,
            quantity: baseQty,
            sellingPrice:
              stock ? stock.sellingPrice : product && product.units[0] ? Number(product.units[0].price) : rep.actualPrice,
            note: stock ? stock.note : '',
          },
          'add'
        )
      );

      const movement = {
        id: uid('mv-'),
        type: 'receive',
        productId: target.productId,
        productNameSnapshot: target.productNameSnapshot,
        unitBaseName: product ? baseNameOf(product) : target.unit,
        beforeBase,
        afterBase,
        diffBase: baseQty,
        ref: target.orderId || target.id,
        note: `Penerimaan barang pembelian ulang (${formatQty(recQty)} ${target.unit})${note ? ` - ${note}` : ''}`,
        timestamp: now,
      };
      setMovements((prev) => [movement, ...prev]);

      setShortages((prev) =>
        prev.map((s) => {
          if (s.id !== shortageId) return s;
          const initial = s.initialQuantity != null ? Number(s.initialQuantity) : Number(s.quantity) || 0;
          const updatedReps = (s.repurchases || []).map((r) =>
            r.id === repurchaseId
              ? {
                  ...r,
                  isReceived: true,
                  receivedQuantity: recQty,
                  receivedAt: now,
                  receiveNote: note ? String(note).trim() : '',
                }
              : r
          );
          const totalRec = round2(
            updatedReps.reduce((acc, r) => acc + (r.isReceived ? Number(r.receivedQuantity) || 0 : 0), 0)
          );
          const remainingQty = round2(Math.max(0, initial - totalRec));
          const newStatus = remainingQty <= 0 ? 'terpenuhi' : 'sudah';

          const historyEntry = {
            status: newStatus,
            timestamp: now,
            note: `Penerimaan pembelian ulang ${formatQty(recQty)} ${s.unit} tiba & masuk stok`,
          };

          return {
            ...s,
            initialQuantity: initial,
            quantity: remainingQty,
            status: newStatus,
            statusChangedAt: now,
            repurchases: updatedReps,
            statusHistory: [...(s.statusHistory || []), historyEntry],
          };
        })
      );

      addActivityLog({
        title: 'Barang Pembelian Ulang Diterima',
        desc: `${formatQty(recQty)} ${target.unit} “${target.productNameSnapshot}” tiba & masuk stok`,
        type: 'repurchase_received',
      });

      return { ok: true };
    },
    [shortages, products, stocks, upsertStock, baseNameOf, addActivityLog]
  );

  const markShortageSold = useCallback(
    (id, note) => {
      const target = shortages.find((s) => s.id === id);
      if (!target) return;
      recordRepurchase({
        shortageId: id,
        quantity: target.quantity,
        actualPrice: 0,
        note: note || '',
        isReceived: false,
      });
    },
    [shortages, recordRepurchase]
  );

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetData = useCallback(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    completedRef.current = new Set();
    setStores(seed.stores);
    setProducts(seed.products.map(migrateProduct));
    setOrders(seed.orders.map(migrateOrder));
    setStorePrices([]);
    setStocks(seed.stocks);
    setMovements(seed.movements);
    setShortages(seed.shortages);
    setPriceHistory([]);
    setSettings(seed.settings);
    setActivityLogs([]);
    setReadNotifIds([]);
  }, [seed]);

  const clearAllData = useCallback(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    completedRef.current = new Set();
    setStores([]);
    setProducts([]);
    setOrders([]);
    setStorePrices([]);
    setStocks([]);
    setMovements([]);
    setShortages([]);
    setPriceHistory([]);
    setActivityLogs([]);
    setReadNotifIds([]);
    setSettings((prev) => ({
      ...seed.settings,
      theme: prev.theme || 'soft-pink',
    }));
  }, [seed]);

  /* ---------- Cadangan (ekspor & impor) ---------- */
  const buildBackup = useCallback(
    () => ({
      app: 'catatan-warung-madura',
      version: '1.2.0',
      exportedAt: new Date().toISOString(),
      data: {
        stores,
        products,
        orders,
        storePrices,
        stocks,
        movements,
        shortages,
        priceHistory,
        settings,
        activityLogs,
      },
    }),
    [stores, products, orders, storePrices, stocks, movements, shortages, priceHistory, settings, activityLogs]
  );

  const validateBackup = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, reason: 'Berkas cadangan tidak valid atau kosong.' };
    }
    const isAppMatch = payload.app === 'catatan-warung-madura' || payload.app === 'warung-madura';
    const d = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    if (!Array.isArray(d.stores)) {
      return { ok: false, reason: 'Data toko pemasok (stores) tidak ditemukan atau tidak berformat array.' };
    }
    if (!Array.isArray(d.products)) {
      return { ok: false, reason: 'Data master barang (products) tidak ditemukan atau tidak berformat array.' };
    }

    // Validasi integritas barang
    for (const p of d.products) {
      if (!p || typeof p !== 'object' || !p.name) {
        return { ok: false, reason: 'Terdapat data barang yang rusak atau tidak memiliki nama.' };
      }
    }

    const summary = {
      stores: d.stores.length,
      products: d.products.length,
      orders: Array.isArray(d.orders) ? d.orders.length : 0,
      stocks: Array.isArray(d.stocks) ? d.stocks.length : 0,
      shortages: Array.isArray(d.shortages) ? d.shortages.length : 0,
      movements: Array.isArray(d.movements) ? d.movements.length : 0,
      exportedAt: payload.exportedAt || null,
      version: payload.version || '1.0.0',
      isOfficialApp: isAppMatch,
    };

    return { ok: true, summary, validatedData: d };
  }, []);

  const importData = useCallback(
    (payload) => {
      const validation = validateBackup(payload);
      if (!validation.ok) {
        return { ok: false, reason: validation.reason };
      }

      const d = validation.validatedData;
      const nextProducts = d.products.map(migrateProduct).map(stripBuyOneGetOne).filter(Boolean);
      const nextStores = d.stores.map(migrateStore).filter(Boolean);
      const nextOrders = Array.isArray(d.orders) ? d.orders.map(migrateOrder).filter(Boolean) : [];
      const nextStorePrices = Array.isArray(d.storePrices)
        ? d.storePrices.map(migrateStorePrice).filter(Boolean)
        : [];
      const nextStocks = migrateStocks(Array.isArray(d.stocks) ? d.stocks : [], nextProducts);
      const nextMovements = Array.isArray(d.movements) ? d.movements : [];
      const nextShortages = Array.isArray(d.shortages) ? d.shortages.map(migrateShortage).filter(Boolean) : [];
      const nextPriceHistory = Array.isArray(d.priceHistory)
        ? d.priceHistory.map(migratePriceHistory).filter(Boolean)
        : [];
      const nextSettings = d.settings && typeof d.settings === 'object' ? d.settings : settings;
      const nextActivityLogs = Array.isArray(d.activityLogs) ? d.activityLogs : [];

      // Validasi penulisan ke localStorage terlebih dahulu sebelum mengubah state React
      try {
        save('stores', nextStores);
        save('products', nextProducts);
        save('orders', nextOrders);
        save('storePrices', nextStorePrices);
        save('stocks', nextStocks);
        save('movements', nextMovements);
        save('shortages', nextShortages);
        save('priceHistory', nextPriceHistory);
        save('settings', nextSettings);
        save('activityLogs', nextActivityLogs);
        save('readNotifIds', []);
      } catch (err) {
        return {
          ok: false,
          reason: `Gagal menyimpan pemulihan data ke memori lokal: ${err.message || 'Kapasitas penuh'}`,
        };
      }

      completedRef.current = new Set();
      setStores(nextStores);
      setProducts(nextProducts);
      setOrders(nextOrders);
      setStorePrices(nextStorePrices);
      setStocks(nextStocks);
      setMovements(nextMovements);
      setShortages(nextShortages);
      setPriceHistory(nextPriceHistory);
      setSettings(nextSettings);
      setActivityLogs(nextActivityLogs);
      setReadNotifIds([]);

      return {
        ok: true,
        summary: validation.summary,
      };
    },
    [validateBackup, settings]
  );

  const activeOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'belum_diterima' || o.status === 'sebagian' || o.status === 'active')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders]
  );

  const doneOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'selesai')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders]
  );

  const stockRows = useMemo(
    () =>
      products
        .map((p) => ({ product: p, stock: stocks.find((s) => s.productId === p.id) }))
        .filter((x) => !!x.stock)
        .sort((a, b) => a.product.name.localeCompare(b.product.name)),
    [products, stocks]
  );

  const openShortages = useMemo(
    () => shortages.filter((s) => s.status === 'belum'),
    [shortages]
  );

  // Barang yang perlu dibeli: habis (qty <= 0) atau menipis (qty di bawah minStock).
  const needsRestock = useMemo(
    () =>
      products
        .map((p) => {
          const stock = stocks.find((s) => s.productId === p.id);
          const qty = stock ? Number(stock.quantity) || 0 : 0;
          const min = p.minStock != null ? Number(p.minStock) : 0;
          let status = null;
          if (qty <= 0) status = 'habis';
          else if (min > 0 && qty < min) status = 'menipis';
          return status ? { product: p, stock, qty, min, status } : null;
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'habis' ? -1 : 1;
          return a.product.name.localeCompare(b.product.name, 'id');
        }),
    [products, stocks]
  );

  // Aktivitas Terbaru untuk Dashboard
  const activities = useMemo(() => {
    const fromMovements = (movements || []).map((m) => {
      let title = 'Penyesuaian Stok Dilakukan';
      let type = 'stock_adjust';
      if (m.type === 'receive') {
        title = 'Pesanan Sudah Diterima';
        type = 'order_done';
      } else if (m.type === 'masuk') {
        title = 'Stok Barang Bertambah';
        type = 'stock_in';
      } else if (m.type === 'keluar') {
        title = 'Stok Barang Berkurang';
        type = 'stock_out';
      }
      const sign = m.diffBase > 0 ? '+' : '';
      const desc = `${m.productNameSnapshot}: ${sign}${formatQty(m.diffBase)} ${m.unitBaseName || 'pcs'}${
        m.note ? ` • “${m.note}”` : m.ref ? ` • Ref: ${m.ref}` : ''
      }`;
      return {
        id: `act-mv-${m.id}`,
        title,
        desc,
        timestamp: m.timestamp,
        type,
      };
    });

    const fromOrders = [];
    for (const o of orders || []) {
      const storeName = storeById(o.storeId)?.name || 'Pemasok';
      fromOrders.push({
        id: `act-ord-${o.id}`,
        title: 'Pesanan Baru Dibuat',
        desc: `Pesanan ${o.id} dibuat ke ${storeName} (${o.totalItems} barang)`,
        timestamp: o.createdAt,
        type: 'order_created',
      });
      if (o.status === 'selesai' || o.receipt) {
        fromOrders.push({
          id: `act-rec-${o.id}`,
          title: 'Pesanan Sudah Diterima',
          desc: `Penerimaan pesanan ${o.id} dari ${storeName} telah selesai dicatat ke stok`,
          timestamp: o.receipt?.completedAt || o.receipt?.date || o.createdAt,
          type: 'order_done',
        });
      }
    }

    const combined = [...activityLogs, ...fromMovements, ...fromOrders];
    combined.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    const seen = new Set();
    const result = [];
    for (const act of combined) {
      if (!seen.has(act.id)) {
        seen.add(act.id);
        result.push(act);
      }
    }
    return result;
  }, [activityLogs, movements, orders, storeById]);

  /* ---------- Notifikasi Dinamis Sesuai Pengaturan ---------- */
  const notifSettings = useMemo(
    () => ({
      ...DEFAULT_NOTIFICATIONS,
      ...(settings.notifications || {}),
    }),
    [settings.notifications]
  );

  const activeNotifications = useMemo(() => {
    const list = [];

    // A. Notifikasi Stok
    if (notifSettings.stockEmpty) {
      for (const item of needsRestock) {
        if (item.status === 'habis') {
          list.push({
            id: `notif-stock-empty-${item.product.id}`,
            category: 'stok',
            type: 'danger',
            title: `Stok Habis: ${item.product.name}`,
            message: `Persediaan habis (0). Segera buat pesanan baru ke pemasok.`,
            link: '/stok',
            createdAt: item.product.createdAt || new Date().toISOString(),
          });
        }
      }
    }

    if (notifSettings.stockLow) {
      for (const item of needsRestock) {
        if (item.status === 'menipis') {
          list.push({
            id: `notif-stock-low-${item.product.id}`,
            category: 'stok',
            type: 'warning',
            title: `Stok Menipis: ${item.product.name}`,
            message: `Sisa stok ${formatQty(item.qty)} berada di bawah batas minimum (${formatQty(item.min)}).`,
            link: '/stok',
            createdAt: item.product.createdAt || new Date().toISOString(),
          });
        }
      }
    }

    if (notifSettings.stockRestocked) {
      const recentMovements = (movements || [])
        .filter((m) => m.type === 'receive' || m.type === 'masuk')
        .slice(0, 5);
      for (const m of recentMovements) {
        const prod = products.find((p) => p.id === m.productId);
        if (prod) {
          list.push({
            id: `notif-restocked-${m.id}`,
            category: 'stok',
            type: 'success',
            title: `Stok Masuk: ${prod.name}`,
            message: `Penambahan +${formatQty(m.diffBase)} ${m.unitBaseName || 'pcs'} telah masuk ke inventaris.`,
            link: '/stok',
            createdAt: m.timestamp || m.createdAt || m.date || '2026-01-01T00:00:00.000Z',
          });
        }
      }
    }

    // B. Notifikasi Pesanan
    for (const o of orders || []) {
      const sName = stores.find((s) => s.id === o.storeId)?.name || 'Pemasok';

      if (notifSettings.orderCreated && (o.status === 'belum_diterima' || o.status === 'active')) {
        list.push({
          id: `notif-order-created-${o.id}`,
          category: 'pesanan',
          type: 'info',
          title: `Pesanan Menunggu: ${o.id}`,
          message: `Pesanan kepada ${sName} sebanyak ${o.items?.length || 0} jenis barang siap diterima.`,
          link: '/pesanan',
          createdAt: o.createdAt,
        });
      }

      // Notifikasi penerimaan barang pesanan yang masuk
      if (notifSettings.orderReceiving && Array.isArray(o.receipts) && o.receipts.length > 0) {
        const latestReceipt = o.receipts[o.receipts.length - 1];
        const recCount = (latestReceipt.items || []).reduce(
          (acc, it) => acc + (Number(it.receivedQuantity) || 0),
          0
        );
        list.push({
          id: `notif-order-receipt-${o.id}-${latestReceipt.id || latestReceipt.receivedAt}`,
          category: 'pesanan',
          type: 'info',
          title: `Penerimaan Barang: ${o.id}`,
          message: `Penerimaan barang dari ${sName} sebanyak ${formatQty(recCount)} unit telah dicatat & masuk stok.`,
          link: '/pesanan',
          createdAt: latestReceipt.receivedAt || o.updatedAt || o.createdAt,
        });
      }

      if (notifSettings.orderPartial && (o.status === 'sebagian' || o.status === 'proses')) {
        list.push({
          id: `notif-order-partial-${o.id}`,
          category: 'pesanan',
          type: 'warning',
          title: `Pesanan Sebagian: ${o.id}`,
          message: `Pesanan dari ${sName} baru diterima sebagian. Sisa barang masih ditunggu.`,
          link: '/pesanan',
          createdAt: o.updatedAt || o.createdAt,
        });
      }

      if (notifSettings.orderCompleted && (o.status === 'selesai' || o.status === 'diterima')) {
        list.push({
          id: `notif-order-completed-${o.id}`,
          category: 'pesanan',
          type: 'success',
          title: `Pesanan Selesai: ${o.id}`,
          message: `Seluruh barang dari ${sName} telah lengkap diterima.`,
          link: '/pesanan',
          createdAt: o.updatedAt || o.createdAt,
        });
      }

      if (notifSettings.orderUnfulfilled) {
        const hasUnfulfilled = (o.items || []).some((it) => (it.receivedQuantity || 0) < it.quantity);
        if (hasUnfulfilled && o.status !== 'batal' && o.status !== 'dibatalkan') {
          list.push({
            id: `notif-order-unfulfilled-${o.id}`,
            category: 'pesanan',
            type: 'warning',
            title: `Ada Kekurangan: ${o.id}`,
            message: `Pesanan ${o.id} memiliki barang yang belum terpenuhi dari pemasok.`,
            link: '/laporan',
            createdAt: o.updatedAt || o.createdAt,
          });
        }
      }
    }

    // C. Notifikasi Pembelian Ulang
    for (const sk of shortages || []) {
      if (
        notifSettings.repurchasePending &&
        (sk.status === 'belum' || (sk.quantity > 0 && (!sk.repurchases || sk.repurchases.length === 0)))
      ) {
        list.push({
          id: `notif-shortage-pending-${sk.id}`,
          category: 'pembelian_ulang',
          type: 'danger',
          title: `Belum Dibeli: ${sk.productNameSnapshot}`,
          message: `Kekurangan ${formatQty(sk.quantity)} ${sk.unit} dari pesanan ${sk.orderId} belum dibeli kembali.`,
          link: '/laporan',
          createdAt: sk.createdAt,
        });
      }
      if (notifSettings.repurchaseInDelivery) {
        for (const rep of sk.repurchases || []) {
          if (!rep.isReceived) {
            list.push({
              id: `notif-repurchase-deliv-${rep.id}`,
              category: 'pembelian_ulang',
              type: 'info',
              title: `Menunggu Kedatangan: ${sk.productNameSnapshot}`,
              message: `Pembelian ulang ${formatQty(rep.quantity)} ${sk.unit} menunggu kedatangan fisik.`,
              link: '/laporan',
              createdAt: rep.date || sk.createdAt,
            });
          }
        }
      }
    }

    // Deduplikasi ketat berdasarkan ID
    const seen = new Set();
    const deduped = [];
    for (const item of list) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduped.push(item);
      }
    }

    return deduped.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [notifSettings, needsRestock, movements, products, orders, stores, shortages]);

  const unreadNotifCount = useMemo(
    () => activeNotifications.filter((n) => !readNotifIds.includes(n.id)).length,
    [activeNotifications, readNotifIds]
  );

  const markAllNotifsRead = useCallback(() => {
    const ids = activeNotifications.map((n) => n.id);
    setReadNotifIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, [activeNotifications]);

  const markNotifRead = useCallback((id) => {
    setReadNotifIds((prev) => Array.from(new Set([...prev, id])));
  }, []);

  const value = {
    stores,
    products,
    orders,
    storePrices,
    stocks,
    movements,
    shortages,
    priceHistory,
    settings,
    activeOrders,
    doneOrders,
    stockRows,
    openShortages,
    needsRestock,
    activities,
    activityLogs,
    addActivityLog,
    activeNotifications,
    unreadNotifCount,
    markAllNotifsRead,
    markNotifRead,
    toasts,
    pushToast,
    dismissToast,
    storeById,
    productById,
    productsOfStore,
    stockOfProduct,
    baseNameOf,
    priceOfStore,
    saveStorePrices,
    createStore,
    updateStore,
    deleteStore,
    saveProduct,
    addProductWithStock,
    checkProductReferences,
    deleteProduct,
    archiveProduct,
    updateProduct,
    deleteStock,
    updateStockPrices,
    createOrder,
    completeOrder,
    completeOrderWithShortages,
    receiveOrderPartial,
    cancelOrder,
    addBarangMasuk,
    addBarangKeluar,
    adjustStock,
    markShortageSold,
    recordRepurchase,
    receiveRepurchase,
    updateSettings,
    resetData,
    clearAllData,
    buildBackup,
    validateBackup,
    importData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}