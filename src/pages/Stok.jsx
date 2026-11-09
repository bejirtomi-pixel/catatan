import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CircleDollarSign,
  History,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatQty, qtyText, rupiah, round2, uid } from '../utils/format';
import {
  Btn,
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
  cx,
} from '../components/UI';
import ProductImage from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import SearchSelect from '../components/SearchSelect';
import ImageUpload from '../components/ImageUpload';

// Kategori dinamis dari data produk yang sudah ada
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

function unitBaseName(product, unit) {
  const base = (product?.units || []).find((u) => Number(u.factor) === 1);
  return base ? base.name : unit ? unit.name : (product?.units || [])[0]?.name || 'pcs';
}

// Harga jual utama = harga satuan dasar. extra = jumlah satuan lain yang punya harga jual.
function sellingInfo(product, stock) {
  const units = (product && product.units) || [];
  const base = units.find((u) => Number(u.factor) === 1) || units[0];
  const prices = (stock && stock.sellingPrices) || {};
  const main = base && prices[base.id] != null ? prices[base.id] : stock ? stock.sellingPrice : 0;
  const extra = units.filter((u) => u.id !== (base && base.id) && prices[u.id] != null).length;
  return { base, price: Number(main) || 0, extra };
}

export default function Stok() {
  const {
    stockRows,
    deleteStock,
    products,
    updateProduct,
    updateStockPrices,
    addProductWithStock,
    pushToast,
  } = useApp();

  const location = useLocation();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('semua');
  const [statusFilter, setStatusFilter] = useState('semua'); // 'semua' | 'hampirHabis' | 'kosong' | 'tersedia'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustMode, setAdjustMode] = useState('tambah');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const processedKey = useRef(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);

  // Form Tambah / Edit Barang
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Quick action dari detail barang / halaman lain
  useEffect(() => {
    const st = location.state;
    if (!st || (!st.openAdjustFor && !st.showHistoryFor && !st.openAdd && !st.infoTab)) return;
    if (processedKey.current === location.key) return;
    processedKey.current = location.key;

    if (st.openAdd) {
      setEditingProduct(null);
      setProductModalOpen(true);
    }
    if (st.openAdjustFor) {
      const row = stockRows.find((r) => r.product.id === st.openAdjustFor);
      if (row) {
        setAdjustFor(row.product);
        setAdjustMode('tambah');
        setAdjustOpen(true);
      }
    }
    if (st.showHistoryFor) {
      setHistoryFor(st.showHistoryFor);
      setHistoryOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const categories = useMemo(() => distinctCategories(products), [products]);

  // Statistik Ringkasan Stok
  const stats = useMemo(() => {
    const totalJenis = stockRows.length;
    let totalStok = 0;
    let hampirHabisCount = 0;
    let kosongCount = 0;

    for (const { product, stock } of stockRows) {
      const qty = Number(stock?.quantity) || 0;
      totalStok += qty;
      const min = Number(product.minStock) || 0;
      if (qty <= 0) {
        kosongCount++;
      } else if (min > 0 && qty < min) {
        hampirHabisCount++;
      }
    }

    return { totalJenis, totalStok, hampirHabisCount, kosongCount };
  }, [stockRows]);

  // Pencarian dan Penyaringan komprehensif
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return stockRows.filter(({ product, stock }) => {
      const qty = Number(stock?.quantity) || 0;
      const min = Number(product.minStock) || 0;

      // Filter Status
      if (statusFilter === 'kosong' && !(qty <= 0)) return false;
      if (statusFilter === 'hampirHabis' && !(min > 0 && qty > 0 && qty < min)) return false;
      if (statusFilter === 'tersedia' && !(qty > 0 && (min <= 0 || qty >= min))) return false;

      // Filter Kategori
      if (categoryFilter !== 'semua' && (product.category || '').trim() !== categoryFilter) {
        return false;
      }

      // Filter Pencarian
      if (!q) return true;

      return (
        product.name.toLowerCase().includes(q) ||
        (product.category || '').toLowerCase().includes(q) ||
        (product.description || '').toLowerCase().includes(q) ||
        (product.promoTitle || '').toLowerCase().includes(q) ||
        (product.promoDescription || '').toLowerCase().includes(q) ||
        String(qty).includes(q) ||
        (stock.note || '').toLowerCase().includes(q) ||
        (product.units || []).some((u) => u.name.toLowerCase().includes(q))
      );
    });
  }, [stockRows, search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetAllFilters = () => {
    setSearch('');
    setCategoryFilter('semua');
    setStatusFilter('semua');
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Stok"
        subtitle={`Pusat inventaris stok barang warung (${stockRows.length} barang terdaftar)`}
      >
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari nama barang, kategori, catatan..."
          className="w-full sm:w-64"
        />
        <Btn variant="outline" icon={History} onClick={() => setHistoryOpen(true)}>
          Riwayat Stok
        </Btn>
        <Btn
          variant="outline"
          icon={SlidersHorizontal}
          onClick={() => {
            setAdjustFor(null);
            setAdjustMode('tambah');
            setAdjustOpen(true);
          }}
        >
          Penyesuaian Stok
        </Btn>
        <Btn
          icon={Plus}
          onClick={() => {
            setEditingProduct(null);
            setProductModalOpen(true);
          }}
        >
          Tambah Barang
        </Btn>
      </PageHeader>

      {/* ===== Ringkasan Stok (Summary Cards) ===== */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Total Jenis Barang */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter('semua');
            setPage(1);
          }}
          className={cx(
            'cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.99]',
            statusFilter === 'semua'
              ? 'border-primary/40 bg-primary-soft/40 shadow-sm'
              : 'border-line bg-white hover:border-line-hover hover:shadow-soft'
          )}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Total Jenis
          </p>
          <p className="mt-1 text-2xl font-black text-ink">{stats.totalJenis}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Jenis barang tercatat</p>
        </div>

        {/* Total Stok Barang */}
        <div className="rounded-2xl border border-line bg-white p-4 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
            Total Stok Fisik
          </p>
          <p className="mt-1 text-2xl font-black text-ink">{formatQty(stats.totalStok)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Dalam satuan dasar</p>
        </div>

        {/* Barang Hampir Habis */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter(statusFilter === 'hampirHabis' ? 'semua' : 'hampirHabis');
            setPage(1);
          }}
          className={cx(
            'cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.99]',
            statusFilter === 'hampirHabis'
              ? 'border-amber-400 bg-amber-50/80 shadow-sm'
              : 'border-line bg-white hover:border-amber-300 hover:shadow-soft'
          )}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Hampir Habis
          </p>
          <p className="mt-1 text-2xl font-black text-amber-700">{stats.hampirHabisCount}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Di bawah batas minimum</p>
        </div>

        {/* Barang Stok Kosong */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setStatusFilter(statusFilter === 'kosong' ? 'semua' : 'kosong');
            setPage(1);
          }}
          className={cx(
            'cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.99]',
            statusFilter === 'kosong'
              ? 'border-rose-400 bg-rose-50/80 shadow-sm'
              : 'border-line bg-white hover:border-rose-300 hover:shadow-soft'
          )}
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
            Stok Kosong
          </p>
          <p className="mt-1 text-2xl font-black text-rose-600">{stats.kosongCount}</p>
          <p className="mt-0.5 text-xs text-ink-soft">Jumlah stok 0 atau habis</p>
        </div>
      </div>

      {/* ===== Bar Filter & Pencarian ===== */}
      <div className="card mb-4 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Filter Status (Chips) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
              Status:
            </span>
            {[
              { id: 'semua', label: 'Semua Barang' },
              { id: 'tersedia', label: 'Tersedia' },
              { id: 'hampirHabis', label: `Hampir Habis (${stats.hampirHabisCount})` },
              { id: 'kosong', label: `Stok Kosong (${stats.kosongCount})` },
            ].map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(f.id);
                    setPage(1);
                  }}
                  className={cx(
                    'rounded-xl px-3 py-1.5 text-xs font-bold transition active:scale-95',
                    active
                      ? 'bg-primary text-white shadow-soft'
                      : 'bg-background text-ink-soft hover:bg-primary-soft hover:text-ink'
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Filter Kategori & Reset */}
          <div className="flex items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink"
            >
              <option value="semua">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {(search || categoryFilter !== 'semua' || statusFilter !== 'semua') && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:bg-rose-50 hover:text-rose-600 transition"
                title="Reset semua filter"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ===== Daftar Inventaris Stok ===== */}
      {filteredRows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={
              search || categoryFilter !== 'semua' || statusFilter !== 'semua'
                ? 'Tidak ada barang yang cocok dengan filter'
                : 'Belum ada data stok'
            }
            description={
              search || categoryFilter !== 'semua' || statusFilter !== 'semua'
                ? 'Coba ubah kata kunci pencarian atau sesuaikan filter status/kategori.'
                : 'Tambahkan barang langsung ke inventaris stok tanpa harus melalui transaksi pembelian.'
            }
            action={
              search || categoryFilter !== 'semua' || statusFilter !== 'semua' ? (
                <Btn size="sm" variant="outline" onClick={resetAllFilters}>
                  Reset Filter & Pencarian
                </Btn>
              ) : (
                <Btn
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    setEditingProduct(null);
                    setProductModalOpen(true);
                  }}
                >
                  Tambah Barang
                </Btn>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Tabel Desktop */}
          <div className="hidden md:block" data-testid="tabel-inventaris-stok">
            <TableWrap minWidth="min-w-[860px]">
              <thead className="border-b border-line bg-primary-soft/50">
                <tr>
                  <TH className="w-12 text-center">No</TH>
                  <TH className="w-16">Gambar</TH>
                  <TH className="min-w-[220px]">Nama Barang</TH>
                  <TH className="min-w-[260px]">Informasi Barang</TH>
                  <TH className="min-w-[170px]">Jumlah Stok</TH>
                  <TH className="min-w-[140px]">Harga Jual</TH>
                  <TH className="w-28 text-right">Aksi</TH>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.map(({ product, stock }, i) => {
                  const baseName = unitBaseName(product);
                  const qty = Number(stock?.quantity) || 0;
                  const min = Number(product.minStock) || 0;
                  const low = min > 0 && qty > 0 && qty < min;
                  const info = sellingInfo(product, stock);

                  return (
                    <tr
                      key={stock.id}
                      className="bg-white transition hover:bg-primary-soft/30"
                    >
                      <TD className="text-center font-medium text-ink-soft">
                        {(safePage - 1) * pageSize + i + 1}
                      </TD>
                      <TD>
                        <ProductImage
                          product={product}
                          size="md"
                          showBadges={false}
                          onClick={() => setDetail(product)}
                        />
                      </TD>
                      <TD className="py-3.5">
                        <div className="max-w-[260px]">
                          <button
                            type="button"
                            onClick={() => setDetail(product)}
                            title="Klik untuk membuka detail lengkap barang"
                            className="text-left font-bold text-ink leading-snug transition hover:text-primary"
                          >
                            {product.name}
                          </button>
                          <p className="mt-0.5 text-xs text-ink-soft">
                            {product.category || 'Tanpa kategori'}
                          </p>
                        </div>
                      </TD>
                      <TD className="py-3.5">
                        <div className="max-w-[320px] space-y-1 text-xs">
                          {product.promo && (
                            <p className="text-ink leading-relaxed">
                              <span className="font-bold text-primary">Promo: </span>
                              {product.promoTitle ? (
                                <span className="font-semibold">{product.promoTitle} — </span>
                              ) : null}
                              <span className="text-ink-soft">
                                {product.promoDescription || 'Sedang ada promo'}
                              </span>
                            </p>
                          )}
                          {product.description && (
                            <p className="text-ink-soft leading-relaxed line-clamp-2">
                              {product.description}
                            </p>
                          )}
                          {product.featured && !product.promo && !product.description && (
                            <p className="font-semibold text-ink-soft">Barang Unggulan</p>
                          )}
                          {!product.promo && !product.description && !product.featured && (
                            <p className="text-ink-soft">{stock.note || '—'}</p>
                          )}
                        </div>
                      </TD>
                      <TD className="py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-baseline gap-1 rounded-lg bg-primary-soft px-2.5 py-1 font-bold text-primary">
                            {qtyText(product.units, qty)}
                          </span>
                          {qty <= 0 ? (
                            <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                              Stok Kosong
                            </span>
                          ) : low ? (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                              Hampir Habis
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-ink-soft">
                          {formatQty(qty)} dalam {baseName}
                          {min > 0 && <span className="text-ink-soft/70"> (min: {formatQty(min)})</span>}
                        </p>
                      </TD>
                      <TD className="py-3.5 whitespace-nowrap font-semibold text-ink">
                        <div>
                          <p>
                            {rupiah(info.price)}
                            <span className="text-xs font-normal text-ink-soft">
                              /{info.base ? info.base.name : 'pcs'}
                            </span>
                          </p>
                          {info.extra > 0 && (
                            <p className="mt-0.5 text-[11px] font-normal text-primary">
                              +{info.extra} satuan lain
                            </p>
                          )}
                        </div>
                      </TD>
                      <TD className="py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(product);
                              setProductModalOpen(true);
                            }}
                            title="Edit Informasi Barang"
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustFor(product);
                              setAdjustMode('sesuaikan');
                              setAdjustOpen(true);
                            }}
                            title="Penyesuaian Stok"
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-amber-50 hover:text-amber-700 active:scale-95"
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ stock, product })}
                            title="Hapus Catatan Stok"
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
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
          <div className="grid gap-3 md:hidden" data-testid="kartu-inventaris-stok">
            {paged.map(({ product, stock }, i) => {
              const baseName = unitBaseName(product);
              const qty = Number(stock?.quantity) || 0;
              const min = Number(product.minStock) || 0;
              const low = min > 0 && qty > 0 && qty < min;
              const info = sellingInfo(product, stock);

              return (
                <div key={stock.id} className="card space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <ProductImage
                      product={product}
                      size="md"
                      showBadges={false}
                      onClick={() => setDetail(product)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDetail(product)}
                          className="text-left text-sm font-bold text-ink hover:text-primary leading-snug"
                        >
                          {product.name}
                        </button>
                        <span className="shrink-0 text-[11px] font-semibold text-ink-soft">
                          #{(safePage - 1) * pageSize + i + 1}
                        </span>
                      </div>
                      <p className="text-xs text-ink-soft">{product.category || 'Tanpa kategori'}</p>
                    </div>
                  </div>

                  {/* Informasi Barang */}
                  {(product.promo || product.description || product.featured || stock.note) && (
                    <div className="space-y-1 rounded-xl bg-background/60 p-2.5 text-xs">
                      {product.promo && (
                        <p className="text-ink leading-relaxed">
                          <span className="font-bold text-primary">Promo: </span>
                          {product.promoTitle ? (
                            <span className="font-semibold">{product.promoTitle} — </span>
                          ) : null}
                          <span className="text-ink-soft">
                            {product.promoDescription || 'Sedang ada promo'}
                          </span>
                        </p>
                      )}
                      {product.description && (
                        <p className="text-ink-soft leading-relaxed">{product.description}</p>
                      )}
                      {product.featured && !product.promo && !product.description && (
                        <p className="font-semibold text-ink-soft">Barang Unggulan</p>
                      )}
                      {!product.promo && !product.description && !product.featured && stock.note && (
                        <p className="text-ink-soft">Catatan: {stock.note}</p>
                      )}
                    </div>
                  )}

                  {/* Stok & Harga */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                    <div>
                      <span className="inline-flex items-baseline gap-1 rounded-lg bg-primary-soft px-2.5 py-1 font-bold text-primary">
                        {qtyText(product.units, qty)}
                      </span>
                      {qty <= 0 ? (
                        <span className="ml-2 font-bold text-rose-600">Stok Kosong</span>
                      ) : low ? (
                        <span className="ml-2 font-bold text-amber-700">Hampir Habis</span>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-ink-soft">
                        {formatQty(qty)} dalam {baseName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-ink">
                        {rupiah(info.price)}
                        <span className="text-xs font-normal text-ink-soft">
                          /{info.base ? info.base.name : 'pcs'}
                        </span>
                      </p>
                      {info.extra > 0 && (
                        <p className="text-[10px] text-primary">+{info.extra} satuan lain</p>
                      )}
                    </div>
                  </div>

                  {/* Aksi */}
                  <div className="flex items-center justify-end gap-1.5 border-t border-line pt-2">
                    <button
                      type="button"
                      onClick={() => setDetail(product)}
                      className="mr-auto text-xs font-bold text-primary hover:underline"
                    >
                      Detail
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProduct(product);
                        setProductModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:bg-primary-soft hover:text-primary active:scale-95"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdjustFor(product);
                        setAdjustMode('sesuaikan');
                        setAdjustOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:bg-amber-50 hover:text-amber-700 active:scale-95"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Sesuaikan
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ stock, product })}
                      title="Hapus Catatan Stok"
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-ink-soft transition hover:bg-rose-50 hover:text-rose-500 active:scale-95"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Baris Bawah: Pengaturan Baris per Halaman & Pagination */}
          <div className="card mt-4 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <span>Tampilkan:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-bold text-ink"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span>barang per halaman ({filteredRows.length} total)</span>
              </div>

              <Pagination
                page={safePage}
                totalPages={totalPages}
                total={filteredRows.length}
                from={(safePage - 1) * pageSize + 1}
                to={Math.min(safePage * pageSize, filteredRows.length)}
                onPage={setPage}
              />
            </div>
          </div>
        </>
      )}

      {/* Modal Tambah Barang / Edit Barang */}
      <StockProductModal
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
        editing={editingProduct}
        onSaveSuccess={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
      />

      {/* Modal Penyesuaian Stok (Tambah, Kurang, Sesuaikan, Harga) */}
      <PenyesuaianModal
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustFor(null);
        }}
        preset={adjustFor}
        initialMode={adjustMode}
      />

      {/* Modal Riwayat Stok */}
      <RiwayatModal
        open={historyOpen}
        onClose={() => {
          setHistoryOpen(false);
          setHistoryFor(null);
        }}
        productId={historyFor}
        productName={historyFor ? stockRows.find((r) => r.product.id === historyFor)?.product.name : null}
      />

      {/* Modal Konfirmasi Hapus */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Catatan Stok"
        message={`Hapus catatan stok ${deleteTarget?.product.name}? Riwayat pesanan & pergerakan stok lama tetap tersimpan.`}
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            deleteStock(deleteTarget.stock.id);
            pushToast('Catatan stok berhasil dihapus');
          }
          setDeleteTarget(null);
        }}
      />

      {/* Panel Detail Lengkap Barang */}
      <ProductDetailModal
        product={detail}
        onClose={() => setDetail(null)}
        onEdit={(p) => {
          setDetail(null);
          setEditingProduct(p);
          setProductModalOpen(true);
        }}
        onAddStock={(p) => {
          setDetail(null);
          setAdjustFor(p);
          setAdjustMode('tambah');
          setAdjustOpen(true);
        }}
        onShowHistory={(p) => {
          setDetail(null);
          setHistoryFor(p.id);
          setHistoryOpen(true);
        }}
      />
    </div>
  );
}

// Formulir Tambah Barang Secara Manual / Edit Barang
function StockProductModal({ open, onClose, editing, onSaveSuccess }) {
  const {
    products,
    stocks,
    updateProduct,
    updateStockPrices,
    addProductWithStock,
    pushToast,
  } = useApp();

  const categorySuggestions = useMemo(() => distinctCategories(products), [products]);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [image, setImage] = useState('');
  const [minStock, setMinStock] = useState('');
  const [units, setUnits] = useState([]);
  const [prices, setPrices] = useState({});
  const [initialStock, setInitialStock] = useState('0');
  const [initialUnitId, setInitialUnitId] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [featured, setFeatured] = useState(false);
  const [promo, setPromo] = useState(false);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || '');
      setCategory(editing.category || '');
      setImage(editing.image || '');
      setMinStock(editing.minStock != null ? String(editing.minStock) : '');
      const curUnits = (editing.units || []).map((u) => ({
        id: u.id,
        name: u.name,
        factor: String(u.factor),
        price: String(u.price || ''),
      }));
      setUnits(curUnits);
      const st = stocks.find((s) => s.productId === editing.id);
      const initPrices = {};
      curUnits.forEach((u) => {
        const p = st?.sellingPrices?.[u.id];
        initPrices[u.id] = p != null ? String(p) : u.factor === '1' ? String(st?.sellingPrice || '') : '';
      });
      setPrices(initPrices);
      setInitialStock('');
      setInitialUnitId(curUnits[0]?.id || '');
      setStockNote(st?.note || '');
      setFeatured(!!editing.featured);
      setPromo(!!editing.promo);
      setPromoTitle(editing.promoTitle || '');
      setPromoDesc(editing.promoDescription || '');
      setDescription(editing.description || '');
    } else {
      const defaultUnitId = uid('u-');
      setName('');
      setCategory('');
      setImage('');
      setMinStock('');
      setUnits([{ id: defaultUnitId, name: 'pcs', factor: '1', price: '' }]);
      setPrices({ [defaultUnitId]: '' });
      setInitialStock('0');
      setInitialUnitId(defaultUnitId);
      setStockNote('');
      setFeatured(false);
      setPromo(false);
      setPromoTitle('');
      setPromoDesc('');
      setDescription('');
    }
    setErrors({});
  }, [open, editing, stocks]);

  const updateUnit = (id, patch) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const removeUnit = (id) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
    setPrices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (initialUnitId === id) {
      const remaining = units.filter((u) => u.id !== id);
      setInitialUnitId(remaining[0]?.id || '');
    }
  };

  const addUnit = () => {
    const newId = uid('u-');
    setUnits((prev) => [...prev, { id: newId, name: '', factor: '', price: '' }]);
    setPrices((prev) => ({ ...prev, [newId]: '' }));
  };

  const submit = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Nama barang wajib diisi.';

    const unitErrs = {};
    if (units.length === 0) {
      errs.units = 'Minimal satu satuan dasar wajib diisi.';
    } else {
      units.forEach((u, i) => {
        const key = `u${i}`;
        if (!u.name.trim()) unitErrs[key] = 'Nama satuan wajib diisi.';
        else if (
          units.some(
            (x, j) => j !== i && x.name.trim().toLowerCase() === u.name.trim().toLowerCase()
          )
        ) {
          unitErrs[key] = 'Nama satuan tidak boleh sama.';
        }

        if (i === 0) {
          if (Number(u.factor) !== 1) unitErrs[key] = 'Satuan dasar harus bernilai 1.';
        } else {
          if (u.factor === '' || !(Number(u.factor) > 0)) unitErrs[key] = 'Faktor konversi wajib > 0.';
          else if (Number(u.factor) === 1) unitErrs[key] = 'Faktor 1 hanya untuk satuan dasar.';
        }
      });
      if (Object.keys(unitErrs).length) errs.unitErrs = unitErrs;
    }

    const baseUnit = units.find((u) => Number(u.factor) === 1) || units[0];
    const baseSellingPrice = baseUnit ? prices[baseUnit.id] : '';
    if (baseSellingPrice === '' || !(Number(baseSellingPrice) > 0)) {
      errs.baseSellingPrice = 'Harga jual satuan dasar wajib lebih dari 0.';
    }

    if (!editing) {
      if (initialStock !== '' && !(Number(initialStock) >= 0)) {
        errs.initialStock = 'Jumlah stok awal harus berupa angka 0 atau lebih.';
      }
    }

    if (minStock !== '' && !(Number(minStock) >= 0)) {
      errs.minStock = 'Batas stok minimum berupa angka 0 atau lebih.';
    }

    setErrors(errs);
    if (Object.keys(errs).length) return;

    const formattedUnits = units.map((u) => ({
      id: u.id || uid('u-'),
      name: u.name.trim(),
      factor: Number(u.factor) || 1,
      price: Number(u.price) || 0,
    }));

    if (editing) {
      updateProduct(editing.id, {
        name: name.trim(),
        category: category.trim(),
        image,
        minStock: minStock === '' || minStock == null ? null : Number(minStock),
        storeIds: editing.storeIds || [],
        units: formattedUnits,
        featured: !!featured,
        promo: !!promo,
        promoTitle: promo ? promoTitle.trim() : '',
        promoDescription: promo ? promoDesc.trim() : '',
        description: description.trim(),
      });
      updateStockPrices(
        editing.id,
        formattedUnits.map((u) => ({
          unitId: u.id,
          price: prices[u.id] !== '' && prices[u.id] != null ? Number(prices[u.id]) : 0,
        }))
      );
      pushToast('Informasi barang berhasil diperbarui');
    } else {
      addProductWithStock({
        productData: {
          name: name.trim(),
          category: category.trim(),
          image,
          minStock: minStock === '' || minStock == null ? null : Number(minStock),
          storeIds: [],
          units: formattedUnits,
          previousPrice: Number(formattedUnits[0]?.price) || 0,
          priceChange: 'none',
          featured: !!featured,
          promo: !!promo,
          promoTitle: promo ? promoTitle.trim() : '',
          promoDescription: promo ? promoDesc.trim() : '',
          advertisement: false,
          advertisementDescription: '',
          description: description.trim(),
        },
        initialStock: Number(initialStock) || 0,
        initialUnitId: initialUnitId || formattedUnits[0]?.id,
        sellingPrices: Object.fromEntries(
          formattedUnits
            .map((u) => [u.id, Number(prices[u.id]) || 0])
            .filter(([, p]) => p > 0)
        ),
        stockNote: stockNote.trim() || 'Stok awal manual',
      });
      pushToast('Barang berhasil ditambahkan ke inventaris stok');
    }

    onSaveSuccess();
  };

  const unitErrs = errors.unitErrs || {};
  const sectionTitle = 'text-[11px] font-bold uppercase tracking-wider text-primary';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit Barang — ${editing.name}` : 'Tambah Barang ke Stok'}
      subtitle={
        editing
          ? 'Ubah informasi barang, harga jual, foto, dan batas stok minimum.'
          : 'Tambahkan barang baru langsung ke inventaris stok tanpa harus melalui transaksi pembelian.'
      }
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={editing ? Package : PackagePlus} onClick={submit}>
            {editing ? 'Simpan Perubahan' : 'Tambah ke Stok'}
          </Btn>
        </>
      }
    >
      <div className="space-y-6">
        {/* Foto Barang */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Foto Barang</p>
          <p className="mt-1 text-xs text-ink-soft">
            Foto opsional. Preview rasio 1:1, diunggah dari galeri atau kamera.
          </p>
          <div className="mt-4">
            <ImageUpload
              value={image}
              onChange={setImage}
              label="Foto Barang"
              hint="Foto ditampilkan rapi dan bersih tanpa stiker atau badge dekoratif."
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
                placeholder="contoh: Beras Pandan Wangi 5kg"
              />
            </Field>
            <Field
              label="Kategori"
              hint="Opsional. Pilih dari saran otomatis atau ketik kategori baru."
              error={errors.category}
            >
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="contoh: Sembako"
                list="stok-kategori-list"
              />
              <datalist id="stok-kategori-list">
                {categorySuggestions.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </Field>
            <Field
              label="Batas Stok Minimum"
              hint="Opsional. Muncul penanda teks 'Hampir Habis' jika stok di bawah angka ini."
              error={errors.minStock}
            >
              <Input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="contoh: 10"
              />
            </Field>
          </div>
        </section>

        {/* Satuan, Harga Beli, dan Konversi */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionTitle}>Satuan & Harga Beli</p>
              <p className="mt-1 text-xs text-ink-soft">
                Satuan dasar (faktor 1) dipakai untuk perhitungan stok warung. Konversi adalah jumlah satuan dasar per 1 satuan tersebut (mis. 1 dus = 40 pcs).
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
              <span>Harga Beli (Modal)</span>
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
                        placeholder="harga beli"
                        inputMode="numeric"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeUnit(u.id)}
                      disabled={units.length <= 1}
                      title={units.length <= 1 ? 'Minimal satu satuan dasar' : 'Hapus satuan'}
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

        {/* Harga Jual Warung */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Harga Jual Warung</p>
          <p className="mt-1 text-xs text-ink-soft">
            Tentukan harga jual per satuan yang berlaku untuk pembeli di warung.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {units.map((u, i) => (
              <Field
                key={u.id}
                label={`Harga Jual per ${u.name || (i === 0 ? 'Satuan Dasar' : 'Satuan ' + (i + 1))}${
                  i === 0 ? ' (Satuan Dasar)' : ''
                }`}
                required={i === 0}
                error={i === 0 ? errors.baseSellingPrice : undefined}
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={prices[u.id] ?? ''}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  placeholder={i === 0 ? 'contoh: 15000' : 'opsional'}
                />
              </Field>
            ))}
          </div>
        </section>

        {/* Jumlah Stok Awal (Hanya saat Tambah Barang Baru) */}
        {!editing && (
          <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <p className={sectionTitle}>Stok Awal</p>
            <p className="mt-1 text-xs text-ink-soft">
              Masukkan jumlah fisik barang yang sudah ada di warung saat ini untuk langsung dicatat di inventaris.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Jumlah Stok Awal" required error={errors.initialStock}>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="contoh: 25"
                />
              </Field>
              <Field label="Satuan Stok Awal">
                <select
                  value={initialUnitId}
                  onChange={(e) => setInitialUnitId(e.target.value)}
                  className="input"
                >
                  {units.map((u, i) => (
                    <option key={u.id} value={u.id}>
                      {u.name || (i === 0 ? 'Satuan Dasar' : 'Satuan ' + (i + 1))}
                      {Number(u.factor) !== 1 ? ` (${u.factor}x satuan dasar)` : ' (dasar)'}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Catatan Stok Awal (opsional)">
                  <Input
                    value={stockNote}
                    onChange={(e) => setStockNote(e.target.value)}
                    placeholder="contoh: Modal awal warung, produksi sendiri, beli tunai di pasar"
                  />
                </Field>
              </div>
            </div>
          </section>
        )}

        {/* Informasi Tambahan (Unggulan, Promo, Deskripsi) */}
        <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <p className={sectionTitle}>Informasi Tambahan & Promosi</p>
          <p className="mt-1 text-xs text-ink-soft">
            Informasi ini langsung ditampilkan pada daftar stok secara rapi berbasis teks.
          </p>
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Toggle checked={featured} onChange={setFeatured} label="Barang Unggulan" />
            <Toggle checked={promo} onChange={setPromo} label="Promo" />
          </div>
          <div className="mt-4 space-y-4">
            {promo && (
              <>
                <Field label="Judul Promo" hint="Contoh: Promo Diskon Spesial">
                  <Input
                    value={promoTitle}
                    onChange={(e) => setPromoTitle(e.target.value)}
                    placeholder="contoh: Promo Diskon Gula"
                  />
                </Field>
                <Field label="Keterangan Promo">
                  <Textarea
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="contoh: Potongan Rp 1.000 untuk pembelian lebih dari 2 karung."
                  />
                </Field>
              </>
            )}
            <Field label="Deskripsi Produk" hint="Deskripsi atau keterangan barang (opsional).">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="contoh: Gula pasir kemasan 1 kg murni, kualitas terjamin."
              />
            </Field>
          </div>
        </section>
      </div>
    </Modal>
  );
}

const ADJUST_MODES = [
  { id: 'tambah', label: 'Tambah Stok', icon: PackagePlus },
  { id: 'kurang', label: 'Kurang Stok', icon: PackageMinus },
  { id: 'sesuaikan', label: 'Sesuaikan Jumlah', icon: SlidersHorizontal },
  { id: 'harga', label: 'Edit Harga Jual', icon: CircleDollarSign },
];

function PenyesuaianModal({ open, onClose, preset, initialMode = 'tambah' }) {
  const { products, stocks, adjustStock, addBarangMasuk, addBarangKeluar, updateStockPrices, pushToast } =
    useApp();
  const [mode, setMode] = useState(initialMode);
  const [productId, setProductId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [prices, setPrices] = useState({});
  const [errors, setErrors] = useState({});

  const loadPricesFor = useCallback(
    (pid) => {
      const p = products.find((x) => x.id === pid);
      const st = stocks.find((s) => s.productId === pid);
      const init = {};
      (p?.units || []).forEach((u) => {
        const v = st?.sellingPrices?.[u.id];
        init[u.id] = v != null ? String(v) : '';
      });
      setPrices(init);
    },
    [products, stocks]
  );

  useEffect(() => {
    if (!open) return;
    const pid = preset ? preset.id : '';
    setMode(initialMode || 'tambah');
    setProductId(pid);
    const p = products.find((x) => x.id === pid);
    setUnitId(p ? p.units[0]?.id || '' : '');
    setQuantity('');
    setReason('');
    setNote('');
    setErrors({});
    if (pid) loadPricesFor(pid);
    else setPrices({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset, initialMode]);

  const product = products.find((p) => p.id === productId);
  const units = product ? product.units || [] : [];
  const unit = product ? units.find((u) => u.id === unitId) || units[0] : null;
  const stock = stocks.find((s) => s.productId === productId);
  const baseName = product ? unitBaseName(product, unit) : 'pcs';
  const before = stock ? stock.quantity : 0;
  const baseQty = unit ? round2((Number(quantity) || 0) * (Number(unit.factor) || 1)) : 0;
  const afterTambah = round2(before + baseQty);
  const afterKurang = Math.max(0, round2(before - baseQty));
  const diff = round2(baseQty - before);
  const baseUnit = units.find((u) => Number(u.factor) === 1) || units[0];

  const onProductChange = (id) => {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    setUnitId(p ? p.units[0]?.id || '' : '');
    setErrors({});
    loadPricesFor(id);
  };

  const submit = () => {
    const errs = {};
    if (!productId) errs.product = 'Pilih barang terlebih dahulu.';
    if (mode === 'tambah' || mode === 'kurang') {
      if (quantity === '' || !(Number(quantity) > 0)) {
        errs.quantity = `Jumlah ${mode === 'tambah' ? 'masuk' : 'keluar'} wajib lebih dari 0.`;
      }
    } else if (mode === 'sesuaikan') {
      if (quantity === '' || !(Number(quantity) >= 0)) {
        errs.quantity = 'Jumlah wajib berupa angka 0 atau lebih.';
      }
      if (!reason.trim()) errs.reason = 'Alasan penyesuaian wajib diisi.';
    } else {
      const basePrice = baseUnit ? prices[baseUnit.id] : '';
      if (basePrice === '' || !(Number(basePrice) > 0)) {
        errs.basePrice = 'Harga jual satuan dasar wajib lebih dari 0.';
      }
      if (units.some((u) => prices[u.id] !== '' && prices[u.id] != null && Number(prices[u.id]) < 0)) {
        errs.prices = 'Harga jual tidak boleh negatif.';
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    if (mode === 'tambah') {
      addBarangMasuk({ productId, unitId: unit.id, quantity: Number(quantity), note: note.trim() });
      pushToast('Barang masuk tercatat — stok bertambah');
    } else if (mode === 'kurang') {
      addBarangKeluar({ productId, unitId: unit.id, quantity: Number(quantity), note: note.trim() });
      pushToast('Barang keluar tercatat — stok berkurang');
    } else if (mode === 'sesuaikan') {
      adjustStock({ productId, unitId: unit.id, quantity: Number(quantity), note: reason.trim() });
      pushToast('Stok disesuaikan — riwayat tersimpan');
    } else {
      updateStockPrices(
        productId,
        units.map((u) => ({
          unitId: u.id,
          price: prices[u.id] === '' || prices[u.id] == null ? 0 : Number(prices[u.id]),
        }))
      );
      pushToast('Harga jual diperbarui');
    }
    onClose();
  };

  const FooterIcon =
    mode === 'tambah'
      ? PackagePlus
      : mode === 'kurang'
      ? PackageMinus
      : mode === 'harga'
      ? CircleDollarSign
      : SlidersHorizontal;

  const footerLabel =
    mode === 'tambah'
      ? 'Simpan Barang Masuk'
      : mode === 'kurang'
      ? 'Simpan Barang Keluar'
      : mode === 'harga'
      ? 'Simpan Harga Jual'
      : 'Simpan Penyesuaian';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Penyesuaian Barang"
      subtitle="Tambah stok, catat barang keluar, sesuaikan fisik, atau ubah harga jual."
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={FooterIcon} onClick={submit}>
            {footerLabel}
          </Btn>
        </>
      }
    >
      <div className="min-h-[22rem]">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-primary-soft/50 p-1 sm:grid-cols-4">
          {ADJUST_MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setErrors({});
                }}
                className={cx(
                  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition',
                  active ? 'bg-primary text-white shadow-soft' : 'text-ink-soft hover:bg-white/70 hover:text-ink'
                )}
              >
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>

        <Field label="Barang" required error={errors.product}>
          <SearchSelect
            options={products.map((p) => ({
              id: p.id,
              label: p.name,
              emoji: p.image ? undefined : '📦',
              sub: `${(p.units || []).map((u) => u.name).join(', ')}`,
            }))}
            value={productId}
            onChange={onProductChange}
            placeholder="Cari & pilih barang..."
            disabled={!!preset}
          />
        </Field>

        {product && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-1 rounded-xl bg-primary-soft/50 px-3 py-2 text-xs">
            <span className="font-bold text-ink">{product.name}</span>
            <span className="text-ink-soft">
              Stok saat ini: <b className="text-ink">{formatQty(before)} {baseName}</b>
            </span>
          </div>
        )}

        {(mode === 'tambah' || mode === 'kurang' || mode === 'sesuaikan') && product && (
          <>
            <div className="grid gap-x-5 sm:grid-cols-2">
              <Field label="Satuan" required>
                <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="input">
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {Number(u.factor) !== 1 ? `(1 = ${u.factor} satuan dasar)` : '(dasar)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  mode === 'tambah'
                    ? 'Jumlah Masuk'
                    : mode === 'kurang'
                    ? 'Jumlah Keluar'
                    : 'Jumlah Stok Baru'
                }
                required
                error={errors.quantity}
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={mode === 'sesuaikan' ? 'contoh: 25' : 'contoh: 10'}
                />
              </Field>
            </div>

            {unit && mode === 'tambah' && (
              <div className="mb-4 rounded-xl bg-primary-soft/50 p-3 text-xs">
                <p className="flex items-center justify-between">
                  <span className="text-ink-soft">Setara satuan dasar</span>
                  <span className="font-bold text-primary">{formatQty(baseQty)} {baseName}</span>
                </p>
                <p className="mt-1 flex items-center justify-between">
                  <span className="text-ink-soft">Stok setelah masuk</span>
                  <span className="font-bold text-ink">{formatQty(afterTambah)} {baseName}</span>
                </p>
              </div>
            )}

            {unit && mode === 'kurang' && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-900">
                <p className="flex items-center justify-between">
                  <span className="text-rose-700">Setara satuan dasar berkurang</span>
                  <span className="font-bold text-rose-600">-{formatQty(baseQty)} {baseName}</span>
                </p>
                <p className="mt-1 flex items-center justify-between">
                  <span className="text-rose-700">Sisa stok setelah keluar</span>
                  <span className="font-bold text-ink">{formatQty(afterKurang)} {baseName}</span>
                </p>
              </div>
            )}

            {unit && mode === 'sesuaikan' && (
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-primary-soft/50 p-3 text-center text-xs">
                <div>
                  <p className="text-ink-soft">Sebelum</p>
                  <p className="font-bold text-ink">{formatQty(before)}</p>
                </div>
                <div>
                  <p className="text-ink-soft">Setelah</p>
                  <p className="font-bold text-primary">{formatQty(baseQty)}</p>
                </div>
                <div>
                  <p className="text-ink-soft">Selisih</p>
                  <p
                    className={`font-bold ${
                      diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-500' : 'text-ink-soft'
                    }`}
                  >
                    {diff > 0 ? '+' : ''}{formatQty(diff)}
                  </p>
                </div>
                <p className="col-span-3 mt-1 text-[11px] text-ink-soft">
                  dalam satuan dasar ({baseName})
                </p>
              </div>
            )}
          </>
        )}

        {(mode === 'tambah' || mode === 'kurang') && product && (
          <Field label="Keterangan / Catatan (opsional)">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === 'tambah'
                  ? 'contoh: beli manual di pasar, retur pembeli...'
                  : 'contoh: barang terjual tunai, barang rusak/kedaluwarsa...'
              }
            />
          </Field>
        )}

        {mode === 'sesuaikan' && product && (
          <Field label="Alasan Penyesuaian" required error={errors.reason}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="contoh: hitung ulang fisik toko, koreksi selisih opname, hilang..."
            />
          </Field>
        )}

        {mode === 'harga' && product && (
          <div className="mb-2">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">
              Harga Jual per Satuan
            </p>
            {units.map((u) => (
              <Field
                key={u.id}
                label={`${u.name}${
                  Number(u.factor) !== 1 ? ` (1 = ${u.factor} ${baseName})` : ' (satuan dasar)'
                }`}
                required={u.id === baseUnit?.id}
                error={u.id === baseUnit?.id ? errors.basePrice : undefined}
              >
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={prices[u.id] ?? ''}
                  onChange={(e) => setPrices((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  placeholder="contoh: 3000"
                />
              </Field>
            ))}
            {errors.prices && (
              <p className="mb-2 text-xs font-medium text-rose-500">{errors.prices}</p>
            )}
            <p className="text-[11px] text-ink-soft">
              Harga tiap satuan diatur manual dan tidak dihitung otomatis dari satuan lain.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RiwayatModal({ open, onClose, productId, productName }) {
  const { movements } = useApp();
  const list = useMemo(() => {
    const all = [...movements].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return productId ? all.filter((m) => m.productId === productId) : all;
  }, [movements, productId]);

  const typeMeta = {
    receive: { label: 'Penerimaan Pesanan', cls: 'bg-emerald-100 text-emerald-700' },
    masuk: { label: 'Barang Masuk', cls: 'bg-sky-100 text-sky-700' },
    keluar: { label: 'Barang Keluar', cls: 'bg-rose-100 text-rose-700' },
    adjust: { label: 'Penyesuaian Stok', cls: 'bg-amber-100 text-amber-700' },
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Riwayat Perubahan Stok"
      subtitle={
        productName
          ? `Semua catatan pergerakan stok untuk “${productName}”.`
          : 'Catatan seluruh aktivitas pergerakan stok: barang masuk, keluar, dan penyesuaian.'
      }
      size="lg"
      footer={<Btn variant="outline" onClick={onClose}>Tutup</Btn>}
    >
      {list.length === 0 ? (
        <EmptyState
          icon={History}
          title={productName ? `Belum ada riwayat untuk ${productName}` : 'Belum ada riwayat stok'}
          description="Pergerakan stok akan otomatis tercatat saat penerimaan pesanan, penambahan manual, barang keluar, atau penyesuaian."
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((m) => {
            const meta = typeMeta[m.type] || typeMeta.adjust;
            const isNegative = m.diffBase < 0;

            return (
              <div key={m.id} className="rounded-xl border border-line bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    {formatDateTime(m.timestamp)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-ink">{m.productNameSnapshot}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
                  <span>
                    Jumlah: <b className="font-bold text-ink">{formatQty(m.beforeBase)}</b> →{' '}
                    <b className="font-bold text-ink">{formatQty(m.afterBase)}</b> {m.unitBaseName}
                  </span>
                  <span
                    className={`font-bold ${
                      m.diffBase > 0
                        ? 'text-emerald-600'
                        : isNegative
                        ? 'text-rose-500'
                        : 'text-ink-soft'
                    }`}
                  >
                    Perubahan: {m.diffBase > 0 ? '+' : ''}
                    {formatQty(m.diffBase)} {m.unitBaseName}
                  </span>
                  {m.ref && <span className="font-semibold text-primary">Ref: {m.ref}</span>}
                  {m.note && <span className="italic">“{m.note}”</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
