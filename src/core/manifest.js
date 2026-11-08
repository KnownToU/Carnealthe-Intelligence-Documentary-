/**
 * manifest.js
 * Validasi manifest.json milik panel (nanti dipakai juga untuk plugin).
 *
 * Fungsi murni: tidak menyentuh DOM, tidak fetch.
 * Jadi gampang dites dan tidak bisa bikin aplikasi crash.
 */

const ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/; // camelCase
const ENTRY_PATTERN = /^[a-zA-Z0-9_-]+\.js$/; // satu nama file, tanpa slash
const ALLOWED_TYPES = ['panel'];

/** ID valid = camelCase, maksimal 40 karakter. Dipakai juga oleh storage plugin. */
export function isValidId(id) {
  return typeof id === 'string' && id.length <= 40 && ID_PATTERN.test(id);
}

/**
 * @param {*} manifest        - Hasil parse manifest.json
 * @param {string} [folderName] - Nama folder tempat manifest berada (kosong = cek id==folder dilewati)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateManifest(manifest, folderName) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest bukan objek JSON'] };
  }

  const errors = [];
  const { id, type, label, version, entry, group, order } = manifest;

  if (!isValidId(id)) {
    errors.push('id harus camelCase (huruf/angka, diawali huruf kecil)');
  } else if (folderName !== undefined && id !== folderName) {
    errors.push(`id "${id}" harus sama dengan nama folder "${folderName}"`);
  }

  if (!ALLOWED_TYPES.includes(type)) {
    errors.push(`type harus salah satu dari: ${ALLOWED_TYPES.join(', ')}`);
  }

  if (typeof label !== 'string' || !label.trim() || label.length > 40) {
    errors.push('label wajib berupa teks 1-40 karakter');
  }

  if (typeof version !== 'string' || !version.trim()) {
    errors.push('version wajib berupa teks, misalnya "0.1.0"');
  }

  if (entry !== undefined && (typeof entry !== 'string' || !ENTRY_PATTERN.test(entry))) {
    errors.push('entry harus berupa satu nama file .js (tanpa folder)');
  }

  if (group !== undefined && (typeof group !== 'string' || !group.trim() || group.length > 40)) {
    errors.push('group harus berupa teks 1-40 karakter');
  }

  if (order !== undefined && !Number.isFinite(order)) {
    errors.push('order harus berupa angka');
  }

  return { ok: errors.length === 0, errors };
}
