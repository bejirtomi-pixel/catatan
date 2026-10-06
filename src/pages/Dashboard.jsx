import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  Inbox,
  Package,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, rupiah } from '../utils/format';
import { Btn, EmptyState, StatusPill } from '../components/UI';
import ProductImage, { ProductFlags } from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';

const MENU_UTAMA = [
  {
    to: '/toko',
    label: 'Toko',
    icon: Store,
    desc: 'Kelola toko pemasok & buat pesanan barang.',
  },
  {
    to: '/pesanan',
    label: 'Pesanan',
    icon: ClipboardList,
    desc: 'Proses & selesaikan pesanan yang masuk.',
  },
  {
    to: '/stok',
    label: 'Stok',
    icon: Boxes,
    desc: 'Pantau, koreksi, & tambah stok warung.',
  },
  {
    to: '/laporan',
    label: 'Laporan',
    icon: BarChart3,
    desc: 'Ringkasan barang kosong, stok, & pembelian.',
  },
];

export default function Dashboard() {
  const { settings, stores, products, activeOrders, storeById } = useApp();
  const [picked, setPicked] = useState(null);

  const highlights = products.filter(
    (p) => p.featured || p.promo || p.buyOneGetOne || p.advertisement
  );

  return (
    <div className="space-y-5">
      {/* Card utama 1: dua fitur utama */}
      <section className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <Boxes className="h-4 w-4 text-primary" />
            Mulai dari Sini
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Dua langkah utama: kelola toko pemasok & master barang.
          </p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Link
            to="/toko"
            className="group flex h-full items-start gap-4 rounded-2xl bg-background/70 p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-primary/40"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-soft transition group-hover:scale-105">
              <Store className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Toko Pemasok</p>
              <h3 className="mt-1 text-3xl font-black text-ink">{stores.length}</h3>
              <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">
                {stores.length > 0
                  ? `${stores.length} toko pemasok terdaftar.`
                  : 'Belum ada toko pemasok.'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                Kelola Toko <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>

          <Link
            to="/barang"
            className="group flex h-full items-start gap-4 rounded-2xl bg-background/70 p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-primary/40"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-ink text-white shadow-soft transition group-hover:scale-105">
              <Package className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Barang Master</p>
              <h3 className="mt-1 text-3xl font-black text-ink">{products.length}</h3>
              <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">
                {products.length > 0
                  ? `${products.length} barang terdaftar, lengkap dengan satuan & harga.`
                  : 'Belum ada barang master.'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                Kelola Barang <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Card utama 2: empat menu utama */}
      <section className="card overflow-hidden">
        <div className="border-b border-line bg-primary-soft/40 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <Sparkles className="h-4 w-4 text-primary" />
            Menu Utama
          </h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Akses cepat ke empat modul utama warung Anda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">
          {MENU_UTAMA.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group rounded-2xl bg-background/70 p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-soft hover:ring-primary/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <m.icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-extrabold text-ink">{m.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{m.desc}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                Buka <ArrowRight className="h-3 w-3 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Ringkasan pesanan aktif */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <ClipboardList className="h-4 w-4 text-primary" />
              Pesanan Sedang Dipesan
            </h2>
            <p className="text-xs text-ink-soft">
              Ringkasan pesanan yang belum diselesaikan ({activeOrders.length})
            </p>
          </div>
          {activeOrders.length > 0 && (
            <Link
              to="/pesanan"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Lihat semua <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {activeOrders.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Inbox}
              title="Tidak ada pesanan aktif"
              description="Belum ada pesanan yang sedang diproses. Buat pesanan baru dari halaman Toko."
              action={
                <Link to="/toko">
                  <Btn size="sm" variant="soft" icon={Store}>
                    Buat Pesanan
                  </Btn>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="card divide-y divide-line overflow-hidden">
            {activeOrders.slice(0, 8).map((o) => (
              <div
                key={o.id}
                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="w-44 shrink-0">
                  <p className="text-sm font-extrabold text-primary">{o.id}</p>
                  <p className="text-[11px] text-ink-soft">{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="w-40 shrink-0">
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
                    <Users className="h-3.5 w-3.5 text-ink-soft" />
                    {storeById(o.storeId)?.name || '—'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-ink-soft">{o.totalItems} barang</p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    {o.items.map((it, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-line/50 px-2 py-0.5 text-[11px] font-semibold text-ink"
                      >
                        {it.productNameSnapshot} ×{it.quantity} {it.unitName}
                      </span>
                    ))}
                  </div>
                  {o.note && (
                    <p className="mt-1 truncate text-[11px] italic text-ink-soft">“{o.note}”</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <StatusPill status="active" />
                  <Boxes className="hidden h-4 w-4 text-ink-soft sm:block" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Info Barang: unggulan, promo, penawaran khusus */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <Sparkles className="h-4 w-4 text-primary" />
              Info Barang
            </h2>
            <p className="text-xs text-ink-soft">
              Barang unggulan, promo, & penawaran khusus ({highlights.length})
            </p>
          </div>
          {highlights.length > 0 && (
            <Link
              to="/barang"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              Lihat semua <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {highlights.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Sparkles}
              title="Belum ada barang istimewa"
              description="Tandai barang sebagai Unggulan, Promo, Buy 1 Get 1, atau Iklan dari halaman Barang."
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.slice(0, 6).map((p) => {
              const base = (p.units || []).find((u) => u.factor === 1) || (p.units || [])[0];
              return (
                <div key={p.id} className="card flex items-start gap-3 p-3.5">
                  <ProductImage product={p} size="md" showBadges={false} onClick={() => setPicked(p)} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setPicked(p)}
                      className="text-left text-sm font-bold text-ink hover:text-primary"
                    >
                      {p.name}
                    </button>
                    {p.category && <p className="text-[11px] text-ink-soft">{p.category}</p>}
                    <p className="mt-0.5 text-sm font-extrabold text-primary">
                      {rupiah(base?.price || 0)}
                    </p>
                    <ProductFlags product={p} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-[11px] text-ink-soft">
        Data & penyimpanan lokal di perangkat ini ({settings.name || 'Warung Madura'}).
      </p>

      <ProductDetailModal product={picked} onClose={() => setPicked(null)} />
    </div>
  );
}