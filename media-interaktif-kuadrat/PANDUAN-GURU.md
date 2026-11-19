# Panduan Guru: Media Interaktif Persamaan Kuadrat + Google Sheet

Isi folder:

| File | Fungsi |
|---|---|
| `index.html` | Media untuk siswa (satu file, tanpa pustaka luar). 3 modul, 21 soal, T1–T4 dan T7–T8. |
| `apps-script/Code.gs` | Penerima data di Google Sheet milik Bapak/Ibu, plus rekap otomatis. |

Alur data: siswa menjawab di `index.html` → jawaban dikirim ke Web App Apps Script → ditulis ke sheet **Log** → menu **Media Kuadrat → Perbarui rekap** mengisi sheet **Rekap Siswa** dan **Rekap Soal**.

## 1. Siapkan Google Sheet (sekitar 10 menit, sekali saja)

1. Buat Google Sheet baru dengan akun sekolah, beri nama misalnya `Progres Kuadrat X-3`.
2. Menu **Ekstensi → Apps Script**. Hapus isi `Code.gs`, tempel seluruh isi `apps-script/Code.gs`, lalu **Simpan**.
3. Di daftar fungsi pilih **setup**, klik **Jalankan**, lalu izinkan akses (Google akan menampilkan peringatan "aplikasi belum diverifikasi" karena skrip ini buatan sendiri: pilih *Lanjutan → Buka*). Izin yang diminta hanya untuk Spreadsheet ini.
4. Kembali ke Sheet. Muncul sheet **Pengaturan** berisi **kode kelas** (6 karakter). Kode inilah yang dibagikan ke siswa.
5. Di Apps Script: **Terapkan → Deployment baru → jenis: Aplikasi web**.
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Siapa saja** (perlu agar siswa tanpa akun Google tetap bisa mengirim; lihat bagian Keamanan).
6. Salin **URL aplikasi web** (berakhiran `/exec`).

## 2. Hubungkan media

1. Buka `index.html` dengan editor teks (Notepad cukup).
2. Cari baris `ENDPOINT: "",` di bagian PENGATURAN GURU dan tempel URL di antara tanda kutip:
   `ENDPOINT: "https://script.google.com/macros/s/xxxx/exec",`
3. Simpan. Uji sendiri: buka file di browser, masuk dengan kode kelas, jawab satu soal, lalu lihat sheet **Log**. Status di kanan atas harus menjadi "Progres terkirim ke guru ✓".

Jika `ENDPOINT` dikosongkan, media berjalan dalam **mode uji**: semua fungsi jalan, tetapi tidak ada yang dikirim.

## 3. Bagikan ke siswa

Pilihan (urut dari yang paling disarankan):

- **GitHub Pages** dari repo proyek: siswa membuka satu tautan. (Bisa saya siapkan bila Bapak/Ibu setuju.)
- **Google Sites**: sematkan file HTML.
- Kirim file `index.html` lewat grup kelas / LMS; siswa membukanya di browser HP atau laptop.

Yang perlu disampaikan ke siswa: kode kelas, cara mengisi kelas (misalnya `X-3`), nomor absen, dan nama panggilan. Di komputer bersama, minta siswa menekan **Keluar** setelah selesai.

## 4. Membaca hasil

Menu **Media Kuadrat** (muncul di Sheet setelah dibuka ulang):

- **Perbarui rekap**: isi ulang sheet rekap. Bisa juga **Pasang rekap otomatis** (tiap 15 menit).
- **Rekap Siswa**: soal tuntas, rata-rata bantuan, kode kesalahan tersering (K1–K16 sesuai dokumen 4), soal yang ditandai "perlu dibantu guru", titik periksa yang dijawab *ragu*, dan kolom **Perlu perhatian**.
- **Rekap Soal**: per soal, berapa siswa tuntas, berapa yang benar pada percobaan pertama tanpa bantuan, dan kesalahan tersering. Soal dengan angka rendah adalah kandidat pembahasan klasikal.
- **Log**: semua kejadian mentah, termasuk penjelasan tertulis siswa (kolom *Jawaban* untuk jenis `penjelasan`).

Cara menindaklanjuti kode kesalahan: buka dokumen `04-scaffolding-kesalahan-umum.md`, cari kode K yang sama, dan pakai tangga pertanyaannya.

## 5. Pengelolaan data

- **Buka / tutup penerimaan data**: tutup di luar jam pelajaran agar tidak ada data iseng.
- **Ganti kode kelas**: bila kode tersebar ke luar kelas.
- **Hapus log lebih dari 180 hari**: jalankan di akhir semester.
- Jangan bagikan Sheet ke siswa. Bagikan hanya ke guru yang perlu.

## 6. Menambah soal

Soal ada di array `MODULES` dalam `index.html`. Setiap soal punya `id`, `tugas` (T1–T12), `fields`, fungsi `check` (mengembalikan `ok`, `code` K, dan `msg`), dan empat `hints` (Sadari, Fokuskan, Hubungkan, Representasi). Setelah menambah soal, ubah `TOTAL_SOAL` di `Code.gs` lalu terapkan ulang (**Terapkan → Kelola deployment → Edit → Versi baru**).
