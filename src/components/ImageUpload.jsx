import { useEffect, useRef, useState } from 'react';
import { Camera, ImageIcon, ImagePlus, Loader2, RotateCcw, Upload } from 'lucide-react';
import { compressImage } from '../utils/image';
import { cx } from './UI';

// value: dataURL atau ''; mendukung preview, ambil dari kamera / galeri, ganti, hapus.
// Variant 'product': preview besar rasio 1:1 untuk foto barang.
// Variant 'logo': kotak kecil untuk logo toko.
// Variant 'receipt': tampilan horizontal untuk struk penerimaan.
export default function ImageUpload({
  value = '',
  onChange,
  label = 'Gambar',
  hint = 'Ambil foto dari kamera atau pilih dari galeri. Maks 1 gambar.',
  variant = 'product',
  className = '',
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [value]);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar (JPG/PNG).');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, { maxDim: 1000, quality: 0.82 });
      onChange(dataUrl);
    } catch {
      setError('Gagal memproses gambar. Coba file lain.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const openPicker = (capture) => {
    setError('');
    const el = inputRef.current;
    if (!el) return;
    if (capture && el.setAttribute) el.setAttribute('capture', 'user');
    else if (el.removeAttribute) el.removeAttribute('capture');
    el.click();
  };

  const smallBtn = cx(
    'inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5',
    'text-[11px] font-bold transition'
  );

  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files && e.target.files[0])}
      />

      {busy && (
        <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memproses gambar...
        </p>
      )}
      {error && <p className="mb-1.5 text-xs font-medium text-rose-500">{error}</p>}

      {variant === 'logo' ? (
        <div className="flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-soft text-3xl shadow-soft">
            {value && !failed ? (
              <img
                src={value}
                alt="Logo"
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-primary" />
            )}
          </span>
          <div className="flex flex-col gap-1.5">
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => openPicker(false)}
                className={`${smallBtn} bg-primary-soft text-primary hover:bg-primary hover:text-white`}
              >
                <Upload className="h-3.5 w-3.5" /> {value ? 'Ganti Logo' : 'Upload Logo'}
              </button>
              <button
                type="button"
                onClick={() => openPicker(true)}
                className={`${smallBtn} border-line bg-white text-ink hover:bg-primary-soft`}
                title="Ambil foto dari kamera"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </span>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className={`${smallBtn} self-start border-transparent text-rose-500 hover:bg-rose-50`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Hapus Logo
              </button>
            )}
          </div>
        </div>
      ) : variant === 'receipt' ? (
        value ? (
          <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            <img src={value} alt="Struk" className="h-44 w-full object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              Tersimpan
            </span>
            <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-ink/60 to-transparent p-2.5">
              <button
                type="button"
                onClick={() => openPicker(false)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/95 px-2 py-1.5 text-xs font-bold text-ink transition hover:bg-white"
              >
                <ImagePlus className="h-3.5 w-3.5" /> Ganti
              </button>
              <button
                type="button"
                onClick={() => openPicker(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/95 px-2 py-1.5 text-xs font-bold text-ink transition hover:bg-white"
              >
                <Camera className="h-3.5 w-3.5" /> Kamera
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                title="Hapus gambar"
                className="inline-flex items-center justify-center rounded-lg bg-rose-500/95 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-rose-500"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => openPicker(false)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary-soft/50 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-primary-soft"
            >
              <Upload className="h-4 w-4" /> Lampirkan Foto Struk
            </button>
            <button
              type="button"
              onClick={() => openPicker(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-primary-soft"
            >
              <Camera className="h-4 w-4" /> Ambil Foto
            </button>
          </div>
        )
      ) : value ? (
        <div className="w-full sm:w-64">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
            {value && !failed ? (
              <img
                src={value}
                alt="Gambar"
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[11px] text-ink-soft">
                <ImageIcon className="h-6 w-6" /> Gambar tidak tersedia
              </span>
            )}
            <span className="absolute left-2 top-2 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              Tersimpan
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => openPicker(false)}
              className={cx(
                'flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary-soft px-2 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white'
              )}
            >
              <ImagePlus className="h-3.5 w-3.5" /> Ganti
            </button>
            <button
              type="button"
              onClick={() => openPicker(true)}
              className={cx(
                'flex flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 py-1.5 text-xs font-bold text-ink transition hover:bg-primary-soft'
              )}
              title="Ambil foto dari kamera"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              title="Hapus gambar"
              className="flex w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-500 transition hover:bg-rose-500 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2 sm:w-64">
          <button
            type="button"
            onClick={() => openPicker(false)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary-soft/50 px-3 py-3 text-sm font-semibold text-primary transition hover:bg-primary-soft"
          >
            <Upload className="h-4 w-4" /> Upload Gambar
          </button>
          <button
            type="button"
            onClick={() => openPicker(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 py-3 text-sm font-semibold text-ink transition hover:bg-primary-soft"
          >
            <Camera className="h-4 w-4" /> Ambil Foto
          </button>
        </div>
      )}

      {!busy && !error && hint && <p className="mt-1.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}