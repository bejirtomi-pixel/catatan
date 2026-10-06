import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Eye, FilterX, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { dateKey, formatDateTime, formatQty, rupiah, round2 } from '../utils/format';
import {
  Btn,
  Chip,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  StatusPill,
  TD,
  TH,
  TableWrap,
  Textarea,
} from '../components/UI';
import ImageUpload from '../components/ImageUpload';

const PAGE_SIZE = 8;

export default function Pesanan() {
  const { activeOrders, storeById } = useApp();
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeOrders.filter((o) => {
      if (date && dateKey(o.createdAt) !== date) return false;
      if (!q) return true;
      const storeName = (storeById(o.storeId)?.name || '').toLowerCase();
      const itemNames = o.items.map((i) => i.productNameSnapshot.toLowerCase()).join(' ');
      return o.id.toLowerCase().includes(q) || storeName.includes(q) || itemNames.includes(q);
    });
  }, [activeOrders, search, date, storeById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilter = search || date;

  return (
    <div>
      <PageHeader title="Pesanan" subtitle={`Pesanan yang belum diselesaikan (${activeOrders.length})`}>
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari no pesanan, toko, barang..."
          className="w-full sm:w-60"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          className="input w-full sm:w-44"
          title="Filter tanggal"
        />
        {hasFilter && (
          <Btn
            variant="soft"
            size="md"
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
      </PageHeader>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title={hasFilter ? 'Pesanan tidak ditemukan' : 'Tidak ada pesanan aktif'}
            description={hasFilter ? 'Coba ubah kata kunci atau tanggal pencarian.' : 'Buat pesanan terlebih dahulu dari halaman Toko.'}
          />
        </div>
      ) : (
        <TableWrap minWidth="min-w-[820px]">
          <thead className="border-b border-line bg-primary-soft/50">
            <tr>
              <TH>No Pesanan</TH>
              <TH>Tanggal & Waktu</TH>
              <TH>Toko</TH>
              <TH>Barang</TH>
              <TH>Total</TH>
              <TH>Status</TH>
              <TH className="text-right">Aksi</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o.id} className="bg-white transition hover:bg-primary-soft/40">
                <TD>
                  <p className="font-extrabold text-primary">{o.id}</p>
                  {o.note && <p className="max-w-[140px] truncate text-[11px] italic text-ink-soft">“{o.note}”</p>}
                </TD>
                <TD className="text-ink-soft">{formatDateTime(o.createdAt)}</TD>
                <TD>
                  <Chip tone="soft">🏪 {storeById(o.storeId)?.name || '—'}</Chip>
                </TD>
                <TD>
                  <div className="flex max-w-[260px] flex-wrap gap-1">
                    {o.items.map((it, idx) => (
                      <Chip key={idx} tone="soft">
                        {it.productNameSnapshot}
                      </Chip>
                    ))}
                  </div>
                </TD>
                <TD className="font-extrabold text-ink">{rupiah(o.totalPrice)}</TD>
                <TD>
                  <StatusPill status="active" />
                </TD>
                <TD>
                  <div className="flex justify-end gap-1.5">
                    <Btn size="sm" variant="outline" icon={Eye} onClick={() => setDetail(o)}>
                      Lihat Detail
                    </Btn>
                    <Btn size="sm" icon={CheckCircle2} onClick={() => setCompleteTarget(o)}>
                      Selesaikan
                    </Btn>
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {filtered.length > 0 && (
        <div className="card mt-4">
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

      <OrderDetailModal order={detail} onClose={() => setDetail(null)} />
      <CompleteOrderModal order={completeTarget} onClose={() => setCompleteTarget(null)} />
    </div>
  );
}

function OrderDetailModal({ order, onClose }) {
  const { storeById } = useApp();
  if (!order) return null;
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Detail Pesanan — ${order.id}`}
      size="md"
      footer={
        <Btn variant="outline" onClick={onClose}>
          Tutup
        </Btn>
      }
    >
      <div className="rounded-xl bg-primary-soft/60 p-3.5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-soft">
            Toko: <span className="font-bold text-ink">{storeById(order.storeId)?.name || '—'}</span>
          </span>
          <span className="text-ink-soft">
            Tanggal: <span className="font-bold text-ink">{formatDateTime(order.createdAt)}</span>
          </span>
          <span className="text-ink-soft">
            Status: <StatusPill status={order.status} />
          </span>
        </div>
      </div>

      <p className="label mt-4">Barang Yang Dipesan</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {order.items.map((it, idx) => (
          <div key={idx} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
            <div>
              <p className="font-semibold text-ink">{it.productNameSnapshot}</p>
              <p className="text-xs text-ink-soft">
                {formatQty(it.quantity)} {it.unitName} × {rupiah(it.priceActual)} / {it.unitName}
                {it.priceActual !== it.priceRef && (
                  <span className="text-ink-soft"> (acuan {rupiah(it.priceRef)})</span>
                )}
              </p>
            </div>
            <span className="font-bold text-primary">{rupiah(it.subtotal)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-between rounded-xl bg-ink/5 px-3.5 py-2.5 text-sm">
        <span className="font-bold text-ink">Total Pesanan</span>
        <span className="font-extrabold text-primary">{rupiah(order.totalPrice)}</span>
      </div>

      {order.note && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
          Catatan: “{order.note}”
        </p>
      )}
    </Modal>
  );
}

function CompleteOrderModal({ order, onClose }) {
  const { storeById, productById, completeOrder, pushToast } = useApp();
  const [received, setReceived] = useState({});
  const [notes, setNotes] = useState({});
  const [receiptNote, setReceiptNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    const map = {};
    for (const it of order.items) {
      map[it.productId] = {
        receivedQuantity: String(it.quantity),
        receivedUnitId: it.unitId || '',
        receivedUnitName: it.unitName,
        receivedUnitFactor: it.unitFactor || 1,
      };
    }
    setReceived(map);
    setNotes({});
    setReceiptNote('');
    setPhoto('');
    setSaving(false);
  }, [order]);

  if (!order) return null;

  const totals = order.items.reduce(
    (acc, it) => {
      const r = received[it.productId];
      let recQty = r ? Number(r.receivedQuantity) || 0 : 0;
      let factor = r ? Number(r.receivedUnitFactor) || it.unitFactor || 1 : it.unitFactor || 1;
      if (r && r.receivedUnitId) {
        const product = productById(it.productId);
        const u = (product?.units || []).find((x) => x.id === r.receivedUnitId);
        if (u) factor = Number(u.factor) || factor;
      }
      const recBase = round2(recQty * factor);
      const ordBase = it.quantity * it.unitFactor;
      const shortage = Math.max(0, round2(ordBase - recBase));
      const costPerBase = it.unitFactor ? it.priceActual / it.unitFactor : it.priceActual;
      acc.cost += costPerBase * recBase;
      acc.items += 1;
      return acc;
    },
    { cost: 0, items: 0 }
  );

  const confirm = () => {
    if (saving) return;
    setSaving(true);
    const receiptItems = order.items.map((it) => {
      const r = received[it.productId] || {};
      const product = productById(it.productId);
      let factor = it.unitFactor || 1;
      let name = it.unitName;
      if (r.receivedUnitId) {
        const u = (product?.units || []).find((x) => x.id === r.receivedUnitId);
        if (u) {
          factor = Number(u.factor);
          name = u.name;
        }
      }
      return {
        productId: it.productId,
        receivedQuantity: r.receivedQuantity !== '' ? Number(r.receivedQuantity) : 0,
        receivedUnitId: r.receivedUnitId || '',
        receivedUnitName: r.receivedUnitId ? name : it.unitName,
        receivedUnitFactor: r.receivedUnitId ? factor : it.unitFactor || 1,
        note: notes[it.productId] || '',
      };
    });
    const result = completeOrder(order.id, { items: receiptItems, note: receiptNote, photo });
    if (result) {
      const shortageCount = result.shortages.length;
      pushToast(
        shortageCount > 0
          ? `Pesanan ${order.id} selesai — diterima kurang dari pesanan, ${shortageCount} barang kosong tercatat`
          : `Pesanan ${order.id} selesai — stok bertambah sesuai penerimaan`
      );
      onClose();
    } else {
      setSaving(false);
      pushToast('Pesanan sudah diselesaikan sebelumnya.', 'warning');
    }
  };

  const updateReceived = (productId, patch) =>
    setReceived((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Selesaikan Pesanan — ${order.id}`}
      subtitle="Periksa barang yang diterima. Stok bertambah sesuai jumlah yang benar-benar diterima, bukan jumlah pesanan."
      size="lg"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={Save} onClick={confirm} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Penerimaan & Selesaikan'}
          </Btn>
        </>
      }
    >
      <div className="rounded-xl bg-primary-soft/60 p-3.5">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-soft">
            Toko: <span className="font-bold text-ink">{storeById(order.storeId)?.name || '—'}</span>
          </span>
          <span className="text-ink-soft">
            Tanggal: <span className="font-bold text-ink">{formatDateTime(order.createdAt)}</span>
          </span>
        </div>
      </div>

      <p className="label mt-4">Pemeriksaan Penerimaan</p>
      <div className="space-y-3">
        {order.items.map((it, idx) => {
          const r = received[it.productId] || {};
          const product = productById(it.productId);
          const productUnits = product?.units || [];
          const units = productUnits.some((u) => u.id === it.unitId)
            ? productUnits
            : [
                { id: it.unitId, name: it.unitName, factor: it.unitFactor || 1 },
                ...productUnits.filter((u) => u.id !== it.unitId),
              ];
          const recQty = Number(r.receivedQuantity) || 0;
          let factor = it.unitFactor || 1;
          if (r.receivedUnitId) {
            const u = units.find((x) => x.id === r.receivedUnitId);
            if (u) factor = Number(u.factor) || factor;
          }
          const recBase = round2(recQty * factor);
          const ordBase = it.quantity * it.unitFactor;
          const shortage = round2(Math.max(0, ordBase - recBase));
          const costPerBase = it.unitFactor ? it.priceActual / it.unitFactor : it.priceActual;

          return (
            <div key={it.productId} className="rounded-xl border border-line bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-ink">{it.productNameSnapshot}</p>
                  <p className="text-xs text-ink-soft">
                    Dipesan {formatQty(it.quantity)} {it.unitName} · harga {rupiah(it.priceActual)} / {it.unitName}
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold text-ink">
                    Diterima: <span className="font-bold text-primary">{qtyAuto(units, recBase)}</span>
                  </p>
                  {shortage > 0 && (
                    <p className="font-semibold text-rose-500">
                      Barang kosong: {qtyShort(units, shortage, it.unitName, it.unitFactor)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_180px]">
                <Field label="Catatan item (opsional)" className="mb-0">
                  <Textarea
                    value={notes[it.productId] || ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [it.productId]: e.target.value }))}
                    placeholder="contoh: kardus penyok, telur pecah sebagian..."
                    className="min-h-[44px]"
                  />
                </Field>
                <div className="space-y-2">
                  <Field label="Jumlah diterima" className="mb-0">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={r.receivedQuantity}
                      onChange={(e) => updateReceived(it.productId, { receivedQuantity: e.target.value })}
                    />
                  </Field>
                  <Field label="Satuan terima" className="mb-0">
                    <select
                      value={r.receivedUnitId || ''}
                      onChange={(e) => {
                        const u = units.find((x) => x.id === e.target.value);
                        updateReceived(it.productId, {
                          receivedUnitId: e.target.value,
                          receivedUnitName: u ? u.name : it.unitName,
                          receivedUnitFactor: u ? u.factor : it.unitFactor,
                        });
                      }}
                      className="input"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="flex flex-col justify-between rounded-xl bg-primary-soft/50 p-3 text-xs">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                      Biaya (diterima)
                    </p>
                    <p className="mt-0.5 text-base font-extrabold text-primary">
                      {rupiah(recBase * costPerBase)}
                    </p>
                  </div>
                  <div>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Setara</p>
                    <p className="mt-0.5 font-bold text-ink">{qtyAuto(units, recBase)}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl bg-primary-soft/50 p-3.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink">Total Biaya berdasarkan barang diterima</span>
          <span className="text-lg font-extrabold text-primary">{rupiah(totals.cost)}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-soft">
          Total biaya dihitung dari jumlah yang benar-benar diterima (barang kosong tidak dihitung).
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Catatan penerimaan (opsional)">
          <Textarea
            value={receiptNote}
            onChange={(e) => setReceiptNote(e.target.value)}
            placeholder="contoh: kerusakan ringan, sisa menyusul..."
            className="min-h-[44px]"
          />
        </Field>
        <ImageUpload value={photo} onChange={setPhoto} label="Foto Struk Penerimaan" variant="receipt" />
      </div>
    </Modal>
  );
}

function qtyAuto(units, baseQty) {
  const sorted = [...units].sort((a, b) => b.factor - a.factor);
  let rest = round2(baseQty);
  const parts = [];
  for (const u of sorted) {
    if (u.factor <= 1) continue;
    const count = Math.floor(rest / u.factor);
    if (count > 0) {
      parts.push(`${count} ${u.name}`);
      rest = round2(rest - count * u.factor);
    }
  }
  if (rest > 0 || parts.length === 0) {
    const base = units.find((u) => u.factor === 1) || sorted[0];
    parts.push(`${formatQty(rest)} ${base.name}`);
  }
  return parts.join(' ');
}

function qtyShort(units, shortageBase, orderedUnitName, orderedFactor) {
  const q = orderedFactor ? formatQty(round2(shortageBase / orderedFactor)) : formatQty(shortageBase);
  return `${q} ${orderedUnitName}`;
}