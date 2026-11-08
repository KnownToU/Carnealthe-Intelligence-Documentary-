# CID — Threat Model Plugin

Status: **Step 3B-1**. Dokumen ini harus diperbarui saat isolasi plugin dikerjakan.

## Ringkasan jujur

Plugin yang dimuat = kode asing yang berjalan di dalam aplikasi dengan **hak yang sama
seperti kode CID sendiri**. Installer saat ini hanya melakukan *validasi dan pencegahan
kecelakaan*, **bukan isolasi**. **Registry bukan sandbox.**

## Aktor

- Pembuat plugin berbahaya.
- Pengguna yang tertipu memasang plugin berbahaya.
- Plugin yang sekadar *bug* (lebih sering daripada yang jahat).

## Apa yang BISA dilakukan plugin sekarang

| Kemampuan | Cara |
|---|---|
| Baca/tulis/hapus SEMUA key localStorage, termasuk kode plugin lain | `localStorage` global |
| Mengirim data ke internet | `fetch(...)` (tidak ada pembatasan CSP) |
| Mengubah tampilan, menipu pengguna (palsu "Settings", form phishing) | akses penuh DOM |
| Memanggil modul inti, termasuk `register`/`unregister` | `import('/src/core/registry.js')` lewat URL absolut |
| Memakai Event Bus untuk menyamar sebagai modul lain | `import('/src/core/eventBus.js')` |
| Membekukan aplikasi | loop tak berujung (timeout hanya melindungi `await`, bukan loop sinkron) |
| Di APK (Step 3B-2): memakai `window.Capacitor.Plugins.*` | termasuk Filesystem langsung |

## Yang SUDAH dilakukan installer (bukan sandbox)

- Validasi manifest (id camelCase, type `panel`, field wajib, field asing dibuang).
- Batas ukuran 512 KB per file, entry point wajib `index.js`.
- ID bentrok dengan panel bawaan/plugin lain ditolak.
- Kode plugin **tidak dijalankan saat instalasi**; hanya saat startup.
- Konfirmasi manual sebelum install, dengan peringatan "kode dari luar".
- Rollback kalau penyimpanan gagal atau verifikasi tidak cocok.
- Plugin gagal dimuat (error / tanpa `render` / timeout 5 detik) dilewati; aplikasi tetap jalan.
- Plugin yang error saat `render()` ditangkap Shell dan tidak menjatuhkan aplikasi.
- Manifest divalidasi ulang saat dimuat (isi localStorage tidak dipercaya).
- Blob URL selalu di-revoke setelah import.

## Yang BELUM ada (dan sengaja tidak diklaim)

- Isolasi / sandbox.
- Tanda tangan atau verifikasi asal plugin.
- Sistem izin (capability) per plugin.
- Content Security Policy.

## Kenapa tidak fatal sekarang

Saat ini aplikasi belum menyimpan data sensitif (belum ada Storage/Evidence/kasus).
Kerugian terburuk: tampilan rusak, atau plugin lain terhapus.

## DEADLINE: wajib selesai sebelum Step 6 (Storage dan Evidence)

Begitu evidence dan data kasus tersimpan, plugin berbahaya bisa membaca atau mengirim
semuanya keluar. **Step 6 tidak boleh dimulai sebelum isolasi plugin selesai.**

Arah solusi (belum dipilih, putuskan saat tahap itu):

- Panel plugin: `<iframe sandbox>` tanpa `allow-same-origin`, komunikasi via `postMessage`.
- Tool plugin: Web Worker dengan API capability yang dikirim lewat pesan.
- Akses data hanya lewat capability eksplisit (sesuai kontrak Tool: `run(input, ctx)`).
- CSP `connect-src` untuk menutup exfiltrasi.
- Plugin TIDAK boleh mendapat akses tambahan secara implisit.
