/**
 * Tes manual: ctx.saveToCase beneran nulis note ke caseStorage (Step 6, langkah 3).
 * Taruh di tests/saveToCase.manual.js, jalankan:
 *   node tests/saveToCase.manual.js
 */
import assert from 'node:assert/strict';

const data = new Map();
globalThis.localStorage = {
  get length() { return data.size; },
  key(i) { return [...data.keys()][i] ?? null; },
  getItem(k) { return data.has(k) ? data.get(k) : null; },
  setItem(k, v) { data.set(k, String(v)); },
  removeItem(k) { data.delete(k); },
  clear() { data.clear(); },
};

const { buildCtx } = await import('../src/core/capabilities.js');
const { createCase, listNotes } = await import('../src/services/caseStorage.js');

// Siapin satu case buat disasar.
const kasus = await createCase('Case buat tes ctx.saveToCase');

// Builtin tool -> ctx.saveToCase harus ADA dan manggilnya harus beneran nulis note.
const builtinCtx = buildCtx(['saveToCase'], 'builtin');
assert.equal(typeof builtinCtx.saveToCase, 'function', 'builtin harus dapet ctx.saveToCase sebagai function');

const note = await builtinCtx.saveToCase(kasus.id, 'Hasil dari tool, teks biasa.');
assert.equal(note.text, 'Hasil dari tool, teks biasa.');

const notesAfterText = await listNotes(kasus.id);
assert.equal(notesAfterText.length, 1, 'note harus beneran kesimpen di caseStorage');
console.log('[OK] ctx.saveToCase(caseId, string) nulis note beneran');

// Data objek harus di-JSON.stringify otomatis, bukan bikin tool crash.
await builtinCtx.saveToCase(kasus.id, { sumber: 'osint', url: 'https://contoh.test' });
const notesAfterObj = await listNotes(kasus.id);
assert.equal(notesAfterObj.length, 2);
assert.match(notesAfterObj[1].text, /"sumber":"osint"/);
console.log('[OK] ctx.saveToCase(caseId, objek) di-JSON.stringify otomatis');

// Plugin -> ctx.saveToCase harus TETAP kosong (mitigasi langkah 1 masih berlaku).
const pluginCtx = buildCtx(['saveToCase'], 'plugin');
assert.equal(pluginCtx.saveToCase, undefined, 'plugin masih HARUS ditolak dari saveToCase');
console.log('[OK] plugin masih ditolak (mitigasi langkah 1 nggak kebawa ke-override)');

console.log('\nSEMUA TES LOLOS. ctx.saveToCase nyambung beneran ke caseStorage, dan mitigasi plugin masih jalan.');
