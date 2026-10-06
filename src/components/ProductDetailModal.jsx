import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Gift,
  History,
  Megaphone,
  Package,
  PackagePlus,
  Pencil,
  ShoppingCart,
  Star,
  Store,
  Tag,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  baseUnit,
  formatQty,
  pickUnit,
  qtyText,
  rupiah,
  unitRelations,
} from '../utils/format';
import { ProductFlags, initialFor, tintFor } from './ProductImage';
import { Btn, Chip, cx, Modal } from './UI';

function Divider() {
  return <div className="my-4 h-px bg-line" />;
}

const QUICK_ACTIONS = [
  { id: 'edit', label: 'Edit Barang', icon: Pencil, tone: 'bg-primary-soft text-primary' },
  { id: 'stock', label: 'Tambah Stok', icon: PackagePlus, tone: 'bg-emerald-50 text-emerald-600' },
  { id: 'order', label: 'Buat Pesanan', icon: ShoppingCart, tone: 'bg-violet-50 text-violet-600' },
  { id: 'history', label: 'Lihat Riwayat', icon: History, tone: 'bg-sky-50 text-sky-600' },
];

export default function ProductDetailModal({
  product,
  onClose,
  onEdit,
  onAddStock,
  onCreateOrder,
  onShowHistory,
}) {
  const { stores, stockOfProduct, baseNameOf } = useApp();
  const navigate = useNavigate();
  if (!product) return null;

  const storeNames = product.storeIds
    .map((id) => stores.find((s) => s.id === id)?.name)
    .filter(Boolean);
  const units = (product.units || []).slice();
  const base = baseUnit(units);
  const baseName = base ? base.name : baseNameOf(product);
  const stock = stockOfProduct(product.id);
  const qty = stock ? Number(stock.quantity) || 0 : 0;
  const low = product.minStock != null && product.minStock > 0 && qty < product.minStock;
  const status = qty <= 0 ? 'habis' : low ? 'menipis' : 'tersedia';
  const statusMeta = {
    habis: { label: 'Habis', cls: 'bg-rose-100 text-rose-600' },
    menipis: { label: 'Stok Menipis', cls: 'bg-amber-100 text-amber-700' },
    tersedia: { label: 'Stok Tersedia', cls: 'bg-emerald-100 text-emerald-700' },
  }[status];
  const quick = pickUnit(units, qty);
  const relations = unitRelations(units);

  const run = (id) => {
    if (id === 'edit') return onEdit ? onEdit(product) : navigate('/barang', { state: { editProductId: product.id } });
    if (id === 'stock') return onAddStock ? onAddStock(product) : navigate('/stok', { state: { openAdjustFor: product.id } });
    if (id === 'order') {
      if (onCreateOrder) return onCreateOrder(product);
      const sid = product.storeIds?.[0] || '';
      return navigate('/toko', { state: { storeId: sid, addProductId: product.id } });
    }
    return onShowHistory ? onShowHistory(product) : navigate('/stok', { state: { showHistoryFor: product.id } });
  };

  const infoRows = [
    { id: 'featured', label: 'Unggulan', on: !!product.featured, icon: Star },
    { id: 'promo', label: 'Promo', on: !!product.promo, icon: Tag },
    { id: 'b1g1', label: 'Buy 1 Get 1', on: !!product.buyOneGetOne, icon: Gift },
    { id: 'iklan', label: 'Iklan Promo', on: !!product.advertisement, icon: Megaphone },
  ];
  const infoDetail =
    (product.promo && (product.promoTitle || product.promoDescription) && (
      <p className="mt-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-violet-800">
        <b>{product.promoTitle}</b>
        {product.promoTitle && product.promoDescription ? ' — ' : ''}
        {product.promoDescription}
      </p>
    )) ||
    (product.buyOneGetOne && product.b1g1Description && (
      <p className="mt-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-sky-800">
        {product.b1g1Description}
      </p>
    )) ||
    null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Detail Barang"
      size="sm"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      {/* Foto hero 1:1 */}
      <div
        className={cx(
          'relative aspect-square w-full overflow-hidden rounded-2xl border border-white/70 shadow-soft',
          tintFor(product),
          'bg-gradient-to-br'
        )}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-6xl font-black text-ink/50">
            {initialFor(product.name)}
          </span>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          <ProductFlags product={product} />
        </div>
      </div>

      <div className="mt-4 text-center">
        <h3 className="text-lg font-extrabold text-ink">{product.name}</h3>
        <p className="text-xs font-semibold text-ink-soft">
          {product.category || 'Tanpa kategori'}
        </p>
      </div>

      {/* Stok */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-primary-soft px-3.5 py-1.5 text-sm font-extrabold text-primary">
          Stok: {formatQty(quick.value)} {quick.unit?.name || baseName}
          {qty > 0 && (
            <span className="ml-1.5 font-semibold text-ink-soft">
              ({qtyText(units, qty)} / {formatQty(qty)} {baseName})
            </span>
          )}
        </span>
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', statusMeta.cls)}>
          {status === 'habis' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : status === 'menipis' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          {statusMeta.label}
        </span>
        {product.minStock != null && (
          <Chip tone="neutral">Min. {formatQty(product.minStock)} {baseName}</Chip>
        )}
      </div>

      {/* Quick action */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => run(a.id)}
            className={cx(
              'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition active:scale-[0.97]',
              a.tone,
              'hover:brightness-[0.98]'
            )}
          >
            <a.icon className="h-4 w-4 shrink-0" />
            {a.label}
          </button>
        ))}
      </div>

      <Divider />

      {/* Daftar satuan & harga */}
      <div className="rounded-xl bg-primary-soft/50 p-3.5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
          Satuan & Harga
        </p>
        <div className="space-y-1">
          {units.map((u) => (
            <div
              key={u.id}
              className={cx(
                'rounded-lg px-2 py-1',
                Number(u.factor) === 1 ? 'bg-white/70' : 'bg-white/40'
              )}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                  {u.name}
                  {Number(u.factor) === 1 && (
                    <span className="rounded-full bg-line/70 px-1.5 py-px text-[10px] font-bold text-ink-soft">
                      dasar
                    </span>
                  )}
                </span>
                <span className="font-bold text-primary">{rupiah(u.price)}</span>
              </div>
              {Number(u.factor) !== 1 && (
                <p className="mt-0.5 pl-1 text-[11px] font-semibold text-ink-soft">
                  1 {u.name} = {formatQty(u.factor)} {baseName} = {rupiah(u.price)}
                </p>
              )}
            </div>
          ))}
        </div>
        {relations.length === 0 && (
          <p className="text-xs text-ink-soft">Hanya satuan dasar {baseName}.</p>
        )}
      </div>

      {/* Supplier */}
      <Divider />
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
          <Store className="h-3.5 w-3.5" /> Toko Pemasok
        </p>
        {storeNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {storeNames.map((n) => (
              <Chip key={n} tone="soft">
                {n}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-soft">Belum ada toko pemasok.</p>
        )}
      </div>

      {/* Informasi Barang */}
      <Divider />
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
          Informasi Barang
        </p>
        {infoRows.some((r) => r.on) || product.description ? (
          <>
            <div className="space-y-1.5">
              {infoRows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2.5 py-1.5"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <r.icon className="h-3.5 w-3.5 text-ink-soft" /> {r.label}
                  </span>
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                      r.on ? 'bg-emerald-100 text-emerald-700' : 'bg-line/60 text-ink-soft'
                    )}
                  >
                    <span className={cx('h-1.5 w-1.5 rounded-full', r.on ? 'bg-emerald-500' : 'bg-ink-soft/50')} />
                    {r.on ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              ))}
            </div>
            {infoDetail}
            {product.description && (
              <p className="mt-2 rounded-xl bg-primary-soft/50 px-3 py-2 text-xs leading-relaxed text-ink">
                {product.description}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-soft">
            Tidak ada informasi khusus. Kelola lewat menu Edit Barang.
          </p>
        )}
      </div>

      {!product.image && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-ink-soft">
          <Package className="h-3.5 w-3.5" /> Belum ada foto. Tambahkan dari halaman Barang.
        </p>
      )}
    </Modal>
  );
}