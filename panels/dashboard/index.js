/**
 * Panel Dashboard.
 * Kontrak panel: export default { render() } yang mengembalikan elemen DOM.
 */
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

    const info = document.createElement('p');
    info.style.cssText = 'color: var(--color-text-muted); margin-top: 1rem;';
    info.textContent = 'Panel ini ditemukan otomatis dari folder panels/.';

    el.append(title, sub, info);
    return el;
  },
};
