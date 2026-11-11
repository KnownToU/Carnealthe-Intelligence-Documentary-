/**
 * evidenceDownload.js
 * Ngeluarin isi evidence (bytes) dari sandbox app ke user.
 *
 * KENAPA DIPISAH dari evidenceStorage.js: evidenceStorage ngurusin
 * baca/tulis evidence DI DALAM storage app (data.bin/meta.json). Modul ini
 * ngurusin langkah SETELAHNYA — gimana caranya bytes itu keluar dari sandbox
 * ke tangan user. Beda tanggung jawab (SRP), beda pola backend juga.
 * Simetris sama evidenceUpload.js yang dipisah dari evidenceStorage buat
 * arah sebaliknya (masuk).
 *
 * KENAPA NGGAK PAKE `<a download>` + blob URL DI CAPACITOR:
 * Itu pola browser biasa, dan DIEM-DIEM GAGAL di WebView Android — klik
 * ke-trigger tapi Android nggak tau cara nurunin skema `blob:` ke Download
 * Manager-nya, jadi nggak ada file yang kesimpen. Bukan bug kode, emang
 * keterbatasan WebView.
 *
 * POLA DI CAPACITOR: tulis bytes ke file sementara di Directory.Cache (pake
 * @capacitor/filesystem, plugin yang sama kayak evidenceStorage.js), terus
 * panggil @capacitor/share buat munculin share-sheet Android ("Save to
 * Files"/Drive/dst) — user yang milih sendiri mau disimpen ke mana. Nggak
 * butuh izin storage tambahan, kerja di semua versi Android dari dulu
 * sampe sekarang.
 *
 * FALLBACK (browser dev biasa, Capacitor/Share nggak ada): balik ke
 * `<a download>` + blob URL, yang di browser beneran emang jalan normal.
 *
 * SOAL TRUST BOUNDARY (path traversal ke filesystem native — beda kelas,
 * makanya ditulis eksplisit, bukan dibenerin diem-diem):
 * `meta.name` itu nama file yang USER UPLOAD SENDIRI — data TIDAK
 * TERPERCAYA, bisa aja isinya "../../../something". Nama itu dipake buat
 * nyusun PATH yang dikirim ke Filesystem.writeFile (plugin native), jadi
 * kalau nggak disaring itu bisa jadi path traversal keluar folder cache.
 * sanitizeFileName() di bawah WAJIB dipanggil sebelum nama itu nyentuh path
 * apa pun, DAN path-nya selalu diawali evidence id (yang formatnya udah
 * divalidasi ketat di evidenceStorage.js/EVIDENCE_ID_PATTERN sebelum
 * sampe sini) — jadi segmen path gabungannya nggak akan pernah bisa
 * persis "." atau ".." walau sanitizeFileName() kecolongan sekalipun.
 *
 * meta.mimeType TETEP nggak pernah dipake buat nentuin cara apa pun di
 * sini (nggak dikirim ke Share.share() juga) — sama kayak aturan Blob di
 * panel, mimeType cuma teks info, titik.
 */

const DOWNLOAD_DIR = 'downloads'; // sub-folder di Directory.Cache, bukan evidence/ milik evidenceStorage.js
const CACHE_DIRECTORY = 'CACHE';  // Directory.Cache — string literal, sama gaya kayak FS_DIRECTORY di evidenceStorage.js

function hasCapacitorShare() {
  return (
    typeof window !== 'undefined' &&
    !!window.Capacitor?.Plugins?.Filesystem &&
    !!window.Capacitor?.Plugins?.Share
  );
}

/** Saring nama file dari user biar aman dipake sebagai SATU segmen path native. */
function sanitizeFileName(name) {
  const cleaned = String(name || '')
    .replace(/[\\/]/g, '_')      // no path separator sama sekali
    .replace(/[\x00-\x1f]/g, '') // no control char
    .trim();
  return cleaned ? cleaned.slice(0, 120) : 'evidence'; // batasin panjang, jangan kosong
}

/** Uint8Array -> base64, dipotong per-chunk biar nggak overflow call stack. */
function uint8ToBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Keluarin satu evidence ke user.
 *
 * @param {{id: string, name: string}} meta - meta.id HARUS hasil dari
 *   evidenceStorage.readEvidence() (udah tervalidasi), bukan input bebas.
 * @param {Uint8Array} bytes
 */
export async function downloadEvidence(meta, bytes) {
  if (hasCapacitorShare()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const Share = window.Capacitor.Plugins.Share;

    const fileName = `${meta.id}_${sanitizeFileName(meta.name)}`;
    const path = `${DOWNLOAD_DIR}/${fileName}`;

    await Filesystem.writeFile({
      path,
      data: uint8ToBase64(bytes),
      directory: CACHE_DIRECTORY,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({ path, directory: CACHE_DIRECTORY });

    await Share.share({
      title: meta.name,
      url: uri,
      dialogTitle: 'Simpan evidence',
    });
    return;
  }

  // Fallback browser biasa (dev/testing, bukan device Capacitor beneran).
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = meta.name || meta.id;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
