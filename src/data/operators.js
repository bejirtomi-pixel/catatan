/**
 * Konfigurasi & Operator Warung Madura Manual (Fase 1)
 *
 * Operator warung adalah sistem identitas operasional (kasir, pencatat mutasi).
 * Operator BUKAN akun Firebase terpisah dan BUKAN role keamanan.
 */

export const DEFAULT_OPERATORS = [
  { id: 'op-ainie', name: 'Ainie', status: 'aktif', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'op-ibu', name: 'Ibu', status: 'aktif', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'op-aa', name: 'AA', status: 'aktif', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'op-adik', name: 'Adik', status: 'aktif', createdAt: '2026-01-01T00:00:00.000Z' },
];

/**
 * Buat snapshot identitas operator yang abadi saat aktivitas dilakukan
 * Memastikan nama yang tersimpan adalah nama saat transaksi terjadi
 */
export function createOperatorSnapshot(operator) {
  if (!operator || typeof operator !== 'object') {
    return { operatorId: 'op-default', operatorName: 'Operator Warung' };
  }
  return {
    operatorId: operator.id || 'op-default',
    operatorName: String(operator.name || 'Operator Warung').trim(),
  };
}

/**
 * Validasi objek operator
 */
export function isValidOperator(op) {
  return (
    op &&
    typeof op === 'object' &&
    typeof op.id === 'string' &&
    op.id.startsWith('op-') &&
    typeof op.name === 'string' &&
    op.name.trim().length > 0 &&
    (op.status === 'aktif' || op.status === 'nonaktif')
  );
}
