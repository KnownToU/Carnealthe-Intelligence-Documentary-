/**
 * capabilities.js
 * Bangun objek ctx dari daftar nama capability di manifest Tool.
 *
 * ctx bukan sandbox nyata — ini cuma cara Tool declare apa yang dia butuhkan.
 * Tool yang sudah di-import tetap punya akses penuh ke app.
 * Lihat docs/THREAT_MODEL.md.
 */

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
 * Stub — Storage belum dibangun (nunggu Step 6).
 * Tool yang coba pakai ini akan dapat error yang jelas.
 */
const saveToCase_STUB = {
  save() {
    throw new Error('[saveToCase] Storage belum ada, nunggu Step 6.');
  },
};

const CAPABILITY_MAP = {
  http: httpCapability,
  readFile: readFileCapability,
  saveToCase: saveToCase_STUB,
};

/**
 * Terima daftar nama capability dari manifest, kembalikan objek ctx.
 * Kalau daftarnya kosong atau tidak ada, kembalikan objek kosong {}.
 *
 * @param {string[]} [capabilityNames] - Dari manifest.capabilities
 * @returns {Object} ctx
 */
export function buildCtx(capabilityNames) {
  if (!Array.isArray(capabilityNames) || capabilityNames.length === 0) return {};

  const ctx = {};
  for (const name of capabilityNames) {
    if (CAPABILITY_MAP[name]) ctx[name] = CAPABILITY_MAP[name];
  }
  return ctx;
}
