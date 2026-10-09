import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  Minus,
  PackageMinus,
  Pencil,
  Plus,
  Save,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { rupiah, formatQty } from '../utils/format';
import {
  Btn,
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
    createStore,
    updateStore,
    deleteStore,
    createOrder,
    priceOfStore,
    saveStorePrices,
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
          }
        }
      }
    } else if (st.storeId && target) {
      setStoreId(target.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, stores, products, priceOfStore, cartStoreId, cart.length]);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [priceOpen, setPriceOpen] = useState(false);

  const storeList = useMemo(() => {
    const q = storeFilter.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(q));
  }, [stores, storeFilter]);

  const productsOfStore = useMemo(
    () => (storeId ? products.filter((p) => p.storeIds.includes(storeId)) : []),
    [products, storeId]
  );

  const cartStoreName = stores.find((s) => s.id === cartStoreId)?.name;

  const addToCart = (product, unitId, qtyNum, priceActual) => {
    const unit = (product.units || []).find((u) => u.id === unitId);
    if (!unit || qtyNum <= 0) return;
    if (cartStoreId && cartStoreId !== storeId) return;
    const priceRef = priceOfStore(storeId, product.id, unitId) || Number(unit.price);
    const actual = Number(priceActual) > 0 ? Number(priceActual) : priceRef;
    setCart((prev) => {
      const next = prev.filter((c) => c.productId !== product.id);
      next.push({ productId: product.id, name: product.name, unitId, unitName: unit.name, unitFactor: unit.factor, quantity: qtyNum, priceRef, priceActual: actual });
      return next;
    });
    setCartStoreId(storeId);
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

  const saveOrder = () => {
    if (!cart.length || !cartStoreId) return;
    const order = createOrder({
      storeId: cartStoreId,
      items: cart.map((c) => ({
        productId: c.productId,
        unitId: c.unitId,
        quantity: c.quantity,
        priceActual: c.priceActual,
      })),
      note,
    });
    pushToast(`Pesanan ${order.id} berhasil dibuat`);
    setCart([]);
    setCartStoreId(null);
    setNote('');
    navigate('/pesanan');
  };

  const totalItems = cart.reduce((a, b) => a + b.quantity, 0);
  const totalPrice = cart.reduce((a, b) => a + b.quantity * b.priceActual, 0);

  return (
    <div>
      <PageHeader title="Toko" subtitle="Kelola toko pemasok & buat pesanan barang.">
        <Btn icon={Plus} onClick={() => setAddOpen(true)}>
          Tambah Toko
        </Btn>
      </PageHeader>

      {stores.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Store}
            title="Belum ada toko pemasok"
            description="Tambah toko pemasok terlebih dahulu untuk mulai membuat pesanan."
            action={
              <Btn size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                Tambah Toko
              </Btn>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)] lg:gap-6">
            <div className="min-w-0 space-y-4">
              {/* Barang toko terpilih */}
              <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                    Barang Toko Terpilih
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden text-xs font-semibold text-ink-soft sm:inline">
                    {productsOfStore.length} barang
                  </span>
                  <Btn variant="soft" size="sm" icon={Tag} onClick={() => setPriceOpen(true)}>
                    Kelola Harga
                  </Btn>
                  <select
                    value={storeId || ''}
                    onChange={(e) => changeStore(e.target.value)}
                    className="input h-9 w-full max-w-[220px] sm:w-56"
                    title="Pilih toko tujuan"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

            {storeId && productsOfStore.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={PackageMinus}
                  title="Belum ada barang di toko ini"
                  description="Tambahkan barang dengan toko ini melalui halaman Barang."
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
                productsOfStore={productsOfStore}
                onAdd={addToCart}
                onPreview={(p) => setDetail(p)}
              />
            ) : null}
          </div>

          {/* Keranjang */}
          <CartPanel
            cart={cart}
            cartStoreName={cartStoreName}
            stores={stores}
            storeId={storeId}
            changeStore={changeStore}
            totalItems={totalItems}
            totalPrice={totalPrice}
            note={note}
            setNote={setNote}
            onRemove={removeFromCart}
            onSave={saveOrder}
          />
          </div>

          {/* Daftar toko pemasok — paling bawah halaman */}
          <div className="card mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-primary-soft/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-primary">
                  Daftar Toko Pemasok ({storeList.length})
                </p>
                <p className="text-xs text-ink-soft">
                  Lihat, cari, tambah, edit, & hapus toko tanpa mengubah toko tujuan pesanan.
                </p>
              </div>
              <SearchInput
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="Cari toko..."
                className="w-full sm:w-72 lg:w-80"
              />
            </div>
            {storeList.length === 0 ? (
              <EmptyState icon={Building2} title="Toko tidak ditemukan" description="Coba kata kunci lain." />
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {storeList.map((s) => {
                  const count = products.filter((p) => p.storeIds.includes(s.id)).length;
                  const active = storeId === s.id;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 transition ${
                        active ? 'bg-primary-soft/60' : 'bg-white'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            active ? 'bg-primary text-white' : 'bg-primary-soft text-primary'
                          }`}
                        >
                          <Store className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                          <p className="text-[11px] text-ink-soft">
                            {count} barang tersedia
                            {active ? ' · toko tujuan' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title="Edit toko"
                          onClick={() => setEditTarget(s)}
                          className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Hapus toko"
                          onClick={() => setDeleteTarget(s)}
                          className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!pendingStoreId}
        onClose={() => setPendingStoreId(null)}
        title="Ganti Toko Tujuan?"
        message={`Keranjang masih berisi pesanan dari ${cartStoreName}. Jika mengganti toko, keranjang akan dikosongkan.`}
        confirmLabel="Kosongkan & Ganti Toko"
        danger
        onConfirm={confirmSwitch}
      />

      <ManagePriceModal
        key={priceOpen ? storeId : 'closed'}
        open={priceOpen}
        initialStoreId={storeId}
        onClose={() => setPriceOpen(false)}
      />

      <StoreFormModal
        open={addOpen}
        title="Tambah Toko"
        onClose={() => setAddOpen(false)}
        initialName=""
        submitLabel="Simpan Toko"
        onSubmit={(name) => {
          const s = createStore(name);
          if (s) {
            pushToast(`Toko ${s.name} berhasil ditambahkan`);
            setStoreId(s.id);
            setAddOpen(false);
          } else {
            pushToast('Nama toko sudah ada.', 'warning');
          }
        }}
      />

      <StoreFormModal
        open={!!editTarget}
        title={`Edit Toko — ${editTarget?.name || ''}`}
        onClose={() => setEditTarget(null)}
        initialName={editTarget?.name || ''}
        submitLabel="Simpan Perubahan"
        onSubmit={(name) => {
          if (editTarget) {
            const res = updateStore(editTarget.id, name);
            if (res?.ok === false) pushToast(res.reason || 'Gagal memperbarui toko.', 'warning');
            else pushToast('Toko berhasil diperbarui');
          }
          setEditTarget(null);
        }}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Toko"
        message={
          deleteTarget
            ? `Hapus toko pemasok “${deleteTarget.name}”? Barang yang hanya dimiliki toko ini tidak akan terhapus, tetapi tidak akan tersedia lagi di toko ini.`
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
              pushToast(`Toko ${deleteTarget.name} berhasil dihapus`);
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
          pushToast(`${p.name} masuk keranjang. Atur jumlah lalu simpan pesanan.`);
        }}
      />
    </div>
  );
}

function OrderTable({ storeId, productsOfStore, onAdd, onPreview }) {
  const { priceOfStore } = useApp();
  const [sel, setSel] = useState({});
  const [prices, setPrices] = useState({});

  const setUnit = (product, unitId) => {
    const unit = (product.units || []).find((u) => u.id === unitId) || product.units[0];
    setSel((prev) => ({ ...prev, [product.id]: { ...prev[product.id], unitId } }));
    setPrices((prev) => ({ ...prev, [product.id]: String(priceOfStore(storeId, product.id, unitId) || (unit ? unit.price : '')) }));
  };

  return (
    <TableWrap minWidth="min-w-[680px]">
      <thead className="border-b border-line bg-primary-soft/50">
        <tr>
          <TH>No</TH>
          <TH>Gambar</TH>
          <TH>Nama Barang</TH>
          <TH>Satuan</TH>
          <TH>Jumlah</TH>
          <TH>Harga (acuan)</TH>
          <TH className="text-right">Aksi</TH>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {productsOfStore.map((p, i) => {
          const units = p.units || [];
          const unitId = sel[p.id]?.unitId || (units.length > 1 ? units[units.length - 1].id : units[0]?.id);
          const qty = sel[p.id]?.qty || 0;
          const effectivePrice = priceOfStore(storeId, p.id, unitId);
          const priceVal = prices[p.id] != null ? prices[p.id] : String(effectivePrice || '');
          const unit = units.find((u) => u.id === unitId) || units[0];
          return (
            <tr key={p.id} className="bg-white transition hover:bg-primary-soft/40">
              <TD className="text-ink-soft">{i + 1}</TD>
              <TD>
                <ProductImage product={p} size="md" onClick={() => onPreview(p)} />
              </TD>
              <TD>
                <button
                  type="button"
                  onClick={() => onPreview(p)}
                  className="text-left font-bold text-ink hover:text-primary"
                >
                  {p.name}
                </button>
                {p.category && <p className="text-[11px] text-ink-soft">{p.category}</p>}
              </TD>
              <TD>
                <div className="relative">
                  <select
                    value={unitId}
                    onChange={(e) => setUnit(p, e.target.value)}
                    className="h-8 w-24 appearance-none rounded-lg border border-line bg-white px-2 pr-6 text-xs font-semibold text-ink outline-none focus:border-primary"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </TD>
              <TD>
                <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-white p-1 shadow-soft">
                  <button
                    type="button"
                    onClick={() => setSel((prev) => ({ ...prev, [p.id]: { ...prev[p.id], unitId, qty: Math.max(0, qty - 1) } }))}
                    disabled={qty <= 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary transition hover:bg-primary hover:text-white disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={qty}
                    onChange={(e) => setSel((prev) => ({ ...prev, [p.id]: { ...prev[p.id], unitId, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) } }))}
                    className="h-7 w-11 border-0 bg-transparent text-center text-sm font-bold text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setSel((prev) => ({ ...prev, [p.id]: { ...prev[p.id], unitId, qty: qty + 1 } }))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white transition hover:brightness-110"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </TD>
              <TD>
                <div className="w-32">
                  <Input
                    type="number"
                    min="0"
                    value={priceVal}
                    onChange={(e) => setPrices((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="!px-2 !py-1.5 text-xs !font-semibold"
                    inputMode="numeric"
                  />
                  {unit && <p className="mt-0.5 text-[10px] text-ink-soft">acuan {rupiah(priceOfStore(storeId, p.id, unitId))} / {unit.name}</p>}
                </div>
              </TD>
              <TD>
                <div className="flex items-center justify-end gap-2">
                  <AnimatePresence mode="popLayout">
                    <motion.span
                      key={qty}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`text-xs font-bold ${qty > 0 ? 'text-ink' : 'text-ink-soft'}`}
                    >
                      {rupiah((Number(priceVal) || 0) * qty)}
                    </motion.span>
                  </AnimatePresence>
                  <button
                    type="button"
                    disabled={qty <= 0}
                    onClick={() => onAdd(p, unitId, qty, Number(priceVal))}
                    title="Tambah ke keranjang"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    <ShoppingCart className="h-4 w-4" />
                  </button>
                </div>
              </TD>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}

function CartPanel({
  cart,
  cartStoreName,
  stores,
  storeId,
  changeStore,
  totalItems,
  totalPrice,
  note,
  setNote,
  onRemove,
  onSave,
}) {
  return (
    <aside>
      <div className="card sticky top-20 p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <ShoppingCart className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-extrabold text-ink">Keranjang Pesanan</h2>
            <p className="text-[11px] text-ink-soft">Satu pesanan untuk satu toko</p>
          </div>
        </div>

        <Field label="Toko Tujuan" required>
          <Select value={storeId} onChange={(e) => changeStore(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {cart.length === 0 ? (
            <p className="rounded-xl bg-primary-soft/60 px-3 py-4 text-center text-xs leading-relaxed text-ink-soft">
              Keranjang masih kosong. Atur satuan, jumlah, dan harga pada tabel barang toko.
            </p>
          ) : (
            cart.map((it) => (
              <div key={it.productId} className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-ink">{it.name}</p>
                  <button
                    type="button"
                    onClick={() => onRemove(it.productId)}
                    className="text-ink-soft transition hover:text-rose-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink-soft">Satuan: {it.unitName}</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-soft">
                    {formatQty(it.quantity)} × {rupiah(it.priceActual)} / {it.unitName}
                  </span>
                  <span className="text-xs font-extrabold text-ink">{rupiah(it.quantity * it.priceActual)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <Field label="Catatan (opsional)" className="mt-4">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="contoh: Kirim pagi hari / minta struk..."
          />
        </Field>

        <div className="mb-3 space-y-1.5 rounded-xl bg-primary-soft/60 p-3.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">Total Barang</span>
            <span className="font-bold text-ink">{totalItems}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">Total Harga</span>
            <span className="text-base font-extrabold text-primary">{rupiah(totalPrice)}</span>
          </div>
        </div>

        <Btn className="w-full" size="lg" icon={Save} disabled={!cart.length} onClick={onSave}>
          Simpan Pesanan
        </Btn>
        {cartStoreName && (
          <p className="mt-2 text-center text-[11px] text-ink-soft">Pesanan untuk: {cartStoreName}</p>
        )}
      </div>
    </aside>
  );
}

function StoreFormModal({ open, title, onClose, initialName = '', submitLabel = 'Simpan', onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError('');
    }
  }, [open, initialName]);

  const submit = () => {
    if (!name.trim()) {
      setError('Nama toko wajib diisi.');
      return;
    }
    onSubmit(name.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
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
      <Field label="Nama Toko Pemasok" required error={error}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
          placeholder="contoh: Toko Sembako Baru"
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function ManagePriceModal({ open, initialStoreId = '', onClose }) {
  const { stores, products, priceOfStore, saveStorePrices, pushToast } = useApp();
  const [storeId, setStoreId] = useState(initialStoreId || stores[0]?.id || '');
  const [rows, setRows] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStoreId(initialStoreId || stores[0]?.id || '');
      setRows({});
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setRows({});
    setError('');
  }, [storeId]);

  const store = stores.find((s) => s.id === storeId);
  const lines = useMemo(() => {
    if (!storeId) return [];
    return products
      .filter((p) => p.storeIds.includes(storeId))
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
      title="Kelola Harga Barang"
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
          <div className="mb-3 grid gap-2">
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
                        Harga lama: <span className="font-bold text-ink">{rupiah(l.oldPrice)}</span>
                      </p>
                      <div className="w-36">
                        <Input
                          type="number"
                          min="0"
                          value={r.newPrice}
                          disabled={!r.checked}
                          onChange={(e) => update(l.key, { newPrice: e.target.value })}
                          placeholder="Harga baru"
                          className="!px-2 !py-1 text-xs"
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
              <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1 sm:mt-1.5">
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
        </>
      )}
    </Modal>
  );
}