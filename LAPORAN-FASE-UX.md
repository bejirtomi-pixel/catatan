# Laporan Fase — Perapihan & Peningkatan UX

Fase selesai. Aplikasi Warung Madura dirapikan fokus pada **Halaman Barang**, **Detail Barang**, **penyelarasan mobile/desktop**, dan **aksi cepat** — tanpa mengubah struktur data, tanpa backend baru, dan tanpa merusak fitur lama. Semua data tetap di `localStorage` (`wm_v1_*`) dan teruji ulang (193 cek).

## Lingkup & hasil verifikasi
- Verifier E2E (`e2e/verify.mjs`) kini berisikan **193 cek: 147 cek regresi lama + 46 cek UX baru**, dipindai pada 4 breakpoint: **1366 / 768 / 390 / 360**.
- Hasil: **193 lolos, 0 gagal** (barang, form, info barang, pesanan, stok, toko, pengaturan, dashboard, dan UX baru).
- Tidak ada perubahan format data / kunci `localStorage`, tidak ada migrasi paksa; seed tetap berlaku.

## Perubahan per area
- **Tabel Barang (desktop)** — Kolom dirapikan: Foto, Nama (+pill unggulan/promo/B1G1), Kategori, Satuan & Harga, Supplier (`Toko Makmur • Toko Jaya • +2`), Stok (angka cepat `35 pcs`/`3 dus` + badge Tersedia/Menipis/Habis), Aksi (edit/hapus).
- **Kartu produk (mobile)** — tabel diganti kartu (foto 1:1, kategori, supplier singkat, harga, stok + status, tombol Detail/Edit/Hapus). Tabel master disembunyikan di layar < md, card disembunyikan di ≥ md.
- **Filter cepat** — dua baris chip: Kategori (`Semua/Makanan/Minuman/Cemilan/Sembako/Lainnya`) dan Stok (`Semua/Tersedia/Menipis/Habis`). Status stok pakai `minStock` yang sudah ada: `qty<=0` Habis, `qty<minStock` Menipis, selain itu Tersedia. Kategori memakai pemetaan kata kunci agar chip tetap ringkas meski kategori bebas teks (mis. `Makanan Ringan` → Cemilan, `Bahan Pokok` → Sembako).
- **Detail Barang (modal)** — hero foto `1:1`, nama + kategori, badge status stok, stok cepat + Min stok, blok Satuan & Harga (relasi `1 dus = 40 pcs = Rp132.000`, satuan dasar ditandai), daftar Supplier, blok Informasi Barang (Unggulan/Promo/B1G1/Iklan + judul/deskripsi promo + deskripsi), footer `Tutup`.
- **Aksi cepat** di Detail Barang (2×2):
  - **Edit Barang** → form terbuka prefilled (langsung, tanpa pindah halaman).
  - **Tambah Stok** → buka halaman Stok dengan **Penyesuaian Stok** sudah pilih barang tsb.
  - **Buat Pesanan** → buka Toko, toko tujuan di-set ke pemasok pertama barang tsb, barang **masuk keranjang** (berbasis satuan besar = acuan pembelian).
  - **Lihat Riwayat** → buka halaman Stok, modal **Riwayat** terfilter per barang tersebut.
- **Stok** — halaman menerima `openAdjustFor` / `showHistoryFor`, menampilkan modal yang sesuai; Riwayat dapat di-filter per barang.
- **Toko** — menerima `{ storeId, addProductId }` untuk persiapan pesanan; bila keranjang sudah berisi toko lain, muncul konfirmasi ganti toko (perilaku existing, tidak diubah).
- **Navigasi mobile** — bottom nav 5 menu (Dashboard/Barang/Pesanan/Stok/Laporan) `md:hidden`; **Pengaturan** diakses lewat ikon gerigi di header (mobile); footer disederhanakan di mobile (`max-md:hidden`), konten diberi ruang bawah `pb-28` agar tidak tertutup navbar.
- **Empty state** — pesan berbeda untuk pencarian tanpa hasil vs filter tanpa hasil, dengan tombol **Reset Filter**.
- **Mikro-interaksi & konsistensi** — tombol `active:scale-95`, chip filter aktif berwarna `primary`, badge status konsisten (rose/amber/emerald), ikon Lucide konsisten, semua menggunakan sistem tema 6 warna yang sudah ada.
- **Form barang** — tetap terkelompok (foto barang / informasi dasar / toko pemasok / satuan & konversi / keterangan khusus), label & placeholder dipertahankan, kategori diberi saran `datalist`.

## Perbaikan bug yang ditemukan saat verifikasi
1. **`isActive is not defined`** — di Layout, variabel render-prop `NavLink` dipakai di luar scope; diperbaiki memakai render-prop `children`.
2. **`ProductFlags is not defined`** — tabel master memakai `ProductFlags` tanpa impor; impor ditambahkan.
3. **Quick action antar-halaman "tidak berfungsi"** — akar masalah: efek yang membersihkan state navigasi (`navigate(_, { state: null })`) memicu **remount rute** sehingga state hasil (keranjang/prefill/modal) ikut tereset. Perbaikan: hapus pembersihan via navigasi, ganti pelindung re-trigger dengan `useRef` + `location.key` (satu kali proses per entri; tombol Back/Forward tidak membuka ulang modal secara tak terduga).

## Konstrain yang dijaga
- Tidak membuat ulang aplikasi; fitur lama tetap berjalan (semua cek regresi A–G hijau).
- Tanpa backend/database; tetap `localStorage` `wm_v1_`.
- Bukan aplikasi POS; konsep **supplier → pesanan → stok → laporan** dipertahankan.
- Tidak ada sistem data ganda; tanpa migrasi struktur yang memaksa.
- Halaman Laporan/Pesanan/Pengaturan tidak dirombak secara struktural (hanya diselaraskan tata letak melalui Layout & tema).

## Catatan
- Penanda uji `data-testid` (`daftar-barang-table`, `daftar-barang-card`) ditambahkan ke dua kontainer daftar barang agar verifikasi konsisten di semua breakpoint; tidak memengaruhi UI.
- File probe debug (`probe-*.mjs`) berada di luar repo (`%TEMP%\opencode\e2e`) dan tidak ikut distribusi.