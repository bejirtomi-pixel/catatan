import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Megaphone,
  Package,
  PackagePlus,
  Pencil,
  ShoppingCart,
  Star,
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
  const { stockOfProduct, baseNameOf } = useApp();
  const navigate = useNavigate();
  if (!product) return null;

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
    null;

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Detail Barang"
      size="md"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      <div className="space-y-4">
        {/* Header foto + nama */}
        <div className="flex items-start gap-4">
          <div
            className={cx(
              'relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/70 shadow-soft',
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
              <span className="flex h-full w-full items-center justify-center text-3xl font-black text-ink/50">
                {initialFor(product.name)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-extrabold text-ink leading-tight">{product.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-ink-soft">
                Kategori: <span className="text-ink">{product.category || 'Tanpa kategori'}</span>
              </p>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                  product.active === false
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {product.active === false ? 'Nonaktif' : 'Aktif'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-baseline gap-1 rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">
                Stok: {qtyText(units, qty)}
              </span>
              <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', statusMeta.cls)}>
                {statusMeta.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-soft">
              Setara {formatQty(qty)} {baseName} (satuan dasar)
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => run(a.id)}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-center text-xs font-bold transition active:scale-[0.97]',
                a.tone,
                'hover:brightness-[0.98]'
              )}
            >
              <a.icon className="h-3.5 w-3.5 shrink-0" />
              {a.label}
            </button>
          ))}
        </div>

        <Divider />

        {/* Daftar Satuan, Harga Beli, dan Harga Jual */}
        <div className="rounded-2xl border border-line bg-surface p-3.5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
            Satuan & Harga
          </p>
          <div className="space-y-2">
            {units.map((u) => {
              const isBase = Number(u.factor) === 1;
              const buyPrice = Number(u.price) || 0;
              const sellPrice =
                Number(stock?.sellingPrices?.[u.id] || (isBase ? stock?.sellingPrice : 0)) || 0;

              return (
                <div key={u.id} className="rounded-xl border border-line/60 bg-white p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink">
                      {u.name}{' '}
                      {isBase ? (
                        <span className="text-[11px] font-normal text-ink-soft">(satuan dasar)</span>
                      ) : (
                        <span className="text-[11px] font-normal text-ink-soft">
                          (1 {u.name} = {formatQty(u.factor)} {baseName})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line/50 pt-1.5 text-xs">
                    <div>
                      <p className="text-[11px] text-ink-soft">Harga Beli / Acuan</p>
                      <p className="font-bold text-ink">{rupiah(buyPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-ink-soft">Harga Jual Warung</p>
                      <p className="font-bold text-primary">
                        {sellPrice > 0 ? rupiah(sellPrice) : 'Belum diatur'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail Parameter: Batas Minimum & Catatan Barang */}
        <div className="grid gap-2 sm:grid-cols-2">
          {/* Batas Stok Minimum */}
          <div className="rounded-xl border border-line bg-surface p-3 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Batas Stok Minimum
            </p>
            <p className="mt-1 font-bold text-ink">
              {product.minStock != null && product.minStock > 0
                ? `${formatQty(product.minStock)} ${baseName}`
                : 'Belum diatur (tidak ada peringatan)'}
            </p>
          </div>

          {/* Catatan Barang */}
          <div className="rounded-xl border border-line bg-surface p-3 text-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Catatan Barang
            </p>
            <p className="mt-1 text-ink leading-relaxed">
              {stock?.note ? stock.note : 'Tidak ada catatan stok khusus.'}
            </p>
          </div>
        </div>

        {/* Informasi Tambahan (Promo / Deskripsi) */}
        <div className="rounded-xl border border-line bg-primary-soft/40 p-3.5 text-xs space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Keterangan & Promosi
          </p>
          <p className="font-semibold text-ink">
            Status Unggulan:{' '}
            <span className={product.featured ? 'text-amber-700 font-bold' : 'text-ink-soft'}>
              {product.featured ? 'Aktif (Barang Unggulan)' : 'Nonaktif'}
            </span>
          </p>
          {product.promo && (
              <div className="rounded-lg bg-white/70 p-2 text-ink">
                <p className="font-bold text-primary">
                  {product.promoTitle || 'Sedang Promo'}
                </p>
                {product.promoDescription && (
                  <p className="mt-0.5 text-ink-soft leading-relaxed">
                    {product.promoDescription}
                  </p>
                )}
              </div>
            )}
            {product.description && (
              <p className="text-ink leading-relaxed">
                <span className="font-semibold text-ink-soft">Deskripsi: </span>
                {product.description}
              </p>
            )}
          </div>
        </div>
      </Modal>
  );
}