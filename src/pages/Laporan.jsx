import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Eye, FilterX, PackageX, ReceiptText, SearchX } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { dateKey, formatDateTime, formatQty, rupiah, round2 } from '../utils/format';
import {
  Btn,
  Chip,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TD,
  TH,
  TableWrap,
  Textarea,
} from '../components/UI';

const PAGE_SIZE = 8;

export default function Laporan() {
  const { doneOrders, shortages, markShortageSold, pushToast, storeById } = useApp();
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [photoView, setPhotoView] = useState('');
  const [statusFilter, setStatusFilter] = useState('semua');
  const [pageK, setPageK] = useState(1);
  const [soldTarget, setSoldTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return doneOrders.filter((o) => {
      if (date && dateKey(o.createdAt) !== date) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        (storeById(o.storeId)?.name || '').toLowerCase().includes(q) ||
        o.items.some((i) => i.productNameSnapshot.toLowerCase().includes(q))
      );
    });
  }, [doneOrders, search, date]);

  const shortageList = useMemo(() => {
    let list = [...shortages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (statusFilter !== 'semua') list = list.filter((s) => s.status === statusFilter);
    return list;
  }, [shortages, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const totalPagesK = Math.max(1, Math.ceil(shortageList.length / PAGE_SIZE));
  const safePageK = Math.min(pageK, totalPagesK);
  const rowsK = shortageList.slice((safePageK - 1) * PAGE_SIZE, safePageK * PAGE_SIZE);
  const hasFilter = search || date;

  return (
    <div>
      <PageHeader title="Laporan" subtitle="Riwayat pesanan selesai & daftar barang kosong." />

      {/* ===== Tabel A: Riwayat Pesanan ===== */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <ReceiptText className="h-4 w-4 text-primary" /> A. Riwayat Pesanan
            </h2>
            <p className="text-xs text-ink-soft">Pesanan selesai, diterima sebagian atau penuh ({doneOrders.length})</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari no, toko, barang..."
              className="w-56"
            />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="input w-40"
              title="Filter tanggal"
            />
            {hasFilter && (
              <Btn
                variant="soft"
                size="sm"
                icon={FilterX}
                onClick={() => {
                  setSearch('');
                  setDate('');
                  setPage(1);
                }}
              >
                Reset
              </Btn>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={hasFilter ? SearchX : ReceiptText}
              title={hasFilter ? 'Pesanan tidak ditemukan' : 'Belum ada riwayat'}
              description={hasFilter ? 'Coba ubah pencarian atau tanggal.' : 'Riwayat terisi saat pesanan diselesaikan dari halaman Pesanan.'}
            />
          </div>
        ) : (
          <TableWrap minWidth="min-w-[800px]">
            <thead className="border-b border-line bg-primary-soft/50">
              <tr>
                <TH>No Pesanan</TH>
                <TH>Tanggal</TH>
                <TH>Toko</TH>
                <TH>Barang</TH>
                <TH>Total</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((o) => {
                const partial = o.receipt
                  ? o.receipt.items.some((r) => r.shortageBase > 0)
                  : false;
                return (
                  <tr key={o.id} className="bg-white transition hover:bg-primary-soft/40">
                    <TD className="font-extrabold text-primary">{o.id}</TD>
                    <TD className="text-ink-soft">
                      {formatDateTime(o.createdAt)}
                      {o.receipt?.completedAt && (
                        <p className="text-[10px]">selesai {formatDateTime(o.receipt.completedAt)}</p>
                      )}
                    </TD>
                    <TD className="font-semibold text-ink">{storeById(o.storeId)?.name || ''}</TD>
                    <TD>
                      <div className="flex max-w-[280px] flex-wrap gap-1">
                        {o.items.slice(0, 3).map((it, idx) => (
                          <span key={idx} className="rounded-lg bg-line/50 px-2 py-0.5 text-[11px] font-semibold text-ink">
                            {it.productNameSnapshot}
                          </span>
                        ))}
                        {o.items.length > 3 && <span className="text-[11px] text-ink-soft">+{o.items.length - 3}</span>}
                      </div>
                      {partial && <Chip tone="amber" className="mt-1">Diterima sebagian</Chip>}
                    </TD>
                    <TD className="font-extrabold text-ink">
                      {rupiah(o.totalPrice)}
                      {o.totalCost != null && o.totalCost !== o.totalPrice && (
                        <p className="text-[10px] font-semibold text-ink-soft">biaya diterima {rupiah(o.totalCost)}</p>
                      )}
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Selesai
                      </span>
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        <Btn size="sm" variant="outline" icon={Eye} onClick={() => setDetail(o)}>
                          Lihat Detail
                        </Btn>
                      </div>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {filtered.length > 0 && (
          <div className="card mt-3">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              from={(safePage - 1) * PAGE_SIZE + 1}
              to={Math.min(safePage * PAGE_SIZE, filtered.length)}
              onPage={setPage}
            />
          </div>
        )}
      </section>

      {/* ===== Tabel B: Barang Kosong ===== */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <PackageX className="h-4 w-4 text-primary" /> B. Daftar Barang Kosong
            </h2>
            <p className="text-xs text-ink-soft">
              Kekurangan penerimaan yang belum / sudah dibeli kembali ({shortageList.length})
            </p>
          </div>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPageK(1); }} className="w-48">
            <option value="semua">Semua Status</option>
            <option value="belum">Belum dibeli lagi</option>
            <option value="sudah">Sudah dibeli</option>
          </Select>
        </div>

        {shortageList.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={PackageX}
              title="Tidak ada barang kosong"
              description="Daftar ini terisi otomatis saat barang yang diterima kurang dari yang dipesan."
            />
          </div>
        ) : (
          <TableWrap minWidth="min-w-[760px]">
            <thead className="border-b border-line bg-primary-soft/50">
              <tr>
                <TH>Tanggal</TH>
                <TH>Barang</TH>
                <TH>Toko</TH>
                <TH>Qty Kosong</TH>
                <TH>Satuan</TH>
                <TH>No Pesanan Asal</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rowsK.map((s) => (
                <tr key={s.id} className="bg-white transition hover:bg-primary-soft/40">
                  <TD className="text-ink-soft">{formatDateOnly(s.createdAt)}</TD>
                  <TD className="font-semibold text-ink">{s.productNameSnapshot}</TD>
                  <TD className="text-ink">{s.storeNameSnapshot}</TD>
                  <TD className="font-bold text-rose-500">{formatQty(s.quantity)}</TD>
                  <TD className="text-ink">{s.unit}</TD>
                  <TD>
                    <span className="font-semibold text-primary">{s.orderId}</span>
                  </TD>
                  <TD>
                    {s.status === 'sudah' ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Sudah dibeli
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" /> Belum dibeli lagi
                      </span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end">
                      {s.status === 'belum' ? (
                        <Btn size="sm" variant="soft" onClick={() => setSoldTarget(s)}>
                          Tandai Sudah Dibeli
                        </Btn>
                      ) : (
                        <p className="text-right text-[10px] leading-tight text-ink-soft">
                          {s.resolvedByOrderId && <span className="block font-semibold text-primary">via {s.resolvedByOrderId}</span>}
                          {s.statusChangedAt && <span className="block">{formatDateTime(s.statusChangedAt)}</span>}
                          {s.statusNote && <span className="block italic">“{s.statusNote}”</span>}
                        </p>
                      )}
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {shortageList.length > 0 && (
          <div className="card mt-3">
            <Pagination
              page={safePageK}
              totalPages={totalPagesK}
              total={shortageList.length}
              from={(safePageK - 1) * PAGE_SIZE + 1}
              to={Math.min(safePageK * PAGE_SIZE, shortageList.length)}
              onPage={setPageK}
            />
          </div>
        )}
      </section>

      <HistoryDetailModal order={detail} onClose={() => setDetail(null)} onPhoto={(url) => setPhotoView(url)} />
      <SoldModal
        target={soldTarget}
        onClose={() => setSoldTarget(null)}
        onSave={(note) => {
          markShortageSold(soldTarget.id, note);
          pushToast('Status barang kosong diperbarui ke Sudah dibeli');
          setSoldTarget(null);
        }}
      />

      <Modal open={!!photoView} onClose={() => setPhotoView('')} title="Foto Struk" size="md" footer={<Btn variant="outline" onClick={() => setPhotoView('')}>Tutup</Btn>}>
        {photoView && <img src={photoView} alt="Foto struk" className="w-full rounded-xl border border-line" />}
      </Modal>
    </div>
  );
}

function formatDateOnly(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function HistoryDetailModal({ order, onClose, onPhoto }) {
  const { storeById } = useApp();
  if (!order) return null;
  const receipt = order.receipt || null;
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Riwayat Pesanan — ${order.id}`}
      size="md"
      footer={<Btn variant="outline" onClick={onClose}>Tutup</Btn>}
    >
      <div className="rounded-xl bg-primary-soft/60 p-3.5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-soft">
            Toko: <span className="font-bold text-ink">{storeById(order.storeId)?.name || ''}</span>
          </span>
          <span className="text-ink-soft">
            Dibuat: <span className="font-bold text-ink">{formatDateTime(order.createdAt)}</span>
          </span>
          {receipt?.completedAt && (
            <span className="text-ink-soft">
              Selesai: <span className="font-bold text-ink">{formatDateTime(receipt.completedAt)}</span>
            </span>
          )}
        </div>
      </div>

      {receipt?.note && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Catatan penerimaan: “{receipt.note}”
        </p>
      )}

      <p className="label mt-4">Pesanan dan Penerimaan</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {order.items.map((it, idx) => {
          const r = receipt?.items?.find((x) => x.productId === it.productId);
          return (
            <div key={idx} className="px-3.5 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{it.productNameSnapshot}</p>
                <p className="font-bold text-primary">{rupiah(it.subtotal)}</p>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-ink-soft">
                <span>
                  Dipesan: <b className="text-ink">{formatQty(it.quantity)} {it.unitName}</b> × {rupiah(it.priceActual)}
                </span>
                <span>
                  Diterima:{' '}
                  <b className="text-ink">
                    {r ? `${formatQty(r.receivedQuantity)} ${r.receivedUnitName}` : `${formatQty(it.quantity)} ${it.unitName}`}
                  </b>
                </span>
                <span>
                  Barang kosong:{' '}
                  <b className={r && r.shortageBase > 0 ? 'text-rose-500' : 'text-ink'}>
                    {r ? `${formatQty(r.shortageQuantity)} ${r.shortageUnitName}` : '0'}
                  </b>
                </span>
              </div>
              {r?.note && <p className="mt-1 text-[11px] italic text-ink-soft">“{r.note}”</p>}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5 rounded-xl bg-primary-soft/50 p-3.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Total Pesanan</span>
          <span className="font-bold text-ink">{rupiah(order.totalPrice)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-ink-soft">Biaya berdasarkan barang diterima</span>
          <span className="font-extrabold text-primary">{rupiah(order.totalCost ?? order.totalPrice)}</span>
        </div>
      </div>

      {order.note && (
        <p className="mt-3 rounded-xl bg-primary-soft px-3.5 py-2 text-xs text-ink-soft">
          Catatan saat pesanan dibuat: “{order.note}”
        </p>
      )}

      {receipt?.photo && (
        <div className="mt-4">
          <p className="label">Foto Struk Penerimaan</p>
          <button type="button" onClick={() => onPhoto(receipt.photo)} className="overflow-hidden rounded-xl border border-line shadow-soft transition hover:opacity-90">
            <img src={receipt.photo} alt="Foto struk" className="h-40 rounded-xl object-cover" />
          </button>
        </div>
      )}
    </Modal>
  );
}

function SoldModal({ target, onClose, onSave }) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (target) setNote('');
  }, [target]);
  if (!target) return null;
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Tandai Sudah Dibeli"
      subtitle={`${target.productNameSnapshot} — ${formatQty(target.quantity)} ${target.unit} dari ${target.storeNameSnapshot}.`}
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn onClick={() => onSave(note.trim())}>
            Simpan
          </Btn>
        </>
      }
    >
      <Field label="Catatan (opsional)" hint="Misal: sudah dibeli lagi di luar aplikasi / lewat pesanan lain.">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="contoh: dibeli dari toko lain"
        />
      </Field>
    </Modal>
  );
}