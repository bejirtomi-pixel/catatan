import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  FileText,
  Gift,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatQty, pickUnit, qtyText, rupiah, uid } from '../utils/format';
import {
  Btn,
  Chip,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  TD,
  TH,
  TableWrap,
  Textarea,
  Toggle,
  cx,
} from '../components/UI';
import ProductImage, { ProductFlags } from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import ImageUpload from '../components/ImageUpload';
import StorePicker from '../components/StorePicker';

const PAGE_SIZE = 8;

const CAT_FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'makanan', label: 'Makanan' },
  { id: 'minuman', label: 'Minuman' },
  { id: 'cemilan', label: 'Cemilan' },
  { id: 'sembako', label: 'Sembako' },
  { id: 'lainnya', label: 'Lainnya' },
];

const STOCK_FILTERS = [
  { id: 'semua', label: 'Semua' },
  { id: 'tersedia', label: 'Tersedia' },
  { id: 'menipis', label: 'Menipis' },
  { id: 'habis', label: 'Habis' },
];

// Kelompokkan kategori bebas ke 5 cabang filter cepat.
const categoryGroup = (cat) => {
  const c = String(cat || '').toLowerCase();
  if (/cemilan|ringan|snack/.test(c)) return 'cemilan';
  if (/makanan|masakan|nasi|berat/.test(c)) return 'makanan';
  if (/minuman|minum/.test(c)) return 'minuman';
  if (/sembako|pokok/.test(c)) return 'sembako';
  return 'lainnya';
};

const stockStatus = (product, qty) => {
  const n = Number(qty) || 0;
  if (n <= 0) return 'habis';
  if (product.minStock != null && product.minStock > 0 && n < Number(product.minStock)) return 'menipis';
  return 'tersedia';
};

const STOCK_BADGE = {
  menipis: { label: 'Menipis', cls: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  habis: { label: 'Habis', cls: 'bg-rose-100 text-rose-600', icon: AlertTriangle },
};

export default function Barang() {
  const { products, stores, saveProduct, updateProduct, deleteProduct, createStore, stockOfProduct, baseNameOf, pushToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('semua');
  const [stok, setStok] = useState('semua');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [infoTab, setInfoTab] = useState('unggulan');
  const [infoSearch, setInfoSearch] = useState('');
  const [deleteInfoTarget, setDeleteInfoTarget] = useState(null);

  // Quick action "Edit Barang" dari halaman lain: buka form barang ini.
  useEffect(() => {
    const st = location.state;
    if (st && st.editProductId) {
      const p = products.find((x) => x.id === st.editProductId);
      if (p) {
        setEditing(p);
        setFormOpen(true);
      }
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'semua' && categoryGroup(p.category) !== cat) return false;
      if (stok !== 'semua') {
        const st = stockOfProduct(p.id);
        if (stockStatus(p, st ? st.quantity : 0) !== stok) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        p.storeIds.some((id) => stores.find((s) => s.id === id)?.name.toLowerCase().includes(q))
      );
    });
  }, [products, search, cat, stok, stores, stockOfProduct]);

  const suppliersOf = (p) => {
    const names = p.storeIds
      .map((id) => stores.find((s) => s.id === id)?.name)
      .filter(Boolean);
    return names;
  };

  const openDetail = (p) => setDetail(p);
  const openForm = (p) => {
    setEditing(p);
    setFormOpen(true);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSave = (data) => {
    const storeIds = [];
    for (const sel of data.stores) {
      if (sel.id) {
        if (!storeIds.includes(sel.id)) storeIds.push(sel.id);
      } else {
        const created = createStore(sel.name);
        if (created && !storeIds.includes(created.id)) storeIds.push(created.id);
      }
    }
    if (storeIds.length === 0) return;

    const units = data.units.map((u) => ({
      id: u.id || uid('u-'),
      name: u.name.trim(),
      factor: Number(u.factor),
      price: Number(u.price),
    }));
    const base = units.find((u) => u.factor === 1);

    const existing = editing ? products.find((p) => p.id === editing.id) : null;
    let previousPrice = base.price;
    let priceChange = 'none';
    if (existing) {
      const oldBase = (existing.units || []).find((u) => u.factor === 1);
      const oldPrice = oldBase ? Number(oldBase.price) : Number((existing.units || [])[0]?.price || 0);
      if (base.price === oldPrice) {
        previousPrice = existing.previousPrice;
        priceChange = existing.priceChange;
      } else {
        previousPrice = oldPrice;
        priceChange = base.price > oldPrice ? 'up' : 'down';
      }
    }

    saveProduct({
      ...(existing || {}),
      id: editing?.id,
      name: data.name,
      category: data.category,
      image: data.image,
      units,
      minStock: data.minStock === '' || data.minStock == null ? null : Number(data.minStock),
      storeIds,
      previousPrice,
      priceChange,
      promo: !!data.promo,
      promoTitle: data.promoTitle || '',
      promoDescription: data.promoDesc || '',
      advertisement: !!data.advertisement,
      advertisementDescription: data.adDesc || '',
      featured: !!data.featured,
      buyOneGetOne: !!data.buyOneGetOne,
      b1g1Description: data.b1g1Desc || '',
      description: data.description || '',
    });
    pushToast(editing ? 'Barang berhasil diperbarui' : 'Barang berhasil ditambahkan');
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader title="Barang" subtitle={`Master data barang (${products.length} barang)`}>
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari barang, kategori, toko..."
          className="w-full sm:w-64"
        />
        <Btn
          icon={PackagePlus}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Tambah Barang
        </Btn>
      </PageHeader>

      {/* Filter cepat: kategori + status stok */}
      <div className="card mb-4 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Kategori</span>
          {CAT_FILTERS.map((c) => (
            <FilterChip
              key={c.id}
              active={cat === c.id}
              onClick={() => {
                setCat(c.id);
                setPage(1);
              }}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">Stok</span>
          {STOCK_FILTERS.map((s) => (
            <FilterChip
              key={s.id}
              active={stok === s.id}
              onClick={() => {
                setStok(s.id);
                setPage(1);
              }}
            >
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={
              search
                ? 'Barang tidak ditemukan'
                : cat !== 'semua' || stok !== 'semua'
                ? 'Tidak ada barang yang cocok'
                : 'Belum ada barang'
            }
            description={
              search
                ? 'Coba kata kunci pencarian lain.'
                : cat !== 'semua' || stok !== 'semua'
                ? 'Coba ubah kategori atau status stok yang dipilih.'
                : 'Tambahkan barang pertama Anda.'
            }
            action={
              search || cat !== 'semua' || stok !== 'semua' ? (
                <Btn
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setCat('semua');
                    setStok('semua');
                    setPage(1);
                  }}
                >
                  Reset Filter
                </Btn>
              ) : (
                <Btn size="sm" icon={Plus} onClick={() => setFormOpen(true)}>
                  Tambah Barang
                </Btn>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Tabel desktop */}
          <div className="hidden md:block" data-testid="daftar-barang-table">
            <TableWrap minWidth="min-w-[920px]">
              <thead className="border-b border-line bg-primary-soft/50">
                <tr>
                  <TH>Gambar</TH>
                  <TH>Nama Barang</TH>
                  <TH>Kategori</TH>
                  <TH>Satuan & Harga</TH>
                  <TH>Supplier</TH>
                  <TH>Stok</TH>
                  <TH className="text-right">Aksi</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => {
                  const stock = stockOfProduct(p.id);
                  const qty = stock ? Number(stock.quantity) || 0 : 0;
                  const st = stockStatus(p, qty);
                  const quick = pickUnit(p.units, qty);
                  const supps = suppliersOf(p);
                  const shown = supps.slice(0, 2);
                  return (
                    <tr key={p.id} className="bg-white transition hover:bg-primary-soft/40">
                      <TD>
                        <ProductImage product={p} size="md" onClick={() => openDetail(p)} />
                      </TD>
                      <TD>
                        <button
                          type="button"
                          onClick={() => openDetail(p)}
                          className="text-left font-bold text-ink hover:text-primary"
                        >
                          {p.name}
                        </button>
                        <ProductFlags product={p} />
                      </TD>
                      <TD>
                        {p.category ? (
                          <Chip tone="violet">{p.category}</Chip>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </TD>
                      <TD>
                        <div className="space-y-0.5">
                          {(p.units || []).map((u) => (
                            <p key={u.id} className="text-xs text-ink">
                              {u.name}
                              {Number(u.factor) !== 1 && (
                                <span className="text-ink-soft"> ({formatQty(u.factor)})</span>
                              )}{' '}
                              — <span className="font-bold text-primary">{rupiah(u.price)}</span>
                            </p>
                          ))}
                        </div>
                      </TD>
                      <TD>
                        {shown.length > 0 ? (
                          <p className="text-xs font-semibold text-ink">
                            {shown.join(' • ')}
                            {supps.length > shown.length && (
                              <span className="text-ink-soft"> • +{supps.length - shown.length}</span>
                            )}
                          </p>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </TD>
                      <TD>
                        <StockCell qty={qty} st={st} quick={quick} baseName={quick.unit?.name || unitBaseName(p)} />
                      </TD>
                      <TD>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openForm(p)}
                            title="Edit barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            title="Hapus barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>

          {/* Kartu mobile */}
          <div className="grid gap-3 md:hidden" data-testid="daftar-barang-card">
            {rows.map((p, i) => (
              <MobileProductCard
                key={p.id}
                product={p}
                index={(safePage - 1) * PAGE_SIZE + i + 1}
                onPreview={openDetail}
                onEdit={openForm}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        </>
      )}

      {filtered.length > 0 && (
        <div className="mt-4 card">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            from={(safePage - 1) * PAGE_SIZE + 1}
            to={Math.min(safePage * PAGE_SIZE, filtered.length)}
            onPage={setPage}
          />
        </div>
      )}

      <InfoBarang
        tab={infoTab}
        setTab={setInfoTab}
        products={products}
        stores={stores}
        search={infoSearch}
        setSearch={setInfoSearch}
        onToggle={updateProduct}
        onEdit={(p) => {
          setEditing(p);
          setFormOpen(true);
        }}
        onAddNew={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        onPreview={setDetail}
        onDeleteInfo={(p, tab) => setDeleteInfoTarget({ product: p, tab })}
      />

      <ConfirmModal
        open={!!deleteInfoTarget}
        onClose={() => setDeleteInfoTarget(null)}
        title="Hapus Informasi Barang"
        message={
          deleteInfoTarget
            ? `Hapus info ${deleteInfoTarget.tab?.label?.toLowerCase()} dari “${deleteInfoTarget.product.name}”? Barang master tetap tersimpan di daftar Barang.`
            : ''
        }
        confirmLabel="Hapus Info"
        danger
        onConfirm={() => {
          if (deleteInfoTarget) {
            const tab = deleteInfoTarget.tab;
            const patch = tab.id === 'promo'
              ? { promo: false, promoTitle: '', promoDescription: '' }
              : tab.id === 'b1g1'
              ? { buyOneGetOne: false, b1g1Description: '' }
              : tab.id === 'deskripsi'
              ? { description: '' }
              : { featured: false };
            updateProduct(deleteInfoTarget.product.id, patch);
            pushToast(`Info ${tab.label.toLowerCase()} dihapus — barang tetap tersimpan`);
          }
          setDeleteInfoTarget(null);
        }}
      />

      <ProductFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        onSave={handleSave}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Barang"
        message={`Hapus ${deleteTarget?.name} dari master barang? Stok terkait ikut dihapus. Riwayat pesanan & barang kosong lama tetap tersimpan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteProduct(deleteTarget.id);
            pushToast('Barang berhasil dihapus');
          }
          setDeleteTarget(null);
        }}
      />

      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => {
          setDetail(null);
          openForm(p);
        }}
        onAddStock={(p) => {
          setDetail(null);
          navigate('/stok', { state: { openAdjustFor: p.id } });
        }}
        onCreateOrder={(p) => {
          setDetail(null);
          navigate('/toko', { state: { storeId: p.storeIds?.[0] || '', addProductId: p.id } });
        }}
        onShowHistory={(p) => {
          setDetail(null);
          navigate('/stok', { state: { showHistoryFor: p.id } });
        }}
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold transition active:scale-95',
        active
          ? 'bg-primary text-white shadow-soft'
          : 'bg-white text-ink-soft ring-1 ring-line hover:bg-primary-soft hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

function StockCell({ qty, st, quick, baseName }) {
  const badge = STOCK_BADGE[st];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          'inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 font-bold',
          qty <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-primary-soft text-primary'
        )}
      >
        {formatQty(quick.value)} {quick.unit?.name || baseName}
      </span>
      {badge && (
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', badge.cls)}>
          <badge.icon className="h-3 w-3" /> {badge.label}
        </span>
      )}
      {st === 'tersedia' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
          Tersedia
        </span>
      )}
    </div>
  );
}

function MobileProductCard({ product, index, onPreview, onEdit, onDelete }) {
  const { stores, stockOfProduct } = useApp();
  const stock = stockOfProduct(product.id);
  const qty = stock ? Number(stock.quantity) || 0 : 0;
  const st = stockStatus(product, qty);
  const quick = pickUnit(product.units, qty);
  const badge = STOCK_BADGE[st];
  const basePrice = Number(
    (product.units || []).find((u) => Number(u.factor) === 1)?.price || (product.units || [])[0]?.price || 0
  );
  const supps = product.storeIds
    .map((id) => stores.find((s) => s.id === id)?.name)
    .filter(Boolean);
  const shown = supps.slice(0, 2);
  return (
    <div className="card flex items-start gap-3 p-3.5">
      <ProductImage product={product} size="md" onClick={() => onPreview(product)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onPreview(product)}
            className="truncate text-left text-sm font-bold text-ink hover:text-primary"
          >
            {product.name}
          </button>
          <span className="shrink-0 text-[10px] font-semibold text-ink-soft">#{index}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
          {product.category && <Chip tone="violet">{product.category}</Chip>}
          {shown.length > 0 && (
            <span className="truncate">
              {shown.join(' • ')}
              {supps.length > shown.length ? ` • +${supps.length - shown.length}` : ''}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-extrabold text-primary">{rupiah(basePrice)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cx(
              'inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 text-xs font-bold',
              qty <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-primary-soft text-primary'
            )}
          >
            {formatQty(quick.value)} {quick.unit?.name || unitBaseName(product)}
          </span>
          {badge && (
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', badge.cls)}>
              <badge.icon className="h-3 w-3" /> {badge.label}
            </span>
          )}
          {st === 'tersedia' && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              Tersedia
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => onEdit(product)}
            title="Edit barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(product)}
            title="Hapus barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <Btn size="sm" variant="soft" className="ml-auto" onClick={() => onPreview(product)}>
            Detail
          </Btn>
        </div>
      </div>
    </div>
  );
}

function unitBaseName(p) {
  const base = (p.units || []).find((u) => u.factor === 1);
  return base ? base.name : (p.units || [])[0]?.name || 'pcs';
}

function ProductFormModal({ open, onClose, editing, onSave }) {
  const { stores } = useApp();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState('');
  const [minStock, setMinStock] = useState('');
  const [storesSel, setStoreSel] = useState([]);
  const [units, setUnits] = useState([]);
  const [promo, setPromo] = useState(false);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [advertisement, setAdvertisement] = useState(false);
  const [adDesc, setAdDesc] = useState('');
  const [featured, setFeatured] = useState(false);
  const [buyOneGetOne, setBuyOneGetOne] = useState(false);
  const [b1g1Desc, setB1g1Desc] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCategory(editing.category || '');
      setImage(editing.image || '');
      setMinStock(editing.minStock != null ? String(editing.minStock) : '');
      setStoreSel(
        editing.storeIds
          .map((id) => {
            const s = stores.find((x) => x.id === id);
            return s ? { id: s.id, name: s.name } : null;
          })
          .filter(Boolean)
      );
      setUnits(
        (editing.units || []).map((u) => ({
          id: u.id,
          name: u.name,
          factor: String(u.factor),
          price: String(u.price),
        }))
      );
      setPromo(!!editing.promo);
      setPromoTitle(editing.promoTitle || '');
      setPromoDesc(editing.promoDescription || '');
      setAdvertisement(!!editing.advertisement);
      setAdDesc(editing.advertisementDescription || '');
      setFeatured(!!editing.featured);
      setBuyOneGetOne(!!editing.buyOneGetOne);
      setB1g1Desc(editing.b1g1Description || '');
      setDescription(editing.description || '');
    } else {
      setName('');
      setCategory('');
      setImage('');
      setMinStock('');
      setStoreSel([]);
      setUnits([{ id: uid('u-'), name: '', factor: '1', price: '' }]);
      setPromo(false);
      setPromoTitle('');
      setPromoDesc('');
      setAdvertisement(false);
      setAdDesc('');
      setFeatured(false);
      setBuyOneGetOne(false);
      setB1g1Desc('');
      setDescription('');
    }
    setErrors({});
  }, [open, editing, stores]);

  const updateUnit = (key, patch) =>
    setUnits((prev) => prev.map((u) => (u.id === key ? { ...u, ...patch } : u)));
  const removeUnit = (key) => setUnits((prev) => prev.filter((u) => u.id !== key));
  const addUnit = () =>
    setUnits((prev) => [
      ...prev,
      { id: uid('u-'), name: '', factor: '', price: '' },
    ]);

  const submit = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Nama barang wajib diisi.';
    if (storesSel.length === 0) errs.stores = 'Pilih minimal satu toko.';

    const unitErrs = {};
    const factors = units.map((u) => Number(u.factor) || 0);
    if (units.length === 0) {
      errs.units = 'Minimal satu satuan wajib diisi.';
    } else {
      units.forEach((u, i) => {
        const key = `u${i}`;
        if (!u.name.trim()) unitErrs[key] = 'Nama satuan wajib diisi.';
        else if (units.some((x, j) => j !== i && x.name.trim().toLowerCase() === u.name.trim().toLowerCase()))
          unitErrs[key] = 'Nama satuan ganda.';
        if (u.factor === '' || !(Number(u.factor) > 0)) unitErrs[key] = 'Faktor wajib > 0.';
        else if (i > 0 && Number(u.factor) === 1) unitErrs[key] = 'Faktor 1 hanya untuk satuan dasar.';
        if (u.price === '' || !(Number(u.price) > 0)) unitErrs[key] = 'Harga wajib > 0.';
      });
      if (!factors.includes(1)) errs.units = 'Wajib ada satu satuan dasar (faktor 1).';
      if (Object.keys(unitErrs).length) errs.unitErrs = unitErrs;
    }
    if (minStock !== '' && !(Number(minStock) >= 0)) errs.minStock = 'Min stok berupa angka 0 atau lebih.';

    setErrors(errs);
    if (Object.keys(errs).length) return;

    onSave({
      name: name.trim(),
      category: category.trim(),
      image,
      minStock: minStock === '' ? '' : Number(minStock),
      stores: storesSel,
      units,
      promo,
      promoTitle,
      promoDesc,
      advertisement,
      adDesc,
      featured,
      buyOneGetOne,
      b1g1Desc,
      description,
    });
  };

  const unitErrs = errors.unitErrs || {};

  const sectionTitle =
    'text-[11px] font-bold uppercase tracking-wider text-primary';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit Barang — ${editing.name}` : 'Tambah Barang'}
      subtitle="Atur foto, kategori, satuan & harga acuan per satuan."
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={Package} onClick={submit}>
            {editing ? 'Simpan Perubahan' : 'Simpan Barang'}
          </Btn>
        </>
      }
    >
      <div className="space-y-6">
        {/* Foto Barang */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Foto Barang</p>
          <p className="mt-1 text-xs text-ink-soft">
            Preview besar rasio 1:1. Unggah dari galeri atau ambil langsung dari kamera.
          </p>
          <div className="mt-4">
            <ImageUpload value={image} onChange={setImage} label="Foto Barang" hint="Foto dipakai di master barang, stok, & informasi barang." />
          </div>
        </section>

        {/* Informasi Dasar */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Informasi Dasar</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nama Barang" required error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="contoh: Gula Pasir" />
            </Field>
            <Field
              label="Kategori"
              hint="Opsional. contoh: Sembako, Minuman. Saran cepat: Makanan, Minuman, Cemilan, Sembako, Lainnya."
              error={errors.category}
            >
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="contoh: Sembako"
                list="barang-kategori"
              />
              <datalist id="barang-kategori">
                {['Makanan', 'Minuman', 'Cemilan', 'Sembako', 'Lainnya'].map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Minimal Stok"
              hint="Opsional. Muncul badge “Stok Menipis” bila stok di bawah nilai ini (satuan dasar)."
              error={errors.minStock}
            >
              <Input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="contoh: 20"
              />
            </Field>
          </div>
        </section>

        {/* Toko Pemasok */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Toko Pemasok</p>
          <p className="mt-1 text-xs text-ink-soft">
            Barang dapat tersedia di lebih dari satu toko pemasok.
          </p>
          <div className="mt-4">
            <Field label="Pilih Toko" required error={errors.stores}>
              <StorePicker stores={stores} value={storesSel} onChange={setStoreSel} />
            </Field>
          </div>
        </section>

        {/* Satuan & Konversi */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionTitle}>Satuan & Konversi</p>
              <p className="mt-1 text-xs text-ink-soft">
                Satuan dasar (faktor 1) dipakai untuk perhitungan stok internal. Konversi = jumlah satuan dasar
                per 1 satuan (contoh: dus = 40 pcs → faktor 40). Harga acuan per satuan untuk pesanan.
              </p>
            </div>
            <Btn variant="soft" size="sm" icon={Plus} onClick={addUnit}>
              Tambah Satuan
            </Btn>
          </div>

          {errors.units && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
              {errors.units}
            </p>
          )}

          <div className="mt-4">
            <div className="hidden grid-cols-[1fr_90px_130px_32px] items-center gap-2 px-0.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft sm:grid">
              <span>Nama Satuan</span>
              <span>Konversi</span>
              <span>Harga Acuan</span>
              <span />
            </div>
            <div className="space-y-2.5">
              {units.map((u, i) => {
                const e = unitErrs[`u${i}`];
                return (
                  <div key={u.id} className="grid grid-cols-[1fr_68px_84px_28px] items-start gap-2 sm:grid-cols-[1fr_90px_130px_32px]">
                    <div>
                      <Input
                        value={u.name}
                        onChange={(e2) => updateUnit(u.id, { name: e2.target.value })}
                        placeholder={i === 0 ? 'Satuan dasar (mis. pcs)' : 'Satuan lain (mis. dus)'}
                      />
                      {e && <p className="mt-0.5 text-[11px] font-medium text-rose-500">{e}</p>}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={u.factor}
                        onChange={(e2) => updateUnit(u.id, { factor: e2.target.value })}
                        placeholder="faktor"
                        disabled={i === 0}
                        title="Jumlah satuan dasar per 1 satuan ini"
                      />
                      {i === 0 && (
                        <p className="mt-0.5 text-[10px] text-ink-soft">Satuan dasar</p>
                      )}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        value={u.price}
                        onChange={(e2) => updateUnit(u.id, { price: e2.target.value })}
                        placeholder="harga"
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUnit(u.id)}
                      disabled={units.length <= 1}
                      title={units.length <= 1 ? 'Minimal satu satuan' : 'Hapus satuan'}
                      className="flex h-9 w-7 items-center justify-center rounded-lg text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 sm:hidden">
              <Btn variant="soft" size="sm" icon={Plus} onClick={addUnit}>
                Tambah Satuan
              </Btn>
            </div>
          </div>
        </section>

        {/* Keterangan Khusus Barang */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Keterangan Khusus Barang</p>
          <p className="mt-1 text-xs text-ink-soft">
            Tandai barang unggulan, promo, ataupun penawaran khusus. Semua isian manual sesuai kebutuhan toko.
          </p>
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Toggle checked={featured} onChange={setFeatured} label="Barang Unggulan" />
            <Toggle checked={promo} onChange={setPromo} label="Promo" />
            <Toggle checked={buyOneGetOne} onChange={setBuyOneGetOne} label="Buy 1 Get 1" />
            <Toggle checked={advertisement} onChange={setAdvertisement} label="Iklan Promo" />
          </div>
          <div className="mt-4 space-y-4">
            {featured && (
              <p className="rounded-xl bg-primary-soft/50 px-3.5 py-2.5 text-xs text-ink-soft">
                Barang ini tampil di tab <b>Barang Unggulan</b> pada halaman Barang.
              </p>
            )}
            {promo && (
              <>
                <Field label="Judul Promo" hint="Nama singkat promo, contoh: “Promo Gula Pasir”.">
                  <Input
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="contoh: Promo Gula Pasir"
                  />
                </Field>
                <Field label="Nilai / Jenis Promo & Keterangan">
                  <Textarea
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="contoh: Hemat 5% saat membeli 2 karung sekaligus."
                  />
                </Field>
              </>
            )}
            {buyOneGetOne && (
              <Field label="Deskripsi Buy 1 Get 1">
                <Textarea
                  value={b1g1Desc}
                  onChange={(e) => setB1g1Desc(e.target.value)}
                  placeholder="contoh: Beli 1 dus Mie, GRATIS 2 bungkus."
                />
              </Field>
            )}
            {advertisement && (
              <Field label="Deskripsi Iklan">
                <Textarea
                  value={adDesc}
                  onChange={(e) => setAdDesc(e.target.value)}
                  placeholder="contoh: Stok kembali tersedia! Bisa antar."
                />
              </Field>
            )}
            <Field label="Deskripsi Produk" hint="Opsional. Dijadikan info tambahan tentang barang ini.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="contoh: Gula pasir putih kemasan 1 kg, harga grosir lebih murah."
              />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}

const INFO_TABS = [
  {
    id: 'unggulan',
    label: 'Barang Unggulan',
    icon: Star,
    field: 'featured',
    empty: 'Belum ada barang unggulan',
    helper: 'Tandai barang sebagai unggulan melalui form barang agar tampil di sini.',
  },
  {
    id: 'promo',
    label: 'Promo',
    icon: Tag,
    field: 'promo',
    empty: 'Belum ada barang berpromo',
    helper: 'Aktifkan “Promo” pada form barang untuk masuk daftar ini.',
  },
  {
    id: 'b1g1',
    label: 'Buy 1 Get 1',
    icon: Gift,
    field: 'buyOneGetOne',
    empty: 'Belum ada penawaran Buy 1 Get 1',
    helper: 'Aktifkan “Buy 1 Get 1” pada form barang beserta deskripsinya.',
  },
  {
    id: 'deskripsi',
    label: 'Deskripsi Produk',
    icon: FileText,
    field: null,
    empty: 'Belum ada deskripsi produk',
    helper: 'Isi kolom “Deskripsi Produk” pada form barang agar tampil di sini.',
  },
];

const infoText = (p, tab) => {
  if (tab.id === 'promo') return p.promoDescription || 'Ada promo menarik untuk barang ini.';
  if (tab.id === 'b1g1') return p.b1g1Description || 'Penawaran beli satu, gratis satu.';
  if (tab.id === 'deskripsi') return p.description;
  return 'Barang ditandai sebagai unggulan.';
};

function InfoBarang({
  tab,
  setTab,
  products,
  stores,
  search,
  setSearch,
  onToggle,
  onEdit,
  onAddNew,
  onPreview,
  onDeleteInfo,
}) {
  const { stockOfProduct, baseNameOf } = useApp();
  const active = INFO_TABS.find((t) => t.id === tab) || INFO_TABS[0];
  const q = (search || '').trim().toLowerCase();
  const rows = products
    .filter((p) => (active.field ? !!p[active.field] : !!(p.description && p.description.trim())))
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (active.id === 'promo' && (p.promoTitle || '').toLowerCase().includes(q)) ||
        infoText(p, active).toLowerCase().includes(q) ||
        p.storeIds.some((id) => stores.find((s) => s.id === id)?.name.toLowerCase().includes(q))
    );

  const switchTab = (id) => {
    setTab(id);
    setSearch('');
  };

  return (
    <section className="mt-6 card overflow-hidden">
      <div className="border-b border-line bg-primary-soft/40 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Informasi Barang</p>
        <p className="text-xs text-ink-soft">
          Kategori info barang (Unggulan / Promo / Buy 1 Get 1 / Deskripsi). Dikelola manual per barang{" "}
          <b>Barang Master</b>; info tetap tampil walau stok 0 atau toko pemasok dihapus. Menonaktifkan info ≠
          menghapus barang.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 pt-3">
        <div className="flex flex-wrap gap-2">
          {INFO_TABS.map((t) => {
            const activeTab = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-t-xl border border-b-0 px-3.5 py-2 text-xs font-bold transition',
                  activeTab
                    ? 'border-line bg-white text-primary'
                    : 'border-transparent text-ink-soft hover:bg-primary-soft/50 hover:text-ink'
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="pb-0.5">
          <SearchInput
            value={search || ''}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari di tab ini..."
            className="w-full sm:w-64"
          />
        </div>
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={active.icon}
            title={search ? 'Tidak ditemukan' : active.empty}
            description={search ? 'Coba kata kunci lain di tab ini.' : active.helper}
            action={
              !search && (
                <Btn size="sm" icon={Plus} onClick={onAddNew}>
                  Tambah Barang
                </Btn>
              )
            }
          />
        ) : (
          <TableWrap minWidth="min-w-[760px]">
            <thead className="border-b border-line bg-primary-soft/50">
              <tr>
                <TH>No</TH>
                <TH>Barang</TH>
                <TH>Stok Warung</TH>
                <TH>Toko</TH>
                <TH>Keterangan</TH>
                <TH className="text-right">Status & Aksi</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p, i) => {
                const storeNames = p.storeIds
                  .map((id) => stores.find((s) => s.id === id)?.name)
                  .filter(Boolean);
                const shown = storeNames.slice(0, 2);
                const infoOn = active.field ? !!p[active.field] : !!(p.description && p.description.trim());
                const stock = stockOfProduct(p.id);
                const stockBase = stock ? Number(stock.quantity) || 0 : 0;
                return (
                  <tr key={p.id} className="bg-white transition hover:bg-primary-soft/40">
                    <TD className="text-ink-soft">{i + 1}</TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <ProductImage product={p} size="sm" onClick={() => onPreview(p)} />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onPreview(p)}
                            className="max-w-[180px] truncate text-left text-sm font-bold text-ink hover:text-primary"
                          >
                            {p.name}
                          </button>
                          <p className="text-[11px] text-ink-soft">Satuan dasar: {unitBaseName(p)}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <p
                        className={cx(
                          'text-sm font-bold',
                          stockBase <= 0 ? 'text-rose-500' : 'text-ink'
                        )}
                      >
                        {qtyText(p.units, stockBase)}
                      </p>
                      <p className="text-[11px] text-ink-soft">{baseNameOf(p)}</p>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {shown.map((n) => (
                          <Chip key={n} tone="soft">
                            {n}
                          </Chip>
                        ))}
                        {storeNames.length > shown.length && (
                          <Chip tone="neutral">+{storeNames.length - shown.length}</Chip>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {active.id === 'promo' && p.promoTitle ? (
                        <p className="text-xs font-bold text-ink">{p.promoTitle}</p>
                      ) : null}
                      <p className="max-w-xs text-xs leading-relaxed text-ink">{infoText(p, active)}</p>
                      {p.category && <p className="mt-0.5 text-[11px] text-ink-soft">Kategori: {p.category}</p>}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-2.5">
                        {active.field ? (
                          <span
                            className={cx(
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition',
                              infoOn
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-line/60 text-ink-soft hover:bg-line'
                            )}
                            title={infoOn ? 'Klik untuk menonaktifkan info' : 'Klik untuk mengaktifkan info'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggle(p.id, { [active.field]: !infoOn });
                            }}
                          >
                            <span
                              className={cx(
                                'h-1.5 w-1.5 rounded-full',
                                infoOn ? 'bg-emerald-500' : 'bg-ink-soft/50'
                              )}
                            />
                            {infoOn ? 'Aktif' : 'Nonaktif'}
                          </span>
                        ) : (
                          <Chip tone="neutral">Terisi</Chip>
                        )}
                        {infoOn && (
                          <button
                            type="button"
                            title="Hapus info (barang tetap tersimpan)"
                            onClick={() => onDeleteInfo(p, active)}
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEdit(p)}
                          title="Edit barang"
                          className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                        >
                          <Pencil className="h-4 w-4" />
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
    </section>
  );
}