/**
 * pluginService.js
 * Logika installer plugin. Dua fase yang SENGAJA dipisah:
 *
 *   FASE INSTALASI  (install, uninstall)
 *     Hanya validasi dan menyimpan teks. Kode plugin TIDAK PERNAH dijalankan di sini.
 *
 *   FASE EKSEKUSI   (loadInstalled)
 *     Dipanggil saat startup. Baru di sini kode plugin di-import lewat Blob URL.
 *
 * PENTING: ini BUKAN sandbox. Plugin yang sudah dimuat punya akses penuh
 * seperti kode aplikasi lainnya. Baca docs/THREAT_MODEL.md.
 */

import { register, unregister, has, get } from '../core/registry.js';
import { validateManifest } from '../core/manifest.js';
import * as storage from './pluginStorage.js';

export const MAX_FILE_BYTES = 512 * 1024;
const ENTRY_FILENAME = 'index.js';
const LOAD_TIMEOUT_MS = 5000;

export class PluginError extends Error {
  /**
   * @param {string} code - INVALID_INPUT | INVALID_MANIFEST | INVALID_ENTRY | EMPTY_CODE
   *                        | TOO_LARGE | ID_CONFLICT | INSTALL_FAILED
   */
  constructor(code, message) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
  }
}

// id -> { id, label, version, status, error }
// status: 'active' | 'failed' | 'conflict'
const statuses = new Map();
let loadPromise = null;

// ============================================================
// FASE INSTALASI
// ============================================================

/**
 * Validasi input mentah tanpa menyimpan atau menjalankan apa pun.
 * Dipakai UI untuk menampilkan info plugin di dialog konfirmasi.
 *
 * @param {string} manifestText - Isi manifest.json
 * @param {string} codeText     - Isi index.js
 * @returns {{ manifest: Object }} manifest yang sudah dibersihkan
 */
export function validatePluginInput(manifestText, codeText) {
  if (typeof manifestText !== 'string' || typeof codeText !== 'string') {
    throw new PluginError('INVALID_INPUT', 'manifest.json dan index.js harus berupa teks.');
  }

  assertSize('manifest.json', manifestText);
  assertSize(ENTRY_FILENAME, codeText);

  let raw;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    throw new PluginError('INVALID_MANIFEST', 'manifest.json bukan JSON yang valid.');
  }

  const check = validateManifest(raw);
  if (!check.ok) {
    throw new PluginError('INVALID_MANIFEST', `manifest.json tidak valid: ${check.errors.join('; ')}`);
  }

  if (raw.entry !== undefined && raw.entry !== ENTRY_FILENAME) {
    throw new PluginError('INVALID_ENTRY', `Entry point wajib "${ENTRY_FILENAME}".`);
  }

  if (!codeText.trim()) {
    throw new PluginError('EMPTY_CODE', `${ENTRY_FILENAME} kosong.`);
  }

  // Hanya simpan field yang dikenal. Field asing dibuang.
  const manifest = {
    id: raw.id,
    type: raw.type,
    label: raw.label.trim(),
    version: raw.version.trim(),
    entry: ENTRY_FILENAME,
  };
  if (raw.group !== undefined) manifest.group = raw.group.trim();
  if (raw.order !== undefined) manifest.order = raw.order;

  return { manifest };
}

/**
 * Pasang plugin: validasi -> cek bentrok -> simpan -> verifikasi -> (rollback kalau gagal).
 * Tidak menjalankan kode plugin. Plugin baru aktif setelah aplikasi reload.
 *
 * @param {{ manifestText: string, codeText: string }} input
 * @returns {Promise<{ id: string, label: string }>}
 */
export async function install({ manifestText, codeText }) {
  const { manifest } = validatePluginInput(manifestText, codeText);
  const id = manifest.id;

  await storage.init();

  // Bentrok dengan panel bawaan atau plugin yang sudah aktif.
  if (has(id)) {
    throw new PluginError('ID_CONFLICT', `ID "${id}" sudah dipakai modul lain.`);
  }
  // Bentrok dengan plugin yang sudah terinstal (termasuk yang gagal dimuat).
  if ((await storage.list()).includes(id)) {
    throw new PluginError('ID_CONFLICT', `Plugin "${id}" sudah terinstal. Hapus dulu kalau mau mengganti.`);
  }

  try {
    await storage.write(id, { manifest, code: codeText });

    // Verifikasi: baca ulang dan bandingkan. Memastikan yang tersimpan = yang dikirim.
    const saved = await storage.read(id);
    if (saved.code !== codeText || saved.manifest.id !== id) {
      throw new PluginError('INSTALL_FAILED', 'Verifikasi setelah penyimpanan gagal.');
    }
  } catch (err) {
    await rollback(id);
    if (err instanceof PluginError) throw err;
    throw new PluginError('INSTALL_FAILED', `Instalasi gagal dan dibatalkan: ${err.message}`);
  }

  return { id, label: manifest.label };
}

/**
 * Hapus plugin: data di storage + registrasi di Registry.
 * Registrasi hanya dihapus kalau memang milik plugin (bukan panel bawaan ber-ID sama).
 *
 * @returns {Promise<boolean>} true kalau plugin memang ada
 */
export async function uninstall(id) {
  await storage.init();

  const existed = await storage.remove(id); // melempar error kalau id tidak valid

  const def = get(id);
  if (def && def.source === 'plugin') unregister(id);
  statuses.delete(id);

  return existed;
}

/**
 * Daftar plugin terinstal beserta statusnya, untuk UI.
 * status: 'active' | 'failed' | 'conflict' | 'pending' (terinstal, menunggu reload)
 */
export async function getInstalled() {
  if (loadPromise) await loadPromise;

  const ids = await storage.list();
  return ids.map(id => (
    statuses.get(id) || { id, label: id, version: '', status: 'pending', error: null }
  ));
}

// ============================================================
// FASE EKSEKUSI
// ============================================================

/**
 * Muat semua plugin terinstal dan daftarkan ke Registry.
 * TIDAK PERNAH melempar error. Hanya jalan sekali; panggilan berikutnya
 * mengembalikan hasil yang sama (mencegah registrasi ganda).
 *
 * @param {Object}   [options]
 * @param {Function} [options.importer]  - (code) => Promise<module>. Default: Blob URL.
 * @param {number}   [options.timeoutMs] - Batas waktu muat per plugin.
 * @returns {Promise<Object[]>} daftar status plugin
 */
export function loadInstalled({ importer = importFromBlob, timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  if (!loadPromise) {
    loadPromise = runLoad(importer, timeoutMs).catch(err => {
      console.error('[Plugin] Kegagalan tak terduga saat memuat plugin:', err);
      return [];
    });
  }
  return loadPromise;
}

async function runLoad(importer, timeoutMs) {
  let ids;
  try {
    await storage.init();
    ids = await storage.list();
  } catch (err) {
    console.warn(`[Plugin] Penyimpanan tidak bisa dibaca, plugin dilewati: ${err.message}`);
    return [];
  }

  // Muat paralel supaya plugin yang hang tidak menumpuk waktu tunggu...
  const results = await Promise.all(ids.map(id => loadOne(id, importer, timeoutMs)));

  // ...tapi daftarkan berurutan supaya hasilnya konsisten.
  for (const result of results) {
    const { def, ...entry } = result;

    if (result.status === 'ready') {
      if (has(result.id) || !register(def)) {
        entry.status = 'conflict';
        entry.error = `ID "${result.id}" sudah dipakai modul lain.`;
        console.warn(`[Plugin] "${result.id}" dilewati: ${entry.error}`);
      } else {
        entry.status = 'active';
      }
    }
    statuses.set(result.id, entry);
  }

  return [...statuses.values()];
}

async function loadOne(id, importer, timeoutMs) {
  try {
    const data = await storage.read(id);

    // Validasi ulang. localStorage bisa diubah pihak lain, jangan percaya isinya begitu saja.
    const check = validateManifest(data.manifest, id);
    if (!check.ok) throw new Error(`manifest rusak: ${check.errors.join('; ')}`);

    const mod = await withTimeout(importer(data.code), timeoutMs);
    const panel = mod?.default;
    if (!panel || typeof panel.render !== 'function') {
      throw new Error('index.js harus melakukan export default { render() { ... } }');
    }

    const m = data.manifest;
    return {
      id,
      label: m.label,
      version: m.version,
      status: 'ready',
      error: null,
      def: { id, type: 'panel', label: m.label, group: m.group, order: m.order, source: 'plugin', module: panel },
    };
  } catch (err) {
    console.warn(`[Plugin] "${id}" gagal dimuat: ${err.message}`);
    return { id, label: id, version: '', status: 'failed', error: err.message, def: null };
  }
}

/**
 * Impor kode lewat Blob URL.
 * Lifecycle: buat URL -> import -> revoke (selalu, sukses maupun gagal).
 * Setelah modul selesai dievaluasi, URL tidak dibutuhkan lagi.
 * (Kalau import menggantung selamanya, URL tertinggal. Itu kebocoran kecil dan
 *  jarang; timeout di atas yang menjaga aplikasi tetap jalan.)
 */
async function importFromBlob(code) {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================
// Helper
// ============================================================

function assertSize(name, text) {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_FILE_BYTES) {
    throw new PluginError('TOO_LARGE', `${name} terlalu besar (${Math.ceil(bytes / 1024)} KB, maks ${MAX_FILE_BYTES / 1024} KB).`);
  }
}

async function rollback(id) {
  try {
    await storage.remove(id);
  } catch (err) {
    console.warn(`[Plugin] Rollback "${id}" gagal: ${err.message}`);
  }
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout setelah ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
