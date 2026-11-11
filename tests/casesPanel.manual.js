/**
 * Tes manual panels/cases/index.js (Step 6, langkah 7 - UI Cases).
 * Jalankan: node tests/casesPanel.manual.js
 *
 * Panel ini pakai DOM asli (document.createElement, dst) yang nggak ada di
 * Node polos. Daripada install jsdom (dependency berat buat satu tes), kita
 * bikin shim MINIMAL: cuma method yang beneran dipakai di cases/index.js
 * (append, replaceChildren, addEventListener, setAttribute, className,
 * textContent). Ini BUKAN browser beneran — tes ini nge-cek logika alurnya
 * (render -> list -> klik case -> detail notes -> kembali), bukan tampilan
 * visual. Tampilan visualnya tetep harus dicek di APK/browser.
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
    this.style = {}; // shim minimal: cuma biar `.style.xxx = ...` nggak meledak
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

// 1. Render pertama kali -> struktur: h1, p, body(list view di dalamnya).
const root = panel.render();
assert.equal(root.className, 'panel panel--cases');
await flush(); // kasih waktu refreshList() (fire-and-forget di dalam render) jalan

const [titleEl, subEl, body] = root.children;
assert.equal(titleEl.textContent, 'Cases');
console.log('[OK] render() balikin struktur panel yang bener');

// 2. List view: belum ada case -> list nunjukin "Belum ada case."
let [newBtn, list, feedback] = body.children;
assert.equal(list.children.length, 1);
assert.equal(list.children[0].textContent, 'Belum ada case.');
console.log('[OK] list kosong nunjukin pesan "Belum ada case."');

// 3. Klik "Case Baru" dengan prompt ngembaliin judul.
promptQueue.push('Kasus Dari Tes Panel');
await newBtn.dispatch('click');

assert.equal(feedback.textContent, 'Case dibuat.');
assert.equal(list.children.length, 1, 'list harus kerefresh, isi 1 case');
const row = list.children[0];
assert.equal(row.children[0].children[0].textContent, 'Kasus Dari Tes Panel');
console.log('[OK] klik "Case Baru" -> createCase() -> list kerefresh nunjukin case baru');

// 4. Klik "Case Baru" lagi tapi user cancel (prompt balikin null) -> nggak nambah apa-apa.
await newBtn.dispatch('click'); // promptQueue kosong -> prompt() balikin null
assert.equal(list.children.length, 1, 'cancel nggak boleh nambah case');
console.log('[OK] cancel prompt -> tidak ada case baru dibuat');

// 5. Klik barisnya -> pindah ke detail view, nunjukin judul case + notes (masih kosong).
await row.dispatch('click');
const [backBtn, caseTitle, evidenceCount, uploadBtn, fileInput, notesList, , , detailFeedback] = body.children;
assert.equal(caseTitle.textContent, 'Kasus Dari Tes Panel', 'detail harus nunjukin judul case yang bener');
assert.equal(evidenceCount.textContent, '0 evidence', 'case baru belum punya evidence apa pun');
assert.equal(notesList.children.length, 1);
assert.equal(notesList.children[0].textContent, 'Belum ada catatan di case ini.');
assert.equal(detailFeedback.textContent, '', 'nggak boleh ada error feedback kalau case ketemu');
console.log('[OK] klik case -> detail view nunjukin judul case + "Belum ada catatan" + "0 evidence"');

// 6. Klik "Kembali" -> balik ke list view, case yang tadi masih ada.
await backBtn.dispatch('click');
await flush(); // showList() manggil refreshList() tanpa di-await (fire-and-forget)
[newBtn, list, feedback] = body.children;
assert.equal(list.children.length, 1, 'balik ke list, case yang tadi harus masih ada');
console.log('[OK] klik "Kembali" -> balik ke list view');

// 7. addNote langsung lewat caseStorage (bukan lewat panel - belum ada tombol
//    tambah note di UI), terus buka detail lagi -> notes-nya harus kebaca.
const { addNote, listCases: listCasesAgain } = await import('../src/services/caseStorage.js');
const [{ id: firstCaseId }] = await listCasesAgain();
await addNote(firstCaseId, 'Catatan ditambahin manual lewat storage.');

await row.dispatch('click');
const [, , , , , notesList2] = body.children;
assert.equal(notesList2.children.length, 1);
assert.equal(
  notesList2.children[0].children[0].children[0].textContent,
  'Catatan ditambahin manual lewat storage.'
);
console.log('[OK] detail view kebaca notes yang ditambahin lewat caseStorage');

console.log('\nSEMUA TES LOLOS. panels/cases/index.js (list + create + detail notes) jalan bener.');
