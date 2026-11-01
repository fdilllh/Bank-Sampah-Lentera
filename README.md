# Bank Sampah Lentera

Aplikasi frontend statis berbasis HTML, CSS, dan JavaScript. Login dan data menggunakan Supabase langsung dari browser. Tidak ada server Node.js saat aplikasi berjalan atau saat di-host di GitHub Pages. Vite dan Node/npm hanya diperlukan di komputer pengembang untuk membangun aset statis.

## Struktur tampilan

Setiap fitur memiliki folder dan file HTML templatenya sendiri di `src/pages/`:

- `masuk/index.html`
- `ringkasan/index.html`
- `nasabah/index.html`
- `barang/index.html`
- `penimbangan/index.html`
- `penarikan/index.html`
- `transaksi/index.html`
- `laporan/index.html`

`src/main.js` mengatur data dan interaksi tombol. Folder `src/pages/admin/` dan `src/pages/pengurus/` memiliki HTML, JavaScript menu, dan CSS terpisah untuk tiap peran. Fitur operasional yang dipakai bersama tetap berada di folder fitur masing-masing, seperti `src/pages/nasabah/` dan `src/pages/penimbangan/`. `src/styles/main.css` memuat gaya umum dan layout responsif; `index.html` utama menjadi kerangka aplikasi.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env`.
2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` dari Supabase Project Settings → API Keys.
3. Jalankan `npm install`, lalu `npm run dev`.

## Supabase dan keamanan

1. Jalankan seluruh `supabase/schema.sql` di Supabase SQL Editor. Jika skema lama pernah dipakai, jalankan lagi untuk menambahkan policy akses browser.
2. Buat admin pertama lewat Authentication → Users → Add user, lalu hubungkan profilnya lewat SQL Editor:

   ```sql
   insert into public.user_profiles (id, email, full_name, role)
   select id, email, 'Administrator', 'admin'
   from auth.users where email = 'email-admin-anda@example.com'
   on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = 'admin';
   ```

3. Admin dapat membuat akun admin/petugas lewat menu Pengguna menggunakan Supabase Auth Signup, tanpa secret key server. Jika konfirmasi email aktif, pemilik akun perlu mengonfirmasi email sebelum login. Nasabah hanya dicatat sebagai data nasabah dan tidak membutuhkan akun.
4. Secret/service role key jangan pernah dimasukkan ke file frontend atau GitHub. Publishable key memang terlihat di browser; RLS pada `schema.sql` yang melindungi akses data.

## Hosting GitHub Pages

1. Push folder proyek ke repository GitHub.
2. Di repository, buka **Settings → Secrets and variables → Actions → Variables**, lalu buat:
   - `VITE_SUPABASE_URL` = URL project Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key Supabase.
3. Buka **Settings → Pages**, pada **Build and deployment** pilih **GitHub Actions**.
4. Push perubahan ke branch `main`; workflow `.github/workflows/pages.yml` akan membangun dan menerbitkan aplikasi.

Workflow `.github/workflows/supabase-heartbeat.yml` juga membaca jumlah baris pada tabel jenis barang satu kali sehari, pukul 09.00 WIB. Jalankan ulang bagian terbaru `supabase/schema.sql` agar fungsi `heartbeat_read()` tersedia. Workflow memakai `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` yang sama dari **Settings → Secrets and variables → Actions → Variables**. Pemeriksaan hanya menerima jumlah baris; isi tabel tidak dikirim ke GitHub Actions.

GitHub Pages hanya menghosting frontend statis. Proses build dilakukan oleh GitHub Actions; pengguna tidak perlu menjalankan Node.js server.

## Fitur

- Login admin/petugas, dashboard saldo dan transaksi.
- Data nasabah, jenis sampah dan harga.
- Hanya admin yang dapat menambah, mengubah, atau menghapus jenis barang. Barang yang sudah dipakai pada transaksi dinonaktifkan saat dihapus agar riwayat lama tetap utuh.
- Penimbangan dengan pilihan masuk tabungan atau cair langsung.
- Penarikan tabungan, riwayat, dan laporan bulanan.
- Cetak ringkasan, daftar nasabah/barang, riwayat transaksi, dan laporan bulanan melalui dialog cetak browser.
- RLS Supabase membatasi data dan operasi berdasarkan peran.
