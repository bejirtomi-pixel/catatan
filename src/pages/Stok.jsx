import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  History,
  PackagePlus,
  Pencil,
  Plus,
  SlidersHorizontal,
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
} from '../components/UI';
import ProductImage, { ProductFlags } from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import SearchSelect from '../components/SearchSelect';

const PAGE_SIZE = 8;

export default function Stok() {
  const { stockRows, deleteStock, pushToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
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

  // Quick action dari detail barang: buka penyesuaian / riwayat barang tertentu.
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.openAdjustFor && !st.showHistoryFor)) return;
    if (processedKey.current === location.key) return;
    processedKey.current = location.key;
    if (st.openAdjustFor) {
      const row = stockRows.find((r) => r.product.id === st.openAdjustFor);
      if (row) {
        setAdjustFor(row.product);
        setAdjustOpen(true);
      }
    }
    if (st.showHistoryFor) {
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
      <PageHeader title="Stok" subtitle={`Stok per barang dalam satuan dasar (${stockRows.length} barang)`}>
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
        <Btn variant="soft" icon={PackagePlus} onClick={() => setMasukOpen(true)}>
          Barang Masuk
        </Btn>
        <Btn icon={SlidersHorizontal} onClick={() => setAdjustOpen(true)}>
          Penyesuaian Stok
        </Btn>
      </PageHeader>

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

      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onAddStock={(p) => {
          setDetail(null);
          setAdjustFor(p);
          setAdjustOpen(true);
        }}
        onShowHistory={(p) => {
          setDetail(null);
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