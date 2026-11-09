import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { cx } from '../utils/format';

export { cx };

/* ---------- Button ---------- */
export function Btn({ variant = 'primary', size = 'md', icon: Icon, className = '', children, ...props }) {
  const v = {
    primary: 'bg-primary text-white hover:brightness-105 shadow-soft',
    soft: 'bg-primary-soft text-primary hover:bg-accent-soft',
    outline: 'bg-white text-ink border border-line hover:border-primary/40 hover:bg-primary-soft',
    ghost: 'text-ink-soft hover:text-ink hover:bg-primary-soft',
    danger: 'bg-rose-500 text-white hover:bg-rose-600 shadow-soft',
    dangerSoft: 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100',
  }[variant];
  const s = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-5 py-3 text-sm gap-2',
  }[size];
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        v,
        s,
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */
export function Input({ className = '', ...props }) {
  return <input className={cx('input', className)} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={cx('input min-h-[96px] resize-y', className)} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <div className="relative">
      <select className={cx('input appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Cari...', className = '' }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="input pl-10 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange({ target: { value: '' } })}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-soft hover:bg-line hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ---------- Field ---------- */
export function Field({ label, required, error, hint, children, className }) {
  return (
    <div className={cx('mb-4', className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-rose-500">{error}</p>}
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5">
      <span className={cx('flex h-6 w-11 items-center rounded-full p-0.5 transition', checked ? 'bg-primary' : 'bg-line')}>
        <span className={cx('h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
    </button>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-extrabold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, subtitle, size = 'md', footer, children }) {
  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={cx('relative w-full overflow-hidden rounded-2xl bg-surface shadow-card', sizes)}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-ink-soft transition hover:bg-primary-soft hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-primary-soft/40 px-5 py-3.5">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ---------- Confirm modal ---------- */
export function ConfirmModal({
  open,
  onClose,
  title = 'Konfirmasi',
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  danger,
  onConfirm,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Btn>
          <Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            danger ? 'bg-rose-50 text-rose-500' : 'bg-primary-soft text-primary'
          )}
        >
          <ShieldAlert className="h-5 w-5" />
        </span>
        <p className="text-sm leading-relaxed text-ink-soft">{message}</p>
      </div>
      {children}
    </Modal>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon: Icon = Inbox, title = 'Belum ada data', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <p className="text-sm font-bold text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-ink-soft">{description}</p>}
      {action}
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, totalPages, onPage, total, from, to }) {
  if (!total) return null;
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    const set = new Set([1, totalPages, page - 1, page, page + 1]);
    const arr = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    let prev = 0;
    for (const p of arr) {
      if (p - prev > 1) pages.push('...');
      pages.push(p);
      prev = p;
    }
  }
  const btnCls = 'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition';
  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-ink-soft">
        Menampilkan <span className="font-bold text-ink">{from || 0}</span>–
        <span className="font-bold text-ink">{to || 0}</span> dari{' '}
        <span className="font-bold text-ink">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={cx(btnCls, 'bg-white text-ink-soft hover:text-ink disabled:opacity-40')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1 text-xs text-ink-soft">
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              className={cx(btnCls, p === page ? 'bg-primary text-white shadow-soft' : 'bg-white text-ink-soft hover:text-ink')}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className={cx(btnCls, 'bg-white text-ink-soft hover:text-ink disabled:opacity-40')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Status pill ---------- */
export function StatusPill({ status }) {
  const map = {
    belum_diterima: { label: 'Belum Diterima', cls: 'bg-amber-100 text-amber-700' },
    active: { label: 'Belum Diterima', cls: 'bg-amber-100 text-amber-700' },
    pending: { label: 'Belum Diterima', cls: 'bg-amber-100 text-amber-700' },
    sebagian: { label: 'Diterima Sebagian', cls: 'bg-blue-100 text-blue-700' },
    proses: { label: 'Sedang Diproses', cls: 'bg-sky-100 text-sky-700' },
    diproses: { label: 'Sedang Diproses', cls: 'bg-sky-100 text-sky-700' },
    selesai: { label: 'Sudah Diterima', cls: 'bg-emerald-100 text-emerald-700' },
    diterima: { label: 'Sudah Diterima', cls: 'bg-emerald-100 text-emerald-700' },
    batal: { label: 'Dibatalkan', cls: 'bg-rose-100 text-rose-700' },
    dibatalkan: { label: 'Dibatalkan', cls: 'bg-rose-100 text-rose-700' },
  };
  const s = map[status] || map.belum_diterima;
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold', s.cls)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

/* ---------- Chip ---------- */
export function Chip({ children, tone = 'soft', className }) {
  const t = {
    soft: 'bg-primary-soft text-primary',
    neutral: 'bg-line/60 text-ink-soft',
    violet: 'bg-violet-100 text-violet-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  }[tone];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', t, className)}>
      {children}
    </span>
  );
}

/* ---------- Table primitives ---------- */
export function TableWrap({ children, minWidth = 'min-w-[720px]' }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className={cx('w-full text-left', minWidth)}>{children}</table>
      </div>
    </div>
  );
}

export function TH({ children, className = '' }) {
  return (
    <th className={cx('whitespace-nowrap px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-ink-soft', className)}>
      {children}
    </th>
  );
}

export function TD({ children, className = '', colSpan }) {
  return (
    <td colSpan={colSpan} className={cx('px-4 py-3 text-sm', className)}>
      {children}
    </td>
  );
}