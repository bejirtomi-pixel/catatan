import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Copy,
  Eye,
  FilterX,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatQty, rupiah, uid } from '../utils/format';
import {
  Btn,
  Chip,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  TD,
  TH,
  TableWrap,
  Textarea,
  Toggle,
} from '../components/UI';
import ProductImage from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import ImageUpload from '../components/ImageUpload';
import StorePicker from '../components/StorePicker';

const distinctCategories = (products) => {
  const seen = new Set();
  const list = [];
  for (const p of products || []) {
    const c = (p.category || '').trim();
    if (c && !seen.has(c)) {
      seen.add(c);
      list.push(c);
    }
  }
  return list.sort((a, b) => a.localeCompare(b, 'id'));
};

export default function Barang() {
  const {
    products,
    stores,
    saveProduct,
    deleteProduct,
    archiveProduct,
    checkProductReferences,
    updateProduct,
    createStore,
    pushToast,
  } = useApp();

  const navigate = useNavigate();
  const location = useLocation();

  // Filter states
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('semua');
  const [statusFilter, setStatusFilter] = useState('semua'); // 'semua' | 'aktif' | 'arsip'

  // Pagination & Display settings
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [blockedDeleteTarget, setBlockedDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);

  // Handle edit from navigation
  useEffect(() => {
    const st = location.state;
    if (st && st.editProductId) {
      const p = products.find((x) => x.id === st.editProductId);
      if (p) {
        setEditing(p);
        setFormOpen(true);
      }
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, products, navigate, location.pathname]);

  const categoryOptions = useMemo(
    () => [
      { id: 'semua', label: 'Semua Kategori' },
      ...distinctCategories(products).map((c) => ({ id: c, label: c })),
    ],
    [products]
  );

  // Filtered products list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      // Filter Kategori
      if (cat !== 'semua' && (p.category || '').trim() !== cat) return false;

      // Filter Status Aktif / Diarsipkan
      const isArchived = !!p.archived || p.active === false;
      if (statusFilter === 'aktif' && isArchived) return false;
      if (statusFilter === 'arsip' && !isArchived) return false;

      // Filter Pencarian nama barang, kategori, deskripsi, promo
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.promoTitle || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, cat, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasFilter = search.trim() !== '' || cat !== 'semua' || statusFilter !== 'semua';

  const resetFilter = () => {
    setSearch('');
    setCat('semua');
    setStatusFilter('semua');
    setPage(1);
  };

  // Duplikasi barang
  const handleDuplicate = (p) => {
    const copy = {
      name: `${p.name} (Salinan)`,
      category: p.category || '',
      image: p.image || '',
      minStock: p.minStock != null ? String(p.minStock) : '',
      storeIds: [...(p.storeIds || [])],
      units: (p.units || []).map((u) => ({
        id: uid('u-'),
        name: u.name,
        factor: String(u.factor),
        price: String(u.price),
      })),
      featured: !!p.featured,
      promo: !!p.promo,
      promoTitle: p.promoTitle || '',
      promoDesc: p.promoDescription || '',
      advertisement: !!p.advertisement,
      adDesc: p.advertisementDescription || '',
      description: p.description || '',
      active: p.active !== false,
      _isDuplicate: true,
    };
    setEditing(copy);
    setFormOpen(true);
  };

  // Toggle status aktif / arsipkan
  const handleToggleActive = (p) => {
    const isCurrentlyActive = p.active !== false && !p.archived;
    if (isCurrentlyActive) {
      archiveProduct(p.id, true);
      pushToast(`Barang “${p.name}” telah diarsipkan.`);
    } else {
      archiveProduct(p.id, false);
      pushToast(`Barang “${p.name}” telah diaktifkan kembali.`);
    }
  };

  const handleDeleteClick = (p) => {
    const refCheck = checkProductReferences(p.id);
    if (refCheck.hasReferences) {
      setBlockedDeleteTarget({ product: p, refCheck });
    } else {
      setDeleteTarget(p);
    }
  };

  const handleSave = (data) => {
    const storeIds = [];
    for (const sel of data.stores || []) {
      if (sel.id) {
        if (!storeIds.includes(sel.id)) storeIds.push(sel.id);
      } else {
        const created = createStore(sel.name);
        if (created && !storeIds.includes(created.id)) storeIds.push(created.id);
      }
    }

    const units = data.units.map((u) => ({
      id: u.id || uid('u-'),
      name: u.name.trim(),
      factor: Number(u.factor),
      price: Number(u.price),
    }));
    const base = units.find((u) => u.factor === 1) || units[0];

    const isDuplicate = editing && editing._isDuplicate;
    const existing = !isDuplicate && editing?.id ? products.find((p) => p.id === editing.id) : null;
    let previousPrice = base.price;
    let priceChange = 'none';

    if (existing) {
      const oldBase = (existing.units || []).find((u) => u.factor === 1);
      const oldPrice = oldBase
        ? Number(oldBase.price)
        : Number((existing.units || [])[0]?.price || 0);
      if (base.price === oldPrice) {
        previousPrice = existing.previousPrice;
        priceChange = existing.priceChange;
      } else {
        previousPrice = oldPrice;
        priceChange = base.price > oldPrice ? 'up' : 'down';
      }
    }

    saveProduct({
      ...(existing || {}),
      id: isDuplicate ? undefined : editing?.id,
      name: data.name,
      category: data.category,
      image: data.image,
      units,
      minStock: data.minStock === '' || data.minStock == null ? null : Number(data.minStock),
      storeIds,
      previousPrice,
      priceChange,
      promo: !!data.promo,
      promoTitle: data.promoTitle || '',
      promoDescription: data.promoDesc || '',
      advertisement: !!data.advertisement,
      advertisementDescription: data.adDesc || '',
      featured: !!data.featured,
      description: data.description || '',
      active: data.active !== false,
      archived: data.active === false ? true : false,
    });

    pushToast(
      isDuplicate
        ? 'Barang berhasil diduplikasi'
        : editing
        ? 'Barang berhasil diperbarui'
        : 'Barang berhasil ditambahkan'
    );
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Barang" subtitle={`Master data & informasi seluruh barang warung (${products.length} barang)`}>
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari nama barang, kategori, deskripsi..."
          className="w-full sm:w-64"
        />
        <Btn
          icon={PackagePlus}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Tambah Barang
        </Btn>
      </PageHeader>

      {/* Filter: Kategori, Status Aktif/Nonaktif, dan Reset */}
      <div className="card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Filter Kategori */}
            <label className="block min-w-[11rem] flex-1 sm:max-w-xs">
              <span className="label">Kategori</span>
              <select
                data-testid="filter-kategori"
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  setPage(1);
                }}
                className="input w-full pr-8"
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Filter Status Aktif / Diarsipkan */}
            <div className="min-w-[13rem]">
              <span className="label">Status Barang</span>
              <div className="flex rounded-xl border border-line bg-surface/50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('semua');
                    setPage(1);
                  }}
                  className={`flex-1 rounded-lg py-1 px-2.5 font-bold transition ${
                    statusFilter === 'semua'
                      ? 'bg-primary text-white shadow-soft'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('aktif');
                    setPage(1);
                  }}
                  className={`flex-1 rounded-lg py-1 px-2.5 font-bold transition ${
                    statusFilter === 'aktif'
                      ? 'bg-primary text-white shadow-soft'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Aktif
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('arsip');
                    setPage(1);
                  }}
                  className={`flex-1 rounded-lg py-1 px-2.5 font-bold transition ${
                    statusFilter === 'arsip'
                      ? 'bg-primary text-white shadow-soft'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Diarsipkan
                </button>
              </div>
            </div>
          </div>

          {/* Reset Filter Button */}
          {hasFilter && (
            <Btn
              size="sm"
              variant="outline"
              icon={FilterX}
              onClick={resetFilter}
              className="self-end"
            >
              Reset Filter
            </Btn>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={hasFilter ? 'Barang tidak ditemukan' : 'Belum ada barang terdaftar'}
            description={
              hasFilter
                ? 'Coba ubah kata kunci pencarian, kategori, atau status yang dipilih.'
                : 'Tambahkan data master barang pertama warung Anda.'
            }
            action={
              hasFilter ? (
                <Btn size="sm" variant="outline" onClick={resetFilter}>
                  Reset Filter
                </Btn>
              ) : (
                <Btn size="sm" icon={Plus} onClick={() => setFormOpen(true)}>
                  Tambah Barang
                </Btn>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Tabel Desktop: 6 Kolom Sesuai Ketentuan */}
          <div className="hidden md:block" data-testid="daftar-barang-table">
            <TableWrap minWidth="min-w-[940px]">
              <thead className="border-b border-line bg-primary-soft/50">
                <tr>
                  <TH className="w-16">Gambar</TH>
                  <TH className="min-w-[200px]">Nama Barang</TH>
                  <TH className="min-w-[130px]">Kategori</TH>
                  <TH className="min-w-[220px]">Satuan dan Harga</TH>
                  <TH className="min-w-[220px]">Informasi Barang</TH>
                  <TH className="w-40 text-right">Aksi</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => {
                  const isActive = p.active !== false;

                  return (
                    <tr
                      key={p.id}
                      className={`transition hover:bg-primary-soft/30 ${
                        !isActive ? 'bg-background/40 opacity-75' : 'bg-white'
                      }`}
                    >
                      {/* 1. Gambar Barang */}
                      <TD>
                        <ProductImage product={p} size="md" showBadges={false} onClick={() => setDetail(p)} />
                      </TD>

                      {/* 2. Nama Barang */}
                      <TD className="py-3.5">
                        <div className="max-w-[220px]">
                          <button
                            type="button"
                            onClick={() => setDetail(p)}
                            title="Buka detail barang"
                            className="text-left font-bold text-ink hover:text-primary leading-snug transition"
                          >
                            {p.name}
                          </button>
                          {p.archived ? (
                            <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                              <Archive className="h-3 w-3" />
                              Diarsipkan
                            </span>
                          ) : p.active === false ? (
                            <span className="mt-1 inline-block rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                              Nonaktif
                            </span>
                          ) : null}
                        </div>
                      </TD>

                      {/* 3. Kategori */}
                      <TD className="py-3.5">
                        {p.category ? (
                          <Chip tone="violet">{p.category}</Chip>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </TD>

                      {/* 4. Satuan dan Harga (Disusun Vertikal Rapi) */}
                      <TD className="py-3.5">
                        <div className="space-y-1.5 py-0.5">
                          {(p.units || []).map((u) => {
                            const isBase = Number(u.factor) === 1;
                            return (
                              <div
                                key={u.id}
                                className="flex items-baseline justify-between gap-3 text-xs"
                              >
                                <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      isBase
                                        ? 'bg-primary-soft text-primary'
                                        : 'bg-line/70 text-ink-soft'
                                    }`}
                                  >
                                    {u.name}
                                  </span>
                                  {isBase ? (
                                    <span className="text-[10px] text-ink-soft">(utama)</span>
                                  ) : (
                                    <span className="text-[10px] text-ink-soft">
                                      (1={formatQty(u.factor)})
                                    </span>
                                  )}
                                </span>
                                <span className="font-bold text-primary whitespace-nowrap">
                                  {rupiah(u.price)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </TD>

                      {/* 5. Informasi Barang (Sederhana & Informatif) */}
                      <TD className="py-3.5">
                        <div className="max-w-[240px] space-y-1 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {p.featured && (
                              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                Unggulan
                              </span>
                            )}
                            {p.promo && (
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Promo
                              </span>
                            )}
                            {p.advertisement && (
                              <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                Iklan
                              </span>
                            )}
                          </div>
                          {p.promo && p.promoTitle && (
                            <p className="font-semibold text-primary line-clamp-1">
                              {p.promoTitle}
                            </p>
                          )}
                          {p.description && !p.promo && (
                            <p className="text-ink-soft line-clamp-2 leading-relaxed">
                              {p.description}
                            </p>
                          )}
                          {!p.promo && !p.description && !p.featured && !p.advertisement && (
                            <span className="text-ink-soft">—</span>
                          )}
                        </div>
                      </TD>

                      {/* 6. Aksi: Detail, Edit, Duplikasi, Toggle Aktif, Hapus */}
                      <TD className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetail(p)}
                            title="Lihat detail lengkap barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(p);
                              setFormOpen(true);
                            }}
                            title="Edit barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicate(p)}
                            title="Duplikasi barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-sky-50 hover:text-sky-600 active:scale-95"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(p)}
                            title={isActive ? 'Nonaktifkan barang' : 'Aktifkan barang'}
                            className={`rounded-lg p-2 transition active:scale-95 ${
                              isActive
                                ? 'text-ink-soft hover:bg-amber-50 hover:text-amber-600'
                                : 'text-rose-500 hover:bg-emerald-50 hover:text-emerald-600'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(p)}
                            title="Hapus barang"
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
          </div>

          {/* Kartu Mobile */}
          <div className="grid gap-3 md:hidden" data-testid="daftar-barang-card">
            {rows.map((p, i) => (
              <MobileProductCard
                key={p.id}
                product={p}
                index={(safePage - 1) * pageSize + i + 1}
                onPreview={() => setDetail(p)}
                onEdit={(item) => {
                  setEditing(item);
                  setFormOpen(true);
                }}
                onDuplicate={handleDuplicate}
                onToggleActive={handleToggleActive}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>

          {/* Pagination & Pilihan Jumlah Tampilan per Halaman */}
          <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2 text-xs text-ink-soft">
              <span>Tampilkan:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="input py-1 px-2 text-xs font-bold"
              >
                <option value={5}>5 per halaman</option>
                <option value={10}>10 per halaman</option>
                <option value={20}>20 per halaman</option>
                <option value={50}>50 per halaman</option>
              </select>
            </div>

            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              from={(safePage - 1) * pageSize + 1}
              to={Math.min(safePage * pageSize, filtered.length)}
              onPage={setPage}
            />
          </div>
        </>
      )}

      {/* Modal Form Tambah / Edit / Duplikasi */}
      <ProductFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
        onSave={handleSave}
      />

      {/* Modal Detail Lengkap Barang */}
      <ProductDetailModal product={detail} onClose={() => setDetail(null)} />

      {/* Modal Peringatan Hapus Diblokir (Memiliki Referensi Riwayat) */}
      <Modal
        open={!!blockedDeleteTarget}
        onClose={() => setBlockedDeleteTarget(null)}
        title="Barang Tidak Dapat Dihapus Permanen"
        size="md"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Btn variant="soft" onClick={() => setBlockedDeleteTarget(null)}>
              Tutup
            </Btn>
            <Btn
              variant="primary"
              icon={Archive}
              onClick={() => {
                if (blockedDeleteTarget?.product) {
                  archiveProduct(blockedDeleteTarget.product.id, true);
                  pushToast(`Barang “${blockedDeleteTarget.product.name}” berhasil diarsipkan.`);
                }
                setBlockedDeleteTarget(null);
              }}
            >
              Arsipkan Barang Saja
            </Btn>
          </div>
        }
      >
        {blockedDeleteTarget && (
          <div className="space-y-4 text-sm text-ink">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 leading-relaxed">
              <p className="font-semibold text-amber-950">
                Barang “{blockedDeleteTarget.product.name}” masih memiliki riwayat operasional di warung:
              </p>
              <ul className="mt-2 list-disc pl-4 space-y-1">
                {blockedDeleteTarget.refCheck.orderCount > 0 && (
                  <li>Tercatat dalam <strong>{blockedDeleteTarget.refCheck.orderCount} pesanan pemasok</strong></li>
                )}
                {blockedDeleteTarget.refCheck.movementCount > 0 && (
                  <li>Tercatat dalam <strong>{blockedDeleteTarget.refCheck.movementCount} riwayat mutasi stok</strong></li>
                )}
                {blockedDeleteTarget.refCheck.shortageCount > 0 && (
                  <li>Tercatat dalam <strong>{blockedDeleteTarget.refCheck.shortageCount} daftar kekurangan / barang kosong</strong></li>
                )}
                {blockedDeleteTarget.refCheck.stockQty > 0 && (
                  <li>Masih memiliki sisa fisik sebanyak <strong>{blockedDeleteTarget.refCheck.stockQty} unit</strong> di inventaris</li>
                )}
              </ul>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              Menghapus barang ini secara permanen akan merusak laporan pembukuan dan integritas data riwayat warung. Sebagai gantinya, Anda disarankan untuk <strong>mengarsipkan</strong> barang ini agar tidak muncul lagi pada pemilihan pesanan aktif.
            </p>
          </div>
        )}
      </Modal>

      {/* Modal Konfirmasi Hapus Permanen (Aman, Tidak Ada Referensi) */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Barang Permanen"
        message={`Barang "${deleteTarget?.name}" belum memiliki riwayat pesanan, mutasi stok, maupun catatan kekurangan. Anda yakin ingin menghapus barang ini secara permanen?`}
        confirmLabel="Hapus Permanen"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteProduct(deleteTarget.id);
            pushToast('Barang berhasil dihapus secara permanen');
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// Kartu Ringkas untuk Tampilan Mobile
function MobileProductCard({
  product: p,
  index,
  onPreview,
  onEdit,
  onDuplicate,
  onToggleActive,
  onDelete,
}) {
  const isActive = p.active !== false;

  return (
    <div
      className={`card space-y-3 p-4 transition ${
        !isActive ? 'bg-background/40 opacity-75' : 'bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <ProductImage product={p} size="md" showBadges={false} onClick={() => onPreview(p)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => onPreview(p)}
              className="text-left text-sm font-bold text-ink hover:text-primary leading-snug"
            >
              {p.name}
            </button>
            <span className="shrink-0 text-[10px] font-semibold text-ink-soft">#{index}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {p.category && <Chip tone="violet">{p.category}</Chip>}
            {p.archived ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                <Archive className="h-3 w-3" />
                Diarsipkan
              </span>
            ) : !isActive ? (
              <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                Nonaktif
              </span>
            ) : null}
            {p.featured && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Unggulan
              </span>
            )}
            {p.promo && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                Promo
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Satuan & Harga Vertikal */}
      <div className="rounded-xl border border-line bg-surface/40 p-2.5 text-xs space-y-1">
        {(p.units || []).map((u) => {
          const isBase = Number(u.factor) === 1;
          return (
            <div key={u.id} className="flex items-center justify-between">
              <span className="text-ink-soft">
                {u.name} {isBase ? '(utama)' : `(1=${formatQty(u.factor)})`}
              </span>
              <span className="font-bold text-primary">{rupiah(u.price)}</span>
            </div>
          );
        })}
      </div>

      {/* Keterangan Promo / Deskripsi */}
      {(p.promoDescription || p.description) && (
        <p className="text-xs text-ink-soft line-clamp-2 leading-relaxed">
          {p.promoDescription || p.description}
        </p>
      )}

      {/* Aksi Baris Mobile */}
      <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
        <Btn size="sm" variant="soft" icon={Eye} onClick={() => onPreview(p)}>
          Detail
        </Btn>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(p)}
            title="Edit barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(p)}
            title="Duplikasi barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-sky-50 hover:text-sky-600 active:scale-95"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(p)}
            title={isActive ? 'Nonaktifkan' : 'Aktifkan'}
            className="rounded-lg p-2 text-ink-soft transition hover:bg-amber-50 hover:text-amber-600 active:scale-95"
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(p)}
            title="Hapus barang"
            className="rounded-lg p-2 text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal Form Tambah / Edit / Duplikasi Barang
function ProductFormModal({ open, onClose, editing, onSave }) {
  const { stores, products } = useApp();
  const categorySuggestions = useMemo(() => distinctCategories(products), [products]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState('');
  const [minStock, setMinStock] = useState('');
  const [active, setActive] = useState(true);
  const [storesSel, setStoreSel] = useState([]);
  const [units, setUnits] = useState([]);
  const [promo, setPromo] = useState(false);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [advertisement, setAdvertisement] = useState(false);
  const [adDesc, setAdDesc] = useState('');
  const [featured, setFeatured] = useState(false);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || '');
      setCategory(editing.category || '');
      setImage(editing.image || '');
      setMinStock(editing.minStock != null ? String(editing.minStock) : '');
      setActive(editing.active !== false);
      setStoreSel(
        (editing.storeIds || [])
          .map((id) => {
            const s = stores.find((x) => x.id === id);
            return s ? { id: s.id, name: s.name } : null;
          })
          .filter(Boolean)
      );
      setUnits(
        (editing.units || []).map((u) => ({
          id: u.id,
          name: u.name,
          factor: String(u.factor),
          price: String(u.price),
        }))
      );
      setPromo(!!editing.promo);
      setPromoTitle(editing.promoTitle || '');
      setPromoDesc(editing.promoDescription || editing.promoDesc || '');
      setAdvertisement(!!editing.advertisement);
      setAdDesc(editing.advertisementDescription || editing.adDesc || '');
      setFeatured(!!editing.featured);
      setDescription(editing.description || '');
    } else {
      setName('');
      setCategory('');
      setImage('');
      setMinStock('');
      setActive(true);
      setStoreSel([]);
      setUnits([{ id: uid('u-'), name: 'pcs', factor: '1', price: '' }]);
      setPromo(false);
      setPromoTitle('');
      setPromoDesc('');
      setAdvertisement(false);
      setAdDesc('');
      setFeatured(false);
      setDescription('');
    }
    setErrors({});
  }, [open, editing, stores]);

  const updateUnit = (key, patch) =>
    setUnits((prev) => prev.map((u) => (u.id === key ? { ...u, ...patch } : u)));
  const removeUnit = (key) => setUnits((prev) => prev.filter((u) => u.id !== key));
  const addUnit = () =>
    setUnits((prev) => [...prev, { id: uid('u-'), name: '', factor: '', price: '' }]);

  const submit = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Nama barang wajib diisi.';

    const unitErrs = {};
    const factors = units.map((u) => Number(u.factor) || 0);
    if (units.length === 0) {
      errs.units = 'Minimal satu satuan wajib diisi.';
    } else {
      units.forEach((u, i) => {
        const key = `u${i}`;
        if (!u.name.trim()) unitErrs[key] = 'Nama satuan wajib diisi.';
        else if (
          units.some(
            (x, j) => j !== i && x.name.trim().toLowerCase() === u.name.trim().toLowerCase()
          )
        )
          unitErrs[key] = 'Nama satuan ganda.';
        if (u.factor === '' || !(Number(u.factor) > 0)) unitErrs[key] = 'Faktor wajib > 0.';
        else if (i > 0 && Number(u.factor) === 1)
          unitErrs[key] = 'Faktor 1 hanya untuk satuan dasar.';
        if (u.price === '' || !(Number(u.price) > 0)) unitErrs[key] = 'Harga wajib > 0.';
      });
      if (!factors.includes(1)) errs.units = 'Wajib ada satu satuan dasar (faktor 1).';
      if (Object.keys(unitErrs).length) errs.unitErrs = unitErrs;
    }
    if (minStock !== '' && !(Number(minStock) >= 0))
      errs.minStock = 'Min stok berupa angka 0 atau lebih.';

    setErrors(errs);
    if (Object.keys(errs).length) return;

    onSave({
      name: name.trim(),
      category: category.trim(),
      image,
      minStock: minStock === '' ? '' : Number(minStock),
      active,
      stores: storesSel,
      units,
      promo,
      promoTitle,
      promoDesc,
      advertisement,
      adDesc,
      featured,
      description,
    });
  };

  const unitErrs = errors.unitErrs || {};
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-wider text-primary';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editing && editing._isDuplicate
          ? 'Duplikasi Barang'
          : editing
          ? `Edit Barang — ${editing.name}`
          : 'Tambah Barang'
      }
      subtitle="Atur informasi master barang, satuan, harga acuan, dan toko pemasok."
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={Package} onClick={submit}>
            {editing && !editing._isDuplicate ? 'Simpan Perubahan' : 'Simpan Barang'}
          </Btn>
        </>
      }
    >
      <div className="space-y-6">
        {/* Status Barang: Aktif / Nonaktif */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={sectionTitle}>Status Barang</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Barang aktif akan muncul di pencatatan stok dan pesanan warung.
              </p>
            </div>
            <Toggle
              checked={active}
              onChange={setActive}
              label={active ? 'Barang Aktif' : 'Barang Nonaktif'}
            />
          </div>
        </section>

        {/* Foto Barang */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Foto Barang</p>
          <p className="mt-1 text-xs text-ink-soft">
            Preview rasio 1:1. Unggah dari galeri atau kamera.
          </p>
          <div className="mt-4">
            <ImageUpload
              value={image}
              onChange={setImage}
              label="Foto Barang"
              hint="Foto dipakai di master barang & panel informasi barang."
            />
          </div>
        </section>

        {/* Informasi Dasar */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Informasi Dasar</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nama Barang" required error={errors.name}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="contoh: Gula Pasir"
              />
            </Field>
            <Field
              label="Kategori"
              hint="Ketik kategori baru atau pilih dari saran."
              error={errors.category}
            >
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="contoh: Sembako"
                list="barang-kategori"
              />
              <datalist id="barang-kategori">
                {categorySuggestions.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Batas Stok Minimum"
              hint="Muncul tanda 'Hampir Habis' bila stok di bawah angka ini."
              error={errors.minStock}
            >
              <Input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="contoh: 20"
              />
            </Field>
          </div>
        </section>

        {/* Toko Pemasok (Dipertahankan untuk Relasi Pesanan) */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Toko Pemasok Terkait</p>
          <p className="mt-1 text-xs text-ink-soft">
            Pilih toko pemasok untuk mempermudah saat membuat pesanan pembelian barang.
          </p>
          <div className="mt-4">
            <Field label="Pilih Toko Pemasok (opsional)" error={errors.stores}>
              <StorePicker stores={stores} value={storesSel} onChange={setStoreSel} />
            </Field>
          </div>
        </section>

        {/* Satuan & Harga */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionTitle}>Satuan & Harga</p>
              <p className="mt-1 text-xs text-ink-soft">
                Satuan dasar (faktor 1) dipakai sebagai satuan acuan. Masukkan harga beli/acuan
                untuk masing-masing satuan.
              </p>
            </div>
            <Btn variant="soft" size="sm" icon={Plus} onClick={addUnit}>
              Tambah Satuan
            </Btn>
          </div>

          {errors.units && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
              {errors.units}
            </p>
          )}

          <div className="mt-4">
            <div className="hidden grid-cols-[1fr_90px_130px_32px] items-center gap-2 px-0.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft sm:grid">
              <span>Nama Satuan</span>
              <span>Konversi</span>
              <span>Harga Acuan</span>
              <span />
            </div>
            <div className="space-y-2.5">
              {units.map((u, i) => {
                const e = unitErrs[`u${i}`];
                return (
                  <div
                    key={u.id}
                    className="grid grid-cols-[1fr_68px_84px_28px] items-start gap-2 sm:grid-cols-[1fr_90px_130px_32px]"
                  >
                    <div>
                      <Input
                        value={u.name}
                        onChange={(e2) => updateUnit(u.id, { name: e2.target.value })}
                        placeholder={i === 0 ? 'Satuan dasar (mis. pcs)' : 'Satuan lain (mis. dus)'}
                      />
                      {e && <p className="mt-0.5 text-[11px] font-medium text-rose-500">{e}</p>}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={u.factor}
                        onChange={(e2) => updateUnit(u.id, { factor: e2.target.value })}
                        placeholder="faktor"
                        disabled={i === 0}
                        title="Jumlah satuan dasar per 1 satuan ini"
                      />
                      {i === 0 && <p className="mt-0.5 text-[10px] text-ink-soft">Satuan dasar</p>}
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="0"
                        value={u.price}
                        onChange={(e2) => updateUnit(u.id, { price: e2.target.value })}
                        placeholder="harga"
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUnit(u.id)}
                      disabled={units.length <= 1}
                      title={units.length <= 1 ? 'Minimal satu satuan' : 'Hapus satuan'}
                      className="flex h-9 w-7 items-center justify-center rounded-lg text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 sm:hidden">
              <Btn variant="soft" size="sm" icon={Plus} onClick={addUnit}>
                Tambah Satuan
              </Btn>
            </div>
          </div>
        </section>

        {/* Keterangan & Promosi */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Keterangan & Promosi</p>
          <p className="mt-1 text-xs text-ink-soft">
            Tandai barang unggulan, promo aktif, atau penawaran khusus bila diperlukan.
          </p>
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Toggle checked={featured} onChange={setFeatured} label="Barang Unggulan" />
            <Toggle checked={promo} onChange={setPromo} label="Promo" />
            <Toggle checked={advertisement} onChange={setAdvertisement} label="Iklan / Penawaran" />
          </div>
          <div className="mt-4 space-y-4">
            {promo && (
              <>
                <Field label="Judul Promo" hint="Contoh: “Promo Diskon Pembelian Karungan”.">
                  <Input
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="contoh: Promo Diskon Karungan"
                  />
                </Field>
                <Field label="Keterangan Promo">
                  <Textarea
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="contoh: Hemat Rp 2.000 saat membeli 2 karung sekaligus."
                  />
                </Field>
              </>
            )}
            {advertisement && (
              <Field label="Deskripsi Iklan">
                <Textarea
                  value={adDesc}
                  onChange={(e) => setAdDesc(e.target.value)}
                  placeholder="contoh: Stok baru datang, kualitas premium."
                />
              </Field>
            )}
            <Field label="Deskripsi Produk" hint="Deskripsi umum produk barang.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="contoh: Gula pasir kemasan murni berkualitas."
              />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}
