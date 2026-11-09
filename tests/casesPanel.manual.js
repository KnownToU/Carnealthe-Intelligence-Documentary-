/**
 * Tes manual panels/cases/index.js (Step 6, langkah 7 - UI Cases langkah 1).
 * Jalankan: node tests/casesPanel.manual.js
 *
 * Panel ini pakai DOM asli (document.createElement, dst) yang nggak ada di
 * Node polos. Daripada install jsdom (dependency berat buat satu tes), kita
 * bikin shim MINIMAL: cuma method yang beneran dipakai di cases/index.js
 * (append, replaceChildren, addEventListener, setAttribute, className,
 * textContent). Ini BUKAN browser beneran — tes ini nge-cek logika alurnya
 * (render -> list kebaca -> klik -> case nambah), bukan tampilan visual.
 * Tampilan visualnya tetep harus dicek di APK/browser.
 */
import assert from 'node:assert/strict';

// --- localStorage tiruan (dipasang SEBELUM caseStorage.js diimpor) ---
const storeData = new Map();
globalThis.localStorage = {
  get length() { return storeData.size; },
  key(i) { return [...storeData.keys()][i] ?? null; },
  getItem(k) { return storeData.has(k) ? storeData.get(k) : null; },
  setItem(k, v) { storeData.set(k, String(v)); },
  removeItem(k) { storeData.delete(k); },
  clear() { storeData.clear(); },
};

// --- DOM shim minimal ---
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.type = '';
    this.disabled = false;
    this.children = [];
    this._listeners = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, fn) { this._listeners[type] = fn; }
  setAttribute(k, v) { this[k] = v; }
  // Bukan DOM API beneran — helper tes buat simulasi klik/trigger event.
  dispatch(type) { return this._listeners[type]?.(); }
}
globalThis.document = { createElement: (tag) => new FakeNode(tag) };

// --- prompt() tiruan: kontrol lewat promptQueue ---
const promptQueue = [];
globalThis.prompt = () => promptQueue.shift() ?? null;

const flush = () => new Promise((r) => setTimeout(r, 0));

const panel = (await import('../panels/cases/index.js')).default;

// 1. Render pertama kali.
const root = panel.render();
assert.equal(root.className, 'panel panel--cases');
await flush(); // kasih waktu refreshList() (fire-and-forget di dalam render) jalan

// Urutan append di root.append(...): h1, p, newBtn, list, feedback
const [titleEl, subEl, newBtn, list, feedback] = root.children;
assert.equal(titleEl.textContent, 'Cases');
assert.equal(newBtn.tagName, 'button');
console.log('[OK] render() balikin struktur panel yang bener');

// 2. Awal mula: belum ada case -> list nunjukin "Belum ada case."
assert.equal(list.children.length, 1);
assert.equal(list.children[0].textContent, 'Belum ada case.');
console.log('[OK] list kosong nunjukin pesan "Belum ada case."');

// 3. Klik "Case Baru" dengan prompt ngembaliin judul.
promptQueue.push('Kasus Dari Tes Panel');
await newBtn.dispatch('click');

assert.equal(feedback.textContent, 'Case dibuat.');
assert.equal(list.children.length, 1, 'list harus kerefresh, isi 1 case');
const row = list.children[0];
const info = row.children[0];
assert.equal(info.children[0].textContent, 'Kasus Dari Tes Panel');
console.log('[OK] klik "Case Baru" -> createCase() -> list kerefresh nunjukin case baru');

// 4. Klik "Case Baru" lagi tapi user cancel (prompt balikin null) -> nggak nambah apa-apa.
await newBtn.dispatch('click'); // promptQueue kosong -> prompt() balikin null
assert.equal(list.children.length, 1, 'cancel nggak boleh nambah case');
console.log('[OK] cancel prompt -> tidak ada case baru dibuat');

console.log('\nSEMUA TES LOLOS. panels/cases/index.js (langkah 1: list + create) jalan bener.');
