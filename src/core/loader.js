/**
 * loader.js
 * Menemukan dan memuat panel secara otomatis.
 *
 * Alur:
 *   panels/index.json -> tiap folder -> manifest.json -> validasi
 *   -> import dinamis index.js -> register ke Registry
 *
 * Prinsip: satu panel rusak = satu panel dilewati. Aplikasi tetap jalan.
 */

import { register } from './registry.js';
import { validateManifest } from './manifest.js';

const FOLDER_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @param {string} basePath - Folder panel, relatif ke index.html. Contoh: './panels'
 * @returns {Promise<{ loaded: string[], failed: string[] }>}
 */
export async function loadPanels(basePath) {
  // URL absolut. Penting: fetch() relatif ke halaman, import() relatif ke file ini.
  // Kalau tidak disamakan jadi URL absolut, keduanya bisa nyasar ke tempat berbeda.
  const base = new URL(basePath.replace(/\/?$/, '/'), document.baseURI);

  let folders;
  try {
    folders = await fetchJson(new URL('index.json', base));
  } catch (err) {
    console.error(`[Loader] Gagal baca ${basePath}/index.json (${err.message}). Sudah jalankan "npm run scan"?`);
    return { loaded: [], failed: [] };
  }

  if (!Array.isArray(folders)) {
    console.error('[Loader] index.json harus berupa array nama folder.');
    return { loaded: [], failed: [] };
  }

  // Muat paralel (cepat), tapi register berurutan (hasil konsisten).
  const results = await Promise.all(folders.map(folder => loadOne(base, folder)));

  const loaded = [];
  const failed = [];
  results.forEach(({ folder, def }) => {
    if (def && register(def)) loaded.push(def.id);
    else failed.push(String(folder));
  });

  return { loaded, failed };
}

async function loadOne(base, folder) {
  try {
    if (typeof folder !== 'string' || !FOLDER_PATTERN.test(folder)) {
      throw new Error('nama folder tidak valid');
    }

    const manifest = await fetchJson(new URL(`${folder}/manifest.json`, base));

    const check = validateManifest(manifest, folder);
    if (!check.ok) throw new Error(check.errors.join('; '));

    const entryUrl = new URL(`${folder}/${manifest.entry || 'index.js'}`, base);
    const mod = await import(entryUrl.href);
    const panel = mod.default;

    if (!panel || typeof panel.render !== 'function') {
      throw new Error('index.js harus melakukan export default { render() { ... } }');
    }

    return {
      folder,
      def: {
        id: manifest.id,
        type: manifest.type,
        label: manifest.label,
        group: manifest.group,
        order: manifest.order,
        module: panel,
      },
    };
  } catch (err) {
    console.warn(`[Loader] Panel "${folder}" dilewati: ${err.message}`);
    return { folder, def: null };
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url.pathname}`);
  return res.json();
}
