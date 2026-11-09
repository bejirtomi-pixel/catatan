import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Loader2,
  PackageCheck,
  PackageX,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DEFAULT_NOTIFICATIONS, useApp } from '../context/AppContext';
import { dateCompact, formatDateTime, formatQty } from '../utils/format';
import { compressImage } from '../utils/image';
import { Btn, ConfirmModal, Field, Input, Modal, PageHeader, Textarea, cx } from '../components/UI';
import Logo from '../components/Logo';

// 6 Tema Warna Resmi Warung Madura
const THEMES = [
  {
    id: 'soft-pink',
    name: 'Soft Pink',
    desc: 'Nuansa merah muda lembut khas Warung Madura',
    primary: '#ec4899',
    colors: ['#ec4899', '#f9a8d4', '#fff7ed'],
  },
  {
    id: 'lavender',
    name: 'Lavender',
    desc: 'Ungu teduh, anggun, dan nyaman di mata',
    primary: '#8b5cf6',
    colors: ['#8b5cf6', '#c4b5fd', '#f9f6ff'],
  },
  {
    id: 'soft-blue',
    name: 'Soft Blue',
    desc: 'Biru kalem yang bersih, sejuk, dan rapi',
    primary: '#4084f5',
    colors: ['#4084f5', '#93c5fd', '#f6faff'],
  },
  {
    id: 'mint',
    name: 'Mint',
    desc: 'Hijau daun segar yang bernuansa alami',
    primary: '#107c69',
    colors: ['#107c69', '#6ee7b7', '#f4fcf8'],
  },
  {
    id: 'peach',
    name: 'Peach',
    desc: 'Oranye cerah hangat yang bersahabat',
    primary: '#ea6a20',
    colors: ['#ea6a20', '#fdba74', '#fff8f3'],
  },
  {
    id: 'cream',
    name: 'Cream / Mocha',
    desc: 'Krem kopi klasik yang hangat dan tenang',
    primary: '#85613e',
    colors: ['#85613e', '#d2ba96', '#fbf8f3'],
  },
];

export default function Pengaturan() {
  const {
    settings,
    updateSettings,
    resetData,
    clearAllData,
    pushToast,
    buildBackup,
    importData,
    stores,
    products,
    stocks,
    orders,
    movements,
    shortages,
  } = useApp();

  // 1. State Profil Toko
  const [name, setName] = useState(settings.name || 'Warung Madura');
  const [description, setDescription] = useState(settings.description || '');
  const [logo, setLogo] = useState(settings.logo || '');
  const [nameError, setNameError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef(null);

  // Sync state profil saat settings berubah
  useEffect(() => {
    setName(settings.name || 'Warung Madura');
    setDescription(settings.description || '');
    setLogo(settings.logo || '');
  }, [settings.name, settings.description, settings.logo]);

  // 3. State Pengaturan Notifikasi
  const [notifConfig, setNotifConfig] = useState(() => ({
    ...DEFAULT_NOTIFICATIONS,
    ...(settings.notifications || {}),
  }));

  useEffect(() => {
    setNotifConfig({
      ...DEFAULT_NOTIFICATIONS,
      ...(settings.notifications || {}),
    });
  }, [settings.notifications]);

  // 4. State Cadangan & Pemulihan
  const [pendingImport, setPendingImport] = useState(null);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [importError, setImportError] = useState('');
  const restoreFileRef = useRef(null);

  // 5. State Reset Data
  const [resetSampleOpen, setResetSampleOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  // Hitung jumlah data yang dicakup dalam cadangan saat ini
  const backupSummary = useMemo(
    () => ({
      stores: stores.length,
      products: products.length,
      stocks: stocks.length,
      orders: orders.length,
      movements: movements.length,
      shortages: shortages.length,
    }),
    [stores, products, stocks, orders, movements, shortages]
  );

  /* =========================================================================
     1. HANDLER PROFIL TOKO
     ========================================================================= */
  const handleLogoUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      pushToast('Berkas harus berupa gambar (JPG atau PNG).', 'warning');
      return;
    }
    setLogoBusy(true);
    try {
      const dataUrl = await compressImage(file, { maxDim: 800, quality: 0.85 });
      setLogo(dataUrl);
      pushToast('Logo berhasil dipilih. Klik "Simpan Profil" untuk menerapkan.');
    } catch {
      pushToast('Gagal memproses berkas gambar.', 'error');
    } finally {
      setLogoBusy(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const openLogoPicker = (capture = false) => {
    const el = logoInputRef.current;
    if (!el) return;
    if (capture && el.setAttribute) el.setAttribute('capture', 'user');
    else if (el.removeAttribute) el.removeAttribute('capture');
    el.click();
  };

  const handleRemoveLogo = () => {
    setLogo('');
    pushToast('Logo dihapus. Klik "Simpan Profil" untuk menerapkan ikon bawaan.');
  };

  const handleSaveProfile = () => {
    if (!name.trim()) {
      setNameError('Nama toko wajib diisi.');
      pushToast('Gagal: Nama toko tidak boleh kosong.', 'warning');
      return;
    }
    setNameError('');
    updateSettings({
      name: name.trim(),
      description: description.trim(),
      logo: logo.trim(),
    });
    pushToast('Profil toko berhasil disimpan.');
  };

  /* =========================================================================
     2. HANDLER TEMA WARNA
     ========================================================================= */
  const handleSelectTheme = (themeId, themeName) => {
    updateSettings({ theme: themeId });
    pushToast(`Tema warna ${themeName} berhasil diterapkan.`);
  };

  /* =========================================================================
     3. HANDLER PENGATURAN NOTIFIKASI
     ========================================================================= */
  const toggleNotif = (key) => {
    setNotifConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const setAllNotifs = (active) => {
    setNotifConfig({
      stockLow: active,
      stockEmpty: active,
      stockRestocked: active,
      orderCreated: active,
      orderReceiving: active,
      orderPartial: active,
      orderCompleted: active,
      orderUnfulfilled: active,
      repurchasePending: active,
      repurchaseInDelivery: active,
    });
    pushToast(active ? 'Seluruh notifikasi diaktifkan.' : 'Seluruh notifikasi dinonaktifkan.');
  };

  const handleSaveNotifications = () => {
    updateSettings({ notifications: notifConfig });
    pushToast('Pengaturan notifikasi berhasil disimpan.');
  };

  /* =========================================================================
     4. HANDLER CADANGAN & PEMULIHAN
     ========================================================================= */
  const handleDownloadBackup = () => {
    try {
      const backup = buildBackup();
      const now = new Date();
      updateSettings({ lastBackupAt: now.toISOString() });

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cadangan-warung-madura-${dateCompact(now)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushToast(
        `Cadangan berhasil diunduh (${backupSummary.products} barang, ${backupSummary.orders} pesanan).`
      );
    } catch {
      pushToast('Gagal membuat berkas cadangan.', 'error');
    }
  };

  const handleSelectRestoreFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    setImportError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Berkas tidak berformat JSON yang valid.');
        }

        const d = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        if (!Array.isArray(d.stores) || !Array.isArray(d.products)) {
          throw new Error('Format cadangan tidak sesuai (data toko atau barang tidak ditemukan).');
        }

        setPendingImport(parsed);
        setRestoreModalOpen(true);
      } catch (err) {
        setImportError(err.message || 'Berkas bukan JSON cadangan Warung Madura yang valid.');
        pushToast('Gagal memvalidasi berkas cadangan.', 'error');
      }
    };
    reader.onerror = () => {
      setImportError('Gagal membaca berkas cadangan.');
      pushToast('Gagal membaca berkas.', 'error');
    };
    reader.readAsText(file);
  };

  const getPendingImportSummary = () => {
    if (!pendingImport) return null;
    const d =
      pendingImport.data && typeof pendingImport.data === 'object'
        ? pendingImport.data
        : pendingImport;
    const n = (x) => (Array.isArray(x) ? x.length : 0);
    return {
      exportedAt: pendingImport.exportedAt || null,
      storeName: d.settings?.name || 'Warung Madura',
      stores: n(d.stores),
      products: n(d.products),
      stocks: n(d.stocks),
      orders: n(d.orders),
      movements: n(d.movements),
      shortages: n(d.shortages),
    };
  };

  const executeRestore = () => {
    if (!pendingImport) return;
    const res = importData(pendingImport);
    if (res.ok) {
      const d =
        pendingImport.data && typeof pendingImport.data === 'object'
          ? pendingImport.data
          : pendingImport;
      if (d.settings && typeof d.settings === 'object') {
        setName(d.settings.name || 'Warung Madura');
        setDescription(d.settings.description || '');
        setLogo(d.settings.logo || '');
      }
      pushToast(
        `Data berhasil dipulihkan: ${res.summary.products} barang, ${res.summary.orders} pesanan, ${res.summary.stores} toko.`
      );
      setRestoreModalOpen(false);
      setPendingImport(null);
    } else {
      setImportError(res.reason || 'Gagal memulihkan data dari berkas.');
      pushToast(res.reason || 'Gagal memulihkan data.', 'error');
    }
  };

  /* =========================================================================
     5. HANDLER RESET DATA
     ========================================================================= */
  const executeResetSample = () => {
    resetData();
    setName('Warung Madura');
    setDescription('Warung kebutuhan sehari-hari dengan berbagai pilihan barang.');
    setLogo('');
    setResetSampleOpen(false);
    pushToast('Data contoh awal berhasil dikembalikan.');
  };

  const executeClearAll = () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'HAPUS') {
      pushToast('Ketik kata "HAPUS" untuk mengonfirmasi pengosongan data.', 'warning');
      return;
    }
    clearAllData();
    setName('Warung Madura');
    setDescription('');
    setLogo('');
    setClearAllOpen(false);
    setDeleteConfirmationText('');
    pushToast('Seluruh data berhasil dikosongkan.');
  };

  const activeThemeId = settings.theme || 'soft-pink';

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Pengaturan"
        subtitle="Pusat pengelolaan profil warung, tema tampilan, notifikasi, dan keamanan cadangan data."
      />

      {/* =========================================================================
          1. PROFIL TOKO
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-soft">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink sm:text-base">1. Profil Toko</h2>
              <p className="text-xs text-ink-soft">
                Identitas warung yang tampil di Dashboard, sidebar, struk, dan seluruh aplikasi.
              </p>
            </div>
          </div>
          <Btn icon={Save} size="sm" onClick={handleSaveProfile}>
            Simpan Profil
          </Btn>
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          {/* Preview & Aksi Logo Toko */}
          <div className="md:col-span-4 lg:col-span-3 flex flex-col items-center sm:items-start">
            <label className="label mb-2">Logo Warung</label>
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/60 shadow-soft">
              <Logo
                src={logo}
                boxClassName="h-full w-full rounded-2xl text-4xl"
                alt="Preview Logo Toko"
              />
              {logoBusy && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              )}
            </div>

            <p className="mt-2 text-center sm:text-left text-[11px] text-ink-soft">
              {logo ? 'Logo aktif tersimpan.' : 'Memakai ikon bawaan warung.'}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5 justify-center sm:justify-start">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleLogoUpload(e.target.files && e.target.files[0])}
              />
              <button
                type="button"
                onClick={() => openLogoPicker(false)}
                className="inline-flex items-center gap-1 rounded-xl border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-ink shadow-soft transition hover:border-primary/50 hover:bg-primary-soft active:scale-95"
              >
                <Upload className="h-3.5 w-3.5 text-primary" />
                {logo ? 'Ganti Logo' : 'Unggah Logo'}
              </button>
              <button
                type="button"
                onClick={() => openLogoPicker(true)}
                className="inline-flex items-center rounded-xl border border-line bg-white p-1.5 text-ink shadow-soft transition hover:bg-primary-soft active:scale-95"
                title="Ambil foto dari kamera"
              >
                <Camera className="h-3.5 w-3.5 text-ink-soft" />
              </button>
              {logo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-100 active:scale-95"
                  title="Hapus logo dan gunakan ikon bawaan"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Hapus
                </button>
              )}
            </div>
          </div>

          {/* Form Nama & Deskripsi */}
          <div className="md:col-span-8 lg:col-span-9 space-y-4">
            <Field
              label="Nama Warung / Toko"
              required
              error={nameError}
              hint="Nama yang akan tertera pada kartu ringkasan, riwayat, dan laporan."
            >
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError('');
                }}
                placeholder="Contoh: Warung Madura Barokah"
                className="font-bold text-sm"
              />
            </Field>

            <Field
              label="Deskripsi Toko (opsional)"
              hint="Keterangan singkat mengenai jenis barang atau lokasi warung Anda."
            >
              <Textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Warung sembako dan kebutuhan sehari-hari lengkap, buka 24 jam."
              />
            </Field>

            <div className="flex justify-end pt-1">
              <Btn icon={Save} onClick={handleSaveProfile}>
                Simpan Profil Warung
              </Btn>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          2. TEMA WARNA
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-soft">
              <Palette className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink sm:text-base">2. Tema Warna Aplikasi</h2>
              <p className="text-xs text-ink-soft">
                Pilih palet warna yang nyaman digunakan. Pilihan tersimpan permanen di perangkat ini.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
            Tema Aktif: {THEMES.find((t) => t.id === activeThemeId)?.name || 'Soft Pink'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelectTheme(theme.id, theme.name)}
                className={cx(
                  'group relative flex flex-col justify-between rounded-2xl border-2 p-4 text-left transition-all duration-150',
                  isActive
                    ? 'border-primary bg-primary-soft/50 shadow-soft ring-1 ring-primary'
                    : 'border-line bg-white hover:border-primary/50 hover:bg-primary-soft/20'
                )}
              >
                {/* Header Kartu Tema */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex -space-x-1.5">
                      {theme.colors.map((color, idx) => (
                        <span
                          key={idx}
                          className="h-6 w-6 rounded-full border-2 border-white shadow-soft"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="font-extrabold text-ink text-sm">{theme.name}</span>
                  </div>

                  {isActive ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-soft">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-ink-soft opacity-0 transition group-hover:opacity-100">
                      Terapkan
                    </span>
                  )}
                </div>

                {/* Deskripsi & Mini Preview */}
                <p className="mt-2.5 text-xs text-ink-soft leading-relaxed">{theme.desc}</p>

                <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px]">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold"
                    style={{
                      backgroundColor: theme.colors[1] + '40',
                      color: theme.primary,
                    }}
                  >
                    Tombol & Badge
                  </span>
                  <span className="font-semibold text-ink-soft">
                    {isActive ? 'Sedang Digunakan' : 'Klik untuk Memilih'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* =========================================================================
          3. PENGATURAN NOTIFIKASI
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-soft">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink sm:text-base">3. Pengaturan Notifikasi</h2>
              <p className="text-xs text-ink-soft">
                Pusat kendali pemberitahuan stok, pesanan, dan pembelian ulang internal warung.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Btn size="sm" variant="outline" onClick={() => setAllNotifs(true)}>
              Aktifkan Semua
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setAllNotifs(false)}>
              Nonaktifkan Semua
            </Btn>
            <Btn size="sm" icon={Save} onClick={handleSaveNotifications}>
              Simpan Notifikasi
            </Btn>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* A. Notifikasi Stok */}
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center gap-2 border-b border-line/70 pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Boxes className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-ink">A. Notifikasi Stok</h3>
                <p className="text-[10px] text-ink-soft">Kondisi persediaan barang warung</p>
              </div>
            </div>

            <div className="mt-3.5 space-y-3">
              <ToggleRow
                title="Stok Menipis"
                desc="Beri tahu saat stok berada di bawah batas minimum."
                checked={!!notifConfig.stockLow}
                onChange={() => toggleNotif('stockLow')}
              />
              <ToggleRow
                title="Stok Habis"
                desc="Peringatan penting saat stok barang mencapai 0."
                checked={!!notifConfig.stockEmpty}
                onChange={() => toggleNotif('stockEmpty')}
              />
              <ToggleRow
                title="Stok Kembali Tersedia"
                desc="Pemberitahuan saat penambahan barang berhasil masuk stok."
                checked={!!notifConfig.stockRestocked}
                onChange={() => toggleNotif('stockRestocked')}
              />
            </div>
          </div>

          {/* B. Notifikasi Pesanan */}
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center gap-2 border-b border-line/70 pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-ink">B. Notifikasi Pesanan</h3>
                <p className="text-[10px] text-ink-soft">Status pesanan ke toko pemasok</p>
              </div>
            </div>

            <div className="mt-3.5 space-y-3">
              <ToggleRow
                title="Pesanan Baru Dibuat"
                desc="Notifikasi saat ada pesanan menunggu pengiriman."
                checked={!!notifConfig.orderCreated}
                onChange={() => toggleNotif('orderCreated')}
              />
              <ToggleRow
                title="Pesanan Diterima Sebagian"
                desc="Beri tahu saat pengiriman pemasok belum lengkap."
                checked={!!notifConfig.orderPartial}
                onChange={() => toggleNotif('orderPartial')}
              />
              <ToggleRow
                title="Pesanan Lengkap Diterima"
                desc="Beri tahu saat seluruh pesanan selesai diterima."
                checked={!!notifConfig.orderCompleted}
                onChange={() => toggleNotif('orderCompleted')}
              />
              <ToggleRow
                title="Kekurangan Barang Pesanan"
                desc="Pemberitahuan barang yang belum terpenuhi dari pesanan."
                checked={!!notifConfig.orderUnfulfilled}
                onChange={() => toggleNotif('orderUnfulfilled')}
              />
            </div>
          </div>

          {/* C. Notifikasi Pembelian Ulang */}
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
            <div className="flex items-center gap-2 border-b border-line/70 pb-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <RefreshCw className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-ink">C. Pembelian Ulang</h3>
                <p className="text-[10px] text-ink-soft">Pemenuhan kekurangan barang</p>
              </div>
            </div>

            <div className="mt-3.5 space-y-3">
              <ToggleRow
                title="Kekurangan Belum Dibeli"
                desc="Peringatan saat kekurangan barang belum dibeli kembali."
                checked={!!notifConfig.repurchasePending}
                onChange={() => toggleNotif('repurchasePending')}
              />
              <ToggleRow
                title="Menunggu Kedatangan Barang"
                desc="Beri tahu saat barang pembelian ulang belum tiba."
                checked={!!notifConfig.repurchaseInDelivery}
                onChange={() => toggleNotif('repurchaseInDelivery')}
              />
            </div>
          </div>
        </div>

        {/* Catatan Integritas Notifikasi */}
        <div className="mt-4 rounded-xl border border-line bg-primary-soft/30 p-3 text-xs text-ink-soft flex items-start gap-2.5">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Seluruh notifikasi dihasilkan langsung dari data riil aplikasi dan ditampilkan pada{' '}
            <strong className="text-ink">ikon lonceng di bilah atas aplikasi</strong>. Notifikasi
            tidak menggunakan izin pop-up browser dan tidak akan memunculkan pemberitahuan palsu
            atau berulang.
          </p>
        </div>
      </section>

      {/* =========================================================================
          4. CADANGAN DAN PEMULIHAN DATA
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-soft">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink sm:text-base">
                4. Cadangan & Pemulihan Data (Backup & Restore)
              </h2>
              <p className="text-xs text-ink-soft">
                Ekspor seluruh catatan warung ke berkas JSON atau pulihkan data dari berkas cadangan.
              </p>
            </div>
          </div>
        </div>

        {/* Ringkasan Data Saat Ini */}
        <div className="rounded-2xl border border-line bg-primary-soft/30 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2.5">
            <span className="font-bold text-ink">Informasi Cadangan Terakhir:</span>
            <span className="font-semibold text-primary">
              {settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'Belum pernah dicadangkan'}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 text-center">
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Toko Pemasok</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.stores}</p>
            </div>
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Data Barang</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.products}</p>
            </div>
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Stok Fisik</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.stocks}</p>
            </div>
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Riwayat Pesanan</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.orders}</p>
            </div>
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Mutasi Stok</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.movements}</p>
            </div>
            <div className="rounded-xl bg-white p-2 border border-line shadow-soft">
              <p className="text-[10px] uppercase font-bold text-ink-soft">Kekurangan</p>
              <p className="text-base font-extrabold text-ink">{backupSummary.shortages}</p>
            </div>
          </div>
        </div>

        {/* 2 Kartu Aksi: Unduh Cadangan vs Pulihkan */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Unduh Cadangan */}
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-ink">
                <Download className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold sm:text-sm">Unduh Cadangan (.json)</h3>
              </div>
              <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                Menyimpan seluruh profil toko, barang, kategori, satuan, riwayat pesanan, stok,
                laporan pembelian ulang, serta preferensi tema dalam satu berkas terenkapsulasi.
              </p>
            </div>

            <div className="mt-4 pt-2 border-t border-line/60">
              <Btn icon={Download} variant="primary" onClick={handleDownloadBackup}>
                Unduh Cadangan Sekarang
              </Btn>
            </div>
          </div>

          {/* Pulihkan dari Berkas */}
          <div className="rounded-2xl border border-line bg-white p-4 shadow-soft flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-ink">
                <Upload className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-extrabold sm:text-sm">Pulihkan dari Berkas (.json)</h3>
              </div>
              <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                Kembalikan catatan warung dari berkas JSON cadangan yang pernah diunduh. Berkas akan
                divalidasi terlebih dahulu sebelum disetujui untuk pemulihan.
              </p>
            </div>

            <div className="mt-4 pt-2 border-t border-line/60">
              <input
                ref={restoreFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleSelectRestoreFile}
              />
              <Btn
                icon={Upload}
                variant="outline"
                onClick={() => restoreFileRef.current?.click()}
              >
                Pilih Berkas Cadangan (.json)
              </Btn>
            </div>
          </div>
        </div>

        {importError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{importError}</span>
          </div>
        )}
      </section>

      {/* =========================================================================
          5. RESET DATA
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between border-b border-line pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-soft">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink sm:text-base">5. Reset Data</h2>
              <p className="text-xs text-ink-soft">
                Tindakan reset data diamankan dengan konfirmasi bertingkat agar data tidak terhapus
                tanpa sengaja.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Opsi A: Reset ke Data Contoh */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-soft flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-amber-900">
                <RotateCcw className="h-4 w-4 text-amber-700" />
                <h3 className="text-xs font-extrabold sm:text-sm">A. Reset ke Data Contoh</h3>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
                Mengembalikan inventaris, toko, pesanan, dan kekurangan ke set data contoh awal
                bawaan aplikasi. Cocok untuk mempelajari kembali fitur pencatatan warung.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800">Menimpa data ke contoh</span>
              <Btn
                size="sm"
                variant="dangerSoft"
                icon={RotateCcw}
                onClick={() => setResetSampleOpen(true)}
              >
                Reset Data Contoh
              </Btn>
            </div>
          </div>

          {/* Opsi B: Kosongkan Seluruh Data (Hapus Total) */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-soft flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-rose-900">
                <Trash2 className="h-4 w-4 text-rose-600" />
                <h3 className="text-xs font-extrabold sm:text-sm">B. Kosongkan Seluruh Data</h3>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft leading-relaxed">
                Menghapus total semua barang, stok, pesanan pemasok, dan catatan riwayat warung
                sehingga Anda dapat mulai mencatat dari awal (nol) dengan bersih.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-rose-200/60 flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-700">Hapus permanen</span>
              <Btn
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={() => {
                  setDeleteConfirmationText('');
                  setClearAllOpen(true);
                }}
              >
                Kosongkan Data
              </Btn>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          6. INFORMASI APLIKASI
          ========================================================================= */}
      <section className="card p-5 sm:p-6 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-2xl shadow-soft">
              🏪
            </span>
            <div>
              <h2 className="text-base font-black text-ink">Warung Madura</h2>
              <p className="text-xs font-semibold text-primary">
                Aplikasi Pencatatan Persediaan & Pengelolaan Warung
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-extrabold text-emerald-800">
              Versi 1.2.0 (Build 2026.11)
            </span>
            <span className="rounded-full bg-primary-soft px-3 py-1 font-bold text-ink-soft">
              Tahun 2026
            </span>
          </div>
        </div>

        <div className="mt-4 text-xs text-ink-soft leading-relaxed space-y-2">
          <p>
            Aplikasi ini dirancang khusus untuk mempermudah pencatatan stok persediaan barang,
            pemesanan kepada toko pemasok, penerimaan barang fisik, pemenuhan kekurangan barang,
            serta rekap mutasi inventaris warung secara rapi dan mandiri.
          </p>
          <div className="rounded-xl border border-line bg-primary-soft/40 p-3 text-[11px] text-ink">
            <strong>Catatan Konsep:</strong> Aplikasi ini merupakan sistem pencatatan internal
            dan pemantauan operasional warung, bukan aplikasi kasir ataupun transaksi penjualan ke
            pelanggan.
          </div>
        </div>
      </section>

      {/* =========================================================================
          MODAL: KONFIRMASI PEMULIHAN DARI BERKAS
          ========================================================================= */}
      {restoreModalOpen && pendingImport && (
        <Modal
          open={restoreModalOpen}
          onClose={() => {
            setRestoreModalOpen(false);
            setPendingImport(null);
          }}
          title="Konfirmasi Pemulihan Data dari Cadangan"
          subtitle="Periksa rincian isi berkas cadangan sebelum melanjutkan proses pemulihan."
          size="md"
          footer={
            <>
              <Btn
                variant="ghost"
                onClick={() => {
                  setRestoreModalOpen(false);
                  setPendingImport(null);
                }}
              >
                Batal
              </Btn>
              <Btn variant="danger" icon={Upload} onClick={executeRestore}>
                Ya, Pulihkan Sekarang
              </Btn>
            </>
          }
        >
          {(() => {
            const summary = getPendingImportSummary();
            if (!summary) return null;
            return (
              <div className="space-y-3.5 text-xs">
                {/* Info Berkas */}
                <div className="rounded-xl border border-line bg-primary-soft/40 p-3">
                  <div className="flex items-center justify-between border-b border-line/60 pb-1.5">
                    <span className="text-ink-soft">Nama Toko Cadangan:</span>
                    <strong className="text-ink">{summary.storeName}</strong>
                  </div>
                  <div className="flex items-center justify-between pt-1.5">
                    <span className="text-ink-soft">Waktu Ekspor:</span>
                    <span className="font-semibold text-ink">
                      {summary.exportedAt ? formatDateTime(summary.exportedAt) : '—'}
                    </span>
                  </div>
                </div>

                {/* Rincian Jumlah Data */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                    Data yang Ditemukan di Berkas:
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Toko Pemasok</span>
                      <p className="font-extrabold text-ink text-sm">{summary.stores}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Data Barang</span>
                      <p className="font-extrabold text-ink text-sm">{summary.products}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Riwayat Pesanan</span>
                      <p className="font-extrabold text-ink text-sm">{summary.orders}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Stok Fisik</span>
                      <p className="font-extrabold text-ink text-sm">{summary.stocks}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Mutasi Stok</span>
                      <p className="font-extrabold text-ink text-sm">{summary.movements}</p>
                    </div>
                    <div className="rounded-xl border border-line bg-white p-2">
                      <span className="text-[10px] text-ink-soft">Kekurangan</span>
                      <p className="font-extrabold text-ink text-sm">{summary.shortages}</p>
                    </div>
                  </div>
                </div>

                {/* Peringatan Penggantian Data */}
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>PENTING:</strong> Pemulihan ini akan menggantikan seluruh catatan data
                    yang sedang aktif saat ini dengan isi berkas cadangan. Pastikan Anda telah
                    mengunduh cadangan terkini jika data saat ini masih diperlukan.
                  </p>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* =========================================================================
          MODAL: RESET DATA CONTOH
          ========================================================================= */}
      <ConfirmModal
        open={resetSampleOpen}
        onClose={() => setResetSampleOpen(false)}
        title="Reset ke Data Contoh Bawaan?"
        message="Seluruh data catatan toko saat ini akan ditimpa kembali dengan data contoh awal bawaan aplikasi. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Reset Data Contoh"
        danger
        onConfirm={executeResetSample}
      />

      {/* =========================================================================
          MODAL: KOSONGKAN SELURUH DATA (SECURITY INPUT 'HAPUS')
          ========================================================================= */}
      {clearAllOpen && (
        <Modal
          open={clearAllOpen}
          onClose={() => setClearAllOpen(false)}
          title="Kosongkan Seluruh Data Warung?"
          subtitle="Tindakan ini akan menghapus semua barang, stok, pesanan, dan histori secara permanen."
          size="sm"
          footer={
            <>
              <Btn variant="ghost" onClick={() => setClearAllOpen(false)}>
                Batal
              </Btn>
              <Btn
                variant="danger"
                icon={Trash2}
                disabled={deleteConfirmationText.trim().toUpperCase() !== 'HAPUS'}
                onClick={executeClearAll}
              >
                Hapus Semua Data
              </Btn>
            </>
          }
        >
          <div className="space-y-3.5 text-xs">
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800 flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>PERINGATAN PERMANEN:</strong> Seluruh inventaris barang, toko pemasok,
                pesanan, dan mutasi stok akan terhapus total. Pastikan Anda telah mengunduh berkas
                cadangan jika sewaktu-waktu ingin memulihkannya.
              </p>
            </div>

            <div>
              <label className="label mb-1">
                Ketik kata <strong className="text-rose-600 font-extrabold">HAPUS</strong> untuk
                mengonfirmasi:
              </label>
              <Input
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Ketik HAPUS di sini..."
                className="font-bold uppercase text-rose-700 tracking-wider"
                autoFocus
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================================
   KOMPONEN KECIL: ROW SWITCH TOGGLE NOTIFIKASI
   ========================================================================= */
function ToggleRow({ title, desc, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-ink leading-tight">{title}</p>
        <p className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={cx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          checked ? 'bg-primary' : 'bg-line/80'
        )}
      >
        <span
          className={cx(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  );
}
