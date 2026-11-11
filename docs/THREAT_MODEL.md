# CID — Threat Model Plugin

Status: **Step 3B-1**. Dokumen ini harus diperbarui saat isolasi plugin dikerjakan.

## UPDATE: installer runtime dicabut

Premis dokumen ini DULU: siapa pun bisa install plugin pihak ketiga lewat UI
(`panels/settingsModules`), jadi ada aktor "pembuat plugin berbahaya" dan
"pengguna yang tertipu install plugin berbahaya" yang nyata.

Keputusan baru: **satu-satunya plugin yang akan pernah ada di CID adalah
plugin resmi buatan developer sendiri.** Nggak ada install-dari-HP lagi.
Plugin resmi masuk ke app lewat folder yang di-scan otomatis (`npm run scan`),
persis sama kayak Case Manager sekarang — bukan modul asing yang dimuat
runtime dari localStorage/Filesystem.

Konsekuensi:
- `src/services/pluginService.js` dan `pluginStorage.js` **dihapus** (install
  fase, Blob URL import, rollback, dst — semua itu buat masalah yang sekarang
  nggak ada: nerima kode dari luar saat runtime).
- Aktor "pembuat plugin berbahaya" dan "pengguna tertipu" di bawah ini jadi
  **nggak relevan** untuk sekarang. Kode plugin resmi levelnya sama kayak
  kode builtin — sama-sama ditulis dan dipercaya oleh developer yang sama.
- Deadline "Step 6 (Storage/Evidence) tidak boleh mulai sebelum isolasi
  plugin selesai" di bawah **dicabut**. Evidence boleh mulai dikerjain.
- Isolasi beneran (iframe sandbox / Web Worker, bagian "Arah solusi" di
  bawah) jadi **prasyarat SEBELUM CID membuka diri ke plugin pihak ketiga**
  di masa depan — bukan prasyarat buat developer sendiri lanjut ngoding.
- Kalau nanti CID beneran dibuka ke plugin pihak ketiga (bukan cuma resmi),
  seluruh bagian di bawah ini (sampai "Mitigasi sementara") balik relevan
  dan installer kemungkinan perlu dibangun ulang dari nol dengan isolasi
  beneran dari awal, bukan ditambal belakangan.
- Rencana arsitektur: plugin resmi yang komunikasi ke layanan luar bakal
  punya orchestrator terisolasi sendiri per plugin (belum didesain, dicatat
  biar nggak kelupaan — bukan capability-gate generik kayak di bawah).

Bagian di bawah ini (per Step 3B-1 lama) dibiarin apa adanya sebagai arsip
keputusan saat itu, KECUALI bagian "DEADLINE" yang statusnya dicabut di atas.

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

### Mitigasi sementara (bukan pengganti isolasi)

Sebelum lanjut ke Step 6, `buildCtx` (`src/core/capabilities.js`) sekarang menolak
memberi capability `http`, `readFile`, `saveToCase` ke module dengan `source === 'plugin'`.
Builtin tool (kode yang ikut repo) tetap dapat semuanya.

Ini **bukan sandbox**. Plugin yang sudah di-import tetap bisa akses `fetch`,
`FileReader`, dll langsung — yang ditutup cuma jalur ctx "resmi". Jadi plugin jahat
yang nulis kode sendiri masih bisa baca `localStorage`/panggil Capacitor Filesystem
langsung kalau dia mau coba-coba. Tujuannya cuma mencegah jalur yang paling gampang
dan "kelihatan sah", bukan menutup semua jalan.

**Masih wajib dikerjain sebelum klaim aman:** isolasi beneran (iframe sandbox / Web
Worker) seperti di bagian "Arah solusi" di bawah.

Arah solusi (belum dipilih, putuskan saat tahap itu):

- Panel plugin: `<iframe sandbox>` tanpa `allow-same-origin`, komunikasi via `postMessage`.
- Tool plugin: Web Worker dengan API capability yang dikirim lewat pesan.
- Akses data hanya lewat capability eksplisit (sesuai kontrak Tool: `run(input, ctx)`).
- CSP `connect-src` untuk menutup exfiltrasi.
- Plugin TIDAK boleh mendapat akses tambahan secara implisit.
