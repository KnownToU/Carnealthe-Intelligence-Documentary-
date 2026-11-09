/**
 * Tes manual mitigasi capability-gating (Step 6, langkah 1).
 * Taruh file ini di tests/capabilityGate.manual.js lalu jalankan:
 *   node tests/capabilityGate.manual.js
 *
 * Tidak butuh browser/server, karena buildCtx() murni logic, tidak sentuh DOM.
 */
import assert from 'node:assert/strict';
import { buildCtx } from '../src/core/capabilities.js';

const ALL_CAPS = ['saveToCase', 'http', 'readFile'];

// Builtin tool (kode yang ikut repo) -> harus dapet ctx penuh.
const builtinCtx = buildCtx(ALL_CAPS, 'builtin');
assert.ok(builtinCtx.saveToCase, 'builtin harus dapet saveToCase');
assert.ok(builtinCtx.http, 'builtin harus dapet http');
assert.ok(builtinCtx.readFile, 'builtin harus dapet readFile');
console.log('[OK] builtin dapet ctx penuh');

// Tanpa source (default / undefined) -> harus diperlakukan sama kayak builtin,
// soalnya panel bawaan lama (sebelum ada konsep plugin) manggil tanpa source.
const noSourceCtx = buildCtx(ALL_CAPS, undefined);
assert.ok(noSourceCtx.saveToCase, 'tanpa source harus tetap dapet saveToCase (anggap builtin)');
console.log('[OK] tanpa source diperlakukan sebagai builtin');

// Plugin (diinstal user dari luar) -> capability sensitif harus KOSONG.
const pluginCtx = buildCtx(ALL_CAPS, 'plugin');
assert.equal(pluginCtx.saveToCase, undefined, 'plugin TIDAK BOLEH dapet saveToCase');
assert.equal(pluginCtx.http, undefined, 'plugin TIDAK BOLEH dapet http');
assert.equal(pluginCtx.readFile, undefined, 'plugin TIDAK BOLEH dapet readFile');
console.log('[OK] plugin ditolak buat ketiga capability sensitif');

console.log('\nSEMUA TES LOLOS. Mitigasi capability-gating jalan bener.');
