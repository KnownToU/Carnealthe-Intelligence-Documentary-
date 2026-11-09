/**
 * Panel Dashboard.
 * Kontrak panel: export default { render() } yang mengembalikan elemen DOM.
 *
 * render() harus sync, tapi sebagian data (status plugin) datangnya async.
 * Pola: tampilkan dulu yang sync, isi yang async setelah resolve.
 */
import { getByType, MODULE_TYPES } from '../../src/core/registry.js';
import { getInstalled } from '../../src/services/pluginService.js';

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

    // Section 2: status plugin (async, dari pluginService).
    const { card: pluginCard, value: pluginValue } = statCard('Plugin Aktif', '...');
    getInstalled()
      .then((plugins) => {
        const active = plugins.filter((p) => p.status === 'active').length;
        pluginValue.textContent = `${active} / ${plugins.length}`;
      })
      .catch(() => {
        // getInstalled() tidak pernah melempar di desain pluginService,
        // tapi dijaga saja supaya Dashboard tidak ikut rusak kalau suatu
        // saat itu berubah.
        pluginValue.textContent = '?';
      });

    grid.append(panelCard, pluginCard);
    el.append(title, sub, grid);
    return el;
  },
};