// Plugin contoh. Satu file, tanpa import relatif.
export default {
  render() {
    const el = document.createElement('div');
    el.className = 'panel';
    const h = document.createElement('h1');
    h.className = 'panel__title';
    h.textContent = 'Hello dari plugin';
    const p = document.createElement('p');
    p.className = 'panel__subtitle';
    p.textContent = 'Kalau ini muncul, instalasi dan Blob URL jalan.';
    el.append(h, p);
    return el;
  },
};
