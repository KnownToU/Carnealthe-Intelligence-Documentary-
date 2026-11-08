/**
 * pluginStorage.js
 * Satu-satunya pintu akses penyimpanan plugin.
 *
 * Backend: Capacitor Filesystem (Directory.Data) kalau tersedia,
 * fallback ke localStorage kalau tidak (browser dev, `npm test`).
 *
 * Aturan:
 * - Semua method async.
 * - Semua error berupa PluginStorageError dengan properti `code`.
 * - Layout Capacitor: plugins/<id>/index.js + plugins/<id>/manifest.json
 * - Penulisan TIDAK atomik: index.js ditulis dulu, manifest.json terakhir.
 *   Kalau manifest gagal ditulis, folder di-rollback (dihapus).
 *   list() hanya menghitung folder yang punya manifest.json.
 *
 * Bentuk data: { manifest: {...}, code: "isi index.js" }
 */

import { isValidId } from '../core/manifest.js';

const PREFIX = 'cid:plugin:'; // dipakai backend localStorage
const PLUGINS_DIR = 'plugins'; // dipakai backend Capacitor
const FS_DIRECTORY = 'DATA'; // Directory.Data, ditulis manual (tanpa bundler, enum tidak bisa diimport)

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

/** Cek apakah Capacitor Filesystem tersedia di lingkungan ini. */
function hasCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.Plugins?.Filesystem;
}

/**
 * Cek bahwa backend bisa dipakai. Aman dipanggil berkali-kali.
 * Method lain memanggil ini sendiri, jadi memanggilnya manual itu opsional.
 */
export async function init() {
  if (ready) return;
  if (hasCapacitor()) {
    // Tidak ada "probe" yang murah untuk Filesystem plugin, jadi anggap siap
    // kalau objeknya ada. Kegagalan nyata akan ketangkep di method lain.
    ready = true;
    return;
  }
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

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    let entries;
    try {
      const res = await Filesystem.readdir({ path: PLUGINS_DIR, directory: FS_DIRECTORY });
      entries = res.files || [];
    } catch (err) {
      // Folder plugins/ belum pernah dibuat (belum ada plugin terinstal sama sekali).
      // CATATAN: Capacitor tidak punya kode error yang konsisten lintas platform
      // untuk "folder tidak ada", jadi di sini SEMUA error readdir pada folder dasar
      // dianggap "belum ada plugin". Ini simplifikasi yang disengaja untuk MVP —
      // kalau suatu saat folder plugins/ somehow rusak/kebaca error lain, gejalanya
      // cuma "plugin kelihatan kosong padahal ada", bukan crash. Non-fatal, tapi
      // catat ini di THREAT_MODEL kalau mau diperbaiki nanti.
      return [];
    }

    const ids = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (!isValidId(name)) continue;
      try {
        await Filesystem.readFile({
          path: `${PLUGINS_DIR}/${name}/manifest.json`,
          directory: FS_DIRECTORY,
          encoding: 'utf8',
        });
        ids.push(name);
      } catch {
        // Tidak ada manifest.json = folder zombie (write setengah jalan). Lewati.
      }
    }
    return ids.sort();
  }

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

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const base = `${PLUGINS_DIR}/${id}`;
    let manifestRaw, codeRaw;
    try {
      manifestRaw = (await Filesystem.readFile({
        path: `${base}/manifest.json`,
        directory: FS_DIRECTORY,
        encoding: 'utf8',
      })).data;
      codeRaw = (await Filesystem.readFile({
        path: `${base}/index.js`,
        directory: FS_DIRECTORY,
        encoding: 'utf8',
      })).data;
    } catch (err) {
      throw new PluginStorageError('NOT_FOUND', `Plugin "${id}" tidak ditemukan.`);
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new PluginStorageError('CORRUPT', `Data plugin "${id}" rusak (manifest bukan JSON valid).`);
    }

    const data = { manifest, code: codeRaw };
    if (!isValidData(data)) {
      throw new PluginStorageError('CORRUPT', `Data plugin "${id}" rusak (bentuk tidak sesuai).`);
    }
    return data;
  }

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

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const base = `${PLUGINS_DIR}/${id}`;

    try {
      await Filesystem.writeFile({
        path: `${base}/index.js`,
        data: data.code,
        directory: FS_DIRECTORY,
        encoding: 'utf8',
        recursive: true,
      });
    } catch (err) {
      throw new PluginStorageError('IO_ERROR', `Gagal menulis kode plugin "${id}": ${err.message}`);
    }

    try {
      await Filesystem.writeFile({
        path: `${base}/manifest.json`,
        data: JSON.stringify(data.manifest),
        directory: FS_DIRECTORY,
        encoding: 'utf8',
        recursive: true,
      });
    } catch (err) {
      // Rollback: index.js sudah tertulis tapi manifest gagal -> hapus folder
      // biar gak jadi zombie separuh-jadi.
      try {
        await Filesystem.rmdir({ path: base, directory: FS_DIRECTORY, recursive: true });
      } catch {
        // Rollback gagal pun tidak fatal untuk sesi ini: list() tetap akan
        // melewati folder ini karena manifest.json tidak ada.
      }
      throw new PluginStorageError('IO_ERROR', `Gagal menulis manifest plugin "${id}": ${err.message}`);
    }
    return;
  }

  const payload = JSON.stringify({ manifest: data.manifest, code: data.code });
  guard(() => getStore().setItem(PREFIX + id, payload));
}

/** @returns {Promise<boolean>} true kalau ada yang dihapus. */
export async function remove(id) {
  await init();
  assertId(id);

  if (hasCapacitor()) {
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const base = `${PLUGINS_DIR}/${id}`;

    let existed = true;
    try {
      await Filesystem.stat({ path: base, directory: FS_DIRECTORY });
    } catch {
      existed = false;
    }
    if (!existed) return false;

    try {
      await Filesystem.rmdir({ path: base, directory: FS_DIRECTORY, recursive: true });
    } catch (err) {
      throw new PluginStorageError('IO_ERROR', `Gagal menghapus plugin "${id}": ${err.message}`);
    }
    return true;
  }

  return guard(() => {
    const store = getStore();
    const existed = store.getItem(PREFIX + id) !== null;
    store.removeItem(PREFIX + id);
    return existed;
  });
}

// --- Internal (localStorage) ---

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