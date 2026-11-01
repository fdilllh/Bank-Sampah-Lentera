-- Skema utama Bank Sampah Lentera sesuai formulir timbang dan rekap bulanan BSL.
-- Jalankan seluruh file ini satu kali pada Supabase SQL Editor.

-- Data warga/nasabah dan jumlah tabungan berjalan.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phone text,
  address text,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

-- Profil login dan peran aktor aplikasi; akun autentikasi dibuat melalui Supabase Auth.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text not null,
  role text not null check (role in ('admin', 'petugas', 'nasabah')),
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_profiles_customer_role_check check (role <> 'nasabah' or customer_id is not null)
);

-- Tambahkan alamat email juga bila tabel profil sudah dibuat oleh versi skema lama.
alter table public.user_profiles add column if not exists email text;

-- Daftar jenis barang, kategori, nomor barang, dan harga pembelian per kg.
create table if not exists public.waste_items (
  id uuid primary key default gen_random_uuid(),
  category text,
  code text,
  name text not null unique,
  unit text not null default 'kg' check (unit in ('kg', 'unit')),
  price_per_kg numeric(14,2) not null default 0 check (price_per_kg >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Satu baris transaksi per lembar formulir penimbangan atau penarikan.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references public.customers(id),
  user_id uuid references auth.users(id),
  date date not null,
  type text not null default 'weighing' check (type in ('weighing', 'withdrawal')),
  total_weight numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  source_file text,
  created_at timestamptz not null default now()
);

-- Detail jenis barang yang ditimbang pada sebuah transaksi.
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  item_id uuid not null references public.waste_items(id),
  item_name text not null,
  category text,
  price_per_kg numeric(14,2) not null,
  unit text not null default 'kg' check (unit in ('kg', 'unit')),
  weight_kg numeric(14,3) not null check (weight_kg > 0),
  amount numeric(14,2) not null,
  created_at timestamptz not null default now()
);

-- Laporan bulanan historis dari workbook rekap Jan–Des.
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  customer_count integer,
  total_weight numeric(14,2),
  gross_amount numeric(14,2),
  deduction_amount numeric(14,2),
  net_amount numeric(14,2),
  source_file text,
  created_at timestamptz not null default now(),
  unique (year, month)
);

-- Nomor baris sumber Excel ikut disimpan untuk keperluan audit hasil migrasi.
alter table public.transaction_items add column if not exists source_row integer;

-- Semua tabel memerlukan sesi masuk; policy di bawah memberi akses sesuai peran.
alter table public.customers enable row level security;
alter table public.user_profiles enable row level security;
alter table public.waste_items enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.monthly_reports enable row level security;

-- Fungsi SQL atomik mencatat formulir, rincian kg/rupiah, dan penambahan saldo.
-- Hapus signature lama agar skema bisa diperbarui dengan pilihan pencairan langsung.
drop function if exists public.create_weighing(uuid, date, text, uuid, text, jsonb);

create or replace function public.create_weighing(
  p_customer_id uuid,
  p_date date,
  p_reference text,
  p_user_id uuid,
  p_source_file text,
  p_items jsonb,
  p_cash_out boolean default false,
  p_cash_out_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.transactions;
  v_total_weight numeric(14,3) := 0;
  v_total_amount numeric(14,2) := 0;
  v_line jsonb;
  v_item public.waste_items;
  v_weight numeric(14,3);
  v_price numeric(14,2);
  v_amount numeric(14,2);
begin
  if auth.uid() is null or auth.uid() <> p_user_id or not public.is_lentera_staff() then
    raise exception 'Hanya petugas yang masuk yang boleh mencatat penimbangan.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Formulir harus berisi setidaknya satu jenis barang.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception 'Nasabah tidak ditemukan.';
  end if;

  insert into public.transactions (reference, customer_id, user_id, date, type, source_file)
  values (p_reference, p_customer_id, p_user_id, p_date, 'weighing', p_source_file)
  returning * into v_transaction;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    select * into v_item from public.waste_items where id = (v_line->>'item_id')::uuid and active = true;
    if not found then raise exception 'Jenis barang tidak ditemukan atau nonaktif.'; end if;
    v_weight := (v_line->>'weight_kg')::numeric;
    v_price := coalesce(nullif(v_line->>'price_per_kg', '')::numeric, v_item.price_per_kg);
    if v_weight <= 0 then raise exception 'Berat harus lebih dari nol.'; end if;
    v_amount := round(v_weight * v_price, 2);

    insert into public.transaction_items (transaction_id, item_id, item_name, category, price_per_kg, unit, weight_kg, amount)
    values (v_transaction.id, v_item.id, v_item.name, v_item.category, v_price, v_item.unit, v_weight, v_amount);

    if v_item.unit = 'kg' then v_total_weight := v_total_weight + v_weight; end if;
    v_total_amount := v_total_amount + v_amount;
  end loop;

  update public.transactions set total_weight = v_total_weight, total_amount = v_total_amount where id = v_transaction.id returning * into v_transaction;
  update public.customers set balance = balance + v_total_amount where id = p_customer_id;

  -- Bila petugas memilih pencairan langsung, catat arus keluar dan jangan tinggalkan saldo baru.
  if p_cash_out then
    if p_cash_out_reference is null then raise exception 'Nomor pencairan langsung wajib tersedia.'; end if;
    insert into public.transactions (reference, customer_id, user_id, date, type, total_amount)
    values (p_cash_out_reference, p_customer_id, p_user_id, p_date, 'withdrawal', v_total_amount);
    update public.customers set balance = balance - v_total_amount where id = p_customer_id;
  end if;
  return to_jsonb(v_transaction);
end;
$$;

-- Fungsi SQL atomik untuk merekam penarikan tanpa mengizinkan saldo negatif.
create or replace function public.create_withdrawal(
  p_customer_id uuid,
  p_date date,
  p_reference text,
  p_user_id uuid,
  p_amount numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers;
  v_transaction public.transactions;
begin
  if auth.uid() is null or auth.uid() <> p_user_id or not public.is_lentera_staff() then
    raise exception 'Hanya petugas yang masuk yang boleh mencatat penarikan.';
  end if;
  select * into v_customer from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Nasabah tidak ditemukan.'; end if;
  if p_amount <= 0 then raise exception 'Nominal penarikan harus lebih dari nol.'; end if;
  if v_customer.balance < p_amount then raise exception 'Saldo tabungan tidak mencukupi.'; end if;

  insert into public.transactions (reference, customer_id, user_id, date, type, total_amount)
  values (p_reference, p_customer_id, p_user_id, p_date, 'withdrawal', p_amount)
  returning * into v_transaction;
  update public.customers set balance = balance - p_amount where id = p_customer_id;
  return to_jsonb(v_transaction);
end;
$$;

-- Periksa peran di dalam database agar policy aman tanpa server Node.
create or replace function public.is_lentera_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_profiles where id = auth.uid() and role in ('admin', 'petugas')); $$;

-- Pemeriksaan admin terpisah untuk operasi pengelolaan akun.
create or replace function public.is_lentera_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'); $$;

-- Mengizinkan nasabah melihat transaksi dan data saldo miliknya saja.
create or replace function public.can_access_lentera_customer(p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_lentera_staff() or exists (select 1 from public.user_profiles where id = auth.uid() and role = 'nasabah' and customer_id = p_customer_id); $$;

-- Pemeriksaan terjadwal membaca tabel harga tanpa membuka isi atau harga barang ke publik.
create or replace function public.heartbeat_read()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select count(*)::integer from public.waste_items; $$;

-- Data profil hanya dapat dilihat sendiri; admin dapat melihat daftar profil semua aktor.
drop policy if exists profiles_read_self_or_admin on public.user_profiles;
create policy profiles_read_self_or_admin on public.user_profiles for select to authenticated
using (id = auth.uid() or public.is_lentera_admin());
drop policy if exists profiles_admin_insert on public.user_profiles;
create policy profiles_admin_insert on public.user_profiles for insert to authenticated with check (public.is_lentera_admin());
drop policy if exists profiles_admin_update on public.user_profiles;
create policy profiles_admin_update on public.user_profiles for update to authenticated using (public.is_lentera_admin()) with check (public.is_lentera_admin());

-- Nasabah boleh membaca data dan saldo sendiri; petugas mengelola seluruh data nasabah.
drop policy if exists customers_read_allowed on public.customers;
create policy customers_read_allowed on public.customers for select to authenticated using (public.can_access_lentera_customer(id));
drop policy if exists customers_staff_insert on public.customers;
create policy customers_staff_insert on public.customers for insert to authenticated with check (public.is_lentera_staff());
drop policy if exists customers_staff_update on public.customers;
create policy customers_staff_update on public.customers for update to authenticated using (public.is_lentera_staff()) with check (public.is_lentera_staff());

-- Semua pengguna masuk dapat membaca harga; hanya admin yang boleh mengelola daftar barang.
drop policy if exists items_read_authenticated on public.waste_items;
create policy items_read_authenticated on public.waste_items for select to authenticated using (true);
drop policy if exists items_staff_insert on public.waste_items;
drop policy if exists items_staff_update on public.waste_items;
drop policy if exists items_admin_insert on public.waste_items;
create policy items_admin_insert on public.waste_items for insert to authenticated with check (public.is_lentera_admin());
drop policy if exists items_admin_update on public.waste_items;
create policy items_admin_update on public.waste_items for update to authenticated using (public.is_lentera_admin()) with check (public.is_lentera_admin());
drop policy if exists items_admin_delete on public.waste_items;
create policy items_admin_delete on public.waste_items for delete to authenticated using (public.is_lentera_admin());

-- Riwayat transaksi dan rincian dibatasi untuk petugas atau pemilik tabungan terkait.
drop policy if exists transactions_read_allowed on public.transactions;
create policy transactions_read_allowed on public.transactions for select to authenticated using (public.can_access_lentera_customer(customer_id));
drop policy if exists transaction_items_read_allowed on public.transaction_items;
create policy transaction_items_read_allowed on public.transaction_items for select to authenticated using (exists (select 1 from public.transactions t where t.id = transaction_id and public.can_access_lentera_customer(t.customer_id)));

-- Laporan bulanan hanya terlihat dan dapat dikelola oleh petugas.
drop policy if exists reports_staff_all on public.monthly_reports;
create policy reports_staff_all on public.monthly_reports for all to authenticated using (public.is_lentera_staff()) with check (public.is_lentera_staff());

-- RPC transaksi dapat dipanggil akun login; fungsi memeriksa peran dan identitas pemanggil.
revoke all on function public.create_weighing(uuid, date, text, uuid, text, jsonb, boolean, text) from public, anon;
grant execute on function public.create_weighing(uuid, date, text, uuid, text, jsonb, boolean, text) to authenticated;
revoke all on function public.create_withdrawal(uuid, date, text, uuid, numeric) from public, anon;
grant execute on function public.create_withdrawal(uuid, date, text, uuid, numeric) to authenticated;
grant execute on function public.is_lentera_staff() to authenticated;
grant execute on function public.is_lentera_admin() to authenticated;
grant execute on function public.can_access_lentera_customer(uuid) to authenticated;
revoke all on function public.heartbeat_read() from public;
grant execute on function public.heartbeat_read() to anon, authenticated;

-- Hak SQL minimum untuk frontend; RLS di atas tetap membatasi baris yang dapat diakses.
grant select on public.user_profiles, public.customers, public.waste_items, public.transactions, public.transaction_items, public.monthly_reports to authenticated;
grant insert, update on public.customers, public.waste_items, public.monthly_reports to authenticated;
grant delete on public.waste_items to authenticated;

-- Indeks mendukung laporan dan riwayat transaksi menurut tanggal serta nasabah.
create index if not exists transactions_date_idx on public.transactions(date desc);
create index if not exists transactions_customer_idx on public.transactions(customer_id, date desc);
create index if not exists transaction_items_transaction_idx on public.transaction_items(transaction_id);

-- Harga awal mengikuti Form Harga per Juni 2026; elektronik dibedakan per unit.
insert into public.waste_items (category, code, name, price_per_kg, unit) values
  ('KERTAS','1.1','Buku Tulis / Pelajaran / Campur',1600,'kg'),('KERTAS','1.2','Hvs / Putihan',1800,'kg'),('KERTAS','1.3','Kardus / Box',1600,'kg'),('KERTAS','1.4','Koran (Bagus)',3000,'kg'),('KERTAS','1.5','Majalah / Buku LKS',500,'kg'),('KERTAS','1.6','Boncos',500,'kg'),
  ('PLASTIK','2.1','Botol Bersih dan Galon Le Mineral',4200,'kg'),('PLASTIK','2.2','Botol / Gelas Mineral kotor',1500,'kg'),('PLASTIK','2.3','Botol Warna',500,'kg'),('PLASTIK','2.4','Thinwall / PP No. 5 (Bening)',3500,'kg'),('PLASTIK','2.5','Thinwall / PP No. 5 (Warna : selain Hitam & Coklat)',2000,'kg'),('PLASTIK','2.6','Ember Campur / Emberan',1500,'kg'),('PLASTIK','2.7','Ember Hitam / Pot Bunga',800,'kg'),('PLASTIK','2.8','Gelas Bersih',3500,'kg'),('PLASTIK','2.9','Asoy / Kresek (Tanpa Selotape dan Lakban)',300,'kg'),('PLASTIK','2.10','Asoy / Plastik Campur (Ada selotape dan Lakban)',100,'kg'),('PLASTIK','2.11','Plastik Khusus: Plastik Mie / Roti / Tisu / Gula',150,'kg'),('PLASTIK','2.12','PE',500,'kg'),('PLASTIK','2.13','Selang Air / Pralon',1000,'kg'),('PLASTIK','2.14','Tutup Botol',3000,'kg'),('PLASTIK','2.15','Tutup Galon / LD',4000,'kg'),('PLASTIK','2.16','Botol Galon (Per Unit)',3000,'kg'),
  ('LOGAM','3.1','Alumunium',11000,'kg'),('LOGAM','3.2','Besi',4200,'kg'),('LOGAM','3.3','Kabin, Paku, Besi Kerompong, Baja Ringan',2200,'kg'),('LOGAM','3.4','Kaleng',2000,'kg'),('LOGAM','3.5','Kuningan',40000,'kg'),('LOGAM','3.6','Seng / Kawat',700,'kg'),('LOGAM','3.7','Tembaga',80000,'kg'),
  ('IMPACT','4.1','Impact: R. Nyamuk, K. Air, Aksesori Motor, Helm, Tape',300,'kg'),('IMPACT','4.2','Printer Tanpa Tinta',300,'kg'),('IMPACT','4.3','Yakult',500,'kg'),('BELING','5.1','Beling',300,'kg'),
  ('AKI','6.1','Aki',10000,'kg'),('KARPET','78.1','Karpet Talang, Karpet Plastik, Karpet Kabel',500,'kg'),('KEPING CD','8.1','Keping CD / Kristal Putih',4500,'kg'),('MINYAK JELANTAH','9.1','Minyak Jelantah',6500,'kg'),
  ('LAIN-LAIN (RESIDU PLASTIK)','10.1','Styrofoam',1000,'kg'),('LAIN-LAIN (RESIDU PLASTIK)','10.2','Tetrapak',100,'kg'),('LAIN-LAIN (RESIDU PLASTIK)','10.3','Multilayer / MLP',100,'kg'),('LAIN-LAIN (RESIDU PLASTIK)','10.4','Mika',50,'kg'),('LAIN-LAIN (RESIDU PLASTIK)','10.5','Kabel',1000,'kg'),
  ('ELEKTRONIK','1','AC 1 set',200000,'unit'),('ELEKTRONIK','2','Outdoor AC',150000,'unit'),('ELEKTRONIK','3','Komputer 1 set',75000,'unit'),('ELEKTRONIK','4','CPU Komplit',40000,'unit'),('ELEKTRONIK','5','Printer Komplit (Ada Tinta)',5000,'unit'),('ELEKTRONIK','6','Handphone (HP)',5000,'unit'),('ELEKTRONIK','7','Kulkas',50000,'unit'),('ELEKTRONIK','8','Laptop',50000,'unit'),('ELEKTRONIK','9','Laptop Tanpa Baterai',40000,'unit'),('ELEKTRONIK','10','Notebook',25000,'unit'),('ELEKTRONIK','11','Notebook Tanpa Baterai',20000,'unit'),('ELEKTRONIK','12','Mesin Cuci Komplit',50000,'unit'),('ELEKTRONIK','13','TV Tabung 14" / Monitor',10000,'unit'),('ELEKTRONIK','14','TV Tabung 21"',20000,'unit'),('ELEKTRONIK','15','TV Tabung 29"',30000,'unit'),('ELEKTRONIK','16','TV LCD / LED < 32"',25000,'unit'),('ELEKTRONIK','17','TV LCD > 32" & LED/LCD 32"',50000,'unit'),('ELEKTRONIK','18','TV LED > 32"',100000,'unit'),('ELEKTRONIK','19','TV Flat Layar Retak/Flek',25000,'unit')
on conflict (name) do nothing;

-- Buat admin pertama di Authentication > Users, lalu tautkan UUID-nya di SQL Editor:
-- insert into public.user_profiles (id, email, full_name, role)
-- select id, email, 'Administrator', 'admin' from auth.users where email = 'admin@contoh.com'
-- on conflict (id) do update set email = excluded.email, role = 'admin';
