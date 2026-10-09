import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeed } from '../data/seed';
import { dateCompact, round2, uid } from '../utils/format';

const PREFIX = 'wm_v1_';

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
const migrateProduct = (p) => {
  if (!p) return null;
  const hasUnits = Array.isArray(p.units) && p.units.length > 0 && p.units.some((x) => x.factor === 1);
  const out = hasUnits
    ? { ...p }
    : {
        ...p,
        category: p.category || '',
        minStock: p.minStock != null ? Number(p.minStock) : null,
        units: [
          { id: uid('u-'), name: p.unit || 'pcs', factor: 1, price: Number(p.purchasePrice) || 0 },
        ],
      };
  return {
    ...out,
    featured: !!out.featured,
    description: out.description || '',
    promo: !!out.promo,
    advertisement: !!out.advertisement,
    promoTitle: out.promoTitle || '',
    promoDescription: out.promoDescription || '',
    advertisementDescription: out.advertisementDescription || '',
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
  productNameSnapshot: it.productNameSnapshot,
  unitId: it.unitId || '',
  unitName: it.unitName || it.unit || 'pcs',
  unitFactor: it.unitFactor || 1,
  quantity: Number(it.quantity) || 0,
  priceRef: it.priceRef != null ? it.priceRef : it.priceSnapshot != null ? it.priceSnapshot : 0,
  priceActual:
    it.priceActual != null ? it.priceActual : it.priceSnapshot != null ? it.priceSnapshot : 0,
  subtotal: it.subtotal != null ? it.subtotal : it.quantity * (it.priceActual ?? it.priceSnapshot ?? 0),
});

const migrateOrder = (o) => ({
  ...o,
  items: (o.items || []).map(migrateOrderItem),
  totalCost: o.totalCost != null ? o.totalCost : o.totalPrice || 0,
  receipt: o.receipt || null,
  status: o.status || 'active',
});

const migrateStocks = (stocks, products) => {
  if (!Array.isArray(stocks)) return [];
  const hasLegacy = stocks.some((s) => s.storeId);
  if (!hasLegacy) {
    return stocks.map((s) => ({
      id: s.id || uid('k-'),
      productId: s.productId,
      quantity: round2(Number(s.quantity) || 0),
      sellingPrice: Number(s.sellingPrice) || 0,
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
    return { ...s, sellingPrice: s.sellingPrice || basePrice };
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

/* ---------- Konteks ---------- */
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const seed = useMemo(() => buildSeed(), []);
  const [stores, setStores] = useState(() => load('stores', seed.stores));
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
  const [shortages, setShortages] = useState(() => load('shortages', seed.shortages));
  const [settings, setSettings] = useState(() => load('settings', seed.settings));
  const [toasts, setToasts] = useState([]);
  const completedRef = useRef(new Set());

  useEffect(() => save('stores', stores), [stores]);
  useEffect(() => save('products', products), [products]);
  useEffect(() => save('orders', orders), [orders]);
  useEffect(() => save('storePrices', storePrices), [storePrices]);
  useEffect(() => save('stocks', stocks), [stocks]);
  useEffect(() => save('movements', movements), [movements]);
  useEffect(() => save('shortages', shortages), [shortages]);
  useEffect(() => save('settings', settings), [settings]);

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
            updatedAt: new Date().toISOString(),
          };
        } else {
          next.push({
            id: uid('sp-'),
            storeId,
            productId: e.productId,
            unitId: e.unitId,
            price,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      return next;
    });
  }, []);

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
    (name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return null;
      if (stores.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return null;
      const store = { id: uid('st-'), name: trimmed, createdAt: new Date().toISOString() };
      setStores((prev) =>
        prev.some((s) => s.name.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, store]
      );
      return store;
    },
    [stores]
  );

  const updateStore = useCallback((id, name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, reason: 'Nama toko tidak boleh kosong.' };
    let blocked = false;
    setStores((prev) => prev.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
    return { ok: !blocked, reason: '' };
  }, []);

  const deleteStore = useCallback(
    (id) => {
      const count = orders.filter((o) => o.storeId === id).length;
      if (count > 0) {
        return { ok: false, reason: `Toko masih memiliki ${count} pesanan. Hapus tidak diizinkan demi keamanan data.` };
      }
      setStores((prev) => prev.filter((s) => s.id !== id));
      setProducts((prev) =>
        prev.map((p) => (p.storeIds.includes(id) ? { ...p, storeIds: p.storeIds.filter((x) => x !== id) } : p))
      );
      setStorePrices((prev) => prev.filter((x) => x.storeId !== id));
      return { ok: true };
    },
    [orders]
  );

  /* ---------- Barang ---------- */
  const keepStockFor = useCallback(
    (productId, units) => {
      const basePrice = units && units[0] ? Number(units[0].price) || 0 : 0;
      setStocks((prev) =>
        upsertStock(prev, { productId, quantity: 0, sellingPrice: basePrice, note: '' }, 'set')
      );
    },
    [upsertStock]
  );
  const addStockRow = useCallback(
    (productId, units) => {
      const basePrice = units && units[0] ? Number(units[0].price) || 0 : 0;
      setStocks((prev) => {
        if (prev.some((s) => s.productId === productId)) return prev;
        return [{ id: uid('k-'), productId, quantity: 0, sellingPrice: basePrice, note: '' }, ...prev];
      });
    },
    []
  );

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

  const deleteProduct = useCallback((id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setStocks((prev) => prev.filter((s) => s.productId !== id));
    setShortages((prev) => prev.filter((x) => x.productId !== id));
    setStorePrices((prev) => prev.filter((x) => x.productId !== id));
  }, []);

  const updateProduct = useCallback((id, patch) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const deleteStock = useCallback((id) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /* ---------- Pesanan ---------- */
  const createOrder = useCallback(
    ({ storeId, items, note }) => {
      const now = new Date();
      const prefix = 'P-' + dateCompact(now);
      const count = orders.filter((o) => o.id.startsWith(prefix)).length;
      const order = {
        id: prefix + '-' + String(count + 1).padStart(3, '0'),
        storeId,
        items: items.map((it) => {
          const product = products.find((p) => p.id === it.productId);
          const unit = (product?.units || []).find((x) => x.id === it.unitId);
          const factor = unit ? Number(unit.factor) : 1;
          const priceRef = it.priceRef != null ? Number(it.priceRef) : Number(unit ? unit.price : 0);
          const priceActual = it.priceActual != null ? Number(it.priceActual) : priceRef;
          return {
            productId: it.productId,
            productNameSnapshot: product ? product.name : it.name,
            unitId: unit ? unit.id : '',
            unitName: unit ? unit.name : it.unitName || 'pcs',
            unitFactor: factor,
            quantity: Number(it.quantity) || 0,
            priceRef,
            priceActual,
            subtotal: round2((Number(it.quantity) || 0) * priceActual),
          };
        }),
        totalItems: items.reduce((a, b) => a + (Number(b.quantity) || 0), 0),
        totalPrice: 0,
        totalCost: 0,
        note: note || '',
        createdAt: now.toISOString(),
        status: 'active',
        receipt: null,
      };
      order.totalPrice = order.items.reduce((a, b) => a + b.subtotal, 0);
      setOrders((prev) => [order, ...prev]);
      return order;
    },
    [orders, products]
  );

  const completeOrder = useCallback(
    (orderId, receiptInput) => {
      if (completedRef.current.has(orderId)) return null;
      const target = orders.find((o) => o.id === orderId);
      if (!target || target.status === 'selesai' || target.receipt) return null;
      completedRef.current.add(orderId);

      const now = new Date().toISOString();
      const receipt = receiptInput || { items: [], note: '', photo: '' };
      const receiptItems = [];
      const newShortages = [];
      let totalCost = 0;

      const stockUpdates = [];
      const movementsToAdd = [];

      for (const item of target.items) {
        const r = (receipt.items || []).find((x) => x.productId === item.productId) || {};
        const ordBase = item.quantity * item.unitFactor;
        const recUnitName = r.receivedUnitName || item.unitName;
        const recFactor = Number(r.receivedUnitFactor) || item.unitFactor || 1;
        const recBase = round2((Number(r.receivedQuantity) || 0) * recFactor);
        const shortageBase = Math.max(0, round2(ordBase - recBase));
        const shortageQty = item.unitFactor ? round2(shortageBase / item.unitFactor) : round2(shortageBase);

        const itemRec = {
          productId: item.productId,
          productNameSnapshot: item.productNameSnapshot,
          orderedUnitName: item.unitName,
          orderedQuantity: item.quantity,
          receivedQuantity: Number(r.receivedQuantity) || 0,
          receivedUnitId: r.receivedUnitId || (item.unitId || ''),
          receivedUnitName: recUnitName,
          receivedUnitFactor: recFactor,
          receivedBase: recBase,
          shortageQuantity: shortageQty,
          shortageUnitName: item.unitName,
          shortageBase,
          note: r.note || '',
        };
        receiptItems.push(itemRec);

        const costPerBase = item.unitFactor ? item.priceActual / item.unitFactor : item.priceActual;
        totalCost += costPerBase * recBase;

        const product = products.find((p) => p.id === item.productId);
        const stock = stocks.find((s) => s.productId === item.productId);
        stockUpdates.push({
          productId: item.productId,
          quantity: recBase,
          sellingPrice: stock ? stock.sellingPrice : product && product.units[0] ? Number(product.units[0].price) : item.priceActual,
          note: stock ? stock.note : '',
        });
        movementsToAdd.push({
          id: uid('mv-'),
          type: 'receive',
          productId: item.productId,
          productNameSnapshot: item.productNameSnapshot,
          unitBaseName: product ? baseNameOf(product) : (r.receivedUnitName || item.unitName),
          beforeBase: stock ? stock.quantity : 0,
          afterBase: round2((stock ? stock.quantity : 0) + recBase),
          diffBase: recBase,
          ref: orderId,
          note: recUnitName,
          timestamp: now,
        });

        if (shortageBase > 1e-9) {
          newShortages.push({
            id: uid('sk-'),
            orderId,
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            storeId: target.storeId,
            storeNameSnapshot: storeById(target.storeId)?.name || '',
            quantity: shortageQty,
            unit: item.unitName,
            factor: item.unitFactor,
            status: 'belum',
            statusChangedAt: '',
            statusNote: '',
            resolvedByOrderId: '',
            createdAt: now,
          });
        }
      }

      totalCost = round2(totalCost);

      // hemat: update states dalam satu batch
      setStocks((prev) => stockUpdates.reduce((acc, upd) => upsertStock(acc, upd, 'add'), prev));
      setMovements((prev) => [...movementsToAdd, ...prev].filter(Boolean));
      const orderProductIds = target.items.map((i) => i.productId);
      setShortages((prev) => {
        const resolved = prev.map((s) =>
          s.status === 'belum' && orderProductIds.includes(s.productId) && s.storeId === target.storeId
            ? {
                ...s,
                status: 'sudah',
                statusChangedAt: now,
                statusNote: `Terpenuhi dari pesanan ${orderId}`,
                resolvedByOrderId: orderId,
              }
            : s
        );
        return [...resolved, ...newShortages];
      });
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'selesai',
                totalCost,
                receipt: {
                  completedAt: now,
                  note: receipt.note || '',
                  photo: receipt.photo || '',
                  items: receiptItems,
                },
              }
            : o
        )
      );

      return {
        orderId,
        items: receiptItems,
        totalCost,
        shortages: newShortages,
      };
    },
    [orders, products, stocks, upsertStock, storeById, baseNameOf]
  );

  /* ---------- Stok ---------- */
  const applyMovement = useCallback((type, data) => {
    const product = products.find((p) => p.id === data.productId);
    if (!product) return null;
    const unit = (product.units || []).find((x) => x.id === data.unitId) || product.units[0];
    const baseDelta =
      type === 'adjust' ? 0 : round2((Number(data.quantity) || 0) * (unit ? unit.factor : 1));
    const stock = stocks.find((s) => s.productId === data.productId);
    const beforeBase = stock ? stock.quantity : 0;
    const afterBase =
      type === 'adjust'
        ? round2((Number(data.quantity) || 0) * (unit ? unit.factor : 1))
        : round2(beforeBase + baseDelta);

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
      ref: '',
      note: data.note || '',
      timestamp: new Date().toISOString(),
    };
    setMovements((prev) => [movement, ...prev]);
    return movement;
  }, [products, stocks, upsertStock, baseNameOf]);

  const addBarangMasuk = useCallback((data) => applyMovement('masuk', data), [applyMovement]);
  const adjustStock = useCallback((data) => applyMovement('adjust', data), [applyMovement]);

  /* ---------- Barang Kosaong ---------- */
  const markShortageSold = useCallback(
    (id, note) => {
      setShortages((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: 'sudah',
                statusChangedAt: new Date().toISOString(),
                statusNote: note || '',
              }
            : s
        )
      );
    },
    []
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
    setSettings(seed.settings);
  }, [seed]);

  const activeOrders = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'active')
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

  const value = {
    stores,
    products,
    orders,
    storePrices,
    stocks,
    movements,
    shortages,
    settings,
    activeOrders,
    doneOrders,
    stockRows,
    openShortages,
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
    deleteProduct,
    updateProduct,
    deleteStock,
    createOrder,
    completeOrder,
    addBarangMasuk,
    adjustStock,
    markShortageSold,
    updateSettings,
    resetData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}