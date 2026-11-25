import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from './AuthContext';
import { enqueueOperation } from '../services/offlineQueue';
import { startSyncEngine, stopSyncEngine, triggerSyncNow } from '../services/syncEngine';
import { buildSeed } from '../data/seed';
import { DEFAULT_OPERATORS, createOperatorSnapshot } from '../data/operators';
import { addDays, computeDataChecksum, dateCompact, dateKey, formatDateId, formatQty, getDayNameId, getLocalDateString, localDateToISO, round2, uid } from '../utils/format';
import { calculateDigitalProfit, validateDigitalTransaction, summarizeDigitalTransactions } from '../utils/digitalFinance';

export { DEFAULT_OPERATORS, computeDataChecksum };

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

// Pelacak status kesehatan penyimpanan lokal
let lastStorageError = null;
const storageListeners = new Set();

export function getStorageHealth() {
  return {
    ok: !lastStorageError,
    lastError: lastStorageError,
  };
}

export function subscribeStorageHealth(listener) {
  storageListeners.add(listener);
  return () => storageListeners.delete(listener);
}

function notifyStorageError(errInfo) {
  lastStorageError = errInfo;
  storageListeners.forEach((fn) => {
    try {
      fn(lastStorageError);
    } catch (_) {}
  });
}

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[Storage Integrity] Kunci "${PREFIX + key}" mengalami kerusakan format JSON.`, err);
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) {
        // Amankan data rusak ke rescue key agar data fisik tidak tertimpa/lenyap
        const rescueKey = `${PREFIX}corrupt_rescue_${key}_${Date.now()}`;
        localStorage.setItem(rescueKey, raw);
        notifyStorageError({
          key,
          isCorrupt: true,
          rescueKey,
          message: `Data pada "${key}" rusak dan telah diamankan ke "${rescueKey}".`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (_) {}
    return fallback;
  }
}

const save = (key, data) => {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(PREFIX + key, serialized);
    if (lastStorageError && lastStorageError.key === key) {
      lastStorageError = null;
      notifyStorageError(null);
    }
  } catch (err) {
    const isQuota =
      err &&
      (err.name === 'QuotaExceededError' ||
        err.code === 22 ||
        err.code === 1014 ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    const errorDetail = {
      key,
      isQuota: !!isQuota,
      message: isQuota
        ? `Memori penyimpanan browser penuh (QuotaExceededError). Gagal menyimpan data "${key}".`
        : `Gagal menyimpan data "${key}": ${err?.message || 'Kesalahan sistem'}`,
      timestamp: new Date().toISOString(),
    };
    console.error('[Storage Error]', errorDetail);
    notifyStorageError(errorDetail);
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
  const rawRepurchases = Array.isArray(s.repurchases)
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

  // Migrasi setiap item pembelian ulang agar mendukung multi-tahap penerimaan (staged repurchases)
  const repurchases = rawRepurchases
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const targetQty = Number(r.quantity) || 0;
      let receipts = Array.isArray(r.receipts) ? r.receipts : [];
      if (receipts.length === 0 && (r.isReceived || Number(r.receivedQuantity) > 0)) {
        receipts = [
          {
            id: uid('rpr-'),
            receivedQuantity: Number(r.receivedQuantity) || targetQty,
            date: r.receivedAt || r.date || r.createdAt || new Date().toISOString(),
            note: r.receiveNote || r.note || '',
          },
        ];
      }
      const sumRec = round2(
        receipts.reduce((acc, rc) => acc + (Number(rc.receivedQuantity) || 0), 0)
      );
      const recQty = receipts.length > 0 ? sumRec : Number(r.receivedQuantity) || 0;
      const isComplete = targetQty > 0 && recQty >= targetQty;
      const repStatus = isComplete ? 'selesai' : recQty > 0 ? 'sebagian' : 'menunggu';
      return {
        ...r,
        receipts,
        receivedQuantity: recQty,
        isReceived: isComplete,
        status: repStatus,
      };
    })
    .filter(Boolean);

  const totalRec = round2(
    repurchases.reduce((acc, r) => acc + (Number(r.receivedQuantity) || 0), 0)
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

// Migrasi data jadwal kunjungan (Batch 5)
const migrateVisit = (v) => {
  if (!v || typeof v !== 'object') return null;
  const todayStr = getLocalDateString();
  const name = String(v.name || v.target || v.title || '').trim();
  const agenda = String(v.agenda || v.title || '').trim();

  let recType = 'none';
  if (typeof v.recurrence === 'string') {
    recType = ['none', 'weekly', 'biweekly'].includes(v.recurrence) ? v.recurrence : 'none';
  } else if (v.recurrence && typeof v.recurrence === 'object') {
    recType = ['none', 'weekly', 'biweekly'].includes(v.recurrence.type) ? v.recurrence.type : 'none';
  }

  const recObj = {
    type: recType,
    startDate: v.recurrence?.startDate ? String(v.recurrence.startDate).slice(0, 10) : (v.date || todayStr),
    endDate: v.recurrence?.endDate ? String(v.recurrence.endDate).slice(0, 10) : null,
    dayOfWeek: v.recurrence?.dayOfWeek != null ? Number(v.recurrence.dayOfWeek) : null,
    intervalWeeks: v.recurrence?.intervalWeeks || (recType === 'biweekly' ? 2 : 1),
  };

  return {
    id: v.id || uid('vst-'),
    name: name || agenda,
    target: name || agenda,
    agenda: agenda || name,
    title: agenda || name,
    type: v.type || 'supplier', // 'supplier' | 'pengiriman' | 'keperluan_usaha' | 'lainnya'
    date: v.date ? String(v.date).slice(0, 10) : todayStr,
    time: v.time ? String(v.time).trim() : '',
    location: v.location ? String(v.location).trim() : '',
    notes: v.notes ? String(v.notes).trim() : '',
    status: v.status || 'scheduled', // 'scheduled' | 'completed' | 'cancelled'
    cancelReason: v.cancelReason ? String(v.cancelReason).trim() : '',
    recurrence: recObj,
    completion: v.completion && typeof v.completion === 'object' ? {
      actualDate: v.completion.actualDate ? String(v.completion.actualDate).slice(0, 10) : '',
      completedAt: v.completion.completedAt || '',
      outcome: v.completion.outcome ? String(v.completion.outcome).trim() : '',
      notes: v.completion.notes ? String(v.completion.notes).trim() : '',
      followUp: v.completion.followUp ? String(v.completion.followUp).trim() : '',
      nextVisitDate: v.completion.nextVisitDate ? String(v.completion.nextVisitDate).slice(0, 10) : '',
    } : null,
    createdAt: v.createdAt || new Date().toISOString(),
    updatedAt: v.updatedAt || v.createdAt || new Date().toISOString(),
  };
};

// Migrasi data transaksi layanan digital (Batch 6)
const migrateDigitalTransaction = (t) => {
  if (!t || typeof t !== 'object') return null;
  const fin = calculateDigitalProfit(t);
  const status = ['completed', 'pending', 'failed', 'cancelled'].includes(t.status)
    ? t.status
    : 'completed';
  return {
    id: t.id || uid('dtr-'),
    type: t.type || 'pulsa',
    customTypeName: String(t.customTypeName || '').trim(),
    provider: String(t.provider || '').trim(),
    destination: String(t.destination || '').trim(),
    serviceAmount: fin.serviceAmount,
    capital: fin.capital,
    providerFee: fin.providerFee,
    customerAdminFee: fin.customerAdminFee,
    customerPaid: fin.customerPaid,
    paymentMethod: ['cash', 'transfer', 'qris', 'ewallet', 'lainnya'].includes(t.paymentMethod)
      ? t.paymentMethod
      : 'cash',
    status,
    notes: String(t.notes || '').trim(),
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
    completedAt:
      t.completedAt ||
      (status === 'completed' ? t.updatedAt || t.createdAt || new Date().toISOString() : null),
  };
};

/* ---------- Operator Warung Manual & Konteks ---------- */
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
  const [visits, setVisits] = useState(() =>
    (load('visits', seed.visits || []) || []).map(migrateVisit).filter(Boolean)
  );
  const [digitalTransactions, setDigitalTransactions] = useState(() =>
    (load('digital_transactions', seed.digitalTransactions || []) || [])
      .map(migrateDigitalTransaction)
      .filter(Boolean)
  );
  const [activityLogs, setActivityLogs] = useState(() => load('activityLogs', []));
  const [readNotifIds, setReadNotifIds] = useState(() => load('readNotifIds', []));
  const [operators, setOperators] = useState(() => {
    const loaded = load('operators', null);
    if (Array.isArray(loaded) && loaded.length > 0) return loaded;
    return DEFAULT_OPERATORS;
  });
  const [activeOperatorId, setActiveOperatorId] = useState(() => load('active_operator_id', 'op-ainie'));
  const [toasts, setToasts] = useState([]);
  const completedRef = useRef(new Set());

  /* ---------- Toast Notification Helpers ---------- */
  const pushToast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------- Storage Health Status (Batch 3) ---------- */
  const [storageStatus, setStorageStatus] = useState(getStorageHealth);
  useEffect(() => {
    return subscribeStorageHealth((err) => {
      setStorageStatus({ ok: !err, lastError: err });
      if (err) {
        pushToast(err.message, 'error');
      }
    });
  }, [pushToast]);

  // Akses autentikasi pemilik warung secara aman (Fase 3A)
  const authContext = useContext(AuthContext);
  const ownerUid = authContext?.ownerUid || null;

  // Siklus hidup Firestore Sync Engine (Fase 3A: Pilot Toko Pemasok)
  useEffect(() => {
    if (ownerUid) {
      startSyncEngine({ ownerUid });
    } else {
      stopSyncEngine();
    }
    return () => {
      stopSyncEngine();
    };
  }, [ownerUid]);

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
  useEffect(() => save('operators', operators), [operators]);
  useEffect(() => save('active_operator_id', activeOperatorId), [activeOperatorId]);
  useEffect(() => save('visits', visits), [visits]);
  useEffect(() => save('digital_transactions', digitalTransactions), [digitalTransactions]);

  const activeOperator = useMemo(() => {
    const list = Array.isArray(operators) ? operators : DEFAULT_OPERATORS;
    const found = list.find((o) => o.id === activeOperatorId && o.status === 'aktif');
    if (found) return found;
    const firstActive = list.find((o) => o.status === 'aktif');
    return firstActive || { id: 'op-default', name: 'Operator Warung', status: 'aktif' };
  }, [operators, activeOperatorId]);

  const addActivityLog = useCallback(
    ({ title, desc, timestamp, type, operator }) => {
      const log = {
        id: uid('act-'),
        title,
        desc,
        timestamp: timestamp || new Date().toISOString(),
        type: type || 'info',
        operator: operator || { operatorId: activeOperator.id, operatorName: activeOperator.name },
      };
      setActivityLogs((prev) => [log, ...prev].slice(0, 100));
    },
    [activeOperator]
  );

  const addOperator = useCallback((data) => {
    const name = String(data?.name || '').trim();
    if (!name) return { ok: false, reason: 'Nama operator wajib diisi.' };
    const newOp = {
      id: uid('op-'),
      name,
      status: 'aktif',
      createdAt: new Date().toISOString(),
    };
    setOperators((prev) => [...(Array.isArray(prev) ? prev : []), newOp]);
    return { ok: true, operator: newOp };
  }, []);

  const updateOperator = useCallback((id, patch) => {
    if (!id) return { ok: false, reason: 'ID operator tidak valid.' };
    setOperators((prev) =>
      (Array.isArray(prev) ? prev : []).map((o) => {
        if (o.id !== id) return o;
        const name = patch.name !== undefined ? String(patch.name).trim() : o.name;
        const status = patch.status !== undefined ? patch.status : o.status;
        return {
          ...o,
          name: name || o.name,
          status: status || o.status,
          updatedAt: new Date().toISOString(),
        };
      })
    );
    return { ok: true };
  }, []);

  const toggleOperatorStatus = useCallback(
    (id) => {
      if (!id) return;
      setOperators((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const target = list.find((o) => o.id === id);
        if (!target) return list;
        const nextStatus = target.status === 'aktif' ? 'nonaktif' : 'aktif';
        // Minimal harus ada 1 operator berstatus aktif
        if (nextStatus === 'nonaktif') {
          const activeCount = list.filter((o) => o.status === 'aktif').length;
          if (activeCount <= 1) {
            pushToast('Minimal harus ada 1 operator warung yang berstatus aktif.', 'warning');
            return list;
          }
        }
        return list.map((o) =>
          o.id === id ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o
        );
      });
    },
    [pushToast]
  );

  /* ---------- helper ---------- */
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
      if (e.reset) continue;
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
      // PERBAIKAN 2.1: Upsert murni tanpa menghapus harga barang lain pada toko ini
      const next = prev.map((item) => ({ ...item }));
      for (const e of entries || []) {
        if (e.reset || Number(e.price) <= 0) {
          // Hapus harga khusus untuk barang ini (kembali ke harga master)
          const idx = next.findIndex(
            (x) => x.storeId === storeId && x.productId === e.productId && x.unitId === e.unitId
          );
          if (idx >= 0) {
            next.splice(idx, 1);
          }
          continue;
        }

        const price = round2(Number(e.price) || 0);
        if (!(price > 0)) continue;
        const found = next.find(
          (x) => x.storeId === storeId && x.productId === e.productId && x.unitId === e.unitId
        );
        if (found) {
          found.price = price;
          found.updatedAt = now;
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

  const resetStorePrice = useCallback((storeId, productId, unitId) => {
    setStorePrices((prev) =>
      prev.filter(
        (x) => !(x.storeId === storeId && x.productId === productId && x.unitId === unitId)
      )
    );
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

  /* ---------- Toko (Suppliers / Pemasok) ---------- */
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
      const nowIso = new Date().toISOString();
      const store = {
        id: uid('st-'),
        name: trimmed,
        phone: String(phone).trim(),
        address: String(address).trim(),
        note: String(note).trim(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      setStores((prev) => [...prev, store]);
      addActivityLog({
        title: 'Toko Pemasok Ditambahkan',
        desc: `Toko “${store.name}” berhasil didaftarkan`,
        type: 'store_add',
      });

      // FASE 3A: Enqueue ke Offline Queue & Picu Sinkronisasi
      if (ownerUid) {
        enqueueOperation({
          operationType: 'CREATE',
          entityType: 'suppliers',
          entityId: store.id,
          payload: store,
          ownerUid,
          operatorId: activeOperator.id,
          operatorName: activeOperator.name,
        }).then(() => {
          triggerSyncNow({ ownerUid });
        }).catch((err) => {
          console.error('[Sync] Gagal enqueue create supplier:', err);
        });
      }

      return store;
    },
    [stores, addActivityLog, ownerUid, activeOperator]
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
      const nowIso = new Date().toISOString();
      let updatedStore = null;
      setStores((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          updatedStore = {
            ...s,
            name: trimmed,
            phone: isObj && input.phone !== undefined ? String(input.phone).trim() : s.phone || '',
            address: isObj && input.address !== undefined ? String(input.address).trim() : s.address || '',
            note: isObj && input.note !== undefined ? String(input.note).trim() : s.note || '',
            updatedAt: nowIso,
          };
          return updatedStore;
        })
      );
      addActivityLog({
        title: 'Toko Pemasok Diperbarui',
        desc: `Data toko “${trimmed}” berhasil diperbarui`,
        type: 'store_edit',
      });

      // FASE 3A: Enqueue ke Offline Queue & Picu Sinkronisasi
      if (ownerUid && updatedStore) {
        enqueueOperation({
          operationType: 'UPDATE',
          entityType: 'suppliers',
          entityId: id,
          payload: updatedStore,
          ownerUid,
          operatorId: activeOperator.id,
          operatorName: activeOperator.name,
        }).then(() => {
          triggerSyncNow({ ownerUid });
        }).catch((err) => {
          console.error('[Sync] Gagal enqueue update supplier:', err);
        });
      }

      return { ok: true, reason: '' };
    },
    [stores, addActivityLog, ownerUid, activeOperator]
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

      // FASE 3A: Enqueue ke Offline Queue & Picu Sinkronisasi
      if (ownerUid && target) {
        enqueueOperation({
          operationType: 'DELETE',
          entityType: 'suppliers',
          entityId: id,
          payload: { id, name: target.name },
          ownerUid,
          operatorId: activeOperator.id,
          operatorName: activeOperator.name,
        }).then(() => {
          triggerSyncNow({ ownerUid });
        }).catch((err) => {
          console.error('[Sync] Gagal enqueue delete supplier:', err);
        });
      }

      return { ok: true };
    },
    [orders, stores, addActivityLog, ownerUid, activeOperator]
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
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          const merged = { ...p, ...patch, id: p.id }; // ID dipertahankan mutlak
          // Pastikan daftar satuan tetap valid dan memiliki satuan dasar factor 1
          if (Array.isArray(merged.units) && merged.units.length > 0) {
            const hasBase = merged.units.some((u) => Number(u?.factor) === 1);
            if (!hasBase && merged.units[0]) {
              merged.units = [{ ...merged.units[0], factor: 1 }, ...merged.units.slice(1)];
            }
          }
          return merged;
        })
      );
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

      const hasReceivedAny = (target.items || []).some((it) => (Number(it.receivedQuantity) || 0) > 0);
      const allReceived =
        (target.items || []).length > 0 &&
        (target.items || []).every((it) => (Number(it.receivedQuantity) || 0) >= Number(it.quantity || 0));
      if (allReceived) {
        return { ok: false, reason: 'Seluruh barang pada pesanan ini sudah diterima.' };
      }

      const trimmedReason = String(reason || '').trim() || 'Dibatalkan oleh pengguna';
      const cancelTime = new Date().toISOString();

      // Tandai sisa barang yang belum terkirim sebagai dibatalkan, pertahankan yang sudah diterima
      const nextItems = (target.items || []).map((it) => {
        const rec = Number(it.receivedQuantity) || 0;
        const remaining = round2(Math.max(0, Number(it.quantity || 0) - rec));
        return {
          ...it,
          cancelledRemaining: remaining,
        };
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                items: nextItems,
                status: 'batal',
                cancelReason: trimmedReason,
                cancelledAt: cancelTime,
                updatedAt: cancelTime,
              }
            : o
        )
      );

      const storeName = storeById(target.storeId)?.name || 'toko pemasok';
      addActivityLog({
        title: 'Pesanan Dibatalkan',
        desc: hasReceivedAny
          ? `Pesanan ${orderId} (${storeName}) dibatalkan untuk sisa barang yang belum dikirim: ${trimmedReason}. Stok barang yang telah diterima tetap tersimpan aman di inventaris.`
          : `Pesanan ${orderId} (${storeName}) dibatalkan: ${trimmedReason}. Tidak ada perubahan stok warung.`,
        type: 'order_cancel',
      });

      return { ok: true, hasPartialReceipts: hasReceivedAny };
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

      // Cegah duplikasi data kekurangan jika fungsi dipanggil ulang untuk pesanan yang sama
      if (newShortages.length > 0) {
        setShortages((prev) => {
          let updated = [...prev];
          for (const ns of newShortages) {
            const existingIdx = updated.findIndex(
              (s) => s.orderId === ns.orderId && s.productId === ns.productId && s.status !== 'terpenuhi'
            );
            if (existingIdx >= 0) {
              const ex = updated[existingIdx];
              updated[existingIdx] = {
                ...ex,
                quantity: ns.quantity,
                initialQuantity: ns.initialQuantity,
                statusNote: ns.statusNote,
                updatedAt: now,
              };
            } else {
              updated.unshift(ns);
            }
          }
          return updated;
        });
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
        shortagesCount: newShortages.length,
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
    if (!data || !data.productId) {
      return { ok: false, reason: 'ID barang wajib disertakan.' };
    }
    const product = products.find((p) => p.id === data.productId);
    if (!product) {
      return { ok: false, reason: 'Barang tidak ditemukan dalam inventaris warung.' };
    }
    const unit = (product.units || []).find((x) => x.id === data.unitId) || product.units[0];
    const rawQty = Number(data.quantity);
    if (isNaN(rawQty)) {
      return { ok: false, reason: 'Jumlah kuantitas harus berupa angka valid.' };
    }

    const factor = Number(unit ? unit.factor : 1) || 1;
    const stock = stocks.find((s) => s.productId === data.productId);
    const beforeBase = stock ? Number(stock.quantity) || 0 : 0;

    let afterBase = beforeBase;
    const noteTrimmed = String(data.note || '').trim();

    if (type === 'masuk') {
      if (rawQty <= 0) {
        return { ok: false, reason: 'Jumlah penambahan barang masuk harus lebih dari 0.' };
      }
      const baseAmount = round2(rawQty * factor);
      afterBase = round2(beforeBase + baseAmount);
    } else if (type === 'keluar') {
      if (rawQty <= 0) {
        return { ok: false, reason: 'Jumlah pengurangan barang keluar harus lebih dari 0.' };
      }
      const baseAmount = round2(rawQty * factor);
      if (baseAmount > beforeBase) {
        return {
          ok: false,
          reason: `Pengurangan stok (${formatQty(rawQty)} ${unit?.name || 'satuan'} = ${formatQty(baseAmount)} ${baseNameOf(product)}) melebihi stok yang tersedia (${formatQty(beforeBase)} ${baseNameOf(product)}). Pengurangan ditolak demi menjaga keakuratan fisik stok.`,
        };
      }
      afterBase = round2(beforeBase - baseAmount);
    } else if (type === 'adjust') {
      if (rawQty < 0) {
        return { ok: false, reason: 'Jumlah penyesuaian fisik stok tidak boleh bernilai negatif.' };
      }
      if (!noteTrimmed) {
        return { ok: false, reason: 'Alasan penyesuaian fisik stok wajib diisi.' };
      }
      afterBase = round2(rawQty * factor);
      if (round2(afterBase) === round2(beforeBase)) {
        return { ok: false, reason: 'Jumlah penyesuaian fisik sama dengan stok tercatat saat ini. Tidak ada perubahan stok.' };
      }
    } else {
      return { ok: false, reason: `Tipe mutasi “${type}” tidak dikenal.` };
    }

    const diffBase = round2(afterBase - beforeBase);
    const now = data.timestamp || new Date().toISOString();

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
      diffBase,
      ref: data.ref || '',
      note: noteTrimmed,
      timestamp: now,
    };
    setMovements((prev) => [movement, ...prev]);

    if (type === 'masuk') {
      addActivityLog({
        title: 'Stok Barang Bertambah',
        desc: `${product.name}: +${formatQty(diffBase)} ${movement.unitBaseName}${noteTrimmed ? ` (${noteTrimmed})` : ''}`,
        type: 'stock_in',
        timestamp: now,
      });
    } else if (type === 'keluar') {
      addActivityLog({
        title: 'Stok Barang Berkurang',
        desc: `${product.name}: ${formatQty(diffBase)} ${movement.unitBaseName}${noteTrimmed ? ` (${noteTrimmed})` : ''}`,
        type: 'stock_out',
        timestamp: now,
      });
    } else if (type === 'adjust') {
      addActivityLog({
        title: 'Penyesuaian Stok Dilakukan',
        desc: `${product.name}: ${formatQty(beforeBase)} → ${formatQty(afterBase)} ${movement.unitBaseName}${noteTrimmed ? ` (${noteTrimmed})` : ''}`,
        type: 'stock_adjust',
        timestamp: now,
      });
    }

    return { ok: true, movement, stockQuantity: afterBase };
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

      const now = date
        ? (date.includes('T') ? date : localDateToISO(date))
        : new Date().toISOString();
      const priceNum = round2(Number(actualPrice) || 0);
      const isRec = Boolean(isReceived);
      const receivedQty = isRec ? qtyNum : 0;

      // Inisialisasi tahapan penerimaan (receipts) untuk mendukung penerimaan bertahap
      const initialReceipts =
        isRec && receivedQty > 0
          ? [
              {
                id: uid('rpr-'),
                receivedQuantity: receivedQty,
                date: now,
                note: note ? String(note).trim() : '',
              },
            ]
          : [];

      // Jika langsung diterima, masukkan ke stok warung dan catat mutasi penerimaan
      if (isRec && receivedQty > 0) {
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
          title: 'Pembelian Ulang Selesai Diterima',
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
        receipts: initialReceipts,
        actualPrice: priceNum,
        isReceived: isRec,
        status: isRec ? 'selesai' : 'menunggu',
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
            allReps.reduce((acc, r) => acc + (Number(r.receivedQuantity) || 0), 0)
          );
          const remainingQty = round2(Math.max(0, initial - totalRec));

          const newStatus = remainingQty <= 0 ? 'terpenuhi' : 'sudah';
          const historyEntry = {
            status: newStatus,
            timestamp: now,
            note: isRec
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

      const currentRec = Number(rep.receivedQuantity) || 0;
      const sisa = round2(Math.max(0, Number(rep.quantity) - currentRec));
      if (sisa <= 0) {
        return { ok: false, reason: 'Barang untuk pembelian ulang ini sudah selesai diterima seluruhnya.' };
      }

      const recQty = receivedQuantity != null ? round2(Number(receivedQuantity) || 0) : sisa;
      if (recQty <= 0) return { ok: false, reason: 'Jumlah yang diterima harus lebih dari 0.' };
      if (recQty > round2(sisa + 1e-6)) {
        return {
          ok: false,
          reason: `Jumlah yang diterima (${formatQty(recQty)} ${target.unit}) melebihi sisa pembelian ulang yang belum datang (${formatQty(sisa)} ${target.unit}).`,
        };
      }

      const now = date
        ? (date.includes('T') ? date : localDateToISO(date))
        : new Date().toISOString();
      const factor = Number(target.factor) || 1;
      const baseQty = round2(recQty * factor);

      const product = products.find((p) => p.id === target.productId);
      const stock = stocks.find((s) => s.productId === target.productId);
      const beforeBase = stock ? Number(stock.quantity) || 0 : 0;
      const afterBase = round2(beforeBase + baseQty);

      // Mutasi fisik inventaris stok
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

      const newReceipt = {
        id: uid('rpr-'),
        receivedQuantity: recQty,
        date: now,
        note: note ? String(note).trim() : '',
      };

      const newRecQty = round2(currentRec + recQty);
      const isComplete = newRecQty >= rep.quantity;

      const updatedRep = {
        ...rep,
        receipts: [...(rep.receipts || []), newReceipt],
        receivedQuantity: newRecQty,
        isReceived: isComplete,
        status: isComplete ? 'selesai' : 'sebagian',
        receivedAt: now,
        receiveNote: note ? String(note).trim() : rep.receiveNote || '',
      };

      let updatedShortage = null;
      setShortages((prev) =>
        prev.map((s) => {
          if (s.id !== shortageId) return s;
          const initial = s.initialQuantity != null ? Number(s.initialQuantity) : Number(s.quantity) || 0;
          const updatedReps = (s.repurchases || []).map((r) =>
            r.id === repurchaseId ? updatedRep : r
          );
          const totalRec = round2(
            updatedReps.reduce((acc, r) => acc + (Number(r.receivedQuantity) || 0), 0)
          );
          const remainingQty = round2(Math.max(0, initial - totalRec));
          const newStatus = remainingQty <= 0 ? 'terpenuhi' : 'sudah';

          const historyEntry = {
            status: newStatus,
            timestamp: now,
            note: `Penerimaan bertahap pembelian ulang: +${formatQty(recQty)} ${s.unit} tiba & masuk stok (${formatQty(newRecQty)}/${formatQty(rep.quantity)} diterima)`,
          };

          updatedShortage = {
            ...s,
            initialQuantity: initial,
            quantity: remainingQty,
            status: newStatus,
            statusChangedAt: now,
            repurchases: updatedReps,
            statusHistory: [...(s.statusHistory || []), historyEntry],
          };
          return updatedShortage;
        })
      );

      addActivityLog({
        title: isComplete ? 'Pembelian Ulang Selesai Diterima' : 'Penerimaan Pembelian Ulang Sebagian',
        desc: `+${formatQty(recQty)} ${target.unit} “${target.productNameSnapshot}” telah tiba & masuk stok (${formatQty(newRecQty)} dari ${formatQty(rep.quantity)} diterima)`,
        type: isComplete ? 'repurchase_received' : 'repurchase_partial',
      });

      return {
        ok: true,
        repurchase: updatedRep,
        shortage: updatedShortage,
        isComplete,
        receivedQuantity: recQty,
        totalReceived: newRecQty,
      };
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

  /* ---------- Kunjungan (Visits & Recurrence) ---------- */

  // Helper untuk menentukan status dinamis suatu kunjungan
  const getVisitComputedStatus = useCallback((visit) => {
    if (!visit) return 'scheduled';
    if (visit.status === 'completed') return 'completed';
    if (visit.status === 'cancelled') return 'cancelled';
    const todayStr = getLocalDateString();
    const visitDate = visit.date ? String(visit.date).slice(0, 10) : '';
    if (visitDate < todayStr) return 'overdue';
    if (visitDate === todayStr) return 'today';
    return 'upcoming';
  }, []);

  // Kunjungan hari ini (terjadwal untuk tanggal hari ini)
  const todayVisits = useMemo(() => {
    const todayStr = getLocalDateString();
    return visits.filter(
      (v) => v.status === 'scheduled' && String(v.date).slice(0, 10) === todayStr
    );
  }, [visits]);

  // Kunjungan terlambat (terjadwal tapi tanggalnya sudah lewat)
  const overdueVisits = useMemo(() => {
    const todayStr = getLocalDateString();
    return visits.filter(
      (v) => v.status === 'scheduled' && String(v.date).slice(0, 10) < todayStr
    );
  }, [visits]);

  // Kunjungan mendatang (terjadwal untuk tanggal di masa depan)
  const upcomingVisits = useMemo(() => {
    const todayStr = getLocalDateString();
    return visits.filter(
      (v) => v.status === 'scheduled' && String(v.date).slice(0, 10) > todayStr
    );
  }, [visits]);

  // Kunjungan yang telah selesai
  const completedVisits = useMemo(() => {
    return visits.filter((v) => v.status === 'completed');
  }, [visits]);

  // Kunjungan yang dibatalkan
  const cancelledVisits = useMemo(() => {
    return visits.filter((v) => v.status === 'cancelled');
  }, [visits]);

  // Pengingat aktif (gabungan kunjungan hari ini dan kunjungan yang terlambat)
  const visitReminders = useMemo(() => {
    return [...todayVisits, ...overdueVisits];
  }, [todayVisits, overdueVisits]);

  // Buat jadwal kunjungan baru
  const createVisit = useCallback(
    (data) => {
      const name = String(data?.name || data?.target || data?.title || '').trim();
      const agenda = String(data?.agenda || data?.title || '').trim();
      if (!name && !agenda) {
        return { ok: false, reason: 'Nama pihak / agenda kunjungan wajib diisi.' };
      }
      const rawDate = data?.date ? String(data.date).slice(0, 10) : '';
      if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return { ok: false, reason: 'Tanggal kunjungan wajib diisi dengan format YYYY-MM-DD.' };
      }

      let recType = 'none';
      if (typeof data?.recurrence === 'string') {
        recType = ['none', 'weekly', 'biweekly'].includes(data.recurrence) ? data.recurrence : 'none';
      } else if (data?.recurrence?.type) {
        recType = ['none', 'weekly', 'biweekly'].includes(data.recurrence.type) ? data.recurrence.type : 'none';
      }

      const recurrence = {
        type: recType,
        startDate: data?.recurrence?.startDate ? String(data.recurrence.startDate).slice(0, 10) : rawDate,
        endDate: data?.recurrence?.endDate ? String(data.recurrence.endDate).slice(0, 10) : null,
        dayOfWeek: data?.recurrence?.dayOfWeek != null ? Number(data.recurrence.dayOfWeek) : null,
        intervalWeeks: recType === 'biweekly' ? 2 : recType === 'weekly' ? 1 : 0,
      };

      const now = new Date().toISOString();
      const newVisit = {
        id: data.id || uid('vst-'),
        name: name || agenda,
        target: name || agenda,
        agenda: agenda || name,
        title: agenda || name,
        type: data.type || 'supplier',
        date: rawDate,
        time: data.time ? String(data.time).trim() : '',
        location: data.location ? String(data.location).trim() : '',
        notes: data.notes ? String(data.notes).trim() : '',
        status: 'scheduled',
        cancelReason: '',
        recurrence,
        completion: null,
        createdAt: now,
        updatedAt: now,
      };

      setVisits((prev) => [newVisit, ...prev]);

      addActivityLog({
        title: 'Jadwal Kunjungan Dibuat',
        desc: `${newVisit.name} (${newVisit.date}${newVisit.time ? ' ' + newVisit.time : ''})${recType !== 'none' ? ' • Berulang ' + (recType === 'weekly' ? 'Mingguan' : '2 Mingguan') : ''}`,
        type: 'visit_created',
        timestamp: now,
      });

      pushToast(`Jadwal kunjungan “${newVisit.name}” berhasil ditambahkan`);
      return { ok: true, visit: newVisit };
    },
    [addActivityLog, pushToast]
  );

  // Edit / perbarui rincian jadwal kunjungan
  const updateVisit = useCallback(
    (id, updates) => {
      const target = visits.find((v) => v.id === id);
      if (!target) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };

      if (updates.name !== undefined) {
        const name = String(updates.name).trim();
        if (!name) return { ok: false, reason: 'Nama pihak / kunjungan tidak boleh kosong.' };
      }
      if (updates.date !== undefined) {
        const d = String(updates.date).slice(0, 10);
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          return { ok: false, reason: 'Format tanggal kunjungan tidak valid.' };
        }
      }

      const now = new Date().toISOString();
      let updatedVisit = null;

      setVisits((prev) =>
        prev.map((v) => {
          if (v.id !== id) return v;
          updatedVisit = {
            ...v,
            ...updates,
            name: updates.name !== undefined ? String(updates.name).trim() : v.name,
            date: updates.date !== undefined ? String(updates.date).slice(0, 10) : v.date,
            time: updates.time !== undefined ? String(updates.time).trim() : v.time,
            location: updates.location !== undefined ? String(updates.location).trim() : v.location,
            agenda: updates.agenda !== undefined ? String(updates.agenda).trim() : v.agenda,
            notes: updates.notes !== undefined ? String(updates.notes).trim() : v.notes,
            type: updates.type || v.type,
            recurrence: updates.recurrence ? { ...v.recurrence, ...updates.recurrence } : v.recurrence,
            updatedAt: now,
          };
          return updatedVisit;
        })
      );

      pushToast(`Jadwal kunjungan “${updatedVisit?.name || target.name}” berhasil diperbarui`);
      return { ok: true, visit: updatedVisit };
    },
    [visits, pushToast]
  );

  // Selesaikan kunjungan & catat hasil kunjungan + otomasi jadwal berikutnya jika berulang
  const completeVisit = useCallback(
    (id, { actualDate, outcome = '', notes = '', followUp = '', nextVisitDate = '' } = {}) => {
      const target = visits.find((v) => v.id === id);
      if (!target) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };
      if (target.status === 'completed') {
        return { ok: false, reason: 'Kunjungan ini sudah diselesaikan sebelumnya.' };
      }

      const now = new Date().toISOString();
      const completion = {
        actualDate: actualDate ? String(actualDate).slice(0, 10) : getLocalDateString(),
        completedAt: now,
        outcome: String(outcome || '').trim(),
        notes: String(notes || '').trim(),
        followUp: String(followUp || '').trim(),
        nextVisitDate: nextVisitDate ? String(nextVisitDate).slice(0, 10) : '',
      };

      // Cek apakah ada jadwal pengulangan otomatis
      const recType = target.recurrence?.type || 'none';
      let nextVisitInstance = null;

      if (recType === 'weekly' || recType === 'biweekly') {
        const intervalDays = recType === 'biweekly' ? 14 : 7;
        const computedNextDate = addDays(target.date, intervalDays);
        const resolvedNextDate = completion.nextVisitDate || computedNextDate;

        const isAllowedByEnd =
          !target.recurrence?.endDate || resolvedNextDate <= target.recurrence.endDate;

        if (isAllowedByEnd) {
          nextVisitInstance = {
            id: uid('vst-'),
            name: target.name,
            type: target.type,
            date: resolvedNextDate,
            time: target.time,
            location: target.location,
            agenda: completion.followUp ? `Tindak Lanjut: ${completion.followUp}` : target.agenda,
            notes: `Jadwal lanjutan (${recType === 'weekly' ? 'Mingguan' : 'Dua Mingguan'}). Hasil sebelumnya: "${completion.outcome || 'Selesai'}"`,
            status: 'scheduled',
            cancelReason: '',
            recurrence: {
              ...target.recurrence,
              startDate: resolvedNextDate,
            },
            completion: null,
            createdAt: now,
            updatedAt: now,
          };
        }
      } else if (completion.nextVisitDate) {
        // Jika tidak berulang tapi pengguna memasukkan nextVisitDate secara manual
        nextVisitInstance = {
          id: uid('vst-'),
          name: target.name,
          type: target.type,
          date: completion.nextVisitDate,
          time: target.time,
          location: target.location,
          agenda: completion.followUp ? `Tindak Lanjut: ${completion.followUp}` : `Kunjungan lanjutan ${target.name}`,
          notes: `Rencana kunjungan berikutnya dari hasil evaluasi: "${completion.outcome || 'Selesai'}"`,
          status: 'scheduled',
          cancelReason: '',
          recurrence: { type: 'none', startDate: completion.nextVisitDate, endDate: null },
          completion: null,
          createdAt: now,
          updatedAt: now,
        };
      }

      setVisits((prev) => {
        const updatedList = prev.map((v) => {
          if (v.id !== id) return v;
          return {
            ...v,
            status: 'completed',
            completion,
            updatedAt: now,
          };
        });

        if (nextVisitInstance) {
          return [nextVisitInstance, ...updatedList];
        }
        return updatedList;
      });

      addActivityLog({
        title: 'Kunjungan Telah Selesai',
        desc: `${target.name}: ${completion.outcome || 'Kunjungan telah dilaksanakan.'}${nextVisitInstance ? ` (Jadwal berikutnya: ${nextVisitInstance.date})` : ''}`,
        type: 'visit_completed',
        timestamp: now,
      });

      pushToast(`Kunjungan “${target.name}” telah ditandai selesai`);
      return { ok: true, completedId: id, nextVisit: nextVisitInstance };
    },
    [visits, addActivityLog, pushToast]
  );

  // Batalkan kunjungan
  const cancelVisit = useCallback(
    (id, reason = '') => {
      const target = visits.find((v) => v.id === id);
      if (!target) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };

      const now = new Date().toISOString();
      setVisits((prev) =>
        prev.map((v) => {
          if (v.id !== id) return v;
          return {
            ...v,
            status: 'cancelled',
            cancelReason: String(reason || 'Dibatalkan').trim(),
            updatedAt: now,
          };
        })
      );

      addActivityLog({
        title: 'Kunjungan Dibatalkan',
        desc: `${target.name}: ${reason || 'Dibatalkan oleh pengguna.'}`,
        type: 'visit_cancelled',
        timestamp: now,
      });

      pushToast(`Kunjungan “${target.name}” telah dibatalkan`);
      return { ok: true };
    },
    [visits, addActivityLog, pushToast]
  );

  // Jadwalkan ulang (Reschedule)
  const rescheduleVisit = useCallback(
    (id, { newDate, newTime, reason = '' } = {}) => {
      const target = visits.find((v) => v.id === id);
      if (!target) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };

      const d = String(newDate || '').slice(0, 10);
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return { ok: false, reason: 'Tanggal penjadwalan ulang tidak valid.' };
      }

      const now = new Date().toISOString();
      const oldDate = target.date;
      const rescheduleNote = reason
        ? `Dijadwalkan ulang dari ${oldDate}: ${reason}`
        : `Dijadwalkan ulang dari ${oldDate}`;

      setVisits((prev) =>
        prev.map((v) => {
          if (v.id !== id) return v;
          return {
            ...v,
            date: d,
            time: newTime !== undefined ? String(newTime).trim() : v.time,
            notes: v.notes ? `${v.notes} • ${rescheduleNote}` : rescheduleNote,
            status: 'scheduled',
            updatedAt: now,
          };
        })
      );

      addActivityLog({
        title: 'Kunjungan Dijadwalkan Ulang',
        desc: `${target.name}: ${oldDate} → ${d}${reason ? ` (${reason})` : ''}`,
        type: 'visit_rescheduled',
        timestamp: now,
      });

      pushToast(`Kunjungan “${target.name}” berhasil dijadwalkan ulang ke ${d}`);
      return { ok: true, newDate: d };
    },
    [visits, addActivityLog, pushToast]
  );

  // Hapus kunjungan secara permanen
  const deleteVisit = useCallback(
    (id) => {
      const target = visits.find((v) => v.id === id);
      if (!target) return { ok: false, reason: 'Kunjungan tidak ditemukan.' };

      setVisits((prev) => prev.filter((v) => v.id !== id));

      addActivityLog({
        title: 'Kunjungan Dihapus',
        desc: `Jadwal kunjungan ${target.name} (${target.date}) telah dihapus.`,
        type: 'visit_deleted',
        timestamp: new Date().toISOString(),
      });

      pushToast(`Jadwal kunjungan “${target.name}” telah dihapus`);
      return { ok: true };
    },
    [visits, addActivityLog, pushToast]
  );

  /* ---------- Catatan Transaksi Layanan Digital (Batch 6) ---------- */

  // Ringkasan metrik keuangan seluruh transaksi digital
  const digitalSummary = useMemo(() => {
    return summarizeDigitalTransactions(digitalTransactions);
  }, [digitalTransactions]);

  // Transaksi digital hari ini
  const todayDigitalTransactions = useMemo(() => {
    const todayStr = getLocalDateString();
    return digitalTransactions.filter(
      (t) => (t.createdAt || '').slice(0, 10) === todayStr
    );
  }, [digitalTransactions]);

  // Ringkasan keuangan transaksi digital hari ini
  const todayDigitalSummary = useMemo(() => {
    return summarizeDigitalTransactions(todayDigitalTransactions);
  }, [todayDigitalTransactions]);

  // Transaksi digital yang berstatus pending (menunggu diproses/selesai)
  const pendingDigitalTransactions = useMemo(() => {
    return digitalTransactions.filter((t) => t.status === 'pending');
  }, [digitalTransactions]);

  // Buat transaksi digital baru
  const createDigitalTransaction = useCallback(
    (data) => {
      const val = validateDigitalTransaction(data);
      if (!val.ok) {
        return { ok: false, reason: val.reason };
      }

      const fin = calculateDigitalProfit(data);
      const now = new Date().toISOString();
      const status = ['completed', 'pending', 'failed', 'cancelled'].includes(data.status)
        ? data.status
        : 'completed';

      const newTx = {
        id: data.id || uid('dtr-'),
        type: data.type || 'pulsa',
        customTypeName: String(data.customTypeName || '').trim(),
        provider: String(data.provider || '').trim(),
        destination: String(data.destination || '').trim(),
        serviceAmount: fin.serviceAmount,
        capital: fin.capital,
        providerFee: fin.providerFee,
        customerAdminFee: fin.customerAdminFee,
        customerPaid: fin.customerPaid,
        paymentMethod: ['cash', 'transfer', 'qris', 'ewallet', 'lainnya'].includes(data.paymentMethod)
          ? data.paymentMethod
          : 'cash',
        status,
        notes: String(data.notes || '').trim(),
        createdAt: data.createdAt || now,
        updatedAt: now,
        completedAt: status === 'completed' ? now : null,
      };

      setDigitalTransactions((prev) => [newTx, ...prev]);

      addActivityLog({
        title: 'Transaksi Digital Dicatat',
        desc: `${newTx.provider || newTx.type} ${rupiah(newTx.serviceAmount)} • ${status === 'completed' ? 'Selesai (Laba ' + rupiah(fin.profit) + ')' : status}`,
        type: 'digital_tx_created',
        timestamp: now,
      });

      pushToast(`Transaksi digital ${newTx.provider || newTx.type} berhasil dicatat`);
      return { ok: true, transaction: newTx };
    },
    [addActivityLog, pushToast]
  );

  // Perbarui transaksi digital
  const updateDigitalTransaction = useCallback(
    (id, updates) => {
      const target = digitalTransactions.find((t) => t.id === id);
      if (!target) return { ok: false, reason: 'Transaksi digital tidak ditemukan.' };

      const merged = { ...target, ...updates };
      const val = validateDigitalTransaction(merged);
      if (!val.ok) {
        return { ok: false, reason: val.reason };
      }

      const fin = calculateDigitalProfit(merged);
      const now = new Date().toISOString();
      const newStatus = updates.status || target.status;
      const completedAt =
        newStatus === 'completed'
          ? target.completedAt || now
          : null;

      let updatedTx = null;
      setDigitalTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          updatedTx = {
            ...t,
            ...updates,
            serviceAmount: fin.serviceAmount,
            capital: fin.capital,
            providerFee: fin.providerFee,
            customerAdminFee: fin.customerAdminFee,
            customerPaid: fin.customerPaid,
            status: newStatus,
            updatedAt: now,
            completedAt,
          };
          return updatedTx;
        })
      );

      pushToast(`Transaksi digital berhasil diperbarui`);
      return { ok: true, transaction: updatedTx };
    },
    [digitalTransactions, pushToast]
  );

  // Hapus transaksi digital
  const deleteDigitalTransaction = useCallback(
    (id) => {
      const target = digitalTransactions.find((t) => t.id === id);
      if (!target) return { ok: false, reason: 'Transaksi digital tidak ditemukan.' };

      setDigitalTransactions((prev) => prev.filter((t) => t.id !== id));

      addActivityLog({
        title: 'Transaksi Digital Dihapus',
        desc: `Transaksi ${target.provider || target.type} ${rupiah(target.serviceAmount)} dihapus.`,
        type: 'digital_tx_deleted',
        timestamp: new Date().toISOString(),
      });

      pushToast(`Transaksi digital berhasil dihapus`);
      return { ok: true };
    },
    [digitalTransactions, addActivityLog, pushToast]
  );

  // Ubah status transaksi digital (completed, pending, failed, cancelled)
  const changeDigitalTransactionStatus = useCallback(
    (id, newStatus, reason = '') => {
      const target = digitalTransactions.find((t) => t.id === id);
      if (!target) return { ok: false, reason: 'Transaksi digital tidak ditemukan.' };
      if (!['completed', 'pending', 'failed', 'cancelled'].includes(newStatus)) {
        return { ok: false, reason: 'Status transaksi tidak valid.' };
      }

      const now = new Date().toISOString();
      const completedAt = newStatus === 'completed' ? target.completedAt || now : null;

      let updatedTx = null;
      setDigitalTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          updatedTx = {
            ...t,
            status: newStatus,
            notes: reason ? `${t.notes ? t.notes + ' • ' : ''}[Status ${newStatus}: ${reason}]` : t.notes,
            updatedAt: now,
            completedAt,
          };
          return updatedTx;
        })
      );

      addActivityLog({
        title: `Status Transaksi Digital: ${newStatus}`,
        desc: `${target.provider || target.type}: status diubah menjadi ${newStatus}.`,
        type: 'digital_tx_status_changed',
        timestamp: now,
      });

      pushToast(`Status transaksi diubah menjadi ${newStatus}`);
      return { ok: true, transaction: updatedTx };
    },
    [digitalTransactions, addActivityLog, pushToast]
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
    setVisits((seed.visits || []).map(migrateVisit).filter(Boolean));
    setDigitalTransactions((seed.digitalTransactions || []).map(migrateDigitalTransaction).filter(Boolean));
    setSettings(seed.settings);
    setActivityLogs([]);
    setReadNotifIds([]);
    setOperators(DEFAULT_OPERATORS);
    setActiveOperatorId('op-ainie');
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
    setVisits([]);
    setDigitalTransactions([]);
    setActivityLogs([]);
    setReadNotifIds([]);
    setOperators(DEFAULT_OPERATORS);
    setActiveOperatorId('op-ainie');
  }, []);

  /* ---------- Cadangan (ekspor & impor) ---------- */
  const buildBackup = useCallback(
    () => {
      const nowIso = new Date().toISOString();
      let storeCarts = {};
      try {
        const rawCarts = localStorage.getItem('wm_v1_store_carts');
        if (rawCarts) storeCarts = JSON.parse(rawCarts);
      } catch (_) {}

      const backupData = {
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
        operators,
        activeOperatorId,
        readNotifIds,
        storeCarts,
        visits,
        digitalTransactions,
      };

      const totalEntities =
        (Array.isArray(stores) ? stores.length : 0) +
        (Array.isArray(products) ? products.length : 0) +
        (Array.isArray(orders) ? orders.length : 0) +
        (Array.isArray(stocks) ? stocks.length : 0) +
        (Array.isArray(movements) ? movements.length : 0) +
        (Array.isArray(shortages) ? shortages.length : 0) +
        (Array.isArray(storePrices) ? storePrices.length : 0) +
        (Array.isArray(priceHistory) ? priceHistory.length : 0) +
        (Array.isArray(operators) ? operators.length : 0);

      const checksum = computeDataChecksum({
        storeCount: stores.length,
        productCount: products.length,
        orderCount: orders.length,
        stockCount: stocks.length,
        storePriceCount: storePrices.length,
        firstStoreId: stores[0]?.id || '',
        firstProductId: products[0]?.id || '',
      });

      return {
        app: 'catatan-warung-madura',
        version: '1.3.0',
        exportedAt: nowIso,
        metadata: {
          schemaVersion: '1.3.0',
          appName: 'Catatan Warung Madura',
          exportedBy: activeOperator?.name || 'Operator Warung',
          operatorId: activeOperatorId,
          totalEntities,
          checksum,
        },
        data: backupData,
      };
    },
    [
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
      operators,
      activeOperatorId,
      readNotifIds,
      activeOperator,
      visits,
      digitalTransactions,
    ]
  );

  const validateBackup = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, valid: false, reason: 'Berkas cadangan tidak valid atau kosong.' };
    }
    const isAppMatch = payload.app === 'catatan-warung-madura' || payload.app === 'warung-madura';
    const d = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    const warnings = [];

    // 1. Validasi Toko Pemasok (stores)
    if (!Array.isArray(d.stores)) {
      return { ok: false, valid: false, reason: 'Data toko pemasok (stores) tidak ditemukan atau tidak berformat array.' };
    }
    const storeIds = new Set();
    const duplicateStoreIds = new Set();
    for (let i = 0; i < d.stores.length; i++) {
      const s = d.stores[i];
      if (!s || typeof s !== 'object' || !s.id || typeof s.name !== 'string' || !s.name.trim()) {
        return {
          ok: false,
          valid: false,
          reason: `Data toko pemasok pada baris #${i + 1} tidak valid (wajib memiliki ID dan nama).`,
        };
      }
      if (storeIds.has(s.id)) {
        duplicateStoreIds.add(s.id);
      }
      storeIds.add(s.id);
    }
    if (duplicateStoreIds.size > 0) {
      warnings.push(`Ditemukan ${duplicateStoreIds.size} ID toko pemasok yang terduplikasi di berkas cadangan.`);
    }

    // 2. Validasi Master Barang (products) & Satuan (units)
    if (!Array.isArray(d.products)) {
      return { ok: false, valid: false, reason: 'Data master barang (products) tidak ditemukan atau tidak berformat array.' };
    }
    const productIds = new Set();
    const duplicateProductIds = new Set();
    for (let i = 0; i < d.products.length; i++) {
      const p = d.products[i];
      if (!p || typeof p !== 'object' || !p.id || typeof p.name !== 'string' || !p.name.trim()) {
        return {
          ok: false,
          valid: false,
          reason: `Data barang pada baris #${i + 1} tidak valid (wajib memiliki ID dan nama).`,
        };
      }
      if (productIds.has(p.id)) {
        duplicateProductIds.add(p.id);
      }
      productIds.add(p.id);

      if (!Array.isArray(p.units) || p.units.length === 0) {
        return {
          ok: false,
          valid: false,
          reason: `Barang “${p.name}” tidak memiliki daftar satuan (units) yang valid.`,
        };
      }
      const hasBaseUnit = p.units.some((u) => Number(u?.factor) === 1);
      if (!hasBaseUnit) {
        return {
          ok: false,
          valid: false,
          reason: `Barang “${p.name}” tidak memiliki satuan dasar dengan faktor konversi 1.`,
        };
      }
    }
    if (duplicateProductIds.size > 0) {
      warnings.push(`Ditemukan ${duplicateProductIds.size} ID barang yang terduplikasi di berkas cadangan.`);
    }

    // 3. Validasi Stok Inventaris (stocks)
    if (d.stocks != null) {
      if (!Array.isArray(d.stocks)) {
        return { ok: false, valid: false, reason: 'Data stok inventaris (stocks) tidak berformat array.' };
      }
      for (let i = 0; i < d.stocks.length; i++) {
        const st = d.stocks[i];
        if (!st || typeof st !== 'object' || !st.productId) {
          return { ok: false, valid: false, reason: `Data stok #${i + 1} tidak memiliki productId yang valid.` };
        }
        const qty = Number(st.quantity);
        if (isNaN(qty) || qty < 0) {
          return {
            ok: false,
            valid: false,
            reason: `Data stok untuk barang ID "${st.productId}" tidak valid atau bernilai negatif (${st.quantity}).`,
          };
        }
        if (!productIds.has(st.productId)) {
          warnings.push(`Stok merujuk ke ID barang "${st.productId}" yang tidak terdaftar dalam master produk.`);
        }
      }
    }

    // 4. Validasi Pesanan (orders)
    if (d.orders != null) {
      if (!Array.isArray(d.orders)) {
        return { ok: false, valid: false, reason: 'Data pesanan (orders) tidak berformat array.' };
      }
      for (let i = 0; i < d.orders.length; i++) {
        const o = d.orders[i];
        if (!o || typeof o !== 'object' || !o.id) {
          return { ok: false, valid: false, reason: `Data pesanan #${i + 1} tidak memiliki ID yang valid.` };
        }
        if (o.storeId && !storeIds.has(o.storeId)) {
          warnings.push(`Pesanan ${o.id} merujuk ke ID toko "${o.storeId}" yang tidak ada dalam daftar toko.`);
        }
        if (!Array.isArray(o.items)) {
          return { ok: false, valid: false, reason: `Pesanan ${o.id} tidak memiliki rincian barang (items) yang valid.` };
        }
        for (const it of o.items) {
          if (!it || typeof it !== 'object' || !it.productId) {
            return { ok: false, valid: false, reason: `Item pada pesanan ${o.id} tidak memiliki productId valid.` };
          }
          if (!productIds.has(it.productId)) {
            warnings.push(`Pesanan ${o.id} memuat barang ID "${it.productId}" yang tidak ada di master produk.`);
          }
        }
      }
    }

    // 5. Validasi Harga Khusus Pemasok (storePrices)
    if (d.storePrices != null) {
      if (!Array.isArray(d.storePrices)) {
        return { ok: false, valid: false, reason: 'Data harga toko (storePrices) tidak berformat array.' };
      }
      for (let i = 0; i < d.storePrices.length; i++) {
        const sp = d.storePrices[i];
        if (!sp || typeof sp !== 'object' || !sp.storeId || !sp.productId || !sp.unitId) {
          return { ok: false, valid: false, reason: `Data harga toko #${i + 1} tidak lengkap.` };
        }
        const priceNum = Number(sp.price);
        if (isNaN(priceNum) || priceNum < 0) {
          return { ok: false, valid: false, reason: `Harga toko #${i + 1} bernilai tidak valid atau negatif.` };
        }
        if (!storeIds.has(sp.storeId)) {
          warnings.push(`Harga khusus merujuk ke toko ID "${sp.storeId}" yang tidak terdaftar.`);
        }
        if (!productIds.has(sp.productId)) {
          warnings.push(`Harga khusus merujuk ke barang ID "${sp.productId}" yang tidak terdaftar.`);
        }
      }
    }

    // 6. Validasi Kekurangan Barang (shortages)
    if (d.shortages != null) {
      if (!Array.isArray(d.shortages)) {
        return { ok: false, valid: false, reason: 'Data kekurangan (shortages) tidak berformat array.' };
      }
      for (let i = 0; i < d.shortages.length; i++) {
        const sk = d.shortages[i];
        if (!sk || typeof sk !== 'object' || !sk.productId) {
          return { ok: false, valid: false, reason: `Data kekurangan #${i + 1} tidak memiliki productId valid.` };
        }
      }
    }

    // 7. Validasi Operators
    if (d.operators != null) {
      if (!Array.isArray(d.operators)) {
        return { ok: false, valid: false, reason: 'Data operator tidak berformat array.' };
      }
    }

    // 8. Validasi Checksum (jika ada pada metadata)
    if (payload.metadata && payload.metadata.checksum) {
      const expectedChecksum = computeDataChecksum({
        storeCount: d.stores.length,
        productCount: d.products.length,
        orderCount: Array.isArray(d.orders) ? d.orders.length : 0,
        stockCount: Array.isArray(d.stocks) ? d.stocks.length : 0,
        storePriceCount: Array.isArray(d.storePrices) ? d.storePrices.length : 0,
        firstStoreId: d.stores[0]?.id || '',
        firstProductId: d.products[0]?.id || '',
      });
      if (expectedChecksum !== payload.metadata.checksum) {
        warnings.push('Metadata checksum berkas cadangan berbeda dengan struktur data. Kemungkinan berkas telah dimodifikasi secara manual.');
      }
    }

    const summary = {
      storeName: (d.settings && d.settings.name) || 'Warung Madura',
      stores: d.stores.length,
      products: d.products.length,
      orders: Array.isArray(d.orders) ? d.orders.length : 0,
      stocks: Array.isArray(d.stocks) ? d.stocks.length : 0,
      shortages: Array.isArray(d.shortages) ? d.shortages.length : 0,
      movements: Array.isArray(d.movements) ? d.movements.length : 0,
      storePrices: Array.isArray(d.storePrices) ? d.storePrices.length : 0,
      priceHistory: Array.isArray(d.priceHistory) ? d.priceHistory.length : 0,
      operators: Array.isArray(d.operators) ? d.operators.length : 0,
      storeCarts: d.storeCarts && typeof d.storeCarts === 'object' ? Object.keys(d.storeCarts).length : 0,
    };

    return {
      ok: true,
      valid: true,
      summary,
      integrity: warnings.length > 0 ? 'warning' : 'valid',
      warnings,
      exportedAt: payload.exportedAt || null,
      version: payload.version || payload.metadata?.schemaVersion || '1.2.0',
      isOfficialApp: isAppMatch,
      validatedData: d,
    };
  }, []);

  const importData = useCallback(
    (payload) => {
      const validation = validateBackup(payload);
      if (!validation.ok || !validation.valid) {
        return { ok: false, reason: validation.reason || 'Berkas cadangan tidak valid.' };
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
      const nextOperators = Array.isArray(d.operators) && d.operators.length > 0 ? d.operators : operators;
      const nextActiveOpId = d.activeOperatorId || activeOperatorId;
      const nextStoreCarts = d.storeCarts && typeof d.storeCarts === 'object' ? d.storeCarts : null;
      const nextVisits = Array.isArray(d.visits) ? d.visits.map(migrateVisit).filter(Boolean) : visits;
      const nextDigital = Array.isArray(d.digitalTransactions)
        ? d.digitalTransactions.map(migrateDigitalTransaction).filter(Boolean)
        : digitalTransactions;

      // Ambil snapshot data localStorage saat ini untuk atomic rollback dan persistent restore rollback
      const snapshot = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith(PREFIX) || k === 'wm_v1_store_carts')) {
            snapshot[k] = localStorage.getItem(k);
          }
        }
      } catch {
        /* ignore */
      }

      // Simpan persistent pre-restore snapshot ke localStorage agar pengguna bisa melakukan "Rollback Pemulihan"
      const preRestoreRecord = {
        timestamp: new Date().toISOString(),
        version: '1.3.0',
        metadata: {
          storeName: settings.name || 'Warung Madura',
          stores: stores.length,
          products: products.length,
          orders: orders.length,
          stocks: stocks.length,
        },
        snapshot,
      };

      // Validasi penulisan ke localStorage terlebih dahulu sebelum mengubah state React (Atomic Commit)
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
        save('operators', nextOperators);
        save('active_operator_id', nextActiveOpId);
        if (Array.isArray(d.visits)) {
          save('visits', nextVisits);
        }
        if (Array.isArray(d.digitalTransactions)) {
          save('digital_transactions', nextDigital);
        }
        if (nextStoreCarts !== null) {
          localStorage.setItem('wm_v1_store_carts', JSON.stringify(nextStoreCarts));
        }

        // Simpan persistent snapshot setelah penulisan data utama berhasil
        localStorage.setItem(PREFIX + 'prerestore_snapshot', JSON.stringify(preRestoreRecord));
      } catch (err) {
        // Rollback atomik ke data sebelumnya jika gagal menulis ke localStorage
        try {
          Object.keys(snapshot).forEach((k) => {
            if (snapshot[k] !== null && snapshot[k] !== undefined) {
              localStorage.setItem(k, snapshot[k]);
            } else {
              localStorage.removeItem(k);
            }
          });
        } catch {
          /* ignore */
        }
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
      setOperators(nextOperators);
      setActiveOperatorId(nextActiveOpId);
      if (Array.isArray(d.visits)) {
        setVisits(nextVisits);
      }
      if (Array.isArray(d.digitalTransactions)) {
        setDigitalTransactions(nextDigital);
      }

      addActivityLog({
        title: 'Pemulihan Cadangan Berhasil',
        desc: `Data warung berhasil dipulihkan dari cadangan: ${nextProducts.length} barang, ${nextOrders.length} pesanan, ${nextStores.length} pemasok.`,
        type: 'backup_restore',
      });

      return {
        ok: true,
        summary: validation.summary,
        warnings: validation.warnings,
        hasRollback: true,
      };
    },
    [validateBackup, settings, stores, products, orders, stocks, operators, activeOperatorId, addActivityLog]
  );

  const getPreRestoreSnapshotInfo = useCallback(() => {
    try {
      const raw = localStorage.getItem(PREFIX + 'prerestore_snapshot');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.snapshot) return null;
      return {
        timestamp: parsed.timestamp,
        metadata: parsed.metadata || {},
      };
    } catch {
      return null;
    }
  }, []);

  const rollbackLastRestore = useCallback(() => {
    try {
      const raw = localStorage.getItem(PREFIX + 'prerestore_snapshot');
      if (!raw) {
        return { ok: false, reason: 'Tidak ditemukan snapshot data sebelum pemulihan.' };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.snapshot || typeof parsed.snapshot !== 'object') {
        return { ok: false, reason: 'Snapshot pemulihan rusak atau tidak valid.' };
      }

      // Pulihkan seluruh kunci dari snapshot
      Object.entries(parsed.snapshot).forEach(([k, val]) => {
        if (val !== null && val !== undefined) {
          localStorage.setItem(k, val);
        } else {
          localStorage.removeItem(k);
        }
      });
      // Hapus snapshot agar tidak bisa dipanggil berulang kali
      localStorage.removeItem(PREFIX + 'prerestore_snapshot');

      // Muat ulang state dari localStorage
      const reloadedStores = load('stores', []).map(migrateStore).filter(Boolean);
      const reloadedProducts = load('products', []).map(migrateProduct).map(stripBuyOneGetOne).filter(Boolean);
      const reloadedOrders = load('orders', []).map(migrateOrder);
      const reloadedStorePrices = load('storePrices', []).map(migrateStorePrice).filter(Boolean);
      const reloadedStocks = migrateStocks(load('stocks', []), reloadedProducts);
      const reloadedMovements = load('movements', []);
      const reloadedShortages = load('shortages', []).map(migrateShortage).filter(Boolean);
      const reloadedPriceHistory = load('priceHistory', []).map(migratePriceHistory).filter(Boolean);
      const reloadedSettings = load('settings', seed.settings);
      const reloadedActivityLogs = load('activityLogs', []);
      const reloadedOperators = load('operators', DEFAULT_OPERATORS);
      const reloadedActiveOpId = load('active_operator_id', 'op-ainie');

      setStores(reloadedStores);
      setProducts(reloadedProducts);
      setOrders(reloadedOrders);
      setStorePrices(reloadedStorePrices);
      setStocks(reloadedStocks);
      setMovements(reloadedMovements);
      setShortages(reloadedShortages);
      setPriceHistory(reloadedPriceHistory);
      setSettings(reloadedSettings);
      setActivityLogs(reloadedActivityLogs);
      setOperators(reloadedOperators);
      setActiveOperatorId(reloadedActiveOpId);

      addActivityLog({
        title: 'Pembatalan Pemulihan Berhasil',
        desc: `Data warung berhasil dikembalikan ke kondisi sebelum pemulihan (${parsed.timestamp}).`,
        type: 'backup_rollback',
      });

      return {
        ok: true,
        restoredAt: parsed.timestamp,
        metadata: parsed.metadata,
      };
    } catch (err) {
      return { ok: false, reason: 'Gagal membatalkan pemulihan: ' + err.message };
    }
  }, [seed, addActivityLog]);

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
  // Filter ketat: produk nonaktif (active === false) atau diarsipkan (archived === true) TIDAK dimasukkan.
  const needsRestock = useMemo(
    () =>
      products
        .filter((p) => p.active !== false && !p.archived)
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
    const explicitLogs = activityLogs || [];

    // Set untuk pelacakan referensi agar tidak terjadi pencatatan ganda
    const explicitRefs = new Set();
    for (const l of explicitLogs) {
      if (l.desc) {
        const matches = l.desc.match(/(P-\d{8}-\d{3}|mv-[a-z0-9]+|rp-[a-z0-9]+|sk-[a-z0-9]+)/g);
        if (matches) {
          matches.forEach((m) => explicitRefs.add(`${l.type}:${m}`));
        }
      }
    }

    const fromMovements = [];
    for (const m of movements || []) {
      const isRefExplicitlyLogged =
        explicitRefs.has(`order_done:${m.ref}`) ||
        explicitRefs.has(`order_partial:${m.ref}`) ||
        explicitRefs.has(`repurchase_received:${m.ref}`) ||
        explicitRefs.has(`repurchase_partial:${m.ref}`);

      let title = 'Penyesuaian Stok Dilakukan';
      let type = 'stock_adjust';
      if (m.type === 'receive') {
        const isPartial = m.note?.includes('sebagian') || m.note?.includes('bertahap');
        const isRepurchase = m.note?.includes('pembelian ulang') || m.note?.includes('Pembelian ulang');
        if (isRepurchase) {
          title = isPartial ? 'Penerimaan Pembelian Ulang Sebagian' : 'Penerimaan Pembelian Ulang';
          type = isPartial ? 'repurchase_partial' : 'repurchase_received';
        } else {
          title = isPartial ? 'Penerimaan Barang Sebagian' : 'Penerimaan Barang Masuk';
          type = isPartial ? 'order_partial' : 'order_done';
        }
      } else if (m.type === 'masuk') {
        title = 'Stok Barang Bertambah';
        type = 'stock_in';
      } else if (m.type === 'keluar') {
        title = 'Stok Barang Berkurang';
        type = 'stock_out';
      }

      // Hindari duplikasi jika movement receive sudah tercatat di explicitLogs
      if (m.type === 'receive' && isRefExplicitlyLogged) {
        continue;
      }

      const sign = m.diffBase > 0 ? '+' : '';
      const desc = `${m.productNameSnapshot}: ${sign}${formatQty(m.diffBase)} ${m.unitBaseName || 'pcs'}${
        m.note ? ` • “${m.note}”` : m.ref ? ` • Ref: ${m.ref}` : ''
      }`;
      fromMovements.push({
        id: `act-mv-${m.id}`,
        title,
        desc,
        timestamp: m.timestamp,
        type,
      });
    }

    const fromOrders = [];
    for (const o of orders || []) {
      const storeName = storeById(o.storeId)?.name || 'Pemasok';

      // Log pesanan dibuat: lewati jika sudah tercatat di explicitLogs
      if (!explicitRefs.has(`order_created:${o.id}`)) {
        fromOrders.push({
          id: `act-ord-${o.id}`,
          title: 'Pesanan Baru Dibuat',
          desc: `Pesanan ${o.id} dibuat ke ${storeName} (${o.totalItems} barang)`,
          timestamp: o.createdAt,
          type: 'order_created',
        });
      }

      // Log status pesanan: hanya catat jika belum ada di explicitLogs
      if (o.status === 'selesai' && !explicitRefs.has(`order_done:${o.id}`)) {
        fromOrders.push({
          id: `act-ord-done-${o.id}`,
          title: 'Pesanan Selesai Diterima',
          desc: `Seluruh barang pesanan ${o.id} dari ${storeName} telah lengkap diterima & masuk stok`,
          timestamp: o.updatedAt || o.createdAt,
          type: 'order_done',
        });
      } else if (o.status === 'sebagian' && !explicitRefs.has(`order_partial:${o.id}`)) {
        fromOrders.push({
          id: `act-ord-part-${o.id}`,
          title: 'Penerimaan Barang Sebagian',
          desc: `Penerimaan bertahap pesanan ${o.id} dari ${storeName} sedang berlangsung`,
          timestamp: o.updatedAt || o.createdAt,
          type: 'order_partial',
        });
      } else if (o.status === 'batal' && !explicitRefs.has(`order_cancel:${o.id}`)) {
        fromOrders.push({
          id: `act-ord-cancel-${o.id}`,
          title: 'Pesanan Dibatalkan',
          desc: `Pesanan ${o.id} (${storeName}) dibatalkan${o.cancelReason ? `: ${o.cancelReason}` : ''}`,
          timestamp: o.updatedAt || o.createdAt,
          type: 'order_cancel',
        });
      }
    }

    const combined = [...explicitLogs, ...fromMovements, ...fromOrders];
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
        if (
          hasUnfulfilled &&
          o.status !== 'batal' &&
          o.status !== 'dibatalkan' &&
          o.status !== 'belum_diterima' &&
          o.status !== 'active'
        ) {
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
    resetStorePrice,
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
    rollbackLastRestore,
    getPreRestoreSnapshotInfo,
    storageStatus,
    operators,
    activeOperator,
    activeOperatorId,
    setActiveOperatorId,
    addOperator,
    updateOperator,
    toggleOperatorStatus,
    visits,
    todayVisits,
    overdueVisits,
    upcomingVisits,
    completedVisits,
    cancelledVisits,
    visitReminders,
    getVisitComputedStatus,
    createVisit,
    updateVisit,
    completeVisit,
    cancelVisit,
    rescheduleVisit,
    deleteVisit,
    digitalTransactions,
    digitalSummary,
    todayDigitalTransactions,
    todayDigitalSummary,
    pendingDigitalTransactions,
    createDigitalTransaction,
    updateDigitalTransaction,
    deleteDigitalTransaction,
    changeDigitalTransactionStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp harus dipakai di dalam AppProvider');
  return ctx;
}