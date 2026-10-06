import { useState } from 'react';
import { Plus, X } from 'lucide-react';

// value: [{ id: string|null, name: string }]
export default function StorePicker({ stores, value = [], onChange }) {
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const q = trimmed.toLowerCase();
  const selectedIds = value.map((v) => v.id).filter(Boolean);
  const options = stores.filter(
    (s) => !selectedIds.includes(s.id) && (!q || s.name.toLowerCase().includes(q))
  );
  const exists = stores.some((s) => s.name.toLowerCase() === q);
  const canCreate = !!trimmed && !exists;

  const remove = (v) =>
    onChange(value.filter((x) => (x.id ? x.id !== v.id : x.name.toLowerCase() !== v.name.toLowerCase())));

  const addExisting = (sid) => {
    const s = stores.find((x) => x.id === sid);
    if (s && !value.some((x) => x.id === sid)) onChange([...value, { id: s.id, name: s.name }]);
    setText('');
  };

  const addNew = () => {
    if (!value.some((x) => !x.id && x.name.toLowerCase() === q))
      onChange([...value, { id: null, name: trimmed }]);
    setText('');
  };

  return (
    <div className="relative">
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span
              key={v.id || v.name}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
            >
              🏪 {v.name}
              <button
                type="button"
                onClick={() => remove(v)}
                className="opacity-60 transition hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ketik & pilih toko, atau buat toko baru..."
          className="input"
        />
        {text && (
          <button
            type="button"
            onClick={() => setText('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(text || options.length > 0) && (
        <div className="mt-1 max-h-44 overflow-auto rounded-xl border border-line bg-white p-1 shadow-card">
          {canCreate && (
            <button
              type="button"
              onClick={addNew}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-primary-soft"
            >
              <Plus className="h-4 w-4" />
              <span>
                Buat toko <span className="font-bold">"{trimmed}"</span>
              </span>
            </button>
          )}
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addExisting(s.id)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-primary-soft"
            >
              <span className="font-medium text-ink">🏪 {s.name}</span>
              <Plus className="h-3.5 w-3.5 text-ink-soft" />
            </button>
          ))}
          {options.length === 0 && !canCreate && (
            <p className="px-3 py-2 text-xs text-ink-soft">Tidak ada toko yang cocok.</p>
          )}
        </div>
      )}
    </div>
  );
}