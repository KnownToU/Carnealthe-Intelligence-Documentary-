/**
 * Panel Cases (placeholder untuk tes auto-discovery dan grouping menu).
 * Boleh dihapus kapan saja: hapus foldernya, jalankan npm run scan.
 */
export default {
  render() {
    const el = document.createElement('div');
    el.className = 'panel panel--cases';

    const title = document.createElement('h1');
    title.className = 'panel__title';
    title.textContent = 'Cases';

    const sub = document.createElement('p');
    sub.className = 'panel__subtitle';
    sub.textContent = 'Belum ada isinya. Ditemukan otomatis, tanpa edit shell.js.';

    el.append(title, sub);
    return el;
  },
};
