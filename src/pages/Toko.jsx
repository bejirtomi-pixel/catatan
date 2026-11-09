import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  CheckCircle2,
  Eye,
  FilterX,
  History,
  MapPin,
  Minus,
  PackageCheck,
  PackageMinus,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
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
  const [cart, setCart] = useState([]);
  const [cartStoreId, setCartStoreId] = useState(null);
  const [pendingStoreId, setPendingStoreId] = useState(null);
  const processedKey = useRef(null);
  const [note, setNote] = useState('');
  const [detail, setDetail] = useState(null);
  const [dupConfirm, setDupConfirm] = useState(null);

  // Modal states
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [storeDetailTarget, setStoreDetailTarget] = useState(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Pastikan storeId selalu mengacu ke toko yang ada
  useEffect(() => {
    if (stores.length > 0 && (!storeId || !stores.some((s) => s.id === storeId))) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);

  // Quick action "Buat Pesanan" dari detail barang: siapkan toko & masukkan barang ke keranjang.
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.storeId && !st.addProductId)) return;
    if (processedKey.current === location.key) return;
    processedKey.current = location.key;
    const target = stores.find((s) => s.id === st.storeId) || (st.storeId ? undefined : stores[0]);
    if (st.addProductId) {
      const p = products.find((x) => x.id === st.addProductId);
      if (p) {
        const units = p.units || [];
        const unitId = units.length > 1 ? units[units.length - 1].id : units[0]?.id;
        const unit = units.find((u) => u.id === unitId) || units[0];
        if (unit && target) {
          if (cartStoreId && cartStoreId !== target.id && cart.length > 0) {
            setPendingStoreId(target.id);
          } else {
            const price = priceOfStore(target.id, p.id, unit.id);
            setStoreId(target.id);
            setCartStoreId(target.id);
            setCart((prev) => {
              const next = prev.filter((c) => c.productId !== p.id);
              next.push({
                productId: p.id,
                name: p.name,
                unitId: unit.id,
                unitName: unit.name,
                unitFactor: unit.factor,
                quantity: 1,
                priceRef: price || Number(unit.price),
                priceActual: price || Number(unit.price),
              });
              return next;
            });
            pushToast(`${p.name} masuk keranjang pesanan.`);
          }
        }
      }
    } else if (st.storeId && target) {
      setStoreId(target.id);
    }
  }, [location.state, stores, products, priceOfStore, cartStoreId, cart.length, pushToast]);

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
    () => (storeId ? products.filter((p) => p.storeIds && p.storeIds.includes(storeId)) : []),
    [products, storeId]
  );

  const cartStoreName = stores.find((s) => s.id === cartStoreId)?.name;

  // Cart operations
  const addToCart = (product, unitId, qtyNum, priceActual) => {
    const unit = (product.units || []).find((u) => u.id === unitId) || product.units[0];
    if (!unit || qtyNum <= 0) return;
    if (cartStoreId && cartStoreId !== storeId && cart.length > 0) {
      setPendingStoreId(storeId);
      return;
    }
    const priceRef = priceOfStore(storeId, product.id, unit.id) || Number(unit.price);
    const actual = Number(priceActual) >= 0 ? Number(priceActual) : priceRef;
    setCart((prev) => {
      const next = prev.filter((c) => c.productId !== product.id);
      next.push({
        productId: product.id,
        name: product.name,
        unitId: unit.id,
        unitName: unit.name,
        unitFactor: unit.factor,
        quantity: qtyNum,
        priceRef,
        priceActual: actual,
      });
      return next;
    });
    setCartStoreId(storeId);
    pushToast(`${formatQty(qtyNum)} ${unit.name} “${product.name}” dimasukkan ke keranjang.`);
  };

  const updateCartQty = (productId, newQty) => {
    const val = Number(newQty);
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, quantity: isNaN(val) ? 0 : val } : c))
    );
  };

  const updateCartUnit = (productId, newUnitId) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const unit = (product.units || []).find((u) => u.id === newUnitId);
    if (!unit) return;
    const priceRef = priceOfStore(cartStoreId || storeId, productId, unit.id) || Number(unit.price);
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? {
              ...c,
              unitId: unit.id,
              unitName: unit.name,
              unitFactor: unit.factor,
              priceRef,
              priceActual: priceRef,
            }
          : c
      )
    );
  };

  const updateCartPrice = (productId, newPrice) => {
    const val = Number(newPrice);
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, priceActual: isNaN(val) ? 0 : val } : c))
    );
  };

  const removeFromCart = (productId) =>
    setCart((prev) => {
      const next = prev.filter((c) => c.productId !== productId);
      if (next.length === 0) setCartStoreId(null);
      return next;
    });

  const changeStore = (id) => {
    if (!id || id === storeId) return;
    if (cartStoreId && id !== cartStoreId && cart.length > 0) {
      setPendingStoreId(id);
      return;
    }
    setStoreId(id);
    setCartStoreId(null);
    setCart([]);
  };

  const confirmSwitch = () => {
    setStoreId(pendingStoreId);
    setCartStoreId(null);
    setCart([]);
    setPendingStoreId(null);
  };

  const finalizeOrder = () => {
    if (!cart.length || !cartStoreId) return;
    const order = createOrder({
      storeId: cartStoreId,
      items: cart.map((c) => ({
        productId: c.productId,
        unitId: c.unitId,
        quantity: c.quantity,
        priceActual: c.priceActual,
      })),
      note: note ? note.trim() : '',
    });
    pushToast(`Pesanan ${order.id} berhasil dibuat`);
    setCart([]);
    setCartStoreId(null);
    setNote('');
    setDupConfirm(null);
    navigate('/pesanan');
  };

  const saveOrder = () => {
    if (!cart.length || !cartStoreId) {
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

    // Peringatan pesanan ganda: toko yang sama & ada barang yang masih dalam pesanan belum selesai
    const dupes = orders.filter(
      (o) =>
        (o.status === 'belum_diterima' || o.status === 'sebagian' || o.status === 'active') &&
        o.storeId === cartStoreId &&
        o.items.some((it) => cart.some((c) => c.productId === it.productId))
    );
    if (dupes.length > 0) {
      setDupConfirm({ count: dupes.length });
      return;
    }
    finalizeOrder();
  };

  const totalItems = cart.reduce((a, b) => a + (Number(b.quantity) || 0), 0);
  const totalPrice = cart.reduce((a, b) => a + (Number(b.quantity) || 0) * (Number(b.priceActual) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Toko"
        subtitle="Kelola toko pemasok, pencatatan pesanan barang, dan pantau riwayat harga beli."
      >
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,380px)] lg:gap-6">
            <div className="min-w-0 space-y-4">
              {/* Header Selector Toko Terpilih */}
              <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Barang Dari Toko Terpilih
                  </p>
                  <p className="text-xs font-semibold text-ink">
                    {currentStore ? currentStore.name : 'Pilih Toko'}
                    <span className="ml-1.5 font-normal text-ink-soft">
                      ({productsOfStore.length} jenis barang)
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Btn
                    variant="soft"
                    size="sm"
                    icon={Tag}
                    onClick={() => setPriceOpen(true)}
                    title="Ubah harga referensi pembelian barang di toko ini"
                  >
                    Kelola Harga
                  </Btn>
                  <select
                    value={storeId || ''}
                    onChange={(e) => changeStore(e.target.value)}
                    className="input h-9 w-full max-w-[220px] font-semibold text-ink sm:w-56"
                    title="Ganti toko tujuan pesanan"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tabel Barang Toko Terpilih */}
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
                />
              ) : null}
            </div>

            {/* Keranjang Pesanan (Panel Kanan) */}
            <CartPanel
              cart={cart}
              products={products}
              cartStoreName={cartStoreName}
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
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                active ? 'bg-primary text-white' : 'bg-primary-soft text-primary'
                              }`}
                            >
                              <Store className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-ink" title={s.name}>
                                {s.name}
                              </p>
                              {active && (
                                <span className="inline-block rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                                  Toko Terpilih
                                </span>
                              )}
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
                              title="Hapus toko"
                              onClick={() => setDeleteTarget(s)}
                              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Info Ringkas Toko: Kontak & Alamat */}
                        <div className="mt-3 space-y-1 text-xs">
                          <p className="font-semibold text-ink">
                            📦 {count} jenis barang tersedia
                          </p>
                          {s.phone ? (
                            <p className="flex items-center gap-1.5 text-ink-soft">
                              <Phone className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">{s.phone}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] italic text-ink-soft/70">Kontak belum diatur</p>
                          )}
                          {s.address ? (
                            <p className="flex items-center gap-1.5 text-ink-soft">
                              <MapPin className="h-3 w-3 shrink-0 text-primary" />
                              <span className="truncate">{s.address}</span>
                            </p>
                          ) : (
                            <p className="text-[11px] italic text-ink-soft/70">Alamat belum diatur</p>
                          )}
                          {s.note && (
                            <p className="truncate text-[11px] italic text-ink-soft">
                              Catatan: “{s.note}”
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Tombol Aksi Bawah */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-line/60 pt-2.5">
                        <span className="text-[11px] text-ink-soft">
                          {orderCount} pesanan
                        </span>
                        {!active && (
                          <button
                            type="button"
                            onClick={() => changeStore(s.id)}
                            className="rounded-lg px-2.5 py-1 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
                          >
                            Pilih Toko Ini
                          </button>
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

      {/* Confirm modal saat ganti toko dengan keranjang aktif */}
      <ConfirmModal
        open={!!pendingStoreId}
        onClose={() => setPendingStoreId(null)}
        title="Ganti Toko Tujuan?"
        message={`Keranjang masih berisi pesanan dari toko ${cartStoreName}. Jika berpindah toko, keranjang saat ini akan dikosongkan.`}
        confirmLabel="Kosongkan & Ganti Toko"
        danger
        onConfirm={confirmSwitch}
      />

      {/* Confirm modal jika ada pesanan kembar yang masih aktif */}
      <ConfirmModal
        open={!!dupConfirm}
        onClose={() => setDupConfirm(null)}
        title="Pesanan Ganda?"
        message={`Toko ${cartStoreName || 'ini'} masih memiliki ${dupConfirm?.count || 0} pesanan aktif dengan beberapa barang yang sama. Anda tetap bisa melanjutkan, namun periksa kembali agar tidak memesan dua kali.`}
        confirmLabel="Tetap Buat Pesanan"
        onConfirm={finalizeOrder}
      />

      {/* Modal Kelola Harga */}
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
              if (storeId === deleteTarget.id) {
                setStoreId(stores.find((s) => s.id !== deleteTarget.id)?.id || '');
                setCartStoreId(null);
                setCart([]);
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
          if (cartStoreId && cartStoreId !== target.id && cart.length > 0) {
            setPendingStoreId(target.id);
            return;
          }
          const price = priceOfStore(target.id, p.id, unit.id);
          setStoreId(target.id);
          setCartStoreId(target.id);
          setCart((prev) => {
            const next = prev.filter((c) => c.productId !== p.id);
            next.push({
              productId: p.id,
              name: p.name,
              unitId: unit.id,
              unitName: unit.name,
              unitFactor: unit.factor,
              quantity: 1,
              priceRef: price || Number(unit.price),
              priceActual: price || Number(unit.price),
            });
            return next;
          });
          pushToast(`“${p.name}” dimasukkan ke keranjang pesanan.`);
        }}
      />
    </div>
  );
}

/* =========================================================================
   1. OrderTable: Tabel Barang Toko Terpilih dengan Fitur Pencarian & Filter
   ========================================================================= */
function OrderTable({ storeId, storeName, productsOfStore, onAdd, onPreview }) {
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
        <TableWrap minWidth="min-w-[700px]">
          <thead className="border-b border-line bg-primary-soft/50 text-xs font-bold text-ink">
            <tr>
              <TH className="w-10">No</TH>
              <TH className="w-14">Gambar</TH>
              <TH>Nama Barang</TH>
              <TH className="w-36">Pilihan Satuan</TH>
              <TH className="w-36">Harga (Rp)</TH>
              <TH className="w-32 text-center">Jumlah</TH>
              <TH className="text-right">Subtotal & Aksi</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((p, i) => {
              const units = p.units || [];
              const unitId =
                sel[p.id]?.unitId ||
                (units.length > 1 ? units[units.length - 1].id : units[0]?.id);
              const qty = sel[p.id]?.qty || 0;
              const effectivePrice = priceOfStore(storeId, p.id, unitId);
              const priceVal =
                prices[p.id] != null ? prices[p.id] : String(effectivePrice || '');
              const unit = units.find((u) => u.id === unitId) || units[0];

              return (
                <tr key={p.id} className="bg-white transition hover:bg-primary-soft/30">
                  <TD className="text-ink-soft">{i + 1}</TD>
                  <TD>
                    <ProductImage product={p} size="sm" onClick={() => onPreview(p)} />
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => onPreview(p)}
                      className="text-left font-bold text-ink hover:text-primary transition"
                    >
                      {p.name}
                    </button>
                    {p.category && (
                      <p className="mt-0.5 text-[11px] text-ink-soft">{p.category}</p>
                    )}
                  </TD>
                  <TD>
                    <select
                      value={unitId}
                      onChange={(e) => setUnit(p, e.target.value)}
                      className="h-8 w-full appearance-none rounded-lg border border-line bg-white px-2 pr-6 text-xs font-semibold text-ink outline-none focus:border-primary"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {Number(u.factor) !== 1 ? `(x${formatQty(u.factor)})` : ''}
                        </option>
                      ))}
                    </select>
                  </TD>
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
                      {unit && (
                        <p className="mt-0.5 text-[10px] text-ink-soft">
                          acuan: {rupiah(effectivePrice)} / {unit.name}
                        </p>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-center">
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
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-2.5">
                      <span className={`text-xs font-bold ${qty > 0 ? 'text-ink' : 'text-ink-soft'}`}>
                        {rupiah((Number(priceVal) || 0) * qty)}
                      </span>
                      <button
                        type="button"
                        disabled={qty <= 0}
                        onClick={() => {
                          onAdd(p, unitId, qty, Number(priceVal));
                          // Reset qty pada baris setelah masuk keranjang
                          setSel((prev) => ({
                            ...prev,
                            [p.id]: { ...prev[p.id], qty: 0 },
                          }));
                        }}
                        title="Tambahkan barang ke keranjang pesanan"
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">+ Keranjang</span>
                      </button>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </div>
  );
}

/* =========================================================================
   2. CartPanel: Keranjang Pesanan Lengkap dengan Pengaturan Satuan & Harga
   ========================================================================= */
function CartPanel({
  cart,
  products,
  cartStoreName,
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
                {cart.length > 0 ? `${cart.length} barang dipilih` : 'Satu pesanan untuk satu toko'}
              </p>
            </div>
          </div>
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
              <p className="mt-1">Pilih satuan, tentukan jumlah, lalu klik tombol "+ Keranjang" pada tabel barang di sebelah kiri.</p>
            </div>
          ) : (
            cart.map((it) => {
              const product = products.find((p) => p.id === it.productId);
              const availableUnits = product?.units || [];
              const subtotal = (Number(it.quantity) || 0) * (Number(it.priceActual) || 0);

              return (
                <div
                  key={it.productId}
                  className="rounded-xl border border-line bg-white p-3 shadow-soft transition hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-ink">{it.name}</p>
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
                  <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
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
                              {u.name} {Number(u.factor) !== 1 ? `(x${formatQty(u.factor)})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-ink">{it.unitName}</p>
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
        {cartStoreName && (
          <p className="mt-2 text-center text-[11px] text-ink-soft">
            Pesanan dibuat untuk: <span className="font-semibold text-ink">{cartStoreName}</span>
          </p>
        )}
      </div>
    </aside>
  );
}

/* =========================================================================
   3. StoreDetailModal: Modal Detail Informasi Toko Pemasok
   ========================================================================= */
function StoreDetailModal({ open, store, onClose, onSelectStore, onEdit }) {
  const { products, orders, priceOfStore } = useApp();

  if (!open || !store) return null;

  const storeProducts = products.filter((p) => p.storeIds && p.storeIds.includes(store.id));
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
            <p className="font-extrabold text-ink">{store.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Nomor Telepon / Kontak</p>
            <p className="font-semibold text-ink">{store.phone || '— Belum diatur'}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Alamat</p>
          <p className="font-semibold text-ink">{store.address || '— Belum diatur'}</p>
        </div>

        {store.note && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Catatan Toko</p>
            <p className="italic text-ink">“{store.note}”</p>
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
                    <p className="font-bold text-ink">{p.name}</p>
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
   4. StoreFormModal: Formulir Tambah / Edit Toko Pemasok
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
   5. ManagePriceModal: Pengaturan Harga Acuan Beli Pemasok
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
          unitFactor: Number(u.factor),
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
                    <p className="truncate text-sm font-bold text-ink">{l.product.name}</p>
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
                      <p className="truncate font-semibold text-ink">
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
                        <p className="truncate font-semibold text-ink">
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

/* =========================================================================
   6. PriceHistoryModal: Modal Riwayat Lengkap Perubahan Harga Toko
   ========================================================================= */
function PriceHistoryModal({ open, initialStoreId = '', onClose }) {
  const { stores, priceHistory } = useApp();
  const [storeFilter, setStoreFilter] = useState('semua');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      setStoreFilter(initialStoreId || 'semua');
      setSearch('');
    }
  }, [open, initialStoreId]);

  if (!open) return null;

  const filtered = priceHistory.filter((h) => {
    if (storeFilter !== 'semua' && h.storeId !== storeFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (h.productNameSnapshot && h.productNameSnapshot.toLowerCase().includes(q)) ||
      (h.storeNameSnapshot && h.storeNameSnapshot.toLowerCase().includes(q)) ||
      (h.unitName && h.unitName.toLowerCase().includes(q))
    );
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Riwayat Perubahan Harga Barang Toko"
      subtitle="Pantau seluruh histori kenaikan atau penurunan harga beli dari masing-masing toko pemasok."
      size="lg"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      {/* Filter Toko & Pencarian */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3">
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

          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari barang atau toko..."
            className="w-48 sm:w-60"
          />
        </div>
        <span className="text-xs font-semibold text-ink-soft">
          {filtered.length} riwayat tercatat
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-primary-soft/30 p-6 text-center text-xs text-ink-soft">
          <History className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="font-bold text-ink">Belum Ada Riwayat Perubahan Harga</p>
          <p className="mt-1">
            Riwayat akan tercatat secara otomatis setiap kali Anda memperbarui harga beli melalui tombol "Kelola Harga".
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[580px] text-left text-xs">
            <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink">
              <tr>
                <th className="px-3 py-2.5">Waktu Perubahan</th>
                <th className="px-3 py-2.5">Nama Barang</th>
                <th className="px-3 py-2.5">Toko Pemasok</th>
                <th className="px-3 py-2.5">Satuan</th>
                <th className="px-3 py-2.5 text-right">Harga Lama</th>
                <th className="px-3 py-2.5 text-right">Harga Baru</th>
                <th className="px-3 py-2.5 text-right">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {filtered.map((h) => {
                const diff = (Number(h.newPrice) || 0) - (Number(h.oldPrice) || 0);
                const isIncrease = diff > 0;
                return (
                  <tr key={h.id} className="hover:bg-primary-soft/20">
                    <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                      {formatDateTime(h.changedAt)}
                    </td>
                    <td className="px-3 py-2 font-bold text-ink">
                      {h.productNameSnapshot}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {h.storeNameSnapshot || '—'}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">{h.unitName}</td>
                    <td className="px-3 py-2 text-right text-ink-soft line-through">
                      {rupiah(h.oldPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-extrabold text-primary">
                      {rupiah(h.newPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      <span className={isIncrease ? 'text-rose-600' : 'text-emerald-600'}>
                        {isIncrease ? '+' : ''}{rupiah(diff)}
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
