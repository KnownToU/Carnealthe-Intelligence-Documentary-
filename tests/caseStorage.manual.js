/**
 * Tes manual caseStorage.js (Step 6, langkah 2).
 * Taruh di tests/caseStorage.manual.js, jalankan:
 *   node tests/caseStorage.manual.js
 */
import assert from 'node:assert/strict';

// --- localStorage tiruan (harus dipasang SEBELUM modul diimpor) ---
const data = new Map();
globalThis.localStorage = {
  get length() { return data.size; },
  key(i) { return [...data.keys()][i] ?? null; },
  getItem(k) { return data.has(k) ? data.get(k) : null; },
  setItem(k, v) { data.set(k, String(v)); },
  removeItem(k) { data.delete(k); },
  clear() { data.clear(); },
};

const { createCase, getCase, listCases, addNote, listNotes, CaseStorageError } =
  await import('../src/services/caseStorage.js');
const { has, get, getByType, MODULE_TYPES } = await import('../src/core/registry.js');

// 1. Harus udah keregister ke Registry sebagai STORAGE pas file di-import.
assert.ok(has('caseStorage'), 'caseStorage harus keregister ke Registry');
assert.equal(get('caseStorage').type, MODULE_TYPES.STORAGE, 'type harus STORAGE');
assert.ok(getByType(MODULE_TYPES.STORAGE).some(d => d.id === 'caseStorage'));
console.log('[OK] caseStorage keregister sebagai module STORAGE');

// 2. Bikin case baru.
const kasus = await createCase('Kasus Tes Pertama');
assert.match(kasus.id, /^case_[a-z0-9]+$/, 'id case harus format case_xxxx');
assert.equal(kasus.title, 'Kasus Tes Pertama');
console.log(`[OK] createCase -> ${kasus.id}`);

// 3. Case baru notes-nya harus kosong.
const fresh = await getCase(kasus.id);
assert.deepEqual(fresh.notes, [], 'case baru harus belum ada notes');
console.log('[OK] getCase: notes kosong di awal');

// 4. Tambah note.
const note = await addNote(kasus.id, 'Catatan pertama dari tool.');
assert.equal(note.text, 'Catatan pertama dari tool.');
console.log(`[OK] addNote -> ${note.id}`);

// 5. listNotes harus kebaca.
const notes = await listNotes(kasus.id);
assert.equal(notes.length, 1);
assert.equal(notes[0].id, note.id);
console.log('[OK] listNotes kebaca 1 note');

// 6. listCases harus nunjukin case ini.
const cases = await listCases();
assert.ok(cases.some(c => c.id === kasus.id), 'listCases harus ada case yang baru dibikin');
console.log('[OK] listCases nunjukin case yang baru dibikin');

// 7. Case yang nggak ada -> NOT_FOUND.
await assert.rejects(
  () => getCase('case_tidakada123'),
  (err) => err instanceof CaseStorageError && err.code === 'NOT_FOUND',
  'getCase ke id yang nggak ada harus lempar NOT_FOUND'
);
console.log('[OK] getCase id nggak ada -> NOT_FOUND');

// 8. title kosong -> INVALID_DATA.
await assert.rejects(
  () => createCase('   '),
  (err) => err instanceof CaseStorageError && err.code === 'INVALID_DATA',
  'createCase title kosong harus lempar INVALID_DATA'
);
console.log('[OK] createCase title kosong -> INVALID_DATA');

console.log('\nSEMUA TES LOLOS. caseStorage.js jalan bener (untuk subset Case + Note).');
