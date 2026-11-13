export const cx = (...args) => args.filter(Boolean).join(' ');

export const rupiah = (n) => {
  const num = Number(n) || 0;
  const [int, dec] = Number(num.toFixed(2)).toString().split('.');
  let out = 'Rp' + Number(int).toLocaleString('id-ID');
  if (dec) out += ',' + dec;
  return out;
};

export const displayNum = (n) => {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : String(num);
};

export const formatDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const dateCompact = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(
    x.getDate()
  ).padStart(2, '0')}`;
};

export const dateKey = (d) => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(
    x.getDate()
  ).padStart(2, '0')}`;
};

// Mengambil tanggal lokal sistem (WIB/Indonesia) dalam format YYYY-MM-DD
export const getLocalDateString = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  const year = x.getFullYear();
  const month = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Mengonversi input YYYY-MM-DD menjadi ISO string yang tepat dengan waktu lokal
export const localDateToISO = (dateStr, timeMode = 'now') => {
  if (!dateStr) return new Date().toISOString();
  const parts = String(dateStr).split('-').map(Number);
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date().toISOString();
  }
  const [y, m, d] = parts;
  const date = new Date();
  date.setFullYear(y, m - 1, d);
  if (timeMode === 'start') {
    date.setHours(0, 0, 0, 0);
  } else if (timeMode === 'end') {
    date.setHours(23, 59, 59, 999);
  }
  return date.toISOString();
};

export const uid = (prefix = '') =>
  prefix +
  Math.random().toString(36).slice(2, 8) +
  Date.now().toString(36).slice(-4);

/* ---------- Angka jumlah ---------- */
export const formatQty = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};

export const round2 = (n) => Math.round(Number(n) * 100) / 100;

/* ---------- Satuan & konversi ---------- */
// units: [{ id, name, factor, price }], faktor = jumlah satuan dasar per 1 satuan ini.
// Satuan dasar adalah unit dengan factor === 1.

export const baseUnit = (units) => (units || []).find((u) => u.factor === 1) || (units || [])[0];

export const validUnits = (units) => {
  const list = Array.isArray(units) ? units : [];
  return list.filter((u) => u && Number(u.factor) > 0);
};

export const sortedUnits = (units) => {
  const list = validUnits(units);
  return [...list].sort((a, b) => Number(b.factor) - Number(a.factor));
};

export const unitToBase = (unit) => Number(unit && unit.factor ? unit.factor : 1);

export const baseToUnit = (baseQty, unit) => {
  const f = unitToBase(unit);
  return f > 0 ? baseQty / f : 0;
};

// Pecah jumlah dalam satuan dasar menjadi bagian satuan terbesar yang habis.
export const splitQty = (units, baseQty) => {
  const list = sortedUnits(units);
  const parts = [];
  let rest = Number(baseQty) || 0;
  for (const u of list) {
    const f = Number(u.factor) || 1;
    if (f <= 1) continue;
    const count = Math.floor(rest / f);
    if (count > 0) {
      parts.push({ unit: u.name, value: count });
      rest = round2(rest - count * f);
    }
  }
  const residual = round2(rest);
  if (residual > 0 || parts.length === 0) {
    const base = baseUnit(units);
    parts.push({ unit: base ? base.name : 'pcs', value: formatQty(residual) });
  }
  return parts.map((p) => ({ ...p, value: formatQty(p.value) }));
};

// Teks ramah: "3 dus 2 pcs"
export const qtyText = (units, baseQty) => {
  const parts = splitQty(units, baseQty);
  return parts.map((p) => `${p.value} ${p.unit}`).join(' ');
};

// Satuan tunggal terbesar yang membagi habis (untuk tampilan cepat).
export const pickUnit = (units, baseQty) => {
  const list = sortedUnits(units);
  const base = baseUnit(units);
  let num = Number(baseQty) || 0;
  for (const u of list) {
    const f = Number(u.factor) || 1;
    if (f > 1 && num >= f && Number.isInteger(Math.round((num / f) * 10000) / 10000)) {
      const v = num / f;
      if (Number.isInteger(Math.round(v * 100) / 100)) return { unit: u, value: v };
    }
  }
  return { unit: base, value: formatQty(num) };
};

export const refPriceForUnit = (units, unitId) => {
  const u = (units || []).find((x) => x.id === unitId);
  return u ? Number(u.price) : 0;
};

// Relasi satuan yang mudah dibaca, contoh: "1 dus = 40 pcs = Rp132.000"
export const unitRelations = (units) => {
  const list = sortedUnits(units);
  const base = baseUnit(units);
  return list
    .filter((u) => Number(u.factor) !== 1)
    .map((u) => ({
      name: u.name,
      factor: Number(u.factor),
      baseName: base ? base.name : 'pcs',
      price: Number(u.price) || 0,
      text: `1 ${u.name} = ${formatQty(u.factor)} ${base ? base.name : 'pcs'}`,
    }));
};