/**
 * Tes manual evidenceUpload.js (Step 6, langkah upload UI - bagian slicing).
 * Jalankan: node tests/evidenceUpload.manual.js
 *
 * Ini logic BARU (motong File jadi chunk pake RECOMMENDED_CHUNK_SIZE),
 * beda dari evidenceStorage.test.js yang manggil appendEvidence manual satu
 * chunk kecil doang. Fokus di sini: batas-batas slicing (pas kebagi, nggak
 * pas kebagi, kosong) ngasilin bytes yang SAMA PERSIS kayak aslinya.
 *
 * Node 20+ punya `File`/`Blob` global bawaan, jadi nggak butuh jsdom.
 */
import assert from 'node:assert/strict';

const storeData = new Map();
globalThis.localStorage = {
  get length() { return storeData.size; },
  key(i) { return [...storeData.keys()][i] ?? null; },
  getItem(k) { return storeData.has(k) ? storeData.get(k) : null; },
  setItem(k, v) { storeData.set(k, String(v)); },
  removeItem(k) { storeData.delete(k); },
  clear() { storeData.clear(); },
};

const { RECOMMENDED_CHUNK_SIZE } = await import('../src/services/evidenceStorage.js');
const { uploadEvidenceFile } = await import('../src/services/evidenceUpload.js');

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('[OK]', name);
  } catch (e) {
    failed++;
    console.log('[GAGAL]', name, '\n       ', e.message);
  }
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Baca balik bytes yang kesimpen di localStorage buat satu record evidence. */
function readStoredBytes(id) {
  const raw = localStorage.getItem('cid:evidence:' + id);
  assert.ok(raw, `evidence "${id}" tidak ketemu di localStorage`);
  const parsed = JSON.parse(raw);
  return Uint8Array.from(atob(parsed.dataBase64), (c) => c.charCodeAt(0));
}

await test('file lebih kecil dari satu chunk -> kesimpen utuh', async () => {
  const bytes = randomBytes(10);
  const file = new File([bytes], 'kecil.bin', { type: 'application/octet-stream' });
  const rec = await uploadEvidenceFile('case_kecil', file);
  assert.equal(rec.size, 10);
  assert.equal(rec.name, 'kecil.bin');
  assert.deepEqual(readStoredBytes(rec.id), bytes);
});

await test('file PAS sama dengan ukuran chunk -> satu chunk, bukan dua (nggak ada iterasi kosong)', async () => {
  const bytes = randomBytes(RECOMMENDED_CHUNK_SIZE);
  const file = new File([bytes], 'pas.bin');
  const rec = await uploadEvidenceFile('case_pas', file);
  assert.equal(rec.size, RECOMMENDED_CHUNK_SIZE);
  assert.deepEqual(readStoredBytes(rec.id), bytes);
});

await test('file sedikit lebih besar dari satu chunk -> kepotong 2 chunk, gabung bener', async () => {
  const bytes = randomBytes(RECOMMENDED_CHUNK_SIZE + 1234);
  const file = new File([bytes], 'lebih.bin');
  const rec = await uploadEvidenceFile('case_lebih', file);
  assert.equal(rec.size, RECOMMENDED_CHUNK_SIZE + 1234);
  assert.deepEqual(readStoredBytes(rec.id), bytes);
});

await test('file kosong (0 byte) -> tetap kesimpen sebagai evidence 0 byte, bukan error', async () => {
  const file = new File([], 'kosong.bin');
  const rec = await uploadEvidenceFile('case_kosong', file);
  assert.equal(rec.size, 0);
  assert.deepEqual(readStoredBytes(rec.id), new Uint8Array(0));
});

if (failed > 0) {
  console.log(`\n${failed} TES GAGAL`);
  process.exitCode = 1;
} else {
  console.log('\nSEMUA TES LOLOS');
}
