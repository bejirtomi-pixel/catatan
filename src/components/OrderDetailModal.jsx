import { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Download,
  History,
  PackageCheck,
  Printer,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatQty, getLocalDateString, localDateToISO, rupiah, round2 } from '../utils/format';
import { Btn, Field, Input, Modal, StatusPill, Textarea } from './UI';

export default function OrderDetailModal({ order, onClose, initialReceiveOpen = false }) {
  const {
    orders,
    storeById,
    receiveOrderPartial,
    completeOrderWithShortages,
    cancelOrder,
    pushToast,
  } = useApp();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [closeShortageOpen, setCloseShortageOpen] = useState(false);

  // Sync dengan state pesanan terbaru di context
  const currentOrder = useMemo(() => {
    if (!order) return null;
    return orders.find((o) => o.id === order.id) || order;
  }, [order, orders]);

  // Jika parent meminta langsung buka modal catat penerimaan
  useEffect(() => {
    if (order && initialReceiveOpen) {
      setReceiveOpen(true);
    } else {
      setReceiveOpen(false);
    }
  }, [order, initialReceiveOpen]);

  if (!currentOrder) return null;

  const canReceiveOrCancel =
    currentOrder.status === 'belum_diterima' ||
    currentOrder.status === 'sebagian' ||
    currentOrder.status === 'active';

  const handleDownloadTxt = () => {
    const storeName = storeById(currentOrder.storeId)?.name || '—';
    const lines = [
      '====================================================',
      '         CATATAN PESANAN — WARUNG MADURA            ',
      '====================================================',
      `Nomor Pesanan    : ${currentOrder.id}`,
      `Toko Pemasok     : ${storeName}`,
      `Waktu Pemesanan  : ${formatDateTime(currentOrder.createdAt)}`,
      `Waktu Diperbarui : ${formatDateTime(currentOrder.updatedAt || currentOrder.createdAt)}`,
      `Status Pesanan   : ${currentOrder.status}`,
      currentOrder.note ? `Catatan Pemesanan: "${currentOrder.note}"` : null,
      currentOrder.cancelReason ? `Alasan Batal     : "${currentOrder.cancelReason}"` : null,
      '----------------------------------------------------',
      'RINCIAN BARANG DIPESAN:',
      ...currentOrder.items.map((it, idx) => {
        const rec = Number(it.receivedQuantity) || 0;
        const sisa = Math.max(0, it.quantity - rec);
        return `${idx + 1}. ${it.productNameSnapshot} | Dipesan: ${formatQty(it.quantity)} ${it.unitName} | Diterima: ${formatQty(rec)} | Sisa: ${formatQty(sisa)} | Harga: ${rupiah(it.priceActual)} | Subtotal: ${rupiah(it.subtotal)}`;
      }),
      '----------------------------------------------------',
      `Total Perkiraan Biaya : ${rupiah(currentOrder.totalPrice)}`,
      `Total Biaya Diterima  : ${rupiah(currentOrder.totalCost || 0)}`,
      '----------------------------------------------------',
      currentOrder.receipts && currentOrder.receipts.length > 0
        ? [
            'RIWAYAT PENERIMAAN BERTAHAP:',
            ...currentOrder.receipts.map(
              (r, idx) =>
                `Tahap #${idx + 1} (${formatDateTime(r.receivedAt)}): ` +
                r.items.map((it) => `+${formatQty(it.receivedQuantity)} ${it.unitName} ${it.productNameSnapshot}`).join(', ') +
                (r.note ? ` | Catatan: "${r.note}"` : '')
            ),
          ].join('\n')
        : 'Riwayat Penerimaan: Belum ada penerimaan barang yang dicatat.',
      '====================================================',
    ].filter(Boolean);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pesanan-${currentOrder.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast(`Catatan pesanan ${currentOrder.id} berhasil diunduh (.txt)`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <Modal
        open={!!order}
        onClose={onClose}
        title={`Detail Pesanan — ${currentOrder.id}`}
        subtitle="Rincian lengkap pesanan barang warung, kondisi progres penerimaan bertahap, dan status."
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {canReceiveOrCancel && (
                <>
                  <Btn
                    variant="soft"
                    size="sm"
                    className="!text-rose-600 hover:!bg-rose-50"
                    icon={Ban}
                    onClick={() => setCancelOpen(true)}
                  >
                    Batalkan Pesanan
                  </Btn>
                  {currentOrder.status === 'sebagian' && (
                    <Btn
                      variant="soft"
                      size="sm"
                      className="!text-amber-800 !bg-amber-50 hover:!bg-amber-100 border border-amber-200"
                      icon={ShieldAlert}
                      onClick={() => setCloseShortageOpen(true)}
                      title="Selesaikan pesanan dan catat sisa barang ke daftar kekurangan"
                    >
                      Tutup & Catat Kekurangan
                    </Btn>
                  )}
                  <Btn
                    size="sm"
                    icon={PackageCheck}
                    onClick={() => setReceiveOpen(true)}
                  >
                    Catat Penerimaan
                  </Btn>
                </>
              )}
              <Btn
                variant="outline"
                size="sm"
                icon={Printer}
                onClick={handlePrint}
                title="Cetak catatan pesanan"
              >
                Cetak
              </Btn>
              <Btn
                variant="outline"
                size="sm"
                icon={Download}
                onClick={handleDownloadTxt}
                title="Unduh ringkasan pesanan ke format teks"
              >
                Unduh .txt
              </Btn>
            </div>
            <Btn variant="outline" size="sm" onClick={onClose}>
              Tutup
            </Btn>
          </div>
        }
      >
        {/* Info Header Toko, Tanggal, Diperbarui, Status */}
        <div className="rounded-xl border border-line bg-primary-soft/40 p-3.5">
          <div className="grid gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Toko Pemasok</p>
              <p className="font-extrabold text-ink">{storeById(currentOrder.storeId)?.name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Waktu Pemesanan</p>
              <p className="font-semibold text-ink">{formatDateTime(currentOrder.createdAt)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Terakhir Diperbarui</p>
              <p className="font-semibold text-ink">
                {formatDateTime(currentOrder.updatedAt || currentOrder.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Status Pesanan</p>
              <div className="mt-0.5">
                <StatusPill status={currentOrder.status} />
              </div>
            </div>
          </div>
        </div>

        {/* Banner Pembatalan */}
        {currentOrder.status === 'batal' && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="font-bold">Pesanan Telah Dibatalkan</p>
              <p className="mt-0.5">
                Alasan pembatalan: “{currentOrder.cancelReason || 'Dibatalkan oleh pengguna'}”.
                Barang yang telah diterima sebelum pembatalan tetap tersimpan aman di inventaris stok.
              </p>
            </div>
          </div>
        )}

        {/* Catatan Pemesanan */}
        {currentOrder.note && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
            <span className="font-bold">Catatan Pemesanan:</span> “{currentOrder.note}”
          </div>
        )}

        {/* Tabel Rincian Barang Dipesan */}
        <div className="mt-4">
          <div className="flex items-center justify-between pb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-ink">
              Daftar Barang ({currentOrder.items?.length || 0} jenis)
            </p>
            <span className="text-[11px] text-ink-soft">
              Penerimaan menambah stok warung secara real-time
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[580px] text-left text-xs">
              <thead className="border-b border-line bg-primary-soft/50 font-bold text-ink">
                <tr>
                  <th className="px-3 py-2.5">No</th>
                  <th className="px-3 py-2.5">Nama Barang</th>
                  <th className="px-3 py-2.5">Satuan</th>
                  <th className="px-3 py-2.5 text-right">Dipesan</th>
                  <th className="px-3 py-2.5 text-right">Diterima</th>
                  <th className="px-3 py-2.5 text-right">Sisa</th>
                  <th className="px-3 py-2.5 text-right">Harga Satuan</th>
                  <th className="px-3 py-2.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {(currentOrder.items || []).map((it, idx) => {
                  const rec = Number(it.receivedQuantity) || 0;
                  const sisa = Math.max(0, it.quantity - rec);
                  return (
                    <tr key={idx} className="hover:bg-primary-soft/20">
                      <td className="px-3 py-2 text-ink-soft">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-bold text-ink">{it.productNameSnapshot}</p>
                      </td>
                      <td className="px-3 py-2 text-ink-soft">{it.unitName}</td>
                      <td className="px-3 py-2 text-right font-semibold text-ink">
                        {formatQty(it.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-600">
                        {rec > 0 ? formatQty(rec) : '0'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        <span className={sisa > 0 ? 'text-amber-600' : 'text-ink-soft'}>
                          {formatQty(sisa)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-ink-soft">
                        {rupiah(it.priceActual)}
                      </td>
                      <td className="px-3 py-2 text-right font-extrabold text-primary">
                        {rupiah(it.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Ringkasan Total Biaya Pesanan */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-line bg-white p-3 text-xs">
            <span className="font-semibold text-ink-soft">Total Perkiraan Biaya Pesanan:</span>
            <span className="text-sm font-extrabold text-primary">{rupiah(currentOrder.totalPrice)}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line bg-white p-3 text-xs">
            <span className="font-semibold text-ink-soft">Total Biaya Barang Diterima:</span>
            <span className="text-sm font-extrabold text-emerald-600">
              {rupiah(currentOrder.totalCost || 0)}
            </span>
          </div>
        </div>

        {/* Riwayat Penerimaan Bertahap */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wider text-ink">
                Riwayat Penerimaan Bertahap ({currentOrder.receipts?.length || 0})
              </p>
            </div>
            {canReceiveOrCancel && (
              <button
                type="button"
                onClick={() => setReceiveOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline"
              >
                + Catat Penerimaan
              </button>
            )}
          </div>

          {!currentOrder.receipts || currentOrder.receipts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-primary-soft/30 p-4 text-center text-xs text-ink-soft">
              Belum ada pencatatan penerimaan barang untuk pesanan ini.
              {canReceiveOrCancel && ' Gunakan tombol "Catat Penerimaan" ketika barang tiba.'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {currentOrder.receipts.map((rcp, idx) => (
                <div
                  key={rcp.id || idx}
                  className="rounded-xl border border-line bg-white p-3.5 shadow-soft transition hover:border-primary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-[10px] font-extrabold text-primary">
                        {idx + 1}
                      </span>
                      <p className="text-xs font-bold text-ink">Penerimaan Tahap #{idx + 1}</p>
                    </div>
                    <span className="text-[11px] font-medium text-ink-soft">
                      {formatDateTime(rcp.receivedAt)}
                    </span>
                  </div>

                  {rcp.note && (
                    <p className="mt-2 text-xs italic text-ink-soft">
                      Catatan: “{rcp.note}”
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(rcp.items || []).map((it, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-200"
                      >
                        <span className="font-extrabold text-emerald-600">
                          +{formatQty(it.receivedQuantity)} {it.unitName}
                        </span>
                        <span>{it.productNameSnapshot}</span>
                        {it.note && <span className="text-[10px] italic text-emerald-700">({it.note})</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Formulir Catat Penerimaan Barang */}
      <ReceiveModal
        open={receiveOpen}
        order={currentOrder}
        onClose={() => setReceiveOpen(false)}
        onSave={(data) => {
          const res = receiveOrderPartial(currentOrder.id, data);
          if (res?.ok) {
            pushToast(
              res.status === 'selesai'
                ? `Pesanan ${currentOrder.id} selesai! Seluruh barang telah lengkap diterima & masuk stok.`
                : `Penerimaan sebagian pesanan ${currentOrder.id} berhasil dicatat & masuk stok.`
            );
            setReceiveOpen(false);
          } else {
            pushToast(res?.reason || 'Gagal menyimpan penerimaan.', 'warning');
          }
        }}
      />

      {/* Modal Batalkan Pesanan */}
      <CancelModal
        open={cancelOpen}
        order={currentOrder}
        onClose={() => setCancelOpen(false)}
        onConfirm={(reason) => {
          const res = cancelOrder(currentOrder.id, reason);
          if (res?.ok) {
            pushToast(`Pesanan ${currentOrder.id} dibatalkan. Stok yang diterima tetap aman.`);
            setCancelOpen(false);
          } else {
            pushToast(res?.reason || 'Gagal membatalkan pesanan.', 'warning');
          }
        }}
      />

      {/* Modal Tutup Pesanan & Catat Kekurangan */}
      <CloseShortageModal
        open={closeShortageOpen}
        order={currentOrder}
        onClose={() => setCloseShortageOpen(false)}
        onConfirm={({ reason, note }) => {
          const res = completeOrderWithShortages(currentOrder.id, { reason, note });
          if (res?.ok) {
            pushToast(
              `Pesanan ${currentOrder.id} diselesaikan. ${
                res.shortagesCount > 0
                  ? `${res.shortagesCount} barang kekurangan berhasil dicatat ke Laporan untuk dibeli kembali.`
                  : 'Seluruh barang telah tercatat.'
              }`
            );
            setCloseShortageOpen(false);
          } else {
            pushToast(res?.reason || 'Gagal menyelesaikan pesanan.', 'warning');
          }
        }}
      />
    </>
  );
}

/* =========================================================================
   Formulir Catat Penerimaan Barang Sebagian
   ========================================================================= */
function ReceiveModal({ open, order, onClose, onSave }) {
  const [entries, setEntries] = useState({});
  const [receivedDate, setReceivedDate] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [error, setError] = useState('');

  // Hitung sisa belum diterima untuk setiap barang
  const itemsWithRemaining = useMemo(() => {
    if (!order?.items) return [];
    return order.items.map((it) => {
      const rec = Number(it.receivedQuantity) || 0;
      const sisa = Math.max(0, it.quantity - rec);
      return { ...it, sisa };
    });
  }, [order]);

  // Reset formulir saat modal dibuka
  useEffect(() => {
    if (open && itemsWithRemaining.length > 0) {
      const map = {};
      for (const it of itemsWithRemaining) {
        // Default: isi dengan sisa barang yang belum diterima
        map[it.productId] = {
          qty: it.sisa > 0 ? String(it.sisa) : '0',
          note: '',
        };
      }
      setEntries(map);
      setGeneralNote('');
      setError('');
      // Default tanggal hari ini (YYYY-MM-DD lokal)
      setReceivedDate(getLocalDateString());
    }
  }, [open, itemsWithRemaining]);

  if (!open || !order) return null;

  const updateEntry = (productId, patch) => {
    setEntries((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || { qty: '0', note: '' }), ...patch },
    }));
  };

  const fillAllRemaining = () => {
    const map = {};
    for (const it of itemsWithRemaining) {
      map[it.productId] = {
        qty: String(it.sisa),
        note: entries[it.productId]?.note || '',
      };
    }
    setEntries(map);
  };

  const clearAll = () => {
    const map = {};
    for (const it of itemsWithRemaining) {
      map[it.productId] = {
        qty: '0',
        note: entries[it.productId]?.note || '',
      };
    }
    setEntries(map);
  };

  const handleSave = () => {
    setError('');
    const items = [];
    let totalQty = 0;

    for (const it of itemsWithRemaining) {
      const e = entries[it.productId];
      const qtyNum = Number(e?.qty) || 0;

      if (qtyNum < 0) {
        setError(`Jumlah diterima untuk ${it.productNameSnapshot} tidak boleh negatif.`);
        return;
      }

      if (qtyNum > it.sisa) {
        setError(
          `Jumlah diterima untuk ${it.productNameSnapshot} (${qtyNum}) melebihi sisa yang belum datang (${it.sisa} ${it.unitName}).`
        );
        return;
      }

      if (qtyNum > 0) {
        totalQty += qtyNum;
        items.push({
          productId: it.productId,
          receivedQuantity: qtyNum,
          note: e?.note ? e.note.trim() : '',
        });
      }
    }

    if (totalQty <= 0) {
      setError('Masukkan jumlah diterima minimal untuk satu barang (lebih dari 0).');
      return;
    }

    const customTimestamp = receivedDate ? localDateToISO(receivedDate, 'now') : undefined;

    onSave({ items, note: generalNote, receivedAt: customTimestamp });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Catat Penerimaan Barang — ${order.id}`}
      subtitle="Periksa dan masukkan jumlah barang yang benar-benar tiba. Stok inventaris bertambah hanya sebesar jumlah yang diterima."
      size="md"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Batal
          </Btn>
          <Btn icon={CheckCircle2} onClick={handleSave}>
            Simpan Penerimaan
          </Btn>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-ink-soft">
          Pintasan Kuantitas:
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fillAllRemaining}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            Isi Semua Sisa
          </button>
          <span className="text-ink-soft">·</span>
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-bold text-ink-soft hover:underline"
          >
            Kosongkan
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {itemsWithRemaining.map((it) => {
          const e = entries[it.productId] || { qty: '0', note: '' };
          const recSoFar = Number(it.receivedQuantity) || 0;
          return (
            <div
              key={it.productId}
              className="rounded-xl border border-line bg-white p-3 shadow-soft transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-ink">{it.productNameSnapshot}</p>
                  <p className="mt-0.5 text-[11px] text-ink-soft">
                    Dipesan: <span className="font-semibold">{formatQty(it.quantity)} {it.unitName}</span>
                    {' · '}
                    Sudah diterima: <span className="font-semibold text-emerald-600">{formatQty(recSoFar)}</span>
                    {' · '}
                    Sisa: <span className="font-semibold text-amber-600">{formatQty(it.sisa)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-[120px_1fr] items-center gap-2">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                    Diterima ({it.unitName})
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max={it.sisa}
                    step="any"
                    value={e.qty}
                    onChange={(ev) => updateEntry(it.productId, { qty: ev.target.value })}
                    className="!px-2.5 !py-1.5 text-xs font-bold text-ink"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                    Keterangan (opsional)
                  </label>
                  <Input
                    type="text"
                    placeholder="misal: kurir paket 1"
                    value={e.note}
                    onChange={(ev) => updateEntry(it.productId, { note: ev.target.value })}
                    className="!px-2.5 !py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Tanggal Penerimaan">
          <Input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="text-xs font-semibold"
          />
        </Field>
        <Field label="Catatan Penerimaan (opsional)">
          <Input
            value={generalNote}
            onChange={(e) => setGeneralNote(e.target.value)}
            placeholder="contoh: Pengiriman tahap pertama via kurir..."
          />
        </Field>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
          {error}
        </p>
      )}
    </Modal>
  );
}

/* =========================================================================
   Formulir Pembatalan Pesanan
   ========================================================================= */
function CancelModal({ open, order, onClose, onConfirm }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open || !order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Batalkan Pesanan?"
      size="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Kembali
          </Btn>
          <Btn
            variant="soft"
            className="!bg-rose-500 !text-white hover:!bg-rose-600"
            onClick={() => onConfirm(reason)}
          >
            Ya, Batalkan Pesanan
          </Btn>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div className="text-xs leading-relaxed text-ink-soft">
          <p className="font-bold text-ink">
            Anda yakin ingin membatalkan pesanan <span className="text-rose-600">{order.id}</span>?
          </p>
          <p className="mt-1">
            Status pesanan akan diubah menjadi <span className="font-bold">Dibatalkan</span>.
            Jika sudah ada barang yang sempat diterima sebelumnya, stok barang tersebut{' '}
            <span className="font-bold text-ink">tidak akan dihapus</span> dari inventaris.
          </p>
        </div>
      </div>

      <Field label="Alasan Pembatalan (opsional)" className="mt-4">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="contoh: Toko kehabisan stok / ganti toko pemasok..."
        />
      </Field>
    </Modal>
  );
}

/* =========================================================================
   Formulir Tutup Pesanan & Catat Kekurangan Barang
   ========================================================================= */
function CloseShortageModal({ open, order, onClose, onConfirm }) {
  const [reason, setReason] = useState('Pemasok kehabisan stok barang');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setReason('Pemasok kehabisan stok barang');
      setNote('');
    }
  }, [open]);

  if (!open || !order) return null;

  const unfulfilled = (order.items || [])
    .map((it) => ({
      name: it.productNameSnapshot,
      sisa: Math.max(0, Number(it.quantity || 0) - Number(it.receivedQuantity || 0)),
      unit: it.unitName,
    }))
    .filter((it) => it.sisa > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tutup Pesanan & Catat Kekurangan"
      subtitle="Selesaikan pesanan ini dan otomatis catat sisa barang yang belum dikirim ke daftar kekurangan untuk dibeli kembali."
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Btn variant="soft" onClick={onClose}>
            Batal
          </Btn>
          <Btn
            variant="primary"
            icon={CheckCircle2}
            onClick={() => onConfirm({ reason, note })}
          >
            Selesaikan & Catat Kekurangan
          </Btn>
        </div>
      }
    >
      <div className="space-y-3.5 text-xs">
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 leading-relaxed">
          <p className="font-bold text-amber-950">
            Daftar sisa barang yang akan dicatat sebagai kekurangan:
          </p>
          <ul className="mt-2 list-disc pl-4 space-y-1">
            {unfulfilled.map((u, i) => (
              <li key={i}>
                <strong>{u.name}</strong>: {formatQty(u.sisa)} {u.unit} belum terkirim
              </li>
            ))}
          </ul>
        </div>

        <Field label="Alasan Penutupan / Kekurangan">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="contoh: Pemasok kehabisan stok / barang kosong di agen..."
          />
        </Field>

        <Field label="Catatan Tambahan (Opsional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Catatan tambahan untuk evaluasi pembelian ulang..."
          />
        </Field>
      </div>
    </Modal>
  );
}
