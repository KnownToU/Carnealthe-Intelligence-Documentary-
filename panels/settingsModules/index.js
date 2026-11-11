/**
 * Panel Settings -> Modules.
 *
 * DULU: panel ini punya installer (pilih manifest.json + index.js dari HP,
 * install plugin pihak ketiga runtime). Dihapus karena satu-satunya plugin
 * yang bakal pernah ada di CID adalah plugin resmi buatan sendiri — plugin
 * resmi masuk lewat folder (scan otomatis, sama kayak Case Manager sekarang),
 * bukan lewat install dari UI. Lihat docs/THREAT_MODEL.md untuk alasan lengkap.
 *
 * Sekarang panel ini CUMA nampilin modul yang lagi aktif (read-only).
 * Nggak ada logika apa-apa di sini selain baca Registry, jadi nggak perlu
 * service layer terpisah.
 */
import { getByType, MODULE_TYPES } from '../../src/core/registry.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent, bukan innerHTML: aman dari XSS
  return node;
}

const TYPE_LABEL = {
  [MODULE_TYPES.PANEL]: 'Panel',
  [MODULE_TYPES.TOOL]: 'Tool',
  [MODULE_TYPES.STORAGE]: 'Storage',
};

function renderRow(item) {
  const row = el('li', 'module-row');
  const info = el('div', 'module-row__info');
  info.append(
    el('div', 'module-row__name', item.label),
    el('div', 'module-row__meta', `${item.id} · ${TYPE_LABEL[item.type] || item.type}`)
  );
  row.append(info);
  return row;
}

export default {
  render() {
    const root = el('div', 'panel panel--modules');
    const list = el('ul', 'module-list');

    const allModules = [
      ...getByType(MODULE_TYPES.PANEL),
      ...getByType(MODULE_TYPES.TOOL),
      ...getByType(MODULE_TYPES.STORAGE),
    ];

    if (allModules.length === 0) {
      list.append(el('li', 'module-empty', 'Belum ada modul terdaftar.'));
    } else {
      allModules.forEach(item => list.append(renderRow(item)));
    }

    root.append(
      el('h1', 'panel__title', 'Modules'),
      el('p', 'panel__subtitle', 'Modul terdaftar (builtin + plugin resmi)'),
      list
    );
    return root;
  },
};
