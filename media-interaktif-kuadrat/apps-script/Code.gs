/** @OnlyCurrentDoc  (batasi izin skrip hanya ke Spreadsheet ini) */

/**
 * Penerima progres "Persamaan Kuadrat Interaktif" (Google Apps Script, terikat ke Google Sheet).
 *
 * Cara pakai singkat (lengkapnya di PANDUAN-GURU.md):
 *  1. Buka Google Sheet baru → Ekstensi → Apps Script → tempel file ini → Simpan.
 *  2. Jalankan fungsi `setup` sekali (izinkan akses). Kode kelas tampil di sheet "Pengaturan".
 *  3. Terapkan → Deployment baru → Aplikasi web → Jalankan sebagai: Saya, Akses: Siapa saja.
 *  4. Salin URL berakhiran /exec ke CONFIG.ENDPOINT di index.html.
 *
 * Keamanan yang diterapkan:
 *  - Kode kelas wajib cocok (disimpan di Script Properties, tidak ada di file HTML).
 *  - Validasi dan pemotongan semua isian; maksimal 50 kejadian per kiriman.
 *  - Pencegahan formula injection (nilai yang diawali = + - @ diberi tanda kutip).
 *  - Batas laju per sesi (CacheService) dan kunci tulis (LockService).
 *  - doGet hanya mengembalikan daftar siswa (kelas, absen, nama) bila kode kelas benar.
 *    Tidak ada jawaban atau progres yang pernah dikirim balik.
 *
 * Daftar siswa: tab "Daftar Siswa" dengan kolom Kelas | Nomor Absen | Nama.
 * Halaman siswa memuatnya untuk mengisi dropdown kelas dan nama.
 */

var SHEET_LOG = 'Log';
var SHEET_REKAP = 'Rekap Siswa';
var SHEET_SOAL = 'Rekap Soal';
var SHEET_SET = 'Pengaturan';
var SHEET_SISWA = 'Daftar Siswa';
var SISWA_HEADERS = ['Kelas', 'Nomor Absen', 'Nama'];
var CACHE_SISWA = 'daftar_siswa_v1';
var CACHE_SISWA_DETIK = 120; // perubahan di tab Daftar Siswa tampil paling lambat 2 menit
var MAX_EVENTS = 50;
var TOTAL_SOAL = 21; // jumlah soal di index.html; ubah jika soal ditambah
var RATE_PER_MIN = 120;
var LOG_HEADERS = ['Waktu server', 'Waktu perangkat', 'Kelas', 'Absen', 'Nama', 'Sesi', 'Jenis', 'Modul', 'Soal',
  'Tugas', 'Benar', 'Percobaan', 'Bantuan', 'Kode kesalahan', 'Keyakinan', 'Jawaban', 'Durasi (dtk)'];
var JENIS = ['mulai', 'jawab', 'bantuan', 'minta_guru', 'penjelasan', 'selesai_semua'];

/* ------------------------------------------------------------------ */
/* Menerima data                                                       */
/* ------------------------------------------------------------------ */
function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var res = handlePayload_(body);
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: 'format' });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.aksi === 'siswa') {
    try {
      return json_(handleDaftar_(p.kode));
    } catch (err) {
      return json_({ ok: false, error: 'server' });
    }
  }
  return json_({ ok: true, app: 'persamaan-kuadrat', info: 'Gunakan POST.' });
}

/** Mengirim daftar siswa untuk dropdown, hanya bila kode kelas cocok. */
function handleDaftar_(kodeMasuk) {
  var kode = PropertiesService.getScriptProperties().getProperty('KODE_KELAS');
  if (!kode) return { ok: false, error: 'belum_setup' };
  if (typeof kodeMasuk !== 'string' || kodeMasuk.trim().toUpperCase() !== kode.toUpperCase()) {
    return { ok: false, error: 'kode_salah' };
  }
  return { ok: true, kelas: daftarSiswa_() };
}

/**
 * Daftar siswa per kelas, urut nomor absen: [{kelas:'X AL FATTAH', siswa:[{absen:1, nama:'...'}]}].
 * Disimpan sebentar di cache agar satu kelas yang membuka halaman bersamaan tidak membebani Sheet.
 */
function daftarSiswa_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_SISWA);
  if (hit) return JSON.parse(hit);
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SISWA);
  var data = (sh && sh.getLastRow() > 1) ? sh.getRange(1, 1, sh.getLastRow(), Math.max(3, sh.getLastColumn())).getDisplayValues() : [];
  var out = susunDaftar_(data);
  try { cache.put(CACHE_SISWA, JSON.stringify(out), CACHE_SISWA_DETIK); } catch (err) { /* daftar terlalu besar untuk cache: tetap jalan */ }
  return out;
}

/** Murni (tanpa layanan Google) agar bisa diuji. data = isi tab termasuk baris judul. */
function susunDaftar_(data) {
  if (!data.length) return [];
  var head = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var cari = function (re, def) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return def; };
  var cK = cari(/^kelas/, 0), cA = cari(/absen|^no/, 1), cN = cari(/^nama/, 2);
  var per = {}, urut = [];
  data.slice(1).forEach(function (r) {
    var kelas = normKelas_(r[cK]), absen = parseInt(r[cA], 10), nama = clean_(r[cN], 60);
    if (!kelas || !(absen >= 1 && absen <= 60) || !nama) return; // baris kosong / tidak lengkap dilewati
    if (!per[kelas]) { per[kelas] = {}; urut.push(kelas); }
    per[kelas][absen] = nama; // absen ganda: baris terakhir yang dipakai
  });
  urut.sort();
  return urut.map(function (k) {
    return { kelas: k, siswa: Object.keys(per[k]).map(Number).sort(function (a, b) { return a - b; })
      .map(function (a) { return { absen: a, nama: per[k][a] }; }) };
  });
}

function normKelas_(v) {
  var k = clean_(v, 20).toUpperCase().replace(/\s+/g, ' ');
  return /^[A-Z0-9 .\-]{1,20}$/.test(k) ? k : '';
}

/** Nama resmi dari tab Daftar Siswa untuk kelas + absen, atau '' bila tidak terdaftar. */
function namaTerdaftar_(kelas, absen) {
  var d = daftarSiswa_();
  for (var i = 0; i < d.length; i++) {
    if (d[i].kelas !== kelas) continue;
    for (var j = 0; j < d[i].siswa.length; j++) if (d[i].siswa[j].absen === absen) return d[i].siswa[j].nama;
  }
  return '';
}

function handlePayload_(body) {
  var props = PropertiesService.getScriptProperties();
  var kode = props.getProperty('KODE_KELAS');
  if (!kode) return { ok: false, error: 'belum_setup' };
  if (props.getProperty('TERIMA_DATA') === 'tidak') return { ok: false, error: 'ditutup' };
  if (typeof body.kode !== 'string' || body.kode.trim().toUpperCase() !== kode.toUpperCase()) {
    return { ok: false, error: 'kode_salah' };
  }

  var kelas = normKelas_(body.kelas);
  var absen = parseInt(body.absen, 10);
  var nama = clean_(body.nama, 60);
  var sesi = clean_(body.sesi, 16);
  if (!kelas) return { ok: false, error: 'kelas' };
  if (!(absen >= 1 && absen <= 60)) return { ok: false, error: 'absen' };
  if (!nama) return { ok: false, error: 'nama' };
  if (!/^[a-z0-9]{1,16}$/.test(sesi)) return { ok: false, error: 'sesi' };
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: true, n: 0 };
  // Bila siswa ada di tab Daftar Siswa, pakai nama resmi dari sana (bukan ketikan siswa).
  // Siswa yang tidak terdaftar tetap diterima agar datanya tidak hilang; namanya diberi tanda.
  // Bila tab Daftar Siswa kosong/belum dibuat, nama ketikan siswa dipakai apa adanya.
  if (daftarSiswa_().length) {
    var resmi = namaTerdaftar_(kelas, absen);
    nama = resmi || (nama + ' (tidak terdaftar)').slice(0, 75);
  }
  if (body.events.length > MAX_EVENTS) return { ok: false, error: 'terlalu_banyak' };

  // Batas laju per sesi
  var cache = CacheService.getScriptCache();
  var ck = 'rate_' + sesi;
  var used = parseInt(cache.get(ck) || '0', 10);
  if (used + body.events.length > RATE_PER_MIN) return { ok: false, error: 'terlalu_cepat' };
  cache.put(ck, String(used + body.events.length), 60);

  var now = new Date();
  var rows = [];
  body.events.forEach(function (ev) {
    if (!ev || JENIS.indexOf(ev.jenis) < 0) return;
    rows.push([
      now,
      safe_(clean_(ev.t, 30)),
      safe_(kelas), absen, safe_(nama), safe_(sesi),
      ev.jenis,
      safe_(clean_(ev.modul, 8)),
      safe_(clean_(ev.soal, 24)),
      safe_(clean_(ev.tugas, 12)),
      ev.benar === 1 || ev.benar === 0 ? ev.benar : '',
      num_(ev.percobaan, 0, 999),
      num_(ev.bantuan, 0, 4),
      safe_(clean_(ev.kode, 4)),
      safe_(clean_(ev.yakin, 8)),
      safe_(clean_(ev.jawaban, 400)),
      num_(ev.durasi, 0, 86400)
    ]);
  });
  if (!rows.length) return { ok: true, n: 0 };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'sibuk' };
  try {
    var sh = sheet_(SHEET_LOG, LOG_HEADERS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, n: rows.length };
}

/* ------------------------------------------------------------------ */
/* Penyiapan dan menu guru                                             */
/* ------------------------------------------------------------------ */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KODE_KELAS')) props.setProperty('KODE_KELAS', randomCode_());
  if (!props.getProperty('TERIMA_DATA')) props.setProperty('TERIMA_DATA', 'ya');
  sheet_(SHEET_LOG, LOG_HEADERS);
  sheet_(SHEET_SISWA, SISWA_HEADERS);
  tulisPengaturan_();
  rekap();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Media Kuadrat')
    .addItem('Perbarui rekap', 'rekap')
    .addItem('Terapkan perubahan Daftar Siswa sekarang', 'segarkanDaftar')
    .addItem('Ganti kode kelas', 'gantiKode')
    .addItem('Buka / tutup penerimaan data', 'bukaTutup')
    .addItem('Pasang rekap otomatis (tiap 15 menit)', 'pasangPemicu')
    .addItem('Hapus log lebih dari 180 hari', 'hapusLogLama')
    .addToUi();
}

function segarkanDaftar() {
  CacheService.getScriptCache().remove(CACHE_SISWA);
  var d = daftarSiswa_(), n = 0;
  d.forEach(function (k) { n += k.siswa.length; });
  SpreadsheetApp.getActive().toast(n + ' siswa di ' + d.length + ' kelas siap tampil di dropdown.', 'Daftar Siswa');
}

/** Cache dibersihkan otomatis setiap tab Daftar Siswa diedit (pemicu sederhana). */
function onEdit(e) {
  if (e && e.range && e.range.getSheet().getName() === SHEET_SISWA) CacheService.getScriptCache().remove(CACHE_SISWA);
}

function gantiKode() {
  PropertiesService.getScriptProperties().setProperty('KODE_KELAS', randomCode_());
  tulisPengaturan_();
}

function bukaTutup() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('TERIMA_DATA', p.getProperty('TERIMA_DATA') === 'tidak' ? 'ya' : 'tidak');
  tulisPengaturan_();
}

function pasangPemicu() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'rekap') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('rekap').timeBased().everyMinutes(15).create();
}

function hapusLogLama() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  if (!sh || sh.getLastRow() < 2) return;
  var batas = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  // Log ditulis berurutan waktu: hapus blok baris tertua sekaligus
  var n = 0;
  while (n < vals.length && vals[n][0] instanceof Date && vals[n][0] < batas) n++;
  if (n) sh.deleteRows(2, n);
  rekap();
}

function tulisPengaturan_() {
  var p = PropertiesService.getScriptProperties();
  var sh = sheet_(SHEET_SET, ['Pengaturan', 'Nilai']);
  sh.getRange(2, 1, 3, 2).setValues([
    ['Kode kelas (bagikan ke siswa)', p.getProperty('KODE_KELAS')],
    ['Menerima data', p.getProperty('TERIMA_DATA')],
    ['Diperbarui', new Date()]
  ]);
}

/* ------------------------------------------------------------------ */
/* Rekap untuk guru                                                    */
/* ------------------------------------------------------------------ */
function rekap() {
  var ss = SpreadsheetApp.getActive();
  var log = ss.getSheetByName(SHEET_LOG);
  var data = (log && log.getLastRow() > 1) ? log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADERS.length).getValues() : [];
  var out = hitungRekap_(data);

  var s1 = sheet_(SHEET_REKAP, out.siswaHeader);
  if (s1.getLastRow() > 1) s1.getRange(2, 1, s1.getLastRow() - 1, s1.getLastColumn()).clearContent();
  if (out.siswa.length) s1.getRange(2, 1, out.siswa.length, out.siswaHeader.length).setValues(out.siswa);

  var s2 = sheet_(SHEET_SOAL, out.soalHeader);
  if (s2.getLastRow() > 1) s2.getRange(2, 1, s2.getLastRow() - 1, s2.getLastColumn()).clearContent();
  if (out.soal.length) s2.getRange(2, 1, out.soal.length, out.soalHeader.length).setValues(out.soal);
}

/** Murni (tanpa layanan Google) agar bisa diuji. data = baris Log tanpa header. */
function hitungRekap_(data) {
  var C = {}; LOG_HEADERS.forEach(function (h, i) { C[h] = i; });
  var siswa = {}, soal = {}, semuaSoal = {};
  data.forEach(function (r) {
    var key = r[C['Kelas']] + '|' + r[C['Absen']];
    var s = siswa[key] || (siswa[key] = { kelas: r[C['Kelas']], absen: r[C['Absen']], nama: r[C['Nama']], terakhir: r[C['Waktu server']],
      tuntas: {}, coba: {}, kode: {}, guru: {}, bantuan: 0, nJawab: 0, ragu: 0 });
    s.nama = r[C['Nama']]; s.terakhir = r[C['Waktu server']];
    var id = String(r[C['Soal']]), jenis = r[C['Jenis']];
    if (jenis === 'jawab') {
      semuaSoal[id] = true;
      var q = soal[id] || (soal[id] = { tugas: r[C['Tugas']], siswa: {}, tuntas: {}, pertama: {}, kode: {} });
      q.siswa[key] = true;
      s.nJawab++; s.bantuan += Number(r[C['Bantuan']]) || 0;
      s.coba[id] = (s.coba[id] || 0) + 1;
      if (r[C['Benar']] === 1) {
        if (!s.tuntas[id]) { q.tuntas[key] = true; if (Number(r[C['Percobaan']]) === 1 && !Number(r[C['Bantuan']])) q.pertama[key] = true; }
        s.tuntas[id] = true; delete s.guru[id];
      } else {
        var k = r[C['Kode kesalahan']];
        if (k) { s.kode[k] = (s.kode[k] || 0) + 1; q.kode[k] = (q.kode[k] || 0) + 1; }
      }
      if (r[C['Keyakinan']] === 'Ragu') s.ragu++;
    } else if (jenis === 'minta_guru' && !s.tuntas[id]) {
      s.guru[id] = true;
    }
  });
  var total = Math.max(TOTAL_SOAL, Object.keys(semuaSoal).length);
  var top = function (o) { var k = Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); return k.slice(0, 3).map(function (x) { return x + ' (' + o[x] + '×)'; }).join(', '); };

  var siswaHeader = ['Kelas', 'Absen', 'Nama', 'Soal tuntas', 'Dari soal yang ada', '% tuntas', 'Rata-rata bantuan per jawaban',
    'Kesalahan tersering', 'Minta bantuan guru (soal)', 'Titik periksa dijawab ragu', 'Terakhir aktif', 'Perlu perhatian'];
  var rowsSiswa = Object.keys(siswa).map(function (k) {
    var s = siswa[k], nT = Object.keys(s.tuntas).length, guru = Object.keys(s.guru);
    var rata = s.nJawab ? Math.round(s.bantuan / s.nJawab * 10) / 10 : 0;
    var perhatian = guru.length > 0 || (s.nJawab >= 5 && nT / Math.max(1, Object.keys(s.coba).length) < 0.5) ? 'YA' : '';
    return [s.kelas, s.absen, s.nama, nT, total, total ? Math.round(nT / total * 100) : 0, rata, top(s.kode), guru.join(', '), s.ragu, s.terakhir, perhatian];
  }).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]; });

  var soalHeader = ['Soal', 'Tugas', 'Siswa mencoba', 'Siswa tuntas', '% tuntas', '% benar percobaan pertama tanpa bantuan', 'Kesalahan tersering'];
  var rowsSoal = Object.keys(soal).sort().map(function (id) {
    var q = soal[id], n = Object.keys(q.siswa).length, t = Object.keys(q.tuntas).length, p = Object.keys(q.pertama).length;
    return [id, q.tugas, n, t, n ? Math.round(t / n * 100) : 0, n ? Math.round(p / n * 100) : 0, top(q.kode)];
  });
  return { siswaHeader: siswaHeader, siswa: rowsSiswa, soalHeader: soalHeader, soal: rowsSoal };
}

/* ------------------------------------------------------------------ */
/* Pembantu                                                            */
/* ------------------------------------------------------------------ */
function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function clean_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}
/** Cegah formula/DDE injection: teks yang diawali = + - @ dibuat menjadi teks biasa. */
function safe_(s) {
  s = String(s);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num_(v, min, max) {
  var n = Number(v);
  if (!isFinite(n)) return '';
  return Math.max(min, Math.min(max, Math.round(n)));
}
function randomCode_() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  for (var i = 0; i < 6; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s;
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
