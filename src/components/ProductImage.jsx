import { Gift, Megaphone, Package, Star, Tag, TrendingDown, TrendingUp } from 'lucide-react';
import { cx } from './UI';

const PALETTE = [
  'bg-rose-200',
  'bg-pink-200',
  'bg-violet-200',
  'bg-sky-200',
  'bg-emerald-200',
  'bg-amber-200',
  'bg-orange-200',
  'bg-teal-200',
];

export function tintFor(product) {
  if (product.imageTint) return product.imageTint;
  const sum = String(product.id || '')
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return PALETTE[sum % PALETTE.length];
}

export const initialFor = (name) => {
  const s = String(name || '').trim();
  return s ? s.slice(0, 1).toUpperCase() : '?';
};

export function productFlags(product) {
  const flags = [];
  if (product.featured) flags.push({ label: 'Unggulan', cls: 'bg-amber-100 text-amber-700', icon: Star });
  if (product.promo) flags.push({ label: 'Promo', cls: 'bg-violet-100 text-violet-700', icon: Tag });
  if (product.advertisement) flags.push({ label: 'Iklan', cls: 'bg-orange-100 text-orange-700', icon: Megaphone });
  return flags;
}

export function ProductFlags({ product, className = '' }) {
  const flags = productFlags(product);
  if (!flags.length) return null;
  return (
    <div className={cx('mt-1 flex flex-wrap gap-1', className)}>
      {flags.map((f) => (
        <span
          key={f.label}
          className={cx(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold',
            f.cls
          )}
        >
          <f.icon className="h-2.5 w-2.5" /> {f.label}
        </span>
      ))}
    </div>
  );
}

export default function ProductImage({
  product,
  size = 'md',
  onClick,
  showBadges = true,
  className = '',
}) {
  if (!product) return null;
  const sizes = {
    xs: 'h-8 w-8 rounded-lg text-sm',
    sm: 'h-10 w-10 rounded-xl text-base',
    md: 'h-12 w-12 rounded-xl text-lg',
    lg: 'h-20 w-20 rounded-2xl text-3xl',
  }[size];
  const badge = 'flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 shadow';
  const Tag = onClick ? 'button' : 'div';
  return (
    <div className={cx('relative inline-block shrink-0', className)}>
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        title={product.name}
        className={cx(
          'flex items-center justify-center overflow-hidden border border-white/70 shadow-soft transition',
          sizes,
          tintFor(product),
          onClick && 'hover:scale-105'
        )}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-extrabold text-ink/60">
            {initialFor(product.name)}
          </span>
        )}
      </Tag>
      {showBadges && (
        <>
          <div className="absolute -left-1 -top-1 flex flex-col items-start gap-0.5">
            {product.priceChange === 'up' && (
              <span className={cx(badge, 'bg-rose-500 p-0.5 text-white')} title="Harga Naik">
                <TrendingUp className="h-3 w-3" />
              </span>
            )}
            {product.priceChange === 'down' && (
              <span className={cx(badge, 'bg-emerald-500 p-0.5 text-white')} title="Harga Turun">
                <TrendingDown className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="absolute -right-1 -top-1 flex flex-col items-end gap-0.5">
            {product.promo && (
              <span className={cx(badge, 'bg-violet-500 p-0.5 text-white')} title="Promo">
                <Gift className="h-3 w-3" />
              </span>
            )}
            {product.advertisement && (
              <span className={cx(badge, 'bg-amber-500 p-0.5 text-white')} title="Iklan Promo">
                <Megaphone className="h-3 w-3" />
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}