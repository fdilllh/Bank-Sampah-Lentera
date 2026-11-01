import './styles/main.css';
// CSS khusus tiap fitur; aturan umum (warna, tombol, tabel, layout) tetap di styles/main.css.
import './pages/masuk/style.css';
import './pages/pengguna/style.css';
import './pages/ringkasan/style.css';
import './pages/nasabah/style.css';
import './pages/barang/style.css';
import './pages/penimbangan/style.css';
import './pages/penarikan/style.css';
import './pages/transaksi/style.css';
import './pages/laporan/style.css';
// Styles dan menu HTML/JS dipisah berdasarkan peran admin dan pengurus.
import './pages/admin/style.css';
import './pages/pengurus/style.css';
import { createClient } from '@supabase/supabase-js';
import adminMenuTemplate from './pages/admin/index.html?raw';
import pengurusMenuTemplate from './pages/pengurus/index.html?raw';
import { adminMenu } from './pages/admin/main.js';
import { pengurusMenu } from './pages/pengurus/main.js';
import loginTemplate from './pages/masuk/index.html?raw';
import usersTemplate from './pages/pengguna/index.html?raw';
import dashboardTemplate from './pages/ringkasan/index.html?raw';
import customersTemplate from './pages/nasabah/index.html?raw';
import itemsTemplate from './pages/barang/index.html?raw';
import weighingTemplate from './pages/penimbangan/index.html?raw';
import withdrawalTemplate from './pages/penarikan/index.html?raw';
import transactionsTemplate from './pages/transaksi/index.html?raw';
import reportsTemplate from './pages/laporan/index.html?raw';

// Konfigurasi UI yang boleh dibaca browser. Salin .env.example menjadi .env.
const CONFIG = { supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '', publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '' };
// Supabase browser client memakai publishable key; keamanan data tetap ditentukan oleh RLS.
const supabase = CONFIG.supabaseUrl && CONFIG.publishableKey ? createClient(CONFIG.supabaseUrl, CONFIG.publishableKey) : null;
const state = { page: 'dashboard', sidebarOpen: !window.matchMedia('(max-width: 760px)').matches, search: '', date: new Date().toISOString().slice(0, 10), profile: null, users: [], customers: [], items: [], transactions: [], monthlyReports: [], stats: {}, notice: '', busy: false };
const app = document.querySelector('#app');
// Utilitas untuk format Rupiah, angka Indonesia, teks aman, dan token sesi.
const idr = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const num = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value || 0));
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const token = () => localStorage.getItem('lentera-session') || '';

// Mengubah pesan galat umum dari layanan menjadi keterangan berbahasa Indonesia.
function pesanGalat(error) {
  const source = String(error?.message || error || '').toLowerCase();
  if (source.includes('email not confirmed')) return 'Alamat email belum dikonfirmasi. Periksa kotak masuk email Anda.';
  if (source.includes('invalid login credentials') || source.includes('invalid credentials')) return 'Alamat email atau kata sandi tidak sesuai.';
  if (source.includes('already registered') || source.includes('already been registered')) return 'Alamat email tersebut sudah terdaftar.';
  if (source.includes('password') && (source.includes('short') || source.includes('least'))) return 'Kata sandi terlalu pendek.';
  if (source.includes('failed to fetch') || source.includes('network')) return 'Tidak dapat terhubung. Periksa koneksi internet Anda.';
  // Pesan buatan aplikasi sudah berbahasa Indonesia; pesan layanan lain disederhanakan.
  if (['hanya ', 'nama,', 'fitur ', 'akun ', 'alamat ', 'sesi ', 'profil ', 'jenis ', 'formulir ', 'berat ', 'saldo ', 'nominal ', 'email tersebut'].some(word => source.includes(word))) return error?.message || String(error);
  return 'Terjadi kendala saat menghubungi layanan. Periksa koneksi atau pengaturan akses, lalu coba kembali.';
}

// Mengisi placeholder {{NAMA}} pada HTML fitur dengan nilai dari state aplikasi.
function fillTemplate(template, values) { return Object.entries(values).reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value ?? '')), template); }

// Router data langsung ke Supabase; tidak ada API Node atau secret key dalam aplikasi statis.
async function api(path, options = {}) {
  if (!supabase) throw new Error('VITE_SUPABASE_URL atau VITE_SUPABASE_PUBLISHABLE_KEY belum diatur.');
  const payload = options.body ? JSON.parse(options.body) : {};
  const method = options.method || 'GET';
  const result = (await (async () => {
    if (path === '/profil') { const { data: { user }, error: authError } = await supabase.auth.getUser(); if (authError || !user) throw new Error('Sesi login tidak terbaca. Silakan masuk kembali.'); const { data, error } = await supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle(); if (error) throw error; if (!data) throw new Error(`Profil untuk ${user.email || 'akun ini'} belum ada atau belum bisa dibaca. Jalankan ulang supabase/schema.sql, lalu tautkan akun di SQL Editor menggunakan email yang sama.`); return data; }
    if (path === '/pengguna' && method === 'GET') { const { data, error } = await supabase.from('user_profiles').select('*').neq('role', 'nasabah').order('created_at', { ascending: false }); if (error) throw error; return data; }
    if (path === '/nasabah' && method === 'GET') { let query = supabase.from('customers').select('*').order('name'); if (state.profile?.role === 'nasabah') query = query.eq('id', state.profile.customer_id); const { data, error } = await query; if (error) throw error; return data; }
    if (path === '/nasabah' && method === 'POST') { const { count, error: countError } = await supabase.from('customers').select('id', { count: 'exact', head: true }); if (countError) throw countError; const { data, error } = await supabase.from('customers').insert({ name: payload.name.trim(), code: `NSB-${String((count || 0) + 1).padStart(4, '0')}`, phone: payload.phone || null, address: payload.address || null }).select().single(); if (error) throw error; return data; }
    if (path === '/jenis-sampah' && method === 'GET') { const { data, error } = await supabase.from('waste_items').select('*').order('category').order('code').order('name'); if (error) throw error; return data; }
    if (path === '/jenis-sampah' && method === 'POST') { if (state.profile?.role !== 'admin') throw new Error('Hanya admin yang boleh menambah jenis barang.'); const { data, error } = await supabase.from('waste_items').insert({ ...payload, name: payload.name.trim() }).select().single(); if (error) throw error; return data; }
    if (path.startsWith('/jenis-sampah/') && method === 'PATCH') { if (state.profile?.role !== 'admin') throw new Error('Hanya admin yang boleh mengubah jenis barang.'); const id = path.split('/').at(-1); const { data, error } = await supabase.from('waste_items').update({ ...payload, name: payload.name.trim() }).eq('id', id).select().single(); if (error) throw error; return data; }
    if (path.startsWith('/jenis-sampah/') && method === 'DELETE') { if (state.profile?.role !== 'admin') throw new Error('Hanya admin yang boleh menghapus jenis barang.'); const id = path.split('/').at(-1); const { count, error: countError } = await supabase.from('transaction_items').select('id', { count: 'exact', head: true }).eq('item_id', id); if (countError) throw countError; if (count) { const { error } = await supabase.from('waste_items').update({ active: false }).eq('id', id); if (error) throw error; return { archived: true }; } const { error } = await supabase.from('waste_items').delete().eq('id', id); if (error) throw error; return { archived: false }; }
    if (path === '/transaksi' && method === 'GET') { const { data, error } = await supabase.from('transactions').select('*, customers(name)').order('date', { ascending: false }).limit(500); if (error) throw error; return data.map(row => ({ ...row, customer_name: row.customers?.name || '' })); }
    if (path === '/laporan' && method === 'GET') { if (state.profile?.role === 'nasabah') return []; const { data, error } = await supabase.from('monthly_reports').select('*').order('year', { ascending: false }).order('month', { ascending: false }); if (error) throw error; return data; }
    if (path === '/dashboard' && method === 'GET') { const [customers, transactions] = await Promise.all([supabase.from('customers').select('id,balance'), supabase.from('transactions').select('type,total_amount,total_weight')]); if (customers.error) throw customers.error; if (transactions.error) throw transactions.error; return { customer_count: customers.data.length, total_weight: transactions.data.filter(t => t.type === 'weighing').reduce((sum, t) => sum + Number(t.total_weight || 0), 0), total_deposit: transactions.data.filter(t => t.type === 'weighing').reduce((sum, t) => sum + Number(t.total_amount || 0), 0), total_balance: customers.data.reduce((sum, c) => sum + Number(c.balance || 0), 0) }; }
    if (path === '/penimbangan' && method === 'POST') { const date = payload.date || new Date().toISOString().slice(0, 10); const reference = await makeReference(date); const cashOutReference = payload.cash_out ? await makeReference(date, 'withdrawal') : null; const { data: { user } } = await supabase.auth.getUser(); const { data, error } = await supabase.rpc('create_weighing', { p_customer_id: payload.customer_id, p_date: date, p_reference: reference, p_user_id: user.id, p_source_file: payload.source_file || null, p_items: payload.items, p_cash_out: !!payload.cash_out, p_cash_out_reference: cashOutReference }); if (error) throw error; return data; }
    if (path === '/penarikan' && method === 'POST') { const date = payload.date || new Date().toISOString().slice(0, 10); const reference = await makeReference(date, 'withdrawal'); const { data: { user } } = await supabase.auth.getUser(); const { data, error } = await supabase.rpc('create_withdrawal', { p_customer_id: payload.customer_id, p_date: date, p_reference: reference, p_user_id: user.id, p_amount: Number(payload.amount) }); if (error) throw error; return data; }
    if (path === '/pengguna' && method === 'POST') {
      // Signup dilakukan lewat client terpisah agar sesi admin saat ini tidak tertimpa sesi akun baru.
      if (state.profile?.role !== 'admin') throw new Error('Hanya admin yang boleh membuat akun.');
      const role = ['admin', 'petugas'].includes(payload.role) ? payload.role : '';
      if (!payload.full_name?.trim() || !payload.email?.trim() || String(payload.password || '').length < 8 || !role) throw new Error('Nama, email, peran, dan kata sandi minimal 8 karakter wajib diisi.');
      const signupClient = createClient(CONFIG.supabaseUrl, CONFIG.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data: signup, error: signupError } = await signupClient.auth.signUp({ email: payload.email.trim(), password: payload.password, options: { data: { full_name: payload.full_name.trim() } } });
      if (signupError) throw signupError;
      if (!signup.user || (signup.user.identities && signup.user.identities.length === 0)) throw new Error('Email tersebut sudah terdaftar atau tidak dapat dipakai.');
      const { data: profile, error: profileError } = await supabase.from('user_profiles').insert({ id: signup.user.id, email: payload.email.trim(), full_name: payload.full_name.trim(), role, customer_id: null }).select().single();
      if (profileError) throw new Error(`Akun berhasil dibuat, tetapi data profil gagal disimpan. Periksa aturan akses pada schema.sql sebelum mencoba kembali.`);
      return profile;
    }
    throw new Error(`Fitur ${path} belum didukung.`);
  })());
  return result;
}

// Login memakai Supabase Auth dan menyimpan token sesi pada browser.
async function login(email, password) {
  if (!CONFIG.supabaseUrl || !CONFIG.publishableKey) throw new Error('URL atau publishable key Supabase belum diisi di .env. Restart Vite setelah mengubah .env.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  localStorage.setItem('lentera-session', data.session.access_token);
  localStorage.setItem('lentera-user', JSON.stringify(data.user));
  try { await loadData(); }
  catch (error) { await supabase.auth.signOut(); localStorage.removeItem('lentera-session'); localStorage.removeItem('lentera-user'); throw error; }
}

// Memuat data utama untuk ringkasan dan daftar pada menu aplikasi.
async function loadData() {
  state.profile = await api('/profil');
  const [customers, items, transactions, stats, monthlyReports] = await Promise.all([api('/nasabah'), api('/jenis-sampah'), api('/transaksi'), api('/dashboard'), api('/laporan')]);
  state.customers = customers; state.items = items; state.transactions = transactions; state.stats = stats; state.monthlyReports = monthlyReports;
}

// Membuat nomor transaksi unik secara praktis berdasarkan transaksi yang terlihat bagi akun.
async function makeReference(date, type = 'weighing') {
  const { count, error } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('date', date).eq('type', type);
  if (error) throw error;
  return `${type === 'weighing' ? 'BSL' : 'WDR'}-${date.replaceAll('-', '')}-${String((count || 0) + 1).padStart(3, '0')}`;
}

// Menampilkan halaman login dari template HTML fitur login.
function renderLogin() {
  app.innerHTML = fillTemplate(loginTemplate, { BUTTON_TEXT: state.busy ? 'Sedang masuk…' : 'Masuk', ERROR: state.notice ? `<p class="notice error">${safe(state.notice)}</p>` : '' });
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form); const button = form.querySelector('button');
    state.busy = true; state.notice = ''; button.disabled = true; button.textContent = 'Sedang masuk…';
    try { await login(data.get('email'), data.get('password')); render(); }
    catch (error) { state.notice = pesanGalat(error); let notice = form.querySelector('.notice'); if (!notice) { notice = document.createElement('p'); notice.className = 'notice error'; form.querySelector('.hint').before(notice); } notice.textContent = state.notice; }
    finally { state.busy = false; if (document.querySelector('#login-form')) { const currentButton = document.querySelector('#login-form button'); currentButton.disabled = false; currentButton.textContent = 'Masuk'; } }
  });
}
// Menampilkan shell navigasi utama dan isi menu yang sedang dipilih.
function render() {
  if (!token()) return renderLogin();
  const user = JSON.parse(localStorage.getItem('lentera-user') || '{}');
  // Menu admin dan pengurus diambil dari folder khusus peran; nasabah memiliki menu baca sendiri.
  const role = state.profile?.role;
  const nav = role === 'nasabah' ? [['dashboard', 'Ringkasan'], ['transaksi', 'Riwayat Transaksi']] : role === 'admin' ? adminMenu : pengurusMenu;
  const menuTemplate = role === 'admin' ? adminMenuTemplate : pengurusMenuTemplate;
  const navHtml = role === 'nasabah' ? nav.map(([key, label]) => `<button class="nav-link ${state.page === key ? 'active' : ''}" data-page="${key}">${label}</button>`).join('') : fillTemplate(menuTemplate, { LINKS: nav.map(([key, label]) => `<button class="nav-link ${state.page === key ? 'active' : ''}" data-page="${key}">${label}</button>`).join('') });
  const roleLabels = { admin: 'Administrator', petugas: 'Petugas bank sampah', nasabah: 'Nasabah' };
  app.innerHTML = `<aside class="sidebar ${state.sidebarOpen ? 'is-open' : 'is-closed'}"><a class="brand" href="#dashboard"><span class="brand-mark">♻</span><span><b>Bank Sampah</b><small>Lentera</small></span></a><p class="nav-label">MENU ${role === 'admin' ? 'ADMIN' : role === 'petugas' ? 'PENGURUS' : 'NASABAH'}</p>${navHtml}<div class="sidebar-bottom"><div class="profile"><span class="avatar">${safe((user.email || 'P').slice(0, 1).toUpperCase())}</span><span><b>${safe(user.email || 'Petugas')}</b><small>${roleLabels[role] || 'Pengguna'}</small></span></div><button id="logout" class="nav-link">Keluar</button></div></aside>${state.sidebarOpen && window.innerWidth <= 760 ? '<button id="sidebar-overlay" class="sidebar-overlay" aria-label="Tutup menu"></button>' : ''}<main class="main ${state.sidebarOpen ? '' : 'sidebar-closed'}"><header class="topbar"><div class="topbar-title"><button id="menu-toggle" class="menu-toggle" aria-label="Buka atau tutup menu" aria-expanded="${state.sidebarOpen}">☰</button><div><span class="eyebrow">BANK SAMPAH LENTERA</span><h1>${nav.find(entry => entry[0] === state.page)?.[1] || 'Ringkasan'}</h1></div></div><div class="top-date">${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}</div><button class="button secondary print-action" data-print>Cetak halaman</button></header><section class="content">${pageContent()}</section></main><div id="toast" class="toast ${state.notice ? 'show' : ''}">${safe(state.notice)}</div>`;
  document.querySelector('#menu-toggle').addEventListener('click', () => { state.sidebarOpen = !state.sidebarOpen; render(); });
  document.querySelector('#sidebar-overlay')?.addEventListener('click', () => { state.sidebarOpen = false; render(); });
  app.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', async () => { state.page = button.dataset.page; state.notice = ''; if (window.innerWidth <= 760) state.sidebarOpen = false; if (state.page === 'pengguna') { try { state.users = await api('/pengguna'); } catch (error) { state.notice = pesanGalat(error); } } render(); }));
  document.querySelector('#logout').addEventListener('click', async () => { await supabase.auth.signOut(); localStorage.removeItem('lentera-session'); localStorage.removeItem('lentera-user'); renderLogin(); });
  bindPageActions();
}

// Membentuk konten halaman sesuai fitur pengelolaan yang dipilih.
function pageContent() {
  if (state.page === 'pengguna') return usersPage();
  if (state.page === 'dashboard') return dashboardPage();
  if (state.page === 'nasabah') return customersPage();
  if (state.page === 'barang') return itemsPage();
  if (state.page === 'penimbangan') return weighingPage();
  if (state.page === 'penarikan') return withdrawalPage();
  if (state.page === 'transaksi') return transactionsPage();
  if (state.page === 'laporan') return reportPage();
  return dashboardPage();
}

// Menampilkan daftar akun aktor dari template HTML khusus.
function usersPage() {
  const roleLabels = { admin: 'Admin', petugas: 'Petugas', nasabah: 'Nasabah' };
  const rows = state.users.filter(account => account.role !== 'nasabah').map(account => `<tr><td><b>${safe(account.full_name)}</b></td><td>${safe(account.email || account.id)}</td><td><span class="badge">${roleLabels[account.role] || safe(account.role)}</span></td><td>${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(account.created_at))}</td></tr>`).join('') || emptyRow(4, 'Belum ada akun petugas lain.');
  return fillTemplate(usersTemplate, { DESCRIPTION: 'Akun login hanya untuk admin dan petugas. Nasabah dicatat pada menu Nasabah & Tabungan.', ROWS: rows });
}
// Menyusun statistik dan aktivitas terkini ke dalam template dashboard HTML.
function dashboardPage() {
  const stats = state.stats;
  const isCustomer = state.profile?.role === 'nasabah';
  return fillTemplate(dashboardTemplate, {
    CUSTOMER_LABEL: isCustomer ? 'AKUN TABUNGAN SAYA' : 'NASABAH TERDAFTAR', CUSTOMER_COUNT: num(stats.customer_count), CUSTOMER_NOTE: isCustomer ? 'akun nasabah terhubung' : 'nasabah terdaftar',
    TOTAL_WEIGHT: num(stats.total_weight), WEIGHT_NOTE: isCustomer ? 'Total timbang Anda' : 'Total semua penimbangan', TOTAL_DEPOSIT: idr(stats.total_deposit), DEPOSIT_NOTE: isCustomer ? 'Nilai setoran Anda' : 'Total tabungan yang masuk',
    BALANCE_LABEL: isCustomer ? 'SALDO SAYA' : 'SALDO NASABAH', TOTAL_BALANCE: idr(stats.total_balance), BALANCE_NOTE: isCustomer ? 'Saldo tabungan Anda' : 'Saldo yang masih tersimpan',
    ACTIVITY_TITLE: isCustomer ? 'Riwayat penimbangan saya' : 'Penimbangan terakhir', WEIGH_BUTTON: isCustomer ? '' : '<button class="button primary" data-goto="penimbangan">Catat penimbangan</button>',
    TRANSACTION_TABLE: transactionTable(state.transactions.slice(0, 8)), INFO_TITLE: isCustomer ? 'Informasi tabungan Anda' : 'Sesuai formulir penimbangan Lentera',
    INFO_DESCRIPTION: isCustomer ? 'Halaman ini menampilkan saldo dan transaksi milik akun nasabah yang sedang masuk.' : 'Data disimpan per nasabah, jenis barang, berat (kg), harga satuan, dan nilai rupiah.'
  });
}
// Menampilkan dan mencari data nasabah memakai template HTML fitur nasabah.
function customersPage() {
  const q = state.search.toLowerCase();
  const rows = state.customers.filter(customer => `${customer.name} ${customer.code || ''} ${customer.address || ''}`.toLowerCase().includes(q));
  const body = rows.map(customer => `<tr><td><span class="code">${safe(customer.code || '—')}</span></td><td><b>${safe(customer.name)}</b></td><td>${safe(customer.phone || '—')}</td><td>${safe(customer.address || '—')}</td><td class="right"><b>${idr(customer.balance)}</b></td></tr>`).join('') || emptyRow(5, 'Nasabah belum terdaftar.');
  return fillTemplate(customersTemplate, { SEARCH: safe(state.search), COUNT: rows.length, ROWS: body });
}
// Menampilkan tabel harga; admin saja yang mendapat tombol kelola barang.
function itemsPage() {
  const isAdmin = state.profile?.role === 'admin';
  const rows = state.items.map(item => `<tr><td>${safe(item.category || 'Lainnya')}</td><td><span class="code">${safe(item.code || '—')}</span></td><td><b>${safe(item.name)}</b></td><td>${item.unit === 'unit' ? 'Per unit' : 'Kg'}</td><td class="right">${idr(item.price_per_kg)}</td><td><span class="badge">${safe(item.active === false ? 'Nonaktif' : 'Aktif')}</span></td>${isAdmin ? `<td class="no-print"><div class="button-group"><button class="button secondary" data-action="edit-item" data-id="${safe(item.id)}">Ubah</button><button class="button danger" data-action="delete-item" data-id="${safe(item.id)}">Hapus</button></div></td>` : ''}</tr>`).join('') || emptyRow(isAdmin ? 7 : 6, 'Daftar jenis barang belum diisi.');
  return fillTemplate(itemsTemplate, { ADD_BUTTON: isAdmin ? '<button class="button primary" data-action="add-item">Tambah jenis barang</button>' : '', ACTION_HEADER: isAdmin ? '<th class="no-print">AKSI</th>' : '', ROWS: rows });
}
// Menyiapkan pilihan nasabah dan baris barang pada template formulir timbang.
function weighingPage() {
  const customers = state.customers.map(customer => `<option value="${safe(customer.id)}">${safe(customer.code || '')} · ${safe(customer.name)}</option>`).join('');
  return fillTemplate(weighingTemplate, { CUSTOMERS: customers, DATE: state.date, WEIGHT_ROW: weightRow() });
}
// Satu baris input barang dengan harga yang otomatis mengikuti daftar harga aktif.
function weightRow(selected = '') {
  return `<tr class="weight-row"><td><select class="item-choice" required><option value="">Pilih barang</option>${state.items.filter(item => item.active !== false).map(item => `<option value="${safe(item.id)}" ${item.id === selected ? 'selected' : ''}>${safe(item.category ? `${item.category} - ` : '')}${safe(item.name)}</option>`).join('')}</select></td><td class="price-cell">-</td><td><input class="weight-input" type="number" min="0.01" step="0.01" placeholder="0,00" required></td><td class="amount-cell">Rp0</td><td><button class="icon-button remove-row" type="button" aria-label="Hapus baris">x</button></td></tr>`;
}

// Menampilkan riwayat setoran dan penarikan pada halaman transaksi.
function transactionsPage() { return fillTemplate(transactionsTemplate, { TABLE: transactionTable(state.transactions) }); }
// Mengisi pilihan nasabah dan tanggal pada template formulir penarikan.
function withdrawalPage() {
  const customers = state.customers.map(customer => `<option value="${safe(customer.id)}">${safe(customer.code || '')} - ${safe(customer.name)} (saldo ${idr(customer.balance)})</option>`).join('');
  return fillTemplate(withdrawalTemplate, { CUSTOMERS: customers, DATE: state.date });
}
// Tabel transaksi menunjukkan nomor formulir, nasabah, tanggal, berat, dan nilai.
function transactionTable(list) {
  return `<div class="table-wrap"><table><thead><tr><th>NO. FORMULIR</th><th>TANGGAL</th><th>NASABAH</th><th>JENIS</th><th class="right">BERAT</th><th class="right">NILAI</th></tr></thead><tbody>${list.map(trx => `<tr><td><span class="code">${safe(trx.reference || trx.id)}</span></td><td>${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(trx.date))}</td><td><b>${safe(trx.customer_name || '—')}</b></td><td><span class="badge ${trx.type === 'withdrawal' ? 'badge-orange' : ''}">${trx.type === 'withdrawal' ? 'Penarikan' : 'Penimbangan'}</span></td><td class="right">${trx.type === 'withdrawal' ? '—' : Number(trx.total_weight) ? `${num(trx.total_weight)} kg` : 'Per unit'}</td><td class="right"><b>${idr(trx.total_amount)}</b></td></tr>`).join('') || emptyRow(6, 'Belum ada transaksi tercatat.')}</tbody></table></div>`;
}

// Menghitung ringkasan per bulan, lalu menaruh barisnya di template laporan HTML.
function reportPage() {
  const byMonth = new Map();
  state.transactions.forEach(trx => { const month = trx.date.slice(0, 7); const row = byMonth.get(month) || { customers: new Set(), weight: 0, amount: 0, cashOut: 0 }; if (trx.type === 'weighing') { row.customers.add(trx.customer_id); row.weight += Number(trx.total_weight || 0); row.amount += Number(trx.total_amount || 0); } else { row.cashOut += Number(trx.total_amount || 0); } byMonth.set(month, row); });
  const importedMonths = new Set(state.monthlyReports.map(row => `${row.year}-${String(row.month).padStart(2, '0')}`));
  const rows = [...state.monthlyReports.map(row => ({ month: `${row.year}-${String(row.month).padStart(2, '0')}`, customers: row.customer_count, weight: row.total_weight, amount: row.gross_amount, net: row.net_amount })), ...[...byMonth].filter(([month]) => !importedMonths.has(month)).map(([month, row]) => ({ month, customers: row.customers.size, weight: row.weight, amount: row.amount, net: row.amount - row.cashOut }))].sort((a, b) => b.month.localeCompare(a.month));
  const body = rows.map(row => `<tr><td><b>${new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${row.month}-01T00:00:00`))}</b></td><td class="right">${num(row.customers)}</td><td class="right">${num(row.weight)} kg</td><td class="right">${idr(row.amount)}</td><td class="right"><b>${idr(row.net)}</b></td></tr>`).join('') || emptyRow(5, 'Belum ada data untuk dilaporkan.');
  return fillTemplate(reportsTemplate, { ROWS: body });
}
// Menjaga keluaran tabel tetap konsisten saat data belum tersedia.
function emptyRow(columns, message) { return `<tr><td class="empty" colspan="${columns}">${safe(message)}</td></tr>`; }

// Mengikat tombol, formulir, pencarian, dan perhitungan pada halaman aktif.
function bindPageActions() {
  app.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => { state.page = button.dataset.goto; render(); }));
  const search = document.querySelector('#search');
  if (search) search.addEventListener('input', event => { state.search = event.target.value; const selection = event.target.selectionStart; render(); document.querySelector('#search').focus(); document.querySelector('#search').setSelectionRange(selection, selection); });
  document.querySelector('[data-action="add-customer"]')?.addEventListener('click', showCustomerForm);
  document.querySelector('[data-action="add-item"]')?.addEventListener('click', showItemForm);
  app.querySelectorAll('[data-action="edit-item"]').forEach(button => button.addEventListener('click', () => showItemForm(button.dataset.id)));
  app.querySelectorAll('[data-action="delete-item"]').forEach(button => button.addEventListener('click', async () => {
    const item = state.items.find(row => row.id === button.dataset.id);
    if (!item || !window.confirm(`Hapus jenis barang "${item.name}" dari daftar aktif?`)) return;
    try { const result = await api(`/jenis-sampah/${item.id}`, { method: 'DELETE' }); await loadData(); render(); notify(result.archived ? 'Barang dinonaktifkan agar riwayat transaksi tetap utuh.' : 'Jenis barang berhasil dihapus.'); }
    catch (error) { notify(pesanGalat(error)); }
  }));
  document.querySelector('[data-action="add-user"]')?.addEventListener('click', showUserForm);
  document.querySelector('#add-weight-row')?.addEventListener('click', () => { document.querySelector('#weight-rows').insertAdjacentHTML('beforeend', weightRow()); bindWeightRows(); });
  if (document.querySelector('#weight-rows')) bindWeightRows();
  document.querySelector('#weigh-form')?.addEventListener('submit', saveWeighing);
  document.querySelector('#withdraw-form')?.addEventListener('submit', saveWithdrawal);
  app.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
}

// Memperbarui harga dan nilai total saat jenis barang atau berat diganti.
function bindWeightRows() {
  document.querySelectorAll('.weight-row').forEach(row => {
    const recalculate = () => { const item = state.items.find(entry => entry.id === row.querySelector('.item-choice').value); const weight = Number(row.querySelector('.weight-input').value || 0); row.querySelector('.price-cell').textContent = item ? `${idr(item.price_per_kg)} / ${item.unit === 'unit' ? 'unit' : 'kg'}` : '-'; row.querySelector('.weight-input').step = item?.unit === 'unit' ? '1' : '0.01'; row.querySelector('.weight-input').min = item?.unit === 'unit' ? '1' : '0.01'; row.querySelector('.weight-input').placeholder = item?.unit === 'unit' ? 'Jumlah' : '0,00'; row.querySelector('.amount-cell').textContent = idr(weight * Number(item?.price_per_kg || 0)); document.querySelector('#weight-total').textContent = idr([...document.querySelectorAll('.weight-row')].reduce((sum, line) => { const match = state.items.find(entry => entry.id === line.querySelector('.item-choice').value); return sum + Number(line.querySelector('.weight-input').value || 0) * Number(match?.price_per_kg || 0); }, 0)); };
    row.querySelector('.item-choice').addEventListener('change', recalculate); row.querySelector('.weight-input').addEventListener('input', recalculate);
    row.querySelector('.remove-row').addEventListener('click', () => { if (document.querySelectorAll('.weight-row').length > 1) row.remove(); recalculate(); });
  });
}

// Mengirim satu formulir timbang dan item-itemnya untuk ditambahkan ke saldo nasabah.
async function saveWeighing(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const customerId = form.get('customer_id');
  const lines = [...document.querySelectorAll('.weight-row')].map(row => ({ item_id: row.querySelector('.item-choice').value, weight_kg: Number(row.querySelector('.weight-input').value) })).filter(line => line.item_id && line.weight_kg > 0);
  if (!lines.length) return notify('Masukkan setidaknya satu berat barang.');
  try { await api('/penimbangan', { method: 'POST', body: JSON.stringify({ customer_id: customerId, date: form.get('date'), cash_out: form.get('disposition') === 'cairkan', items: lines }) }); await loadData(); state.notice = form.get('disposition') === 'cairkan' ? 'Penimbangan dicatat dan hasilnya langsung dicairkan.' : 'Penimbangan berhasil masuk ke tabungan.'; render(); } catch (error) { notify(pesanGalat(error)); }
}

// Mengirim penarikan dan memperbarui saldo dalam satu transaksi basis data.
async function saveWithdrawal(event) {
  event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget));
  try { await api('/penarikan', { method: 'POST', body: JSON.stringify({ customer_id: form.customer_id, date: form.date, amount: Number(form.amount) }) }); await loadData(); state.notice = 'Penarikan berhasil dicatat.'; render(); } catch (error) { notify(pesanGalat(error)); }
}

// Membuka formulir pendaftaran nasabah baru dengan informasi yang dipakai bank sampah.
function showCustomerForm() {
  openModal('Tambah nasabah', `<form id="customer-form"><label>Nama lengkap<input name="name" required></label><label>Nomor telepon<input name="phone"></label><label>Alamat<textarea name="address" rows="3"></textarea></label><div class="modal-actions"><button type="button" class="button secondary" data-close>Batal</button><button class="button primary">Simpan nasabah</button></div></form>`);
  document.querySelector('#customer-form').addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); try { await api('/nasabah', { method: 'POST', body: JSON.stringify(data) }); await loadData(); closeModal(); render(); } catch (error) { notify(pesanGalat(error)); } });
}

// Form tambah atau ubah barang. Hanya admin yang dapat membuka dialog ini.
function showItemForm(itemId = '') {
  if (state.profile?.role !== 'admin') return notify('Hanya admin yang boleh mengelola jenis barang.');
  const item = state.items.find(row => row.id === itemId);
  const title = item ? 'Ubah jenis barang' : 'Tambah jenis barang';
  openModal(title, `<form id="item-form"><label>Kategori<input name="category" value="${safe(item?.category || '')}" placeholder="Contoh: KERTAS"></label><label>Nomor barang<input name="code" value="${safe(item?.code || '')}" placeholder="Contoh: 1.1"></label><label>Nama barang<input name="name" value="${safe(item?.name || '')}" required placeholder="Contoh: Kardus / Box"></label><label>Satuan harga<select name="unit"><option value="kg" ${item?.unit !== 'unit' ? 'selected' : ''}>Per kg</option><option value="unit" ${item?.unit === 'unit' ? 'selected' : ''}>Per unit</option></select></label><label>Harga (Rp)<input name="price_per_kg" value="${safe(item?.price_per_kg ?? '')}" required min="0" type="number"></label>${item ? `<label class="check-label"><input name="active" type="checkbox" ${item.active !== false ? 'checked' : ''}> Barang aktif untuk transaksi baru</label>` : ''}<div class="modal-actions"><button type="button" class="button secondary" data-close>Batal</button><button class="button primary">${item ? 'Simpan perubahan' : 'Simpan jenis barang'}</button></div></form>`);
  document.querySelector('#item-form').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.price_per_kg = Number(data.price_per_kg); if (item) data.active = form.elements.active.checked; try { await api(item ? `/jenis-sampah/${item.id}` : '/jenis-sampah', { method: item ? 'PATCH' : 'POST', body: JSON.stringify(data) }); await loadData(); closeModal(); render(); notify(item ? 'Jenis barang berhasil diubah.' : 'Jenis barang berhasil ditambahkan.'); } catch (error) { notify(pesanGalat(error)); } });
}
// Membuat akun login Auth untuk admin atau petugas; nasabah hanya berupa data nasabah.
function showUserForm() {
  // Admin dapat membuat akun login melalui Supabase Auth; nasabah tetap hanya berupa data.
  openModal('Tambah akun aktor', `<form id="user-form"><label>Nama lengkap<input name="full_name" required></label><label>Email login<input name="email" type="email" required></label><label>Kata sandi sementara<input name="password" type="password" minlength="8" required><small class="muted">Minimal 8 karakter. Berikan kata sandi ini kepada petugas.</small></label><label>Peran<select name="role"><option value="petugas">Petugas</option><option value="admin">Admin</option></select></label><p class="hint">Jika konfirmasi email aktif di Supabase, pengguna perlu mengonfirmasi email sebelum login.</p><div class="modal-actions"><button type="button" class="button secondary" data-close>Batal</button><button class="button primary">Buat akun</button></div></form>`);
  document.querySelector('#user-form').addEventListener('submit', async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); try { await api('/pengguna', { method: 'POST', body: JSON.stringify(data) }); state.users = await api('/pengguna'); closeModal(); render(); notify('Akun aktor berhasil dibuat.'); } catch (error) { notify(pesanGalat(error)); } });
}

// Menampilkan dialog konsisten untuk pendaftaran nasabah dan barang baru.
function openModal(title, content) { app.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="modal"><section class="modal"><button class="icon-button modal-x" data-close aria-label="Tutup">×</button><h2>${safe(title)}</h2>${content}</section></div>`); document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeModal)); }
// Menutup dialog input tanpa mengubah data tersimpan.
function closeModal() { document.querySelector('#modal')?.remove(); }
// Menampilkan pesan singkat hasil simpan atau kesalahan validasi.
function notify(message) { const toast = document.querySelector('#toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3800); }

// Memulihkan sesi Supabase tersimpan lalu mengambil data yang diizinkan oleh RLS.
supabase?.auth.getSession().then(({ data, error }) => {
  if (error || !data.session) { localStorage.removeItem('lentera-session'); localStorage.removeItem('lentera-user'); return renderLogin(); }
  localStorage.setItem('lentera-session', data.session.access_token);
  localStorage.setItem('lentera-user', JSON.stringify(data.session.user));
  return loadData().then(render).catch(loadError => { state.notice = loadError.message; renderLogin(); });
}).catch(error => { state.notice = pesanGalat(error); renderLogin(); });
if (!supabase) renderLogin();
