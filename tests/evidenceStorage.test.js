/**
 * Tes evidenceStorage (Node, tanpa browser).
 * Jalankan: npm test
 *
 * Nutup begin/append/finish (termasuk streaming per-chunk) + listEvidence +
 * getEvidenceMeta. abortEvidence/readEvidence/deleteEvidence belum ada,
 * jadi belum dites di sini.
 */

import assert from 'node:assert/strict';

// --- localStorage tiruan, pola sama kayak tests/installer.test.js dulu ---
const data = new Map();
const ls = {
  failSet: false,
  get length() { return data.size; },
  key(i) { return [...data.keys()][i] ?? null; },
  getItem(k) { return data.has(k) ? data.get(k) : null; },
  setItem(k, v) {
    if (ls.failSet) {
      const e = new Error('quota penuh');
      e.name = 'QuotaExceededError';
      throw e;
    }
    data.set(k, String(v));
  },
  removeItem(k) { data.delete(k); },
  clear() { data.clear(); },
};
globalThis.localStorage = ls;

const es = await import('../src/services/evidenceStorage.js');

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('PASS', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '\n     ', e.message);
  }
}

async function rejectsCode(promise, code) {
  try {
    await promise;
  } catch (e) {
    assert.equal(e.code, code, `code seharusnya ${code}, dapat ${e.code} (${e.message})`);
    return;
  }
  assert.fail(`seharusnya melempar error ${code}`);
}

await test('beginEvidence: tolak caseId kosong/bukan teks', async () => {
  await rejectsCode(es.beginEvidence(''), 'INVALID_DATA');
  await rejectsCode(es.beginEvidence(null), 'INVALID_DATA');
});

await test('appendEvidence: tolak sessionId salah dan chunk bukan Uint8Array', async () => {
  const sid = await es.beginEvidence('case_abc');
  await rejectsCode(es.appendEvidence('sesi_ngawur', new Uint8Array()), 'NOT_FOUND');
  await rejectsCode(es.appendEvidence(sid, 'bukan uint8array'), 'INVALID_DATA');
  // sesi masih hidup, belum di-finish -> buang biar gak nyampah ke tes lain
  await es.finishEvidence(sid);
});

await test('finishEvidence: tanpa chunk apa pun -> size 0, hash ditunda (null)', async () => {
  const sid = await es.beginEvidence('case_abc', { name: 'kosong.txt' });
  const rec = await es.finishEvidence(sid);
  assert.equal(rec.size, 0);
  assert.equal(rec.hash, null);
  assert.equal(rec.caseId, 'case_abc');
  assert.equal(rec.name, 'kosong.txt');
});

await test('finishEvidence: gabung multi-chunk, hash ditunda (null), caseId & meta nyambung', async () => {
  const sid = await es.beginEvidence('case_xyz', { name: 'abc.bin', mimeType: 'text/plain' });
  await es.appendEvidence(sid, new TextEncoder().encode('a'));
  await es.appendEvidence(sid, new TextEncoder().encode('b'));
  await es.appendEvidence(sid, new TextEncoder().encode('c'));
  const rec = await es.finishEvidence(sid);

  assert.equal(rec.size, 3);
  assert.equal(rec.hash, null);
  assert.equal(rec.caseId, 'case_xyz');
  assert.equal(rec.name, 'abc.bin');
  assert.equal(rec.mimeType, 'text/plain');
  assert.ok(rec.id.startsWith('ev_'));
  assert.ok(new Date(rec.createdAt).toString() !== 'Invalid Date');
});

await test('finishEvidence: data beneran kesimpen & bisa dibaca balik utuh', async () => {
  const sid = await es.beginEvidence('case_xyz', { name: 'roundtrip.bin' });
  const original = new TextEncoder().encode('abc');
  await es.appendEvidence(sid, original);
  const rec = await es.finishEvidence(sid);

  const raw = ls.getItem('cid:evidence:' + rec.id);
  assert.ok(raw, 'tidak ketemu di localStorage');
  const parsed = JSON.parse(raw);
  assert.deepEqual(parsed.meta, rec);

  const roundtrip = Uint8Array.from(atob(parsed.dataBase64), c => c.charCodeAt(0));
  assert.deepEqual(roundtrip, original);
});

await test('finishEvidence: sesi yang sama tidak bisa di-finish dua kali', async () => {
  const sid = await es.beginEvidence('case_xyz');
  await es.finishEvidence(sid);
  await rejectsCode(es.finishEvidence(sid), 'NOT_FOUND');
});

await test('finishEvidence: sessionId ngawur ditolak', async () => {
  await rejectsCode(es.finishEvidence('tidak_pernah_ada'), 'NOT_FOUND');
});

await test('default meta: name/mimeType jatuh ke default kalau tidak dikasih', async () => {
  const sid = await es.beginEvidence('case_xyz');
  const rec = await es.finishEvidence(sid);
  assert.equal(rec.name, 'evidence');
  assert.equal(rec.mimeType, 'application/octet-stream');
});

await test('listEvidence: tolak caseId kosong/bukan teks', async () => {
  await rejectsCode(es.listEvidence(''), 'INVALID_DATA');
  await rejectsCode(es.listEvidence(null), 'INVALID_DATA');
});

await test('listEvidence: caseId valid tapi nggak punya evidence -> array kosong (bukan error)', async () => {
  const result = await es.listEvidence('case_sepi_banget');
  assert.deepEqual(result, []);
});

await test('listEvidence: cuma balikin evidence milik caseId yang diminta, urut dari paling lama', async () => {
  const caseA = `case_a_${Math.random().toString(36).slice(2, 8)}`;
  const caseB = `case_b_${Math.random().toString(36).slice(2, 8)}`;

  const s1 = await es.beginEvidence(caseA, { name: 'satu.txt' });
  const rec1 = await es.finishEvidence(s1);
  const s2 = await es.beginEvidence(caseB, { name: 'punya-b.txt' });
  await es.finishEvidence(s2);
  const s3 = await es.beginEvidence(caseA, { name: 'dua.txt' });
  const rec3 = await es.finishEvidence(s3);

  const list = await es.listEvidence(caseA);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((m) => m.id), [rec1.id, rec3.id]);
  assert.ok(list.every((m) => m.caseId === caseA));
});

await test('getEvidenceMeta: tolak id kosong/bukan teks', async () => {
  await rejectsCode(es.getEvidenceMeta(''), 'INVALID_DATA');
  await rejectsCode(es.getEvidenceMeta(null), 'INVALID_DATA');
});

await test('getEvidenceMeta: id nggak exist -> NOT_FOUND', async () => {
  await rejectsCode(es.getEvidenceMeta('ev_ngawur_123'), 'NOT_FOUND');
});

await test('getEvidenceMeta: id exist -> balikin metadata yang sama persis dengan hasil finishEvidence', async () => {
  const sid = await es.beginEvidence('case_xyz', { name: 'cek-meta.bin' });
  const rec = await es.finishEvidence(sid);
  const meta = await es.getEvidenceMeta(rec.id);
  assert.deepEqual(meta, rec);
});

console.log(failed === 0 ? '\nSEMUA TES LULUS' : `\n${failed} TES GAGAL`);
process.exit(failed === 0 ? 0 : 1);
