/**
 * Panel Dashboard.
 * Kontrak panel: export default { render() } yang mengembalikan elemen DOM.
 * Semua data di sini sync (dari Registry), jadi render() nggak perlu nunggu apa-apa.
 */
import { getByType, MODULE_TYPES } from '../../src/core/registry.js';

/** Satu kartu statistik. Dibikin fungsi biar gampang nambah kartu baru nanti. */
function statCard(label, initialValue) {
  const card = document.createElement('div');
  card.className = 'stat-card';

  const value = document.createElement('p');
  value.className = 'stat-card__value';
  value.textContent = initialValue;

  const caption = document.createElement('p');
  caption.className = 'stat-card__label';
  caption.textContent = label;

  card.append(value, caption);
  return { card, value };
}

export default {
  render() {
    const el = document.createElement('div');
    el.className = 'panel panel--dashboard';

    const title = document.createElement('h1');
    title.className = 'panel__title';
    title.textContent = 'Dashboard';

    const sub = document.createElement('p');
    sub.className = 'panel__subtitle';
    sub.textContent = 'Carnealthe Intelligence Documentary';

    const grid = document.createElement('div');
    grid.className = 'stat-grid';

    // Section 1: jumlah panel terdaftar (sync, dari Registry).
    const panelCount = getByType(MODULE_TYPES.PANEL).length;
    const { card: panelCard } = statCard('Panel Terdaftar', String(panelCount));

    // Section 2: jumlah tool terdaftar (sync, dari Registry).
    // Dulu di sini ada kartu "Plugin Aktif" (async, dari pluginService).
    // Dihapus karena nggak ada lagi plugin yang diinstal runtime — semua
    // modul (termasuk plugin resmi) dimuat lewat loader.js seperti panel biasa.
    const toolCount = getByType(MODULE_TYPES.TOOL).length;
    const { card: toolCard } = statCard('Tool Terdaftar', String(toolCount));

    grid.append(panelCard, toolCard);
    el.append(title, sub, grid);
    return el;
  },
};