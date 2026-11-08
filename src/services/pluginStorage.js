/**
 * pluginStorage.js
 * Satu-satunya pintu akses penyimpanan plugin.
 *
 * Backend sekarang: localStorage (untuk tes di browser).
 * Nanti di Step 3B-2 isi file ini diganti Capacitor Filesystem.
 * Selama method dan perilakunya sama, service dan UI tidak perlu disentuh.
 *
 * Aturan:
 * - Semua method async.
 * - Semua error berupa PluginStorageError dengan properti `code`.
 * - Satu plugin = satu key = satu setItem, jadi penulisan atomik (tidak ada setengah tertulis).
 *
 * Bentuk data: { manifest: {...}, code: "isi index.js" }
 */

import { isValidId } from '../core/manifest.js';

const PREFIX = 'cid:plugin:';

export class PluginStorageError extends Error {
  /**
   * @param {string} code - UNAVAILABLE | INVALID_ID | INVALID_DATA | NOT_FOUND | CORRUPT | QUOTA | IO_ERROR
   */
  constructor(code, message) {
    super(message);
    this.name = 'PluginStorageError';
    this.code = code;
  }
}

let ready = false;

/**
 * Cek bahwa backend bisa dipakai. Aman dipanggil berkali-kali.
 * Method lain memanggil ini sendiri, jadi memanggilnya manual itu opsional.
 */
export async function init() {
  if (ready) return;
  try {
    const store = getStore();
    const probe = `${PREFIX}__probe__`;
    store.setItem(probe, '1');
    store.removeItem(probe);
  } catch (err) {
    throw new PluginStorageError('UNAVAILABLE', `Penyimpanan plugin tidak tersedia: ${err.message}`);
  }
  ready = true;
}

/** @returns {Promise<string[]>} Daftar ID plugin, terurut. */
export async function list() {
  await init();
  return guard(() => {
    const store = getStore();
    const ids = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX)) {
        const id = key.slice(PREFIX.length);
        if (isValidId(id)) ids.push(id);
      }
    }
    return ids.sort();
  });
}

/** @returns {Promise<{manifest: Object, code: string}>} */
export async function read(id) {
  await init();
  assertId(id);

  const raw = guard(() => getStore().getItem(PREFIX + id));
  if (raw === null) {
    throw new PluginStorageError('NOT_FOUND', `Plugin "${id}" tidak ditemukan.`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new PluginStorageError('CORRUPT', `Data plugin "${id}" rusak (bukan JSON valid).`);
  }

  if (!isValidData(data)) {
    throw new PluginStorageError('CORRUPT', `Data plugin "${id}" rusak (bentuk tidak sesuai).`);
  }
  return data;
}

/**
 * Simpan plugin. Menimpa kalau ID sudah ada (cek bentrok adalah tugas service).
 * @param {string} id
 * @param {{manifest: Object, code: string}} data
 */
export async function write(id, data) {
  await init();
  assertId(id);

  if (!isValidData(data)) {
    throw new PluginStorageError('INVALID_DATA', 'Data harus berbentuk { manifest: object, code: string tidak kosong }.');
  }
  if (data.manifest.id !== id) {
    throw new PluginStorageError('INVALID_DATA', `manifest.id ("${data.manifest.id}") harus sama dengan id ("${id}").`);
  }

  const payload = JSON.stringify({ manifest: data.manifest, code: data.code });
  guard(() => getStore().setItem(PREFIX + id, payload));
}

/** @returns {Promise<boolean>} true kalau ada yang dihapus. */
export async function remove(id) {
  await init();
  assertId(id);

  return guard(() => {
    const store = getStore();
    const existed = store.getItem(PREFIX + id) !== null;
    store.removeItem(PREFIX + id);
    return existed;
  });
}

// --- Internal ---

function getStore() {
  const store = globalThis.localStorage;
  if (!store) throw new Error('localStorage tidak ada di lingkungan ini');
  return store;
}

function assertId(id) {
  if (!isValidId(id)) {
    throw new PluginStorageError('INVALID_ID', 'ID plugin harus camelCase (huruf/angka, diawali huruf kecil, maks 40 karakter).');
  }
}

function isValidData(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    data.manifest !== null &&
    typeof data.manifest === 'object' &&
    !Array.isArray(data.manifest) &&
    typeof data.code === 'string' &&
    data.code.length > 0
  );
}

/** Bungkus akses storage supaya error mentah selalu jadi PluginStorageError. */
function guard(fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof PluginStorageError) throw err;
    const isQuota = err?.name === 'QuotaExceededError' || err?.code === 22 || err?.code === 1014;
    throw new PluginStorageError(
      isQuota ? 'QUOTA' : 'IO_ERROR',
      isQuota ? 'Penyimpanan penuh.' : `Gagal mengakses penyimpanan: ${err.message}`
    );
  }
}
