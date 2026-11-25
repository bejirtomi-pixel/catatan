import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, User, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { cx } from './UI';

export default function OperatorSwitcher({ compact = false }) {
  const { operators, activeOperator, activeOperatorId, setActiveOperatorId, pushToast } = useApp();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Filter operator yang berstatus aktif
  const activeList = (Array.isArray(operators) ? operators : []).filter(
    (o) => o.status === 'aktif'
  );

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const handleSelect = (op) => {
    setActiveOperatorId(op.id);
    setOpen(false);
    pushToast(`Operator aktif beralih ke: ${op.name}`, 'info');
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Ganti Operator Warung yang sedang bertugas"
        className={cx(
          'flex items-center gap-1.5 rounded-xl border border-line bg-white text-ink shadow-soft transition hover:border-primary/40 active:scale-95',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-xs font-semibold'
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <User className="h-3 w-3" />
        </span>
        <span className="max-w-[90px] truncate sm:max-w-[120px] font-bold">
          {activeOperator.name}
        </span>
        <ChevronDown className={cx('h-3.5 w-3.5 text-ink-soft transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-2xl border border-line bg-surface p-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 border-b border-line mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1">
              <Users className="h-3 w-3 text-primary" />
              <span>Operator Bertugas</span>
            </p>
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {activeList.map((op) => {
              const isSelected = op.id === activeOperatorId;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleSelect(op)}
                  className={cx(
                    'flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium transition',
                    isSelected
                      ? 'bg-primary text-white font-bold'
                      : 'text-ink hover:bg-primary-soft/60'
                  )}
                >
                  <span className="truncate">{op.name}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
