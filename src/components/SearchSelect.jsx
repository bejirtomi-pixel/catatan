import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cx } from './UI';

export default function SearchSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Pilih...',
  error,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = options.find((o) => o.id === value);
  const q = text.trim().toLowerCase();
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q));

  return (
    <div ref={ref} className={cx('relative', disabled && 'pointer-events-none opacity-60')}>
      <div className="relative">
        {!selected && (
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        )}
        <input
          value={selected ? selected.label : text}
          onChange={(e) => {
            if (selected) onChange(null);
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={cx('input', selected ? 'pr-9' : 'pl-10 pr-9')}
        />
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setText('');
            }}
            className="absolute right-8 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-soft"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-line bg-white p-1 shadow-card">
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink-soft">Tidak ditemukan.</p>
          )}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setText('');
                setOpen(false);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-primary-soft',
                value === o.id && 'bg-primary-soft'
              )}
            >
              {o.emoji && <span className="text-base">{o.emoji}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{o.label}</span>
                {o.sub && <span className="block truncate text-xs text-ink-soft">{o.sub}</span>}
              </span>
              {value === o.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs font-medium text-rose-500">{error}</p>}
    </div>
  );
}