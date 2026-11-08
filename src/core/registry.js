/**
 * registry.js
 * Daftar semua modul yang aktif di aplikasi.
 *
 * Kalau Event Bus adalah radio, Registry adalah buku telepon.
 * Siapa saja ada, bisa ditemukan di sini.
 */

export const MODULE_TYPES = {
  STORAGE: 'storage',
  TOOL: 'tool',
  PANEL: 'panel',
};

const modules = new Map();

/**
 * Daftarkan sebuah modul.
 *
 * @param {Object} definition
 * @param {string} definition.id     - ID unik, camelCase
 * @param {string} definition.type   - Salah satu dari MODULE_TYPES
 * @param {string} definition.label  - Nama tampilan di UI
 * @param {*}      definition.module - Objek modul yang sebenarnya
 * @param {string} [definition.group] - Nama grup menu di drawer (opsional)
 * @param {number} [definition.order] - Urutan di menu, kecil = atas (default 100)
 * @param {string} [definition.source] - 'builtin' (default) atau 'plugin'
 * @returns {boolean} true kalau berhasil, false kalau ditolak
 */
export function register(definition) {
  const { id, type, label, module, group, order, source } = definition;

  if (!id || !type || !module) {
    console.error('[Registry] Registrasi gagal: field id, type, dan module wajib ada.', definition);
    return false;
  }

  if (!Object.values(MODULE_TYPES).includes(type)) {
    console.error(`[Registry] Tipe modul tidak dikenal: "${type}". Gunakan MODULE_TYPES.`);
    return false;
  }

  if (modules.has(id)) {
    console.warn(`[Registry] Modul dengan ID "${id}" sudah terdaftar. Registrasi diabaikan.`);
    return false;
  }

  modules.set(id, {
    id,
    type,
    label: label || id,
    group: group || null,
    order: Number.isFinite(order) ? order : 100,
    source: source === 'plugin' ? 'plugin' : 'builtin',
    module,
  });
  return true;
}

export function get(id) {
  return modules.get(id);
}

export function getByType(type) {
  const result = [];
  modules.forEach(def => {
    if (def.type === type) result.push(def);
  });
  return result;
}

export function has(id) {
  return modules.has(id);
}

/**
 * Hapus registrasi sebuah modul.
 *
 * PERINGATAN: Registry BUKAN sandbox. Siapa pun yang bisa meng-import file ini
 * (termasuk plugin) bisa memanggil fungsi ini. Lihat docs/THREAT_MODEL.md.
 *
 * @returns {boolean} true kalau ada yang dihapus
 */
export function unregister(id) {
  return modules.delete(id);
}
