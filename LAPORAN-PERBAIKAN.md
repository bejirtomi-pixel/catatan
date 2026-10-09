# Laporan Perbaikan — Audit Ulang & Perbaiki Fitur Catatan Warung Madura

Tanggal: 9 Oktober 2026
Struktur: 5 bagian laporan terpisah sebagaimana diminta.

---

## 1. Perubahan yang Selesai

### A. Informasi Barang dipindah ke halaman Stok (tab)
- Halaman Barang kini murni menjadi **master barang** (nama/kategori/foto/satuan/harga/min-stok/relasi pemasok). Semua pengelolaan **Informasi Barang** (Barang Unggulan, Promo, Deskripsi Produk) pindah ke halaman **Stok** sebagai dua tab:
  - **Inventaris Stok** — tabel stok + penyesuaian/penerimaan/riwayat (fungsi lama utuh).
  - **Informasi Barang** — 3 sub-tab (Barang Unggulan / Promo / Deskripsi Produk) + pencarian per tab + toggle Aktif/Nonaktif + tombol hapus info + pembuka form InfoBarang.
- **Tidak ada duplikasi data**: InfoBarang tetap membaca/menulis `product` (field `featured`, `promo`, `promoTitle`, `promoDescription`, `description`, `advertisement`) — data yang sama, hanya tampilannya dipindah.
- **Stok 0 tetap muncul dan bisa dikelola** di Informasi Barang (kolom stok per tab).
- **Toggle Aktif/Nonaktif ≠ hapus barang**: hanya menonaktifkan info di tab; barang, foto, harga, dan relasi pemasok tetap utuh di master.
- Dashboard: seksi "Info Barang" menampilkan barang unggulan/promo/iklan; tombol "Lihat semua" mengarah ke `/stok` dan langsung membuka tab Informasi Barang (`location.state`).
- Detail produk: bagian InfoBarang terkait langsung dibuka dari Informasi Barang; teks kosong mengarahkan ke tab tersebut.

### B. Buy 1 Get 1 dihapus total
- Dihapus dari: form Barang (toggle + textarea + payload), sub-tab & tabel InfoBarang, badge di ProductImage, Detail Produk, Dashboard (filter highlights), dan komponen terkait.
- Data lama aman: fungsi `stripBuyOneGetOne` di AppContext membersihkan field `buyOneGetOne`/`b1g1Description` dari produk lama pada saat data dimuat, tanpa menghapus produk itu sendiri.
- Seed diperbarui: `p-mie` tidak lagi mengandung field B1G1.

### C. Pengelolaan harga pemasok (per relasi barang–pemasok)
- Model baru: key `wm_v1_storePrices` = array `{ id, storeId, productId, unitId, price, updatedAt }` (disimpan per satuan, per barang, per pemasok). Harga default tetap harga di `product.units[]`; `priceOfStore(storeId, productId, unitId)` mengembalikan harga khusus pemasok bila ada (fallback default). Migrasi aman: jika struktur berubah, migrator lama menolak dan data dibiarkan.
- Alur "Kelola Harga" di Toko (tombol di bar "Barang Toko Terpilih"):
  1. Pilih **satu pemasok** (select di depan modal).
  2. Muncul daftar barang yang terhubung ke pemasok itu, tiap baris = produk × satuan, menampilkan **harga lama** + kolom **harga baru**.
  3. Centang **barang mana saja** yang ingin diubah.
  4. Panel **Pratinjau Perubahan (n baris)** menampilkan Barang / Harga Lama / Harga Baru sebelum disimpan.
  5. Simpan hanya berjalan setelah konfirmasi; tanpa pilihan → tombol simpan nonaktif; harga kosong/≤0 → validasi "harus berupa angka lebih dari 0".
- Larangan dipatuhi: tanpa input persentase; mengubah hanya pemasok yang dipilih; **tidak mengubah harga jual**; **tidak mengubah snapshot pesanan lama** (`priceRef`/`priceActual` sudah ter-snapshot di saat pesanan dibuat); **harga baru bertahan setelah reload** (dipersist di localStorage).
- Harga khusus pemasok dipakai juga oleh: acuan di tabel Order, harga default kotak "harga", quick action "Buat Pesanan", dan `ProductDetailModal` (`onCreateOrder`). Saat berpindah pemasok, OrderTable di-`key` oleh `storeId` sehingga harga/qty direset benar.
- Saat toko dihapus → `storePrices` milik toko itu ikut dibersihkan; saat produk dihapus → `storePrices` produk itu dibersihkan.

### D. Responsif (1366 / 768 / 390 / 360)
- Barang, Toko, Stok, Pesanan, Laporan, Pengaturan: tidak ada lagi overflow horizontal di keempat lebar (diuji: `scrollWidth − clientWidth ≤ 1`).
- Barang/Stok memakai tabel desktop + kartu mobile; Toko memakai order font + keranjang di bawah (mobile) / di kanan (desktop); tabel lebar (OrderTable & Pesanan) tetap memakai `overflow-x-auto` agar tetap bisa dibaca tanpa memotong kolom.
- Stok: tab + InfoBarang meresponsif (tabel desktop `md:block`, kartu mobile `md:hidden`).

### E. Perlindungan data (`wm_v1_*`)
- Tidak ada reset/penghapusan localStorage di alur normal. Semua kunci lama (products, stores, orders, stocks, movements, settings, …) tetap dibaca; hanya ditambah kunci baru `wm_v1_storePrices`.
- Snapshot laporan & pesanan lama tidak diubah oleh perubahan harga katalog (bukti: order seed gula karung tetap `priceActual 700.000` setelah harga pemasok diubah).

---

## 2. File yang Diubah

| File | Perubahan |
| --- | --- |
| `src/context/AppContext.jsx` | `stripBuyOneGetOne`; model `storePrices` (+ `migrateStorePrice`), state & persist `wm_v1_storePrices`, `priceOfStore`, `saveStorePrices`, cleanup di `deleteStore`/`deleteProduct`, `resetData`; ekspos di value |
| `src/pages/Stok.jsx` | Tab Inventaris Stok / Informasi Barang; komponen InfoBarang + InfoProductCard + modals (tambah/edit/hapus-confirm); efek `location.state` (infoTab / penyesuaian / riwayat); responsif tabel/kartu |
| `src/pages/Barang.jsx` | Hapus InfoBarang, sub-tab B1G1, form B1G1; master barang + form tetap; **dropdown kategori dinamis dari `products[].category` + datalist form dinamis (hapus daftar hardcoded)** |
| `src/pages/Toko.jsx` | OrderTable `key={storeId}` + acuan/harga default dari `priceOfStore`; tombol "Kelola Harga"; komponen `ManagePriceModal` (alur 5 langkah); addToCart/quick-action harga efektif; perbaikan responsif (select max-w, flex-wrap) |
| `src/pages/Dashboard.jsx` | Highlights tanpa B1G1; "Lihat semua" → `/stok` (tab Informasi Barang); teks kosong mengarah ke tab |
| `src/components/ProductImage.jsx` | ProductFlags tanpa B1G1 (badge naik/turun `previousPrice`/`priceChange` tetap) |
| `src/components/ProductDetailModal.jsx` | Hapus info B1G1 & import Gift; teks kosong arah ke tab Informasi Barang di Stok |
| `src/data/seed.js` | `p-mie` tanpa field B1G1 |
| `LAPORAN-PERBAIKAN.md` | Laporan ini |
| *(verifikasi)* `C:\Users\TEFA\AppData\Local\Temp\opencode\e2e\verify.mjs` | Ekspektasi lama dibuang, tes baru ditambahkan (lihat bagian 3) |

---

## 3. Hasil Pengujian

- `npm run build` → **sukses** (1961 modul, `index-DGcbwCF5.js` 463,79 kB / gzip 136,11 kB; CSS 37,75 kB).
- Verifikasi E2E otomatis (`node verify.mjs`, Puppeteer + Chrome, server `npm run preview`): **242 lolos, 0 gagal**.

Rincian tes baru/update yang relevan dengan spek:
- **Tab Informasi Barang di Stok**: tab Inventaris Stok & Informasi Barang ada; kolom "Stok Warung"; konten Unggulan (Gula) & Promo (judul+keterangan); pencarian per tab; hapus info (≠ hapus barang) membersihkan promo; toggle nonaktif ≠ hapus (produk count tetap 10, Gula tetap di master); **stok 0 tetap tampil ('0 kg')**; setelah toko dihapus, produk + info + foto tetap.
- **Buy 1 Get 1 hilang**: form barang tanpa "buy 1 get 1"; stok tanpa badge B1G1; chip fitur (ungulan/promo/iklan) tetap ada; migrasi data lama dengan field B1G1 aman (strip saat load).
- **Harga pemasok**: pilih barang Gula kg di modal Kelola Harga → pratinjau muncul → validasi harga >0 → simpan; hanya pemasok terpilih yang berubah (`only st-makmur`, tanpa Minyak); **snapshot pesanan lama tidak berubah (gula karung tetap 700.000)**; acuan di Toko menampilkan harga baru setelah pilih satuan kg; bertahan setelah reload; pemasok lain (st-jaya) tetap harga lama 15.000.
- **Responsif 4 breakpoint (1366/768/390/360)**: Barang, Toko, Stok, Pesanan, Laporan, Pengaturan tanpa overflow horizontal; Stok info = tabel desktop vs kartu mobile sesuai lebar; navbar bawah di mobile.

---

## 4. Fitur yang Belum Selesai / Catatan

- Tidak ada perbaikan yang tertinggal dari 6 bagian spek. Semua selesai dan lulus uji.
- Catatan kecil (bukan kekurangan fungsional):
  - OrderTable di Toko menampilkan satuan default = satuan terakhir (kemasan terbesar, mis. karung/dus). Harga acuan per pemasok bisa dilihat dengan memilih satuan lain (mis. kg). Ini perilaku lama yang dipertahankan.
  - Tabel Toko & Pesanan menggunakan scroll horizontal di bawah 680–820 px (konten tabel tetap utuh, bukan terpotong).
  - `know:shift`-Harga khusus pemasok ditandai sebagai data terpisah; tidak ada penanda visual "harga khusus" pada baris di OrderTable selain nilai acuan yang berbeda dari harga master. (Opsional, bisa ditambah kemudian.)

---

## 5. Risiko Migrasi Data

- **Kunci lama `wm_v1_*` tidak dihapus atau dipindah**; seluruh data lama (products, stores, orders, stocks, movements, settings, dll.) tetap dibaca oleh migrator yang sama.
- Produk lama yang masih mengandung field `buyOneGetOne`/`b1g1Description` akan dibersihkan field-nya saat dimuat (`stripBuyOneGetOne`) — **tidak menghapus produk**, hanya membuang field B1G1 karena fiturnya sudah dihapus.
- `wm_v1_storePrices` adalah **kunci baru**: browser/instalasi tanpa kunci ini berjalan normal (fallback ke harga master). Kunci ini diabaikan jika `migrateStorePrice` mendapati struktur tak dikenal.
- Pesanan/laporan lama tidak tersentuh; snapshot `priceRef`/`priceActual` per item tetap menjadi sumber riwayat.
- Satu-satunya tabel yang diinisialisasi ulang adalah seed demo (`?seed=`). Produksi / data pengguna tidak direset.
- Toleransi: jika `wm_v1_storePrices` korup (bukan array), migrator menolak dan aplikasi memakai harga master (safe fallback) — data lama tetap tersimpan di localStorage.

---

## 6. Perubahan Tambahan — Dropdown Kategori Dinamis

### Audit kondisi kategori
- Kategori disimpan **hanya sebagai field teks bebas di setiap produk** (`product.category`). Tidak ada entitas/registry kategori terpisah di localStorage, dan **tidak ada fitur pengelolaan kategori** (tidak ada form/CRUD kategori sendiri di aplikasi).
- Karena itu sumber data kategori yang dipakai aplikasi = **nilai `category` unik yang ada pada data produk** (seed: Sembako, Bahan Pokok, Makanan Ringan, Minuman, Pembersih). Nilai kategori dibuat lewat form Barang (datalist).
- **Tidak dibuat daftar kategori kedua.** Satu-satunya sumber tetap `products[].category`.

### Perubahan
- `src/pages/Barang.jsx`:
  - Daftar hardcoded `CAT_FILTERS` dan `categoryGroup` (pengelompokan ke 5 cabang) **dihapus**.
  - Filter kategori kini **dropdown dinamis** (`<select data-testid="filter-kategori">`) yang opsinya dihitung dari `distinctCategories(products)` — setiap kategori baru pada produk langsung muncul tanpa mengubah kode; kategori yang diubah/dihapus otomatis menyesuaikan opsi tanpa menyentuh data barang.
  - Opsi **"Semua"** dipertahankan sebagai pilihan default; filter mencocokkan kategori secara presisi.
  - Karena data produk dipersist di `wm_v1_products`, setelah halaman dimuat ulang dropdown tetap terisi dan filter tetap berfungsi.
  - `datalist` saran kategori pada form Barang juga diturunkan dari sumber yang sama (sebelumnya hardcoded `['Makanan','Minuman','Cemilan','Sembako','Lainnya']`); hint form diperbarui (kategori baru bisa dibuat dengan mengetik nilai baru).
- Filter status stok (Tersedia/Menipis/Habis) tidak berubah (bukan bagian kategori).

### Usulan minimal (tambahan, opsional)
Karena belum ada fitur pengelolaan kategori, perubahan minimal yang disarankan jika ingin "menu kategori" tersendiri: tab/form pengelolaan kategori yang membaca daftar ini (dari `products[].category`), dengan operasi rename/hapus yang memetakan ulang ke semua produk terkait. Ini tidak wajib untuk memenuhi permintaan dropdown dinamis dan sengaja tidak dibuat agar tidak mengarang fitur yang belum tersedia.

### Hasil uji
- `npm run build` sukses.
- Verifikasi E2E: **254 lolos, 0 gagal** — termasuk tes baru di 4 breakpoint: opsi dropdown = data aktual (Semua + Sembako + Bahan Pokok + Makanan Ringan + Minuman + Pembersih), filter presisi per kategori, berganti kategori, kembali ke "Semua" menampilkan seluruh barang.