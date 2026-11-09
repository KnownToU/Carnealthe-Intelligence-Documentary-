/**
 * capabilities.js
 * Bangun objek ctx dari daftar nama capability di manifest Tool.
 *
 * ctx bukan sandbox nyata — ini cuma cara Tool declare apa yang dia butuhkan.
 * Tool yang sudah di-import tetap punya akses penuh ke app.
 * Lihat docs/THREAT_MODEL.md.
 */

import { addNote } from '../services/caseStorage.js';

/**
 * Fetch wrapper minimal. Hanya method GET dan POST, response sebagai teks atau JSON.
 * Tool bertanggung jawab atas error handling-nya sendiri.
 */
const httpCapability = {
  async get(url) {
    const res = await fetch(url);
    return { ok: res.ok, status: res.status, text: await res.text() };
  },
  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  },
};

/**
 * Baca file dari input[type=file] yang user pilih.
 * Mengembalikan teks isi file.
 */
const readFileCapability = {
  fromInput(fileInputEl) {
    return new Promise((resolve, reject) => {
      const file = fileInputEl?.files?.[0];
      if (!file) return reject(new Error('Tidak ada file yang dipilih.'));
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsText(file);
    });
  },
};

/**
 * ctx.saveToCase(caseId, data) -> Promise<{id, text, createdAt}>
 * Sesuai bentuk di src/contract/toolContract.js (dipanggil langsung, bukan .save()).
 *
 * V1: "simpan ke case" == nambah satu note. Belum ada evidence biner/file
 * (itu beginEvidence/appendEvidence/finishEvidence, nyusul step lain).
 *
 * data string disimpan apa adanya; data objek di-JSON.stringify dulu,
 * biar Tool yang ngirim objek nggak langsung dapet error nggak jelas.
 */
async function saveToCase(caseId, data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return addNote(caseId, text);
}

const CAPABILITY_MAP = {
  http: httpCapability,
  readFile: readFileCapability,
  saveToCase,
};

/**
 * Capability yang BOLEH dipegang plugin pihak ketiga (diinstal user dari luar).
 * Sengaja kosong untuk sekarang.
 *
 * Alasan: belum ada sandbox beneran (lihat docs/THREAT_MODEL.md). Begitu Storage
 * (Step 6) aktif, 'saveToCase' bisa dipakai plugin jahat buat nyampah/nimpa data
 * case. 'http' dan 'readFile' juga ditahan sekalian, karena kombinasi readFile+http
 * = jalur exfiltrasi (baca file lokal, kirim keluar).
 *
 * Ini BUKAN sandbox. Plugin yang sudah di-import tetap bisa akses semua ini
 * langsung lewat window.fetch / FileReader kalau dia mau — yang dicegah di sini
 * cuma jalur "resmi" ctx, biar nggak kelihatan "didukung secara sah" oleh app.
 * Mitigasi sementara sampai isolasi plugin beneran dikerjain.
 */
const PLUGIN_ALLOWED = [];

/**
 * Terima daftar nama capability dari manifest, kembalikan objek ctx.
 * Kalau daftarnya kosong atau tidak ada, kembalikan objek kosong {}.
 *
 * @param {string[]} [capabilityNames] - Dari manifest.capabilities
 * @param {string}   [source] - 'builtin' (default) atau 'plugin', dari Registry
 * @returns {Object} ctx
 */
export function buildCtx(capabilityNames, source) {
  if (!Array.isArray(capabilityNames) || capabilityNames.length === 0) return {};

  const isPlugin = source === 'plugin';

  const ctx = {};
  for (const name of capabilityNames) {
    if (isPlugin && !PLUGIN_ALLOWED.includes(name)) continue;
    if (CAPABILITY_MAP[name]) ctx[name] = CAPABILITY_MAP[name];
  }
  return ctx;
}
