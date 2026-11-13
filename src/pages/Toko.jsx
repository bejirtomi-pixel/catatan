import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpDown,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  FilterX,
  History,
  Info,
  MapPin,
  Minus,
  PackageMinus,
  Pencil,
  Phone,
  Plus,
  Save,
  Scale,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { rupiah, formatQty, formatDateTime, round2 } from '../utils/format';
import {
  Btn,
  Chip,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  TableWrap,
  TD,
  TH,
  Textarea,
} from '../components/UI';
import ProductImage from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';

// Kunci penyimpanan keranjang draft per toko di localStorage
const STORE_CARTS_STORAGE_KEY = 'wm_v1_store_carts';

function getStoredCarts() {
  try {
    const raw = localStorage.getItem(STORE_CARTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('Gagal membaca keranjang toko dari localStorage:', e);
    return {};
  }
}

function persistStoredCarts(carts) {
  try {
    localStorage.setItem(STORE_CARTS_STORAGE_KEY, JSON.stringify(carts));
  } catch (e) {
    console.error('Gagal menyimpan keranjang toko ke localStorage:', e);
  }
}

export default function Toko() {
  const {
    stores,
    products,
    orders,
    createStore,
    updateStore,
    deleteStore,
    createOrder,
    priceOfStore,
    priceHistory,
    pushToast,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [storeFilter, setStoreFilter] = useState('');
  const [storeId, setStoreId] = useState(stores[0]?.id || '');

  // Keranjang persisten per toko: { [storeId]: { items: [...], note: '' } }
  const [cartsByStore, setCartsByStore] = useState(getStoredCarts);

  const processedKey = useRef(null);
  const [detail, setDetail] = useState(null);
  const [dupConfirm, setDupConfirm] = useState(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [blockedDeleteStore, setBlockedDeleteStore] = useState(null);

  // Modal states
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [storeDetailTarget, setStoreDetailTarget] = useState(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareProductId, setCompareProductId] = useState(null);

  // Pastikan storeId selalu mengacu ke toko yang ada
  useEffect(() => {
    if (stores.length > 0 && (!storeId || !stores.some((s) => s.id === storeId))) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);

  // Data keranjang aktif untuk toko yang sedang dipilih
  const currentCartData = useMemo(() => {
    if (!storeId) return { items: [], note: '' };
    return cartsByStore[storeId] || { items: [], note: '' };
  }, [cartsByStore, storeId]);

  const cart = currentCartData.items || [];
  const note = currentCartData.note || '';

  // Helper pembaruan keranjang toko aktif
  const updateActiveCart = useCallback(
    (updater) => {
      if (!storeId) return;
      setCartsByStore((prev) => {
        const cur = prev[storeId] || { items: [], note: '' };
        const newItems = typeof updater === 'function' ? updater(cur.items || []) : updater;
        const next = {
          ...prev,
          [storeId]: {
            ...cur,
            items: newItems,
          },
        };
        persistStoredCarts(next);
        return next;
      });
    },
    [storeId]
  );

  const setNote = useCallback(
    (newNote) => {
      if (!storeId) return;
      setCartsByStore((prev) => {
        const cur = prev[storeId] || { items: [], note: '' };
        const noteVal = typeof newNote === 'function' ? newNote(cur.note || '') : newNote;
        const next = {
          ...prev,
          [storeId]: {
            ...cur,
            note: noteVal,
          },
        };
        persistStoredCarts(next);
        return next;
      });
    },
    [storeId]
  );

  // Quick action "Buat Pesanan" dari luar halaman (misal detail barang di Halaman Barang)
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.storeId && !st.addProductId)) return;
    if (processedKey.current === location.key) return;
    processedKey.current = location.key;
    const target = stores.find((s) => s.id === st.storeId) || (st.storeId ? undefined : stores[0]);
    if (st.addProductId) {
      const p = products.find((x) => x.id === st.addProductId);
      if (p && target) {
        const units = p.units || [];
        const unitId = units.length > 1 ? units[units.length - 1].id : units[0]?.id;
        const unit = units.find((u) => u.id === unitId) || units[0];
        if (unit) {
          const price = priceOfStore(target.id, p.id, unit.id);
          const priceRef = price || Number(unit.price) || 0;
          setStoreId(target.id);
          setCartsByStore((prev) => {
            const cur = prev[target.id] || { items: [], note: '' };
            const nextItems = (cur.items || []).filter((c) => c.productId !== p.id);
            nextItems.push({
              productId: p.id,
              name: p.name,
              unitId: unit.id,
              unitName: unit.name,
              unitFactor: Number(unit.factor) || 1,
              quantity: 1,
              priceRef,
              priceActual: priceRef,
            });
            const next = {
              ...prev,
              [target.id]: {
                ...cur,
                items: nextItems,
              },
            };
            persistStoredCarts(next);
            return next;
          });
          pushToast(`“${p.name}” dimasukkan ke keranjang ${target.name}.`);
        }
      }
    } else if (st.storeId && target) {
      setStoreId(target.id);
    }
  }, [location.state, location.key, stores, products, priceOfStore, pushToast]);

  const storeList = useMemo(() => {
    const q = storeFilter.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address && s.address.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.note && s.note.toLowerCase().includes(q))
    );
  }, [stores, storeFilter]);

  const currentStore = stores.find((s) => s.id === storeId);
  const productsOfStore = useMemo(
    () =>
      storeId
        ? products.filter(
            (p) =>
              !p.archived &&
              p.active !== false &&
              p.storeIds &&
              p.storeIds.includes(storeId)
          )
        : [],
    [products, storeId]
  );

  // Operasi keranjang
  const addToCart = (product, unitId, qtyNum, priceActual) => {
    const unit = (product.units || []).find((u) => u.id === unitId) || product.units[0];
    if (!unit || qtyNum <= 0) return;
    const priceRef = priceOfStore(storeId, product.id, unit.id) || Number(unit.price) || 0;
    const actual = Number(priceActual) >= 0 ? Number(priceActual) : priceRef;

    updateActiveCart((prev) => {
      const next = prev.filter((c) => c.productId !== product.id);
      next.push({
        productId: product.id,
        name: product.name,
        unitId: unit.id,
        unitName: unit.name,
        unitFactor: Number(unit.factor) || 1,
        quantity: qtyNum,
        priceRef,
        priceActual: actual,
      });
      return next;
    });

    pushToast(`${formatQty(qtyNum)} ${unit.name} “${product.name}” masuk keranjang.`);
  };

  const updateCartQty = (productId, newQty) => {
    const val = Number(newQty);
    updateActiveCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, quantity: isNaN(val) ? 0 : val } : c))
    );
  };

  const updateCartUnit = (productId, newUnitId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const unit = (product.units || []).find((u) => u.id === newUnitId);
    if (!unit) return;
    const priceRef = priceOfStore(storeId, productId, unit.id) || Number(unit.price) || 0;

    updateActiveCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? {
              ...c,
              unitId: unit.id,
              unitName: unit.name,
              unitFactor: Number(unit.factor) || 1,
              priceRef,
              priceActual: priceRef,
            }
          : c
      )
    );
  };

  const updateCartPrice = (productId, newPrice) => {
    const val = Number(newPrice);
    updateActiveCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, priceActual: isNaN(val) ? 0 : val } : c))
    );
  };

  const removeFromCart = (productId) => {
    updateActiveCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const clearCurrentCart = () => {
    if (!storeId) return;
    setCartsByStore((prev) => {
      const next = { ...prev };
      delete next[storeId];
      persistStoredCarts(next);
      return next;
    });
    setClearConfirmOpen(false);
    pushToast(`Keranjang pesanan untuk ${currentStore?.name || 'toko ini'} telah dikosongkan.`);
  };

  const changeStore = (id) => {
    if (!id || id === storeId) return;
    setStoreId(id);
  };

  const finalizeOrder = () => {
    if (!cart.length || !storeId) return;
    const order = createOrder({
      storeId,
      items: cart.map((c) => ({
        productId: c.productId,
        unitId: c.unitId,
        quantity: c.quantity,
        priceActual: c.priceActual,
      })),
      note: note ? note.trim() : '',
    });
    pushToast(`Pesanan ${order.id} berhasil dibuat`);
    // Hapus draft keranjang toko ini saja
    setCartsByStore((prev) => {
      const next = { ...prev };
      delete next[storeId];
      persistStoredCarts(next);
      return next;
    });
    setDupConfirm(null);
    navigate('/pesanan');
  };

  const saveOrder = () => {
    if (!cart.length || !storeId) {
      pushToast('Keranjang masih kosong. Tambahkan barang terlebih dahulu.', 'warning');
      return;
    }

    const invalidQty = cart.find((c) => !(Number(c.quantity) > 0));
    if (invalidQty) {
      pushToast(`Jumlah pesanan untuk “${invalidQty.name}” harus lebih dari 0.`, 'warning');
      return;
    }

    const invalidPrice = cart.find((c) => Number(c.priceActual) < 0);
    if (invalidPrice) {
      pushToast(`Harga untuk “${invalidPrice.name}” tidak boleh negatif.`, 'warning');
      return;
    }

    // Peringatan pesanan kembar jika masih ada pesanan aktif belum selesai dengan barang yang sama
    const dupes = orders.filter(
      (o) =>
        (o.status === 'belum_diterima' || o.status === 'sebagian' || o.status === 'active') &&
        o.storeId === storeId &&
        o.items.some((it) => cart.some((c) => c.productId === it.productId))
    );
    if (dupes.length > 0) {
      setDupConfirm({ count: dupes.length });
      return;
    }
    finalizeOrder();
  };

  // Handler aksi hapus toko dengan audit safety check
  const handleDeleteStoreClick = (targetStore) => {
    const orderCount = orders.filter((o) => o.storeId === targetStore.id).length;
    if (orderCount > 0) {
      setBlockedDeleteStore({ store: targetStore, orderCount });
    } else {
      setDeleteTarget(targetStore);
    }
  };

  const totalItems = cart.reduce((a, b) => a + (Number(b.quantity) || 0), 0);
  const totalPrice = cart.reduce(
    (a, b) => a + (Number(b.quantity) || 0) * (Number(b.priceActual) || 0),
    0
  );

  return (
    <div>
      <PageHeader
        title="Toko"
        subtitle="Kelola toko pemasok, pencatatan pesanan barang, perbandingan harga, dan pantau riwayat harga beli."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            variant="soft"
            size="md"
            icon={Scale}
            onClick={() => {
              setCompareProductId(null);
              setCompareOpen(true);
            }}
            title="Bandingkan harga barang antar seluruh toko pemasok"
          >
            Bandingkan Harga
          </Btn>
          <Btn
            variant="soft"
            size="md"
            icon={History}
            onClick={() => setHistoryOpen(true)}
            title="Lihat riwayat perubahan harga barang toko pemasok"
          >
            Riwayat Harga
          </Btn>
          <Btn icon={Plus} size="md" onClick={() => setAddOpen(true)}>
            Tambah Toko
          </Btn>
        </div>
      </PageHeader>

      {stores.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Store}
            title="Belum ada toko pemasok"
            description="Tambah toko pemasok terlebih dahulu untuk mulai mencatat pesanan barang."
            action={
              <Btn size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                Tambah Toko
              </Btn>
            }
          />
        </div>
      ) : (
        <>
          {/* Layout Dua Kolom: Daftar Barang Toko (Kiri) & Keranjang Pesanan (Kanan) */}
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_350px] lg:gap-6">
            <div className="min-w-0 space-y-4">
              {/* Header Selector Toko Terpilih */}
              <div className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Barang Dari Toko Terpilih
                  </p>
                  <p className="text-base font-extrabold text-ink leading-snug break-words">
                    {currentStore ? currentStore.name : 'Pilih Toko'}
                    <span className="ml-1.5 text-xs font-normal text-ink-soft">
                      ({productsOfStore.length} jenis barang)
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  <Btn
                    variant="soft"
                    size="sm"
                    icon={Tag}
                    onClick={() => setPriceOpen(true)}
                    title="Ubah harga referensi pembelian barang di toko ini"
                    className="shrink-0"
                  >
                    Kelola Harga
                  </Btn>
                  <div className="min-w-[200px] flex-1 sm:w-72 sm:flex-initial">
                    <Select
                      value={storeId || ''}
                      onChange={(e) => changeStore(e.target.value)}
                      className="!h-9 !py-1 text-xs !font-bold text-ink sm:text-sm"
                      title="Ganti toko tujuan pesanan"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              {/* Tabel Barang Toko Terpilih (Exact 9 Columns + Mobile Cards) */}
              {storeId && productsOfStore.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon={PackageMinus}
                    title="Belum ada barang terhubung ke toko ini"
                    description="Hubungkan barang dengan toko ini melalui formulir di halaman Barang."
                    action={
                      <Btn size="sm" variant="soft" onClick={() => navigate('/barang')}>
                        Ke Halaman Barang
                      </Btn>
                    }
                  />
                </div>
              ) : storeId ? (
                <OrderTable
                  key={storeId}
                  storeId={storeId}
                  storeName={currentStore?.name || ''}
                  productsOfStore={productsOfStore}
                  onAdd={addToCart}
                  onPreview={(p) => setDetail(p)}
                  onOpenCompare={(productId) => {
                    setCompareProductId(productId);
                    setCompareOpen(true);
                  }}
                />
              ) : null}
            </div>

            {/* Keranjang Pesanan (Panel Kanan) */}
            <CartPanel
              cart={cart}
              products={products}
              currentStore={currentStore}
              stores={stores}
              storeId={storeId}
              changeStore={changeStore}
              totalItems={totalItems}
              totalPrice={totalPrice}
              note={note}
              setNote={setNote}
              onUpdateQty={updateCartQty}
              onUpdateUnit={updateCartUnit}
              onUpdatePrice={updateCartPrice}
              onRemove={removeFromCart}
              onClearCart={() => setClearConfirmOpen(true)}
              onSave={saveOrder}
            />
          </div>

          {/* Daftar Toko Pemasok (Bagian Bawah Halaman) */}
          <div className="card mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-primary-soft/40 px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wider text-ink">
                    Daftar Toko Pemasok ({storeList.length})
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Kelola data toko pemasok, kontak, alamat, serta lihat rincian barang yang tersedia.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  placeholder="Cari nama, alamat, telepon..."
                  className="w-full sm:w-72 lg:w-80"
                />
                <Btn size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                  Tambah Toko
                </Btn>
              </div>
            </div>

            {storeList.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Toko tidak ditemukan"
                description="Coba gunakan kata kunci pencarian yang lain."
                action={
                  <Btn size="sm" variant="soft" onClick={() => setStoreFilter('')}>
                    Reset Pencarian
                  </Btn>
                }
              />
            ) : (
              <div className="grid gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {storeList.map((s) => {
                  const count = products.filter((p) => p.storeIds && p.storeIds.includes(s.id)).length;
                  const active = storeId === s.id;
                  const orderCount = orders.filter((o) => o.storeId === s.id).length;
                  const hasDraftCart = (cartsByStore[s.id]?.items || []).length > 0;

                  return (
                    <div
                      key={s.id}
                      className={`flex flex-col justify-between rounded-xl border p-3.5 transition shadow-soft ${
                        active
                          ? 'border-primary/50 bg-primary-soft/40 ring-1 ring-primary/20'
                          : 'border-line bg-white hover:border-primary/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5 ${
                                active ? 'bg-primary text-white' : 'bg-primary-soft text-primary'
                              }`}
                            >
                              <Store className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-ink leading-snug break-words line-clamp-2" title={s.name}>
                                {s.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {active && (
                                  <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                    Toko Terpilih
                                  </span>
                                )}
                                {hasDraftCart && (
                                  <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    🛒 Ada Draft
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title="Lihat detail toko"
                              onClick={() => setStoreDetailTarget(s)}
                              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Edit toko"
                              onClick={() => setEditTarget(s)}
                              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title={
                                orderCount > 0
                                  ? `Tidak dapat dihapus: Memiliki ${orderCount} riwayat pesanan`
                                  : 'Hapus toko pemasok'
                              }
                              onClick={() => handleDeleteStoreClick(s)}
                              className={`rounded-lg p-1.5 transition ${
                                orderCount > 0
                                  ? 'text-ink-soft/40 hover:bg-slate-100 hover:text-slate-600'
                                  : 'text-ink-soft hover:bg-rose-50 hover:text-rose-600'
                              }`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Info Ringkas Toko: Kontak & Alamat & Deskripsi */}
                        <div className="mt-3 space-y-1.5 text-xs">
                          <p className="font-semibold text-ink">
                            📦 {count} jenis barang tersedia
                          </p>
                          {s.phone ? (
                            <p className="flex items-center gap-1.5 text-ink-soft">
                              <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="text-[11px] font-medium break-all">{s.phone}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] italic text-ink-soft/70">Kontak belum diatur</p>
                          )}
                          {s.address ? (
                            <p className="flex items-start gap-1.5 text-ink-soft">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                              <span className="text-[11px] leading-snug line-clamp-2 break-words" title={s.address}>
                                {s.address}
                              </span>
                            </p>
                          ) : (
                            <p className="text-[11px] italic text-ink-soft/70">Alamat belum diatur</p>
                          )}
                          {s.note ? (
                            <p
                              className="text-[11px] italic text-ink-soft line-clamp-2 leading-relaxed break-words"
                              title={s.note}
                            >
                              Catatan: “{s.note}”
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Tombol Aksi Bawah */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-line/60 pt-2.5">
                        <span className="text-[11px] text-ink-soft">
                          {orderCount} pesanan
                        </span>
                        {!active ? (
                          <button
                            type="button"
                            onClick={() => changeStore(s.id)}
                            className="rounded-lg px-2.5 py-1 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
                          >
                            Pilih Toko Ini
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-primary">
                            Sedang Aktif
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirm modal saat kosongkan keranjang aktif */}
      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        title="Kosongkan Keranjang Pesanan?"
        message={`Seluruh barang (${cart.length} item) dalam keranjang untuk toko “${currentStore?.name || ''}” akan dihapus. Pesanan yang belum disimpan akan hilang.`}
        confirmLabel="Ya, Kosongkan"
        danger
        onConfirm={clearCurrentCart}
      />

      {/* Modal informasi hapus toko diblokir karena ada pesanan */}
      <Modal
        open={!!blockedDeleteStore}
        onClose={() => setBlockedDeleteStore(null)}
        title="Toko Tidak Dapat Dihapus"
        subtitle="Integritas data pencatatan warung dilindungi."
        size="sm"
        footer={
          <Btn variant="primary" onClick={() => setBlockedDeleteStore(null)}>
            Saya Mengerti
          </Btn>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">
                Toko “{blockedDeleteStore?.store?.name}” masih memiliki {blockedDeleteStore?.orderCount} riwayat pesanan.
              </p>
              <p className="leading-relaxed">
                Untuk menjaga riwayat pembukuan dan audit pesanan warung, toko yang sudah pernah melakukan pesanan tidak dapat dihapus dari sistem.
              </p>
            </div>
          </div>
          <p className="text-xs text-ink-soft">
            Jika toko ini sudah tidak digunakan, Anda dapat mengedit catatan toko atau menghapus hubungan barang dengan toko ini di halaman Barang.
          </p>
        </div>
      </Modal>

      {/* Confirm modal jika ada pesanan kembar yang masih aktif */}
      <ConfirmModal
        open={!!dupConfirm}
        onClose={() => setDupConfirm(null)}
        title="Pesanan Ganda?"
        message={`Toko ${currentStore?.name || 'ini'} masih memiliki ${dupConfirm?.count || 0} pesanan aktif dengan beberapa barang yang sama. Anda tetap bisa melanjutkan, namun periksa kembali agar tidak memesan dua kali.`}
        confirmLabel="Tetap Buat Pesanan"
        onConfirm={finalizeOrder}
      />

      {/* Modal Perbandingan Harga Antar Toko */}
      <PriceComparisonModal
        open={compareOpen}
        initialProductId={compareProductId}
        onClose={() => {
          setCompareOpen(false);
          setCompareProductId(null);
        }}
        onSelectStoreAndProduct={(targetStoreId, p, unitId) => {
          setCompareOpen(false);
          setCompareProductId(null);
          setStoreId(targetStoreId);
          // Tambahkan ke keranjang toko target
          const unit = (p.units || []).find((u) => u.id === unitId) || p.units[0];
          if (unit) {
            const priceRef = priceOfStore(targetStoreId, p.id, unit.id) || Number(unit.price) || 0;
            setCartsByStore((prev) => {
              const cur = prev[targetStoreId] || { items: [], note: '' };
              const nextItems = (cur.items || []).filter((c) => c.productId !== p.id);
              nextItems.push({
                productId: p.id,
                name: p.name,
                unitId: unit.id,
                unitName: unit.name,
                unitFactor: Number(unit.factor) || 1,
                quantity: 1,
                priceRef,
                priceActual: priceRef,
              });
              const next = {
                ...prev,
                [targetStoreId]: {
                  ...cur,
                  items: nextItems,
                },
              };
              persistStoredCarts(next);
              return next;
            });
            const stName = stores.find((s) => s.id === targetStoreId)?.name || 'toko';
            pushToast(`Toko ${stName} dipilih & “${p.name}” masuk keranjang.`);
          }
        }}
      />

      {/* Modal Kelola Harga Acuan Beli */}
      <ManagePriceModal
        key={priceOpen ? storeId : 'closed'}
        open={priceOpen}
        initialStoreId={storeId}
        onClose={() => setPriceOpen(false)}
      />

      {/* Modal Riwayat Perubahan Harga */}
      <PriceHistoryModal
        open={historyOpen}
        initialStoreId={storeId}
        onClose={() => setHistoryOpen(false)}
      />

      {/* Modal Detail Toko */}
      <StoreDetailModal
        open={!!storeDetailTarget}
        store={storeDetailTarget}
        onClose={() => setStoreDetailTarget(null)}
        onSelectStore={(id) => {
          changeStore(id);
          setStoreDetailTarget(null);
        }}
        onEdit={(s) => {
          setStoreDetailTarget(null);
          setEditTarget(s);
        }}
      />

      {/* Modal Tambah Toko */}
      <StoreFormModal
        open={addOpen}
        title="Tambah Toko Pemasok"
        onClose={() => setAddOpen(false)}
        submitLabel="Simpan Toko"
        onSubmit={(payload) => {
          const s = createStore(payload);
          if (s) {
            pushToast(`Toko “${s.name}” berhasil ditambahkan`);
            setStoreId(s.id);
            setAddOpen(false);
          } else {
            pushToast('Nama toko sudah ada atau tidak valid.', 'warning');
          }
        }}
      />

      {/* Modal Edit Toko */}
      <StoreFormModal
        open={!!editTarget}
        title={`Edit Toko — ${editTarget?.name || ''}`}
        onClose={() => setEditTarget(null)}
        initialData={editTarget}
        submitLabel="Simpan Perubahan"
        onSubmit={(payload) => {
          if (editTarget) {
            const res = updateStore(editTarget.id, payload);
            if (res?.ok === false) pushToast(res.reason || 'Gagal memperbarui toko.', 'warning');
            else pushToast(`Data toko “${payload.name}” berhasil diperbarui`);
          }
          setEditTarget(null);
        }}
      />

      {/* Modal Konfirmasi Hapus Toko */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Toko Pemasok?"
        message={
          deleteTarget
            ? `Hapus toko pemasok “${deleteTarget.name}”? Hubungan barang dengan toko ini akan dilepas, namun data barang tidak akan terhapus dari inventaris.`
            : ''
        }
        confirmLabel="Hapus Toko"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            const res = deleteStore(deleteTarget.id);
            if (res?.ok === false) {
              pushToast(res.reason, 'warning');
            } else {
              pushToast(`Toko “${deleteTarget.name}” berhasil dihapus`);
              // Hapus draft keranjang toko yang dihapus
              setCartsByStore((prev) => {
                const next = { ...prev };
                delete next[deleteTarget.id];
                persistStoredCarts(next);
                return next;
              });
              if (storeId === deleteTarget.id) {
                setStoreId(stores.find((s) => s.id !== deleteTarget.id)?.id || '');
              }
            }
          }
          setDeleteTarget(null);
        }}
      />

      {/* Modal Preview Barang */}
      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onCreateOrder={(p) => {
          setDetail(null);
          const target = stores.find((s) => s.id === (p.storeIds && p.storeIds[0])) || stores[0];
          if (!target) return;
          const units = p.units || [];
          const unitId = units.length > 1 ? units[units.length - 1].id : units[0]?.id;
          const unit = units.find((u) => u.id === unitId) || units[0];
          if (!unit) return;

          const price = priceOfStore(target.id, p.id, unit.id);
          const priceRef = price || Number(unit.price) || 0;
          setStoreId(target.id);
          setCartsByStore((prev) => {
            const cur = prev[target.id] || { items: [], note: '' };
            const nextItems = (cur.items || []).filter((c) => c.productId !== p.id);
            nextItems.push({
              productId: p.id,
              name: p.name,
              unitId: unit.id,
              unitName: unit.name,
              unitFactor: Number(unit.factor) || 1,
              quantity: 1,
              priceRef,
              priceActual: priceRef,
            });
            const next = {
              ...prev,
              [target.id]: {
                ...cur,
                items: nextItems,
              },
            };
            persistStoredCarts(next);
            return next;
          });
          pushToast(`“${p.name}” masuk keranjang ${target.name}.`);
        }}
      />
    </div>
  );
}

/* =========================================================================
   UnitSelectDropdown: Dropdown Satuan Ringkas (Hanya nama saat tertutup,
   nama lengkap + konversi saat terbuka)
   ========================================================================= */
function UnitSelectDropdown({ units, baseUnit, selectedUnitId, onChange, className = '' }) {
  const selectedUnit =
    units.find((u) => u.id === selectedUnitId) || units[0] || { id: '', name: 'pcs', factor: 1 };
  const safeBaseName = baseUnit?.name || 'pcs';

  return (
    <div
      className={`relative inline-flex h-8 w-full min-w-[70px] max-w-[96px] items-center justify-between rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink shadow-sm transition hover:border-primary focus-within:border-primary ${className}`}
      title={`Satuan aktif: ${selectedUnit.name}`}
    >
      <span className="truncate pr-3 font-semibold text-ink capitalize">
        {selectedUnit.name}
      </span>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-soft" />
      <select
        value={selectedUnit.id}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        title="Pilih satuan barang"
      >
        {units.map((u) => {
          const isBase = Number(u.factor) === 1;
          const convLabel = isBase ? '' : ` (x${formatQty(u.factor)} ${safeBaseName})`;
          return (
            <option key={u.id} value={u.id}>
              {u.name}{convLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

/* =========================================================================
   1. OrderTable: Tabel Barang Toko Terpilih (Exact 8 Columns + Mobile Cards)
   ========================================================================= */
function OrderTable({
  storeId,
  storeName,
  productsOfStore,
  onAdd,
  onPreview,
  onOpenCompare,
}) {
  const { priceOfStore } = useApp();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('semua');
  const [sel, setSel] = useState({});
  const [prices, setPrices] = useState({});

  // Ekstrak kategori unik dari daftar barang toko
  const categories = useMemo(() => {
    const set = new Set();
    for (const p of productsOfStore) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [productsOfStore]);

  // Filter pencarian dan kategori
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productsOfStore.filter((p) => {
      if (category !== 'semua' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [productsOfStore, search, category]);

  const setUnit = (product, unitId) => {
    const unit = (product.units || []).find((u) => u.id === unitId) || product.units[0];
    setSel((prev) => ({ ...prev, [product.id]: { ...prev[product.id], unitId } }));
    setPrices((prev) => ({
      ...prev,
      [product.id]: String(priceOfStore(storeId, product.id, unitId) || (unit ? unit.price : '')),
    }));
  };

  return (
    <div className="card overflow-hidden">
      {/* Bar Pencarian & Kategori Barang */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-primary-soft/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama barang di toko ini..."
            className="w-full sm:w-64"
          />
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input h-9 text-xs font-semibold text-ink"
              title="Filter berdasarkan kategori barang"
            >
              <option value="semua">Semua Kategori ({productsOfStore.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {(search || category !== 'semua') && (
            <Btn
              size="sm"
              variant="ghost"
              icon={FilterX}
              onClick={() => {
                setSearch('');
                setCategory('semua');
              }}
            >
              Reset
            </Btn>
          )}
        </div>
        <span className="text-xs font-semibold text-ink-soft">
          Menampilkan {filtered.length} dari {productsOfStore.length} barang
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={PackageMinus}
            title="Barang tidak ditemukan"
            description="Tidak ada barang yang cocok dengan kata kunci atau filter kategori."
            action={
              <Btn
                size="sm"
                variant="soft"
                onClick={() => {
                  setSearch('');
                  setCategory('semua');
                }}
              >
                Hapus Filter
              </Btn>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop Table View (Exact 9 Ordered Columns) */}
          <div className="hidden md:block">
            <TableWrap minWidth="min-w-[880px]">
              <thead className="border-b border-line bg-primary-soft/50 text-xs font-bold text-ink">
                <tr>
                  <TH className="w-10 text-center">No</TH>
                  <TH className="w-14">Gambar</TH>
                  <TH className="min-w-[190px] max-w-[280px]">Nama Barang</TH>
                  <TH className="w-28">Kategori</TH>
                  <TH className="w-40">Pilihan Satuan</TH>
                  <TH className="w-36">Harga Beli</TH>
                  <TH className="w-36 text-center">Jumlah Pesanan</TH>
                  <TH className="w-28 text-right">Subtotal</TH>
                  <TH className="w-28 text-right">Aksi</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p, i) => {
                  const units = p.units || [];
                  const baseUnit = units[0] || { name: 'pcs', factor: 1 };
                  const unitId =
                    sel[p.id]?.unitId ||
                    (units.length > 1 ? units[units.length - 1].id : units[0]?.id);
                  const qty = sel[p.id]?.qty || 0;
                  const effectivePrice = priceOfStore(storeId, p.id, unitId);
                  const priceVal =
                    prices[p.id] != null ? prices[p.id] : String(effectivePrice || '');
                  const unit = units.find((u) => u.id === unitId) || units[0] || { factor: 1, name: 'pcs' };
                  const factor = Number(unit.factor) || 1;
                  const hasConversion = factor > 1;
                  const subtotal = (Number(priceVal) || 0) * qty;

                  return (
                    <tr key={p.id} className="bg-white transition hover:bg-primary-soft/30">
                      {/* 1. No */}
                      <TD className="text-center text-ink-soft">{i + 1}</TD>

                      {/* 2. Gambar */}
                      <TD>
                        <ProductImage product={p} size="sm" onClick={() => onPreview(p)} />
                      </TD>

                      {/* 3. Nama Barang */}
                      <TD className="min-w-[190px] max-w-[280px]">
                        <button
                          type="button"
                          onClick={() => onPreview(p)}
                          className="text-left font-bold text-ink hover:text-primary transition line-clamp-2 leading-snug break-words"
                          title={p.name}
                        >
                          {p.name}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {p.sku && (
                            <span className="text-[10px] font-mono text-ink-soft">
                              #{p.sku}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenCompare(p.id)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary/80 hover:text-primary hover:underline"
                            title="Bandingkan harga barang ini di toko lain"
                          >
                            <Scale className="h-2.5 w-2.5" />
                            Bandingkan
                          </button>
                        </div>
                      </TD>

                      {/* 4. Kategori */}
                      <TD>
                        <span className="inline-block rounded-md bg-primary-soft/80 px-2 py-0.5 text-xs font-semibold text-primary">
                          {p.category || 'Umum'}
                        </span>
                      </TD>

                      {/* 5. Pilihan Satuan */}
                      <TD>
                        <select
                          value={unitId}
                          onChange={(e) => setUnit(p, e.target.value)}
                          className="h-8 w-full appearance-none rounded-lg border border-line bg-white px-2 pr-6 text-xs font-semibold text-ink outline-none focus:border-primary"
                        >
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} {Number(u.factor) > 1 ? `(x${formatQty(u.factor)} ${baseUnit.name})` : ''}
                            </option>
                          ))}
                        </select>
                        {hasConversion && (
                          <p className="mt-1 text-[10px] text-ink-soft">
                            1 {unit.name} = {formatQty(factor)} {baseUnit.name}
                          </p>
                        )}
                      </TD>

                      {/* 6. Harga Beli */}
                      <TD>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            value={priceVal}
                            onChange={(e) =>
                              setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            className="!px-2.5 !py-1 text-xs !font-bold"
                            inputMode="numeric"
                          />
                          <p className="mt-0.5 text-[10px] text-ink-soft truncate" title={`Acuan: ${rupiah(effectivePrice)} / ${unit.name}`}>
                            acuan: {rupiah(effectivePrice)}
                          </p>
                        </div>
                      </TD>

                      {/* 7. Jumlah Pesanan */}
                      <TD>
                        <div className="flex flex-col items-center justify-center">
                          <div className="inline-flex items-center rounded-xl border border-line bg-white p-0.5 shadow-soft">
                            <button
                              type="button"
                              onClick={() =>
                                setSel((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    unitId,
                                    qty: Math.max(0, qty - 1),
                                  },
                                }))
                              }
                              disabled={qty <= 0}
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary transition hover:bg-primary hover:text-white disabled:opacity-40"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={qty}
                              onChange={(e) =>
                                setSel((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    unitId,
                                    qty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                  },
                                }))
                              }
                              className="h-7 w-10 border-0 bg-transparent text-center text-xs font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setSel((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    ...prev[p.id],
                                    unitId,
                                    qty: qty + 1,
                                  },
                                }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white transition hover:brightness-110"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          {hasConversion && qty > 0 && (
                            <span className="mt-1 text-[10px] font-semibold text-primary">
                              Total: {formatQty(qty * factor)} {baseUnit.name}
                            </span>
                          )}
                        </div>
                      </TD>

                      {/* 8. Subtotal */}
                      <TD className="text-right">
                        <span className={`text-xs font-bold ${qty > 0 ? 'text-primary' : 'text-ink-soft'}`}>
                          {rupiah(subtotal)}
                        </span>
                      </TD>

                      {/* 9. Aksi */}
                      <TD className="text-right">
                        <button
                          type="button"
                          disabled={qty <= 0}
                          onClick={() => {
                            onAdd(p, unitId, qty, Number(priceVal));
                            setSel((prev) => ({
                              ...prev,
                              [p.id]: { ...prev[p.id], qty: 0 },
                            }));
                          }}
                          title="Tambahkan barang ke keranjang pesanan"
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span>+ Keranjang</span>
                        </button>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>

          {/* Mobile Card View (Zero Cutoff on Small Screens) */}
          <div className="space-y-3 p-3 md:hidden">
            {filtered.map((p, i) => {
              const units = p.units || [];
              const baseUnit = units[0] || { name: 'pcs', factor: 1 };
              const unitId =
                sel[p.id]?.unitId ||
                (units.length > 1 ? units[units.length - 1].id : units[0]?.id);
              const qty = sel[p.id]?.qty || 0;
              const effectivePrice = priceOfStore(storeId, p.id, unitId);
              const priceVal =
                prices[p.id] != null ? prices[p.id] : String(effectivePrice || '');
              const unit = units.find((u) => u.id === unitId) || units[0] || { factor: 1, name: 'pcs' };
              const factor = Number(unit.factor) || 1;
              const hasConversion = factor > 1;
              const subtotal = (Number(priceVal) || 0) * qty;

              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-line bg-white p-3.5 shadow-soft transition hover:border-primary/40 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <ProductImage product={p} size="sm" onClick={() => onPreview(p)} />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onPreview(p)}
                          className="text-left text-xs font-bold text-ink hover:text-primary transition line-clamp-2 leading-snug break-words"
                        >
                          {p.name}
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="rounded bg-primary-soft/80 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {p.category || 'Umum'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenCompare(p.id)}
                            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary/80 hover:underline"
                          >
                            <Scale className="h-2.5 w-2.5" />
                            Bandingkan
                          </button>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-ink-soft">#{i + 1}</span>
                  </div>

                  {/* Pilihan Satuan & Harga Beli */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Satuan
                      </label>
                      <select
                        value={unitId}
                        onChange={(e) => setUnit(p, e.target.value)}
                        className="mt-0.5 h-7 w-full appearance-none rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink outline-none focus:border-primary"
                      >
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} {Number(u.factor) > 1 ? `(x${formatQty(u.factor)})` : ''}
                          </option>
                        ))}
                      </select>
                      {hasConversion && (
                        <p className="mt-1 text-[10px] text-ink-soft">
                          1 {unit.name} = {formatQty(factor)} {baseUnit.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Harga Beli (Rp)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        value={priceVal}
                        onChange={(e) =>
                          setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                        className="!h-7 !px-2 !py-0 text-xs !font-bold"
                        inputMode="numeric"
                      />
                      <p className="mt-0.5 text-[10px] text-ink-soft truncate">
                        acuan: {rupiah(effectivePrice)}
                      </p>
                    </div>
                  </div>

                  {/* Pengatur Jumlah & Aksi Masuk Keranjang */}
                  <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
                    <div>
                      <div className="inline-flex items-center rounded-lg border border-line bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSel((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev[p.id],
                                unitId,
                                qty: Math.max(0, qty - 1),
                              },
                            }))
                          }
                          disabled={qty <= 0}
                          className="flex h-6 w-6 items-center justify-center rounded bg-primary-soft text-primary transition hover:bg-primary hover:text-white disabled:opacity-40"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={qty}
                          onChange={(e) =>
                            setSel((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev[p.id],
                                unitId,
                                qty: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              },
                            }))
                          }
                          className="h-6 w-8 border-0 bg-transparent text-center text-xs font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSel((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...prev[p.id],
                                unitId,
                                qty: qty + 1,
                              },
                            }))
                          }
                          className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white transition hover:brightness-110"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      {hasConversion && qty > 0 && (
                        <p className="mt-1 text-[10px] font-semibold text-primary">
                          Total: {formatQty(qty * factor)} {baseUnit.name}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-[10px] text-ink-soft">Subtotal</span>
                        <p className="text-xs font-bold text-primary">{rupiah(subtotal)}</p>
                      </div>
                      <button
                        type="button"
                        disabled={qty <= 0}
                        onClick={() => {
                          onAdd(p, unitId, qty, Number(priceVal));
                          setSel((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], qty: 0 },
                          }));
                        }}
                        className="flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span>+ Keranjang</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   2. CartPanel: Keranjang Pesanan Lengkap dengan Persistensi & Konversi Satuan
   ========================================================================= */
function CartPanel({
  cart,
  products,
  currentStore,
  stores,
  storeId,
  changeStore,
  totalItems,
  totalPrice,
  note,
  setNote,
  onUpdateQty,
  onUpdateUnit,
  onUpdatePrice,
  onRemove,
  onClearCart,
  onSave,
}) {
  return (
    <aside>
      <div className="card sticky top-20 p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <ShoppingCart className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink">Keranjang Pesanan</h2>
              <p className="text-[11px] text-ink-soft">
                {cart.length > 0 ? `${cart.length} barang dipilih` : 'Draft pesanan tersimpan per toko'}
              </p>
            </div>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={onClearCart}
              title="Kosongkan seluruh barang di keranjang toko ini"
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
            >
              Kosongkan
            </button>
          )}
        </div>

        <Field label="Toko Pemasok Tujuan" required>
          <Select value={storeId} onChange={(e) => changeStore(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
          {cart.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-primary-soft/40 px-3 py-6 text-center text-xs leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Keranjang Masih Kosong</p>
              <p className="mt-1">
                Pilih satuan, tentukan jumlah, lalu klik tombol "+ Keranjang" pada tabel barang di sebelah kiri.
              </p>
            </div>
          ) : (
            cart.map((it) => {
              const product = products.find((p) => p.id === it.productId);
              const availableUnits = product?.units || [];
              const baseUnit = availableUnits[0] || { name: 'pcs', factor: 1 };
              const factor = Number(it.unitFactor) || 1;
              const hasConversion = factor > 1;
              const subtotal = (Number(it.quantity) || 0) * (Number(it.priceActual) || 0);

              return (
                <div
                  key={it.productId}
                  className="rounded-xl border border-line bg-white p-3 shadow-soft transition hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-ink leading-snug break-words flex-1 pr-1" title={it.name}>{it.name}</p>
                    <button
                      type="button"
                      onClick={() => onRemove(it.productId)}
                      title="Hapus barang dari keranjang"
                      className="text-ink-soft transition hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Pengaturan Satuan & Jumlah */}
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-start gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Satuan
                      </label>
                      {availableUnits.length > 1 ? (
                        <select
                          value={it.unitId}
                          onChange={(e) => onUpdateUnit(it.productId, e.target.value)}
                          className="mt-0.5 h-7 w-full rounded-lg border border-line bg-white px-2 text-xs font-semibold text-ink outline-none focus:border-primary"
                        >
                          {availableUnits.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} {Number(u.factor) > 1 ? `(x${formatQty(u.factor)} ${baseUnit.name})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-ink">{it.unitName}</p>
                      )}
                      {hasConversion && (
                        <p className="mt-1 text-[10px] text-ink-soft">
                          1 {it.unitName} = {formatQty(factor)} {baseUnit.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Jumlah
                      </label>
                      <div className="mt-0.5 inline-flex items-center rounded-lg border border-line bg-white p-0.5">
                        <button
                          type="button"
                          onClick={() => onUpdateQty(it.productId, Math.max(1, (Number(it.quantity) || 1) - 1))}
                          className="flex h-6 w-6 items-center justify-center rounded bg-primary-soft text-primary transition hover:bg-primary hover:text-white"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => onUpdateQty(it.productId, e.target.value)}
                          className="h-6 w-9 border-0 bg-transparent text-center text-xs font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => onUpdateQty(it.productId, (Number(it.quantity) || 0) + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded bg-primary text-white transition hover:brightness-110"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      {hasConversion && Number(it.quantity) > 0 && (
                        <p className="mt-1 text-right text-[10px] font-semibold text-primary">
                          Total: {formatQty(Number(it.quantity) * factor)} {baseUnit.name}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pengaturan Harga & Subtotal */}
                  <div className="mt-2.5 flex items-end justify-between gap-2 border-t border-line/60 pt-2">
                    <div className="w-28">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                        Harga (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={it.priceActual}
                        onChange={(e) => onUpdatePrice(it.productId, e.target.value)}
                        className="mt-0.5 h-7 w-full rounded-lg border border-line bg-white px-2 text-xs font-bold text-ink outline-none focus:border-primary"
                      />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-semibold text-ink-soft">Subtotal</span>
                      <p className="text-xs font-extrabold text-primary">{rupiah(subtotal)}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Catatan Pesanan */}
        <Field label="Catatan Pesanan (opsional)" className="mt-4">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="contoh: Permintaan khusus, jadwal pengiriman, pesan toko..."
          />
        </Field>

        {/* Ringkasan Total Pesanan */}
        <div className="mb-3 mt-4 space-y-1.5 rounded-xl border border-line bg-primary-soft/50 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">Total Jenis Barang</span>
            <span className="font-bold text-ink">{cart.length} jenis</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">Total Kuantitas</span>
            <span className="font-bold text-ink">{formatQty(totalItems)} unit</span>
          </div>
          <div className="flex items-center justify-between border-t border-line/60 pt-1.5 text-sm">
            <span className="font-bold text-ink">Total Perkiraan Biaya</span>
            <span className="text-base font-extrabold text-primary">{rupiah(totalPrice)}</span>
          </div>
        </div>

        <Btn
          className="w-full"
          size="lg"
          icon={Save}
          disabled={!cart.length}
          onClick={onSave}
        >
          Simpan Pesanan
        </Btn>
        {currentStore && (
          <p className="mt-2 text-center text-[11px] text-ink-soft">
            Pesanan dibuat untuk: <span className="font-semibold text-ink">{currentStore.name}</span>
          </p>
        )}
      </div>
    </aside>
  );
}

/* =========================================================================
   3. PriceComparisonModal: Fitur Perbandingan Harga Antar Toko Pemasok
   ========================================================================= */
function PriceComparisonModal({ open, initialProductId, onClose, onSelectStoreAndProduct }) {
  const { stores, products, priceOfStore, priceHistory } = useApp();
  const [selectedProductId, setSelectedProductId] = useState(initialProductId || '');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('cheapest'); // 'cheapest' | 'expensive'

  useEffect(() => {
    if (open) {
      if (initialProductId) {
        setSelectedProductId(initialProductId);
      } else if (products.length > 0 && !selectedProductId) {
        setSelectedProductId(products[0].id);
      }
      setSearch('');
    }
  }, [open, initialProductId, products, selectedProductId]);

  if (!open) return null;

  // Filter daftar barang untuk dropdown / pencarian
  const filteredProducts = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  // Hitung harga dari setiap toko yang menyediakan barang ini
  const comparisonData = (() => {
    if (!selectedProduct) return [];
    const storeIds = selectedProduct.storeIds || [];
    const units = selectedProduct.units || [];
    const baseUnit = units[0] || { name: 'pcs', factor: 1 };
    const baseUnitName = baseUnit.name;

    // Untuk setiap toko pemasok yang menyediakan barang ini
    const list = storeIds
      .map((sid) => {
        const store = stores.find((s) => s.id === sid);
        if (!store) return null;

        // Ambil satuan yang ditawarkan & cari harga satuan dasar ekuivalen
        // Jika ada satuan kemasan (factor > 1), tampilkan juga harga kemasannya
        const unitDetails = units.map((u) => {
          const pr = priceOfStore(store.id, selectedProduct.id, u.id);
          const factor = Number(u.factor) || 1;
          const equivBasePrice = factor > 0 ? pr / factor : pr;
          return {
            unit: u,
            price: pr,
            factor,
            equivBasePrice,
          };
        });

        // Ambil harga satuan dasar terendah yang ditawarkan oleh toko ini
        const bestUnitDetail = [...unitDetails].sort((a, b) => a.equivBasePrice - b.equivBasePrice)[0];

        // Cari riwayat perubahan harga terakhir toko ini untuk barang terkait
        const lastHistory = priceHistory
          .filter((h) => h.storeId === store.id && h.productId === selectedProduct.id)
          .sort((a, b) => new Date(b.changedAt || 0) - new Date(a.changedAt || 0))[0];

        return {
          store,
          unitDetails,
          bestUnitDetail,
          equivBasePrice: bestUnitDetail?.equivBasePrice || 0,
          lastUpdated: lastHistory?.changedAt || null,
        };
      })
      .filter(Boolean);

    // Hitung toko termurah
    const minEquivPrice = Math.min(...list.map((item) => item.equivBasePrice), Infinity);

    const withCheapestFlag = list.map((item) => ({
      ...item,
      isCheapest: item.equivBasePrice > 0 && Math.abs(item.equivBasePrice - minEquivPrice) < 0.01,
      diffFromMin: item.equivBasePrice - minEquivPrice,
    }));

    // Sorting
    withCheapestFlag.sort((a, b) => {
      if (sortBy === 'cheapest') return a.equivBasePrice - b.equivBasePrice;
      if (sortBy === 'expensive') return b.equivBasePrice - a.equivBasePrice;
      return a.store.name.localeCompare(b.store.name);
    });

    return withCheapestFlag;
  })();

  const baseUnitName = selectedProduct?.units?.[0]?.name || 'pcs';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Perbandingan Harga Antar Toko"
      subtitle="Bandingkan harga beli barang di seluruh pemasok berdasarkan acuan ekuivalen satuan dasar."
      size="xl"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      {/* Pemilihan Barang & Sorting */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
          <div className="w-full sm:w-64">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari barang untuk dibandingkan..."
            />
          </div>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="input h-9 text-xs font-semibold text-ink flex-1"
          >
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.category || 'Umum'})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-soft shrink-0">Urutkan:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input h-9 text-xs font-semibold text-ink"
          >
            <option value="cheapest">⭐ Harga Termurah</option>
            <option value="expensive">Harga Termahal</option>
            <option value="name">Nama Toko (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Info Barang yang Sedang Dibandingkan */}
      {selectedProduct && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-primary-soft/40 p-3.5">
          <div className="flex items-center gap-3">
            <ProductImage product={selectedProduct} size="md" />
            <div>
              <p className="text-sm font-extrabold text-ink">{selectedProduct.name}</p>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-ink-soft">
                <span className="font-semibold text-primary">{selectedProduct.category || 'Umum'}</span>
                <span>·</span>
                <span>Satuan dasar: <strong>{baseUnitName}</strong></span>
                <span>·</span>
                <span>Disediakan oleh <strong>{comparisonData.length} toko pemasok</strong></span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
              Harga Acuan Dasar
            </span>
            <p className="text-xs font-extrabold text-primary">
              Per 1 {baseUnitName}
            </p>
          </div>
        </div>
      )}

      {/* Hasil Perbandingan Toko */}
      <div className="mt-4 space-y-3">
        {comparisonData.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-primary-soft/30 p-8 text-center text-xs text-ink-soft">
            <Scale className="mx-auto mb-2 h-7 w-7 text-primary" />
            <p className="font-bold text-ink">Belum Ada Toko Pemasok Terhubung</p>
            <p className="mt-1">
              Barang ini belum dihubungkan dengan toko pemasok mana pun. Anda dapat menghubungkan toko pemasok di halaman Barang.
            </p>
          </div>
        ) : (
          comparisonData.map((item, idx) => {
            const { store, unitDetails, bestUnitDetail, isCheapest, diffFromMin, lastUpdated } = item;
            return (
              <div
                key={store.id}
                className={`relative flex flex-col justify-between rounded-xl border p-4 transition shadow-soft sm:flex-row sm:items-center gap-3 ${
                  isCheapest
                    ? 'border-emerald-300 bg-emerald-50/50 ring-1 ring-emerald-300'
                    : 'border-line bg-white hover:border-primary/40'
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-sm text-ink leading-snug break-words">{store.name}</p>
                    {isCheapest && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                        <Sparkles className="h-3 w-3" />
                        ⭐ Termurah
                      </span>
                    )}
                    {diffFromMin > 0 && (
                      <span className="text-[11px] font-semibold text-rose-600">
                        +{rupiah(diffFromMin)} / {baseUnitName} lebih mahal
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                    {store.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-primary" />
                        {store.phone}
                      </span>
                    )}
                    {store.address && (
                      <span className="flex items-center gap-1 text-[11px] break-words line-clamp-2 max-w-sm" title={store.address}>
                        <MapPin className="h-3 w-3 text-primary" />
                        {store.address}
                      </span>
                    )}
                    {lastUpdated && (
                      <span className="text-[11px]">
                        Diperbarui: {formatDateTime(lastUpdated)}
                      </span>
                    )}
                  </div>

                  {/* Rincian Seluruh Satuan yang Disediakan Toko Ini */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {unitDetails.map((ud) => (
                      <span
                        key={ud.unit.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink"
                      >
                        <span className="font-bold text-primary">{rupiah(ud.price)}</span>
                        <span className="text-ink-soft">/ {ud.unit.name}</span>
                        {ud.factor > 1 && (
                          <span className="text-[10px] text-ink-soft font-mono">
                            (setara {rupiah(ud.equivBasePrice)} / {baseUnitName})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Harga Ekuivalen Dasar & Tombol Pesan */}
                <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 border-line/60 pt-2 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                      Setara Satuan Dasar
                    </span>
                    <p className={`text-base font-extrabold ${isCheapest ? 'text-emerald-700' : 'text-primary'}`}>
                      {rupiah(item.equivBasePrice)}
                      <span className="text-xs font-normal text-ink-soft"> / {baseUnitName}</span>
                    </p>
                  </div>
                  <Btn
                    size="sm"
                    icon={ShoppingCart}
                    variant={isCheapest ? 'primary' : 'soft'}
                    onClick={() =>
                      onSelectStoreAndProduct(
                        store.id,
                        selectedProduct,
                        bestUnitDetail?.unit?.id || selectedProduct.units[0]?.id
                      )
                    }
                  >
                    Pilih Toko & Pesan
                  </Btn>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

/* =========================================================================
   4. PriceHistoryModal: Modal Riwayat Perubahan Harga Toko (Upgraded)
   ========================================================================= */
function PriceHistoryModal({ open, initialStoreId = '', onClose }) {
  const { stores, products, priceHistory } = useApp();
  const [storeFilter, setStoreFilter] = useState('semua');
  const [typeFilter, setTypeFilter] = useState('semua'); // 'semua' | 'naik' | 'turun'
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setStoreFilter(initialStoreId || 'semua');
      setTypeFilter('semua');
      setSearch('');
    }
  }, [open, initialStoreId]);

  if (!open) return null;

  // Filter riwayat
  const filtered = priceHistory.filter((h) => {
    if (storeFilter !== 'semua' && h.storeId !== storeFilter) return false;
    const diff = (Number(h.newPrice) || 0) - (Number(h.oldPrice) || 0);
    if (typeFilter === 'naik' && diff <= 0) return false;
    if (typeFilter === 'turun' && diff >= 0) return false;

    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (h.productNameSnapshot && h.productNameSnapshot.toLowerCase().includes(q)) ||
      (h.storeNameSnapshot && h.storeNameSnapshot.toLowerCase().includes(q)) ||
      (h.unitName && h.unitName.toLowerCase().includes(q))
    );
  });

  // Metrik ringkasan
  const totalRecords = filtered.length;
  const increaseCount = filtered.filter(
    (h) => (Number(h.newPrice) || 0) > (Number(h.oldPrice) || 0)
  ).length;
  const decreaseCount = filtered.filter(
    (h) => (Number(h.newPrice) || 0) < (Number(h.oldPrice) || 0)
  ).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Riwayat Perubahan Harga Barang Toko"
      subtitle="Pantau histori perubahan harga beli dari pemasok beserta nominal dan persentase perubahannya."
      size="xl"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      {/* Kartu Ringkasan Metrik */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-line bg-primary-soft/40 p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
            Total Perubahan
          </span>
          <p className="text-base font-extrabold text-ink mt-0.5">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
            Kenaikan Harga
          </span>
          <p className="text-base font-extrabold text-rose-600 mt-0.5">{increaseCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Penurunan Harga
          </span>
          <p className="text-base font-extrabold text-emerald-600 mt-0.5">{decreaseCount}</p>
        </div>
      </div>

      {/* Filter Toko, Tipe, & Pencarian */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-line">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="input h-9 text-xs font-semibold text-ink"
            title="Filter toko pemasok"
          >
            <option value="semua">Semua Toko Pemasok</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input h-9 text-xs font-semibold text-ink"
            title="Filter arah perubahan harga"
          >
            <option value="semua">Semua Perubahan</option>
            <option value="naik">📈 Kenaikan Saja</option>
            <option value="turun">📉 Penurunan Saja</option>
          </select>

          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang atau toko..."
            className="w-48 sm:w-60"
          />
        </div>
        <span className="text-xs font-semibold text-ink-soft">
          {filtered.length} riwayat ditemukan
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-primary-soft/30 p-8 text-center text-xs text-ink-soft">
          <History className="mx-auto mb-2 h-7 w-7 text-primary" />
          <p className="font-bold text-ink">Belum Ada Riwayat Perubahan Harga</p>
          <p className="mt-1">
            Riwayat tercatat secara otomatis setiap kali Anda memperbarui harga beli melalui menu "Kelola Harga".
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink">
              <tr>
                <th className="px-3 py-2.5">Waktu Perubahan</th>
                <th className="px-3 py-2.5">Nama Barang</th>
                <th className="px-3 py-2.5">Toko Pemasok</th>
                <th className="px-3 py-2.5">Satuan</th>
                <th className="px-3 py-2.5 text-right">Harga Lama</th>
                <th className="px-3 py-2.5 text-right">Harga Baru</th>
                <th className="px-3 py-2.5 text-right">Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {filtered.map((h) => {
                const oldP = Number(h.oldPrice) || 0;
                const newP = Number(h.newPrice) || 0;
                const diff = newP - oldP;
                const isIncrease = diff > 0;
                const pct = oldP > 0 ? ((diff / oldP) * 100).toFixed(1) : null;

                return (
                  <tr key={h.id} className="hover:bg-primary-soft/20">
                    <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">
                      {formatDateTime(h.changedAt)}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-ink">
                      {h.productNameSnapshot}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {h.storeNameSnapshot || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{h.unitName}</td>
                    <td className="px-3 py-2.5 text-right text-ink-soft line-through">
                      {rupiah(oldP)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-extrabold text-ink">
                      {rupiah(newP)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                          isIncrease
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {isIncrease ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        <span>
                          {isIncrease ? '+' : ''}{rupiah(diff)} {pct ? `(${isIncrease ? '+' : ''}${pct}%)` : ''}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* =========================================================================
   5. StoreDetailModal: Modal Detail Informasi Toko Pemasok
   ========================================================================= */
function StoreDetailModal({ open, store, onClose, onSelectStore, onEdit }) {
  const { products, orders, priceOfStore } = useApp();

  if (!open || !store) return null;

  const storeProducts = products.filter(
    (p) => !p.archived && p.active !== false && p.storeIds && p.storeIds.includes(store.id)
  );
  const storeOrders = orders.filter((o) => o.storeId === store.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Detail Toko — ${store.name}`}
      subtitle="Informasi kontak, alamat, serta rincian barang yang tersedia dari toko ini."
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Btn
            variant="soft"
            size="sm"
            icon={Pencil}
            onClick={() => onEdit(store)}
          >
            Edit Toko
          </Btn>
          <div className="flex gap-2">
            <Btn variant="ghost" size="sm" onClick={onClose}>
              Tutup
            </Btn>
            <Btn
              size="sm"
              icon={ShoppingCart}
              onClick={() => onSelectStore(store.id)}
            >
              Pilih Toko Ini
            </Btn>
          </div>
        </div>
      }
    >
      {/* Informasi Umum Toko */}
      <div className="rounded-xl border border-line bg-primary-soft/40 p-3.5 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Nama Toko</p>
            <p className="font-extrabold text-ink leading-snug break-words">{store.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Nomor Telepon / Kontak</p>
            <p className="font-semibold text-ink break-all">{store.phone || '— Belum diatur'}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Alamat</p>
          <p className="font-semibold text-ink leading-relaxed break-words">{store.address || '— Belum diatur'}</p>
        </div>

        {store.note && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Catatan Toko</p>
            <p className="italic text-ink leading-relaxed break-words">“{store.note}”</p>
          </div>
        )}

        <div className="flex justify-between border-t border-line/60 pt-2 text-[11px] text-ink-soft">
          <span>Total Riwayat Pesanan: <strong className="text-ink">{storeOrders.length} pesanan</strong></span>
          <span>Terdaftar sejak: {formatDateTime(store.createdAt)}</span>
        </div>
      </div>

      {/* Daftar Barang dari Toko Ini */}
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink">
          Barang Tersedia ({storeProducts.length})
        </p>
        {storeProducts.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line bg-primary-soft/30 p-3 text-center text-xs text-ink-soft">
            Belum ada barang yang dihubungkan ke toko ini.
          </p>
        ) : (
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {storeProducts.map((p) => {
              const units = p.units || [];
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-white p-2.5 text-xs shadow-soft"
                >
                  <div>
                    <p className="font-bold text-ink leading-snug break-words">{p.name}</p>
                    <p className="text-[11px] text-ink-soft">{p.category || 'Tanpa kategori'}</p>
                  </div>
                  <div className="text-right">
                    {units.map((u) => {
                      const pr = priceOfStore(store.id, p.id, u.id);
                      return (
                        <p key={u.id} className="text-[11px] font-semibold text-primary">
                          {rupiah(pr)} / {u.name}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================================
   6. StoreFormModal: Formulir Tambah / Edit Toko Pemasok
   ========================================================================= */
function StoreFormModal({
  open,
  title,
  onClose,
  initialData = null,
  submitLabel = 'Simpan',
  onSubmit,
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialData?.name || '');
      setPhone(initialData?.phone || '');
      setAddress(initialData?.address || '');
      setNote(initialData?.note || '');
      setError('');
    }
  }, [open, initialData]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) {
      setError('Nama toko wajib diisi.');
      return;
    }
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      note: note.trim(),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle="Kelola informasi toko pemasok untuk mempermudah pemesanan barang."
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={Store} onClick={submit}>
            {submitLabel}
          </Btn>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Nama Toko Pemasok" required error={error}>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError('');
            }}
            placeholder="contoh: Toko Makmur Sembako"
            autoFocus
          />
        </Field>

        <Field label="Nomor Telepon / Kontak (opsional)">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="contoh: 081234567890 / Pak Budi"
          />
        </Field>

        <Field label="Alamat Toko (opsional)">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="contoh: Pasar Induk Blok B No. 12"
          />
        </Field>

        <Field label="Catatan Tambahan (opsional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="contoh: Buka jam 06.00, gratis ongkir minimal order 1jt..."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* =========================================================================
   7. ManagePriceModal: Pengaturan Harga Acuan Beli Pemasok
   ========================================================================= */
function ManagePriceModal({ open, initialStoreId = '', onClose }) {
  const { stores, products, priceOfStore, saveStorePrices, priceHistory, pushToast } = useApp();
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || '');
  const [rows, setRows] = useState({});
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (open) {
      setStoreId(initialStoreId || stores[0]?.id || '');
      setRows({});
      setError('');
      setShowHistory(false);
    }
  }, [open, initialStoreId, stores]);

  useEffect(() => {
    setRows({});
    setError('');
  }, [storeId]);

  const store = stores.find((s) => s.id === storeId);
  const lines = useMemo(() => {
    if (!storeId) return [];
    return products
      .filter((p) => p.storeIds && p.storeIds.includes(storeId))
      .flatMap((p) =>
        (p.units || []).map((u) => ({
          key: `${p.id}:${u.id}`,
          productId: p.id,
          product: p,
          unitId: u.id,
          unitName: u.name,
          unitFactor: Number(u.factor) || 1,
          oldPrice: priceOfStore(storeId, p.id, u.id),
        }))
      );
  }, [storeId, products, priceOfStore]);

  const selected = lines.filter((l) => rows[l.key]?.checked);

  const history = useMemo(
    () => priceHistory.filter((h) => h.storeId === storeId).slice(0, 30),
    [priceHistory, storeId]
  );

  const update = (key, patch) =>
    setRows((prev) => ({ ...prev, [key]: { ...(prev[key] || { checked: false, newPrice: '' }), ...patch } }));

  const save = () => {
    const entries = [];
    for (const l of lines) {
      const r = rows[l.key];
      if (!r || !r.checked) continue;
      const np = Number(r.newPrice);
      if (!(np > 0)) {
        setError(`Harga baru untuk “${l.product.name} (${l.unitName})” harus berupa angka lebih dari 0.`);
        return;
      }
      entries.push({ productId: l.productId, unitId: l.unitId, price: np });
    }
    if (!entries.length) {
      setError('Pilih minimal satu barang, lalu isi harga baru yang akan disimpan.');
      return;
    }
    saveStorePrices(storeId, entries);
    pushToast(`Harga ${entries.length} barang diperbarui untuk ${store ? store.name : 'toko'}`);
    onClose();
  };

  const fmtPrice = (v) =>
    v === '' || v == null ? '—' : rupiah(Number(v) > 0 ? Number(v) : 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kelola Harga Beli Barang"
      subtitle="Ubah harga referensi pembelian per pemasok. Pemasok lain & pesanan lama tidak ikut berubah."
      size="xl"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={Tag} onClick={save} disabled={!selected.length}>
            Simpan Perubahan
          </Btn>
        </>
      }
    >
      <div className="mb-3">
        <Field label="Pilih Toko Pemasok" required>
          <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {lines.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={PackageMinus}
            title="Belum ada barang di toko ini"
            description="Tambahkan barang dengan toko ini melalui halaman Barang terlebih dahulu."
          />
        </div>
      ) : (
        <>
          <div className="mb-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {lines.map((l) => {
              const r = rows[l.key] || { checked: false, newPrice: '' };
              return (
                <div
                  key={l.key}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                    r.checked ? 'border-primary/50 bg-primary-soft/30' : 'border-line bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={r.checked}
                    onChange={(e) => update(l.key, { checked: e.target.checked })}
                    title="Pilih barang untuk diubah harganya"
                    className="mt-1.5 h-4 w-4"
                  />
                  <ProductImage product={l.product} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink leading-snug line-clamp-2 break-words" title={l.product.name}>{l.product.name}</p>
                    <p className="text-[11px] text-ink-soft">
                      {l.unitName}
                      {l.unitFactor !== 1 && (
                        <span className="ml-1">· 1 = {formatQty(l.unitFactor)} satuan dasar</span>
                      )}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-end gap-3">
                      <p className="text-xs text-ink-soft">
                        Harga acuan saat ini: <span className="font-bold text-ink">{rupiah(l.oldPrice)}</span>
                      </p>
                      <div className="w-36">
                        <Input
                          type="number"
                          min="0"
                          value={r.newPrice}
                          disabled={!r.checked}
                          onChange={(e) => update(l.key, { newPrice: e.target.value })}
                          placeholder="Harga baru (Rp)"
                          className="!px-2 !py-1 text-xs font-bold text-ink"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
          )}

          {selected.length > 0 && (
            <div className="rounded-xl border border-line bg-primary-soft/50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  Pratinjau Perubahan ({selected.length} baris)
                </p>
                <span className="text-[11px] font-semibold text-primary">{store ? store.name : ''}</span>
              </div>
              <div className="mt-2 hidden grid-cols-[1fr_110px_110px] gap-2 px-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft sm:grid">
                <span>Barang</span>
                <span className="text-right">Harga Lama</span>
                <span className="text-right">Harga Baru</span>
              </div>
              <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1 sm:mt-1.5">
                {selected.map((l) => {
                  const r = rows[l.key] || { newPrice: '' };
                  return (
                    <div
                      key={l.key}
                      className="grid grid-cols-1 gap-0.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs sm:grid-cols-[1fr_110px_110px] sm:items-center sm:gap-2"
                    >
                      <p className="font-semibold text-ink leading-snug line-clamp-2 break-words">
                        {l.product.name} — {l.unitName}
                      </p>
                      <p className="text-right text-ink-soft sm:pr-2">{rupiah(l.oldPrice)}</p>
                      <p className="text-right font-bold text-primary sm:pr-2">{fmtPrice(r.newPrice)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Riwayat Khusus Toko Terpilih */}
          <div className="mt-4 rounded-xl border border-line bg-white">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                Riwayat Perubahan Harga {store ? `— ${store.name}` : ''} ({history.length})
              </span>
              <span className="text-[11px] font-bold text-primary">
                {showHistory ? 'Sembunyikan' : 'Tampilkan'}
              </span>
            </button>
            {showHistory && (
              <div className="border-t border-line px-3.5 py-3">
                {history.length === 0 ? (
                  <p className="text-xs text-ink-soft">
                    Belum ada perubahan harga tercatat untuk toko ini.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <div
                        key={h.id}
                        className="grid grid-cols-1 gap-0.5 rounded-lg bg-primary-soft/30 px-2.5 py-1.5 text-xs sm:grid-cols-[1fr_auto] sm:items-center sm:gap-2"
                      >
                        <p className="font-semibold text-ink leading-snug line-clamp-2 break-words">
                          {h.productNameSnapshot} — {h.unitName}
                        </p>
                        <p className="text-ink-soft sm:text-right">
                          <span className="line-through">{rupiah(h.oldPrice)}</span>
                          <span className="mx-1.5 text-primary">→</span>
                          <span className="font-bold text-primary">{rupiah(h.newPrice)}</span>
                          {h.changedAt && (
                            <span className="ml-2 text-[10px] text-ink-soft">{formatDateTime(h.changedAt)}</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
