import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  FileText,
  History,
  PackagePlus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatQty, qtyText, rupiah, round2 } from '../utils/format';
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
  cx,
} from '../components/UI';
import ProductImage, { ProductFlags } from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import SearchSelect from '../components/SearchSelect';

const PAGE_SIZE = 8;

export default function Stok() {
  const { stockRows, deleteStock, products, stores, updateProduct, pushToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState('inventaris');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [masukOpen, setMasukOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const processedKey = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [infoTab, setInfoTab] = useState('unggulan');
  const [infoSearch, setInfoSearch] = useState('');
  const [deleteInfoTarget, setDeleteInfoTarget] = useState(null);

  // Quick action dari detail barang / dashboard: buka penyesuaian, riwayat, atau tab Informasi Barang.
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.openAdjustFor && !st.showHistoryFor && !st.infoTab)) return;
    if (processedKey.current === location.key) return;
    processedKey.current = location.key;
    if (st.infoTab) {
      setView('info');
    }
    if (st.openAdjustFor) {
      setView('inventaris');
      const row = stockRows.find((r) => r.product.id === st.openAdjustFor);
      if (row) {
        setAdjustFor(row.product);
        setAdjustOpen(true);
      }
    }
    if (st.showHistoryFor) {
      setView('inventaris');
      setHistoryFor(st.showHistoryFor);
      setHistoryOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stockRows;
    return stockRows.filter(
      ({ product, stock }) =>
        product.name.toLowerCase().includes(q) ||
        (product.category || '').toLowerCase().includes(q) ||
        String(stock.quantity).includes(q) ||
        stock.note.toLowerCase().includes(q)
    );
  }, [stockRows, search]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Stok"
        subtitle={
          view === 'inventaris'
            ? `Stok per barang dalam satuan dasar (${stockRows.length} barang)`
            : 'Informasi barang Warung: Unggulan, Promo, & Deskripsi. Dikelola manual, tetap tampil walau stok 0.'
        }
      >
        {view === 'inventaris' && (
          <>
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari barang, kategori, catatan..."
              className="w-full sm:w-64"
            />
            <Btn variant="outline" icon={History} onClick={() => setHistoryOpen(true)}>
              Riwayat Stok
            </Btn>
            <Btn icon={SlidersHorizontal} onClick={() => setAdjustOpen(true)}>
              Penyesuaian Barang
            </Btn>
          </>
        )}
      </PageHeader>

      <div className="card mb-4 p-1.5">
        <div className="flex flex-wrap gap-1">
          {PAGE_TABS.map((t) => {
            const active = t.id === view;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                className={cx(
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition active:scale-[0.98]',
                  active ? 'bg-primary text-white shadow-soft' : 'text-ink-soft hover:bg-primary-soft hover:text-ink'
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === 'inventaris' ? (
        <>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Boxes}
            title={search ? 'Stok tidak ditemukan' : 'Belum ada data stok'}
            description={search ? 'Coba kata kunci pencarian lain.' : 'Stok muncul otomatis saat barang dibuat.'}
          />
        </div>
      ) : (
        <TableWrap minWidth="min-w-[760px]">
          <thead className="border-b border-line bg-primary-soft/50">
            <tr>
              <TH>No</TH>
              <TH>Gambar</TH>
              <TH>Nama Barang</TH>
              <TH>Jumlah Stok</TH>
              <TH>Harga Jual</TH>
              <TH>Catatan</TH>
              <TH className="text-right">Aksi</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {paged.map(({ product, stock }, i) => {
              const low = product.minStock != null && product.minStock > 0 && stock.quantity < product.minStock;
              return (
                <tr key={stock.id} className="bg-white transition hover:bg-primary-soft/40">
                  <TD className="text-ink-soft">{(safePage - 1) * PAGE_SIZE + i + 1}</TD>
                  <TD>
                    <ProductImage product={product} size="md" onClick={() => setDetail(product)} />
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => setDetail(product)}
                      title={product.description || product.name}
                      className="text-left font-bold text-ink hover:text-primary"
                    >
                      {product.name}
                    </button>
                    {product.category && <p className="text-[11px] text-ink-soft">{product.category}</p>}
                    <ProductFlags product={product} />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-baseline gap-1 rounded-lg bg-primary-soft px-2.5 py-1 font-bold text-primary">
                        {qtyText(product.units, stock.quantity)}
                      </span>
                      {low && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                          <AlertTriangle className="h-3 w-3" /> Stok Menipis
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-ink-soft">
                      {formatQty(stock.quantity)} dalam satuan dasar
                    </p>
                  </TD>
                  <TD className="font-semibold text-ink">{rupiah(stock.sellingPrice)}</TD>
                  <TD className="max-w-[180px] text-xs text-ink-soft">{stock.note || '—'}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustFor(product);
                          setAdjustOpen(true);
                        }}
                        title="Penyesuaian Stok"
                        className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ stock, product })}
                        title="Hapus catatan stok"
                        className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500"
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
      )}

      {rows.length > 0 && (
        <div className="card mt-4">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={rows.length}
            from={(safePage - 1) * PAGE_SIZE + 1}
            to={Math.min(safePage * PAGE_SIZE, rows.length)}
            onPage={setPage}
          />
        </div>
      )}

      <BarangMasukModal
        open={masukOpen}
        onClose={() => setMasukOpen(false)}
      />
      <PenyesuaianModal
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustFor(null);
        }}
        preset={adjustFor}
      />

      <RiwayatModal
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryFor(null);
        }}
        productId={historyFor}
        productName={historyFor ? stockRows.find((r) => r.product.id === historyFor)?.product.name : null}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Catatan Stok"
        message={`Hapus catatan stok ${deleteTarget?.product.name}? Riwayat pesanan & pergerakan stok lama tetap tersimpan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteStock(deleteTarget.stock.id);
            pushToast('Catatan stok berhasil dihapus');
          }
          setDeleteTarget(null);
        }}
      />
        </>
      ) : (
        <InfoBarang
          tab={infoTab}
          setTab={setInfoTab}
          products={products}
          stores={stores}
          search={infoSearch}
          setSearch={setInfoSearch}
          onToggle={updateProduct}
          onEdit={(p) => navigate('/barang', { state: { editProductId: p.id } })}
          onAddNew={() => navigate('/barang')}
          onPreview={setDetail}
          onDeleteInfo={(p, tab) => setDeleteInfoTarget({ product: p, tab })}
        />
      )}

      <ConfirmModal
        open={!!deleteInfoTarget}
        onClose={() => setDeleteInfoTarget(null)}
        title="Hapus Informasi Barang"
        message={
          deleteInfoTarget
            ? `Hapus info ${deleteInfoTarget.tab?.label?.toLowerCase()} dari “${deleteInfoTarget.product.name}”? Barang master tetap tersimpan di halaman Barang.`
            : ''
        }
        confirmLabel="Hapus Info"
        danger
        onConfirm={() => {
          if (deleteInfoTarget) {
            const tab = deleteInfoTarget.tab;
            const patch =
              tab.id === 'promo'
                ? { promo: false, promoTitle: '', promoDescription: '' }
                : tab.id === 'deskripsi'
                ? { description: '' }
                : { featured: false };
            updateProduct(deleteInfoTarget.product.id, patch);
            pushToast(`Info ${tab.label.toLowerCase()} dihapus — barang tetap tersimpan`);
          }
          setDeleteInfoTarget(null);
        }}
      />

      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onAddStock={(p) => {
          setDetail(null);
          setView('inventaris');
          setAdjustFor(p);
          setAdjustOpen(true);
        }}
        onShowHistory={(p) => {
          setDetail(null);
          setView('inventaris');
          setHistoryFor(p.id);
          setHistoryOpen(true);
        }}
      />
    </div>
  );
}

function BarangMasukModal({ open, onClose }) {
  const { products, stocks, addBarangMasuk, pushToast } = useApp();
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setProductId('');
    setUnitId('');
    setQuantity('');
    setNote('');
    setErrors({});
  }, [open]);

  const product = products.find((p) => p.id === productId);
  const unit = product ? product.units.find((u) => u.id === unitId) || product.units[0] : null;
  const bqty = unit ? round2((Number(quantity) || 0) * unit.factor) : 0;
  const stock = stocks.find((s) => s.productId === productId);
  const after = stock ? round2(stock.quantity + bqty) : bqty;

  const submit = () => {
    const errs = {};
    if (!productId) errs.product = 'Pilih barang terlebih dahulu.';
    if (quantity === '' || !(Number(quantity) > 0)) errs.quantity = 'Jumlah wajib lebih dari 0.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    addBarangMasuk({ productId, unitId: unit.id, quantity: Number(quantity), note: note.trim() });
    pushToast('Barang masuk tercatat — stok bertambah');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Barang Masuk (Manual)"
      subtitle="Catat barang yang masuk di luar pesanan. Stok & riwayat bertambah."
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={PackagePlus} onClick={submit}>
            Simpan Barang Masuk
          </Btn>
        </>
      }
    >
      <Field label="Barang" required error={errors.product}>
        <SearchSelect
          options={products.map((p) => ({
            id: p.id,
            label: p.name,
            emoji: p.image ? undefined : '📦',
            sub: `${(p.units || []).map((u) => u.name).join(', ')}`,
          }))}
          value={productId}
          onChange={(id) => {
            setProductId(id);
            const p = products.find((x) => x.id === id);
            setUnitId(p ? p.units[0]?.id || '' : '');
          }}
          placeholder="Cari & pilih barang..."
        />
      </Field>

      {product && (
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="Satuan" required>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="input"
            >
              {(product.units || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.factor !== 1 ? `(1 = ${u.factor} satuan dasar)` : '(dasar)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jumlah Masuk" required error={errors.quantity}>
            <Input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="contoh: 10"
            />
          </Field>
        </div>
      )}

      {unit && (
        <div className="mb-4 rounded-xl bg-primary-soft/50 p-3 text-xs">
          <p className="flex items-center justify-between">
            <span className="text-ink-soft">Setara satuan dasar</span>
            <span className="font-bold text-primary">{formatQty(bqty)} {unitBaseName(product, unit)}</span>
          </p>
          <p className="mt-1 flex items-center justify-between">
            <span className="text-ink-soft">Stok setelah masuk</span>
            <span className="font-bold text-ink">{formatQty(after)} {unitBaseName(product, unit)}</span>
          </p>
        </div>
      )}

      <Field label="Catatan (opsional)">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="contoh: beli manual dari pasar"
        />
      </Field>
    </Modal>
  );
}

function PenyesuaianModal({ open, onClose, preset }) {
  const { products, stocks, adjustStock, pushToast } = useApp();
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    const pid = preset ? preset.id : '';
    setProductId(pid);
    setUnitId(pid ? products.find((p) => p.id === pid)?.units[0]?.id || '' : '');
    setQuantity('');
    setReason('');
    setErrors({});
  }, [open, preset, products]);

  const product = products.find((p) => p.id === productId);
  const unit = product ? product.units.find((u) => u.id === unitId) || product.units[0] : null;
  const before = stocks.find((s) => s.productId === productId)?.quantity || 0;
  const after = unit ? round2((Number(quantity) || 0) * unit.factor) : 0;
  const diff = round2(after - before);

  const submit = () => {
    const errs = {};
    if (!productId) errs.product = 'Pilih barang terlebih dahulu.';
    if (quantity === '' || !(Number(quantity) >= 0)) errs.quantity = 'Jumlah wajib berupa angka 0 atau lebih.';
    if (!reason.trim()) errs.reason = 'Alasan penyesuaian wajib diisi.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    adjustStock({ productId, unitId: unit.id, quantity: Number(quantity), reason: reason.trim() });
    pushToast('Stok disesuaikan — riwayat tersimpan');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Penyesuaian Stok"
      subtitle="Atur jumlah stok menjadi nilai tertentu. Perubahan dicatat lengkap dengan perbandingan sebelum & sesudah."
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={SlidersHorizontal} onClick={submit}>
            Simpan Penyesuaian
          </Btn>
        </>
      }
    >
      <Field label="Barang" required error={errors.product}>
        <SearchSelect
          options={products.map((p) => ({
            id: p.id,
            label: p.name,
            emoji: p.image ? undefined : '📦',
            sub: `${(p.units || []).map((u) => u.name).join(', ')}`,
          }))}
          value={productId}
          onChange={(id) => {
            setProductId(id);
            const p = products.find((x) => x.id === id);
            setUnitId(p ? p.units[0]?.id || '' : '');
          }}
          placeholder="Cari & pilih barang..."
          disabled={!!preset}
        />
      </Field>

      {product && (
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="Satuan" required>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="input">
              {(product.units || []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.factor !== 1 ? `(1 = ${u.factor} satuan dasar)` : '(dasar)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jumlah Stok Baru" required error={errors.quantity}>
            <Input
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="contoh: 25"
            />
          </Field>
        </div>
      )}

      {unit && (
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-primary-soft/50 p-3 text-center text-xs">
          <div>
            <p className="text-ink-soft">Sebelum</p>
            <p className="font-bold text-ink">{formatQty(before)}</p>
          </div>
          <div>
            <p className="text-ink-soft">Setelah</p>
            <p className="font-bold text-primary">{formatQty(after)}</p>
          </div>
          <div>
            <p className="text-ink-soft">Selisih</p>
            <p className={`font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-500' : 'text-ink-soft'}`}>
              {diff > 0 ? '+' : ''}{formatQty(diff)}
            </p>
          </div>
          <p className="col-span-3 mt-1 text-[11px] text-ink-soft">
            dalam satuan dasar ({unitBaseName(product, unit)})
          </p>
        </div>
      )}

      <Field label="Alasan" required error={errors.reason}>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="contoh: rusak/kedaluwarsa, hitung ulang fisik, hilang..."
        />
      </Field>
    </Modal>
  );
}

function RiwayatModal({ open, onClose, productId, productName }) {
  const { movements } = useApp();
  const list = useMemo(() => {
    const all = [...movements].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return productId ? all.filter((m) => m.productId === productId) : all;
  }, [movements, productId]);
  const typeMeta = {
    receive: { label: 'Penerimaan Pesanan', cls: 'bg-emerald-100 text-emerald-700' },
    masuk: { label: 'Barang Masuk Manual', cls: 'bg-sky-100 text-sky-700' },
    adjust: { label: 'Penyesuaian', cls: 'bg-amber-100 text-amber-700' },
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Riwayat Stok"
      subtitle={
        productName
          ? `Riwayat pergerakan “${productName}”.`
          : 'Semua pergerakan stok tercatat di sini.'
      }
      size="lg"
      footer={<Btn variant="outline" onClick={onClose}>Tutup</Btn>}
    >
      {list.length === 0 ? (
        <EmptyState
          icon={History}
          title={productName ? `Belum ada riwayat untuk ${productName}` : 'Belum ada riwayat'}
          description="Pergerakan stok akan tercatat saat penerimaan, barang masuk, atau penyesuaian."
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((m) => {
            const meta = typeMeta[m.type] || typeMeta.adjust;
            return (
              <div key={m.id} className="rounded-xl border border-line bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
                  <span className="text-[11px] text-ink-soft">{formatDateTime(m.timestamp)}</span>
                </div>
                <p className="mt-2 text-sm font-bold text-ink">{m.productNameSnapshot}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span>
                    <b className="font-bold text-ink">{formatQty(m.beforeBase)}</b> →{' '}
                    <b className="font-bold text-ink">{formatQty(m.afterBase)}</b> {m.unitBaseName}
                  </span>
                  <span className={`font-bold ${m.diffBase > 0 ? 'text-emerald-600' : m.diffBase < 0 ? 'text-rose-500' : 'text-ink-soft'}`}>
                    {m.diffBase > 0 ? '+' : ''}{formatQty(m.diffBase)} {m.unitBaseName}
                  </span>
                  {m.ref && <span className="font-semibold text-primary">Pesanan {m.ref}</span>}
                  {m.note && <span className="italic">“{m.note}”</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function unitBaseName(product, unit) {
  const base = (product.units || []).find((u) => u.factor === 1);
  return base ? base.name : unit ? unit.name : 'pcs';
}

const PAGE_TABS = [
  { id: 'inventaris', label: 'Inventaris Stok', icon: Boxes },
  { id: 'info', label: 'Informasi Barang', icon: Star },
];

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

  const infoOn = (p) => (active.field ? !!p[active.field] : !!(p.description && p.description.trim()));

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line bg-primary-soft/40 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Informasi Barang</p>
        <p className="text-xs text-ink-soft">
          Info barang Warung (Unggulan / Promo / Deskripsi) untuk barang yang dikelola di sini. Info tetap tampil
          walau stok 0 atau toko pemasok dihapus. Toggle <b>Aktif/Nonaktif</b> ≠ menghapus barang.
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
          <>
            {/* Tabel desktop */}
            <div className="hidden md:block" data-testid="informasi-barang-table">
              <TableWrap minWidth="min-w-[720px]">
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
                    const on = infoOn(p);
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
                          <p className={cx('text-sm font-bold', stockBase <= 0 ? 'text-rose-500' : 'text-ink')}>
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
                                  on
                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                    : 'bg-line/60 text-ink-soft hover:bg-line'
                                )}
                                title={on ? 'Klik untuk menonaktifkan info' : 'Klik untuk mengaktifkan info'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggle(p.id, { [active.field]: !on });
                                }}
                              >
                                <span
                                  className={cx(
                                    'h-1.5 w-1.5 rounded-full',
                                    on ? 'bg-emerald-500' : 'bg-ink-soft/50'
                                  )}
                                />
                                {on ? 'Aktif' : 'Nonaktif'}
                              </span>
                            ) : (
                              <Chip tone="neutral">Terisi</Chip>
                            )}
                            {on && (
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
            </div>

            {/* Kartu mobile */}
            <div className="grid gap-3 md:hidden" data-testid="informasi-barang-card">
              {rows.map((p, i) => (
                <InfoProductCard
                  key={p.id}
                  product={p}
                  index={i + 1}
                  active={active}
                  on={infoOn(p)}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onPreview={onPreview}
                  onDeleteInfo={onDeleteInfo}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function InfoProductCard({ product, index, active, on, onToggle, onEdit, onPreview, onDeleteInfo }) {
  const { stockOfProduct, baseNameOf } = useApp();
  const stock = stockOfProduct(product.id);
  const stockBase = stock ? Number(stock.quantity) || 0 : 0;
  return (
    <div className="card flex items-start gap-3 p-3.5">
      <ProductImage product={product} size="md" onClick={() => onPreview(product)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onPreview(product)}
            className="text-left text-sm font-bold text-ink hover:text-primary"
          >
            {product.name}
          </button>
          <span className="shrink-0 text-[10px] font-semibold text-ink-soft">#{index}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
          <span
            className={cx(
              'inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 text-xs font-bold',
              stockBase <= 0 ? 'bg-rose-50 text-rose-600' : 'bg-primary-soft text-primary'
            )}
          >
            {qtyText(product.units, stockBase)}
          </span>
          <span>dalam {baseNameOf(product)}</span>
        </div>
        {active.id === 'promo' && product.promoTitle ? (
          <p className="mt-1 text-xs font-bold text-ink">{product.promoTitle}</p>
        ) : null}
        <p className="mt-1 text-xs leading-relaxed text-ink">{infoText(product, active)}</p>
        <div className="mt-2 flex items-center justify-end gap-1 border-t border-line pt-2">
          {active.field ? (
            <span
              className={cx(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition',
                on
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-line/60 text-ink-soft hover:bg-line'
              )}
              title={on ? 'Klik untuk menonaktifkan info' : 'Klik untuk mengaktifkan info'}
              onClick={() => onToggle(product.id, { [active.field]: !on })}
            >
              <span
                className={cx('h-1.5 w-1.5 rounded-full', on ? 'bg-emerald-500' : 'bg-ink-soft/50')}
              />
              {on ? 'Aktif' : 'Nonaktif'}
            </span>
          ) : (
            <Chip tone="neutral">Terisi</Chip>
          )}
          {on && (
            <button
              type="button"
              title="Hapus info (barang tetap tersimpan)"
              onClick={() => onDeleteInfo(product, active)}
              className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(product)}
            title="Edit barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}