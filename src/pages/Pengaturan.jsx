import { useState } from 'react';
import { Palette, RotateCcw, Save, Store } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ImageUpload from '../components/ImageUpload';
import {
  Btn,
  ConfirmModal,
  Field,
  Input,
  PageHeader,
  Textarea,
  cx,
} from '../components/UI';

const THEMES = [
  { id: 'soft-pink', name: 'Soft Pink', colors: ['#ec4899', '#f9a8d4', '#fff7ed'] },
  { id: 'lavender', name: 'Lavender', colors: ['#8b5cf6', '#c4b5fd', '#f9f6ff'] },
  { id: 'soft-blue', name: 'Soft Blue', colors: ['#4084f5', '#93c5fd', '#f6faff'] },
  { id: 'mint', name: 'Mint', colors: ['#107c69', '#6ee7b7', '#f4fcf8'] },
  { id: 'peach', name: 'Peach', colors: ['#ea6a20', '#fdba74', '#fff8f3'] },
  { id: 'cream', name: 'Cream / Moca', colors: ['#85613e', '#d2ba96', '#fbf8f3'] },
];

export default function Pengaturan() {
  const { settings, updateSettings, resetData, pushToast } = useApp();
  const [name, setName] = useState(settings.name || 'Warung Madura');
  const [description, setDescription] = useState(
    settings.description || ''
  );
  const [logo, setLogo] = useState(settings.logo || '');
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);

  const saveProfile = () => {
    if (!name.trim()) {
      setError('Nama toko wajib diisi.');
      return;
    }
    setError('');
    updateSettings({ name: name.trim(), description: description.trim(), logo: logo.trim() });
    pushToast('Pengaturan toko disimpan');
  };

  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Informasi toko & tampilan aplikasi." />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Profil Toko */}
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Store className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink">Profil Toko</h2>
              <p className="text-[11px] text-ink-soft">Ditampilkan di Dashboard & sidebar</p>
            </div>
          </div>

          <Field label="Logo Toko" hint="Unggah gambar logo dari perangkat atau ambil foto. Kosongkan untuk memakai ikon bawaan.">
            <ImageUpload
              value={logo}
              onChange={(v) => setLogo(v || '')}
              label=""
              hint=""
              variant="logo"
            />
          </Field>

          <Field label="Nama Toko" required error={error}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Warung Madura" />
          </Field>

          <Field label="Deskripsi Toko">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Warung kebutuhan sehari-hari dengan berbagai pilihan barang."
            />
          </Field>

          <Btn icon={Save} onClick={saveProfile}>
            Simpan Profil
          </Btn>
        </div>

        {/* Tema */}
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Palette className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink">Tema Warna</h2>
              <p className="text-[11px] text-ink-soft">Pilih suasana aplikasi</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEMES.map((t) => {
              const active = (settings.theme || 'soft-pink') === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    updateSettings({ theme: t.id });
                    pushToast(`Tema ${t.name} aktif`, 'info');
                  }}
                  className={cx(
                    'flex items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition',
                    active
                      ? 'border-primary bg-primary-soft shadow-soft'
                      : 'border-line bg-white hover:border-primary/40'
                  )}
                >
                  <span className="flex -space-x-1.5">
                    {t.colors.map((c) => (
                      <span
                        key={c}
                        className="h-8 w-8 rounded-full border-2 border-white shadow-soft"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink">{t.name}</span>
                    <span className="text-[11px] text-ink-soft">
                      {active ? 'Sedang aktif' : 'Klik untuk memakai'}
                    </span>
                  </span>
                  {active && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-line bg-primary-soft/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink">Data Contoh</p>
                <p className="text-xs text-ink-soft">
                  Kembalikan seluruh data ke contoh awal.
                </p>
              </div>
              <Btn variant="dangerSoft" icon={RotateCcw} onClick={() => setResetOpen(true)}>
                Reset Data
              </Btn>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Data Contoh"
        message="Seluruh data yang tersimpan akan ditimpa kembali ke data contoh awal. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Reset"
        danger
        onConfirm={() => {
          resetData();
          setName('Warung Madura');
          setDescription('Warung kebutuhan sehari-hari dengan berbagai pilihan barang.');
          setLogo('');
          setResetOpen(false);
          pushToast('Data contoh berhasil direset', 'info');
        }}
      />
    </div>
  );
}