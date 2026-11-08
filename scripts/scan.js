/**
 * scripts/scan.js
 * Jalan di Node/Termux (BUKAN di browser).
 *
 * Browser tidak bisa "ls" folder, jadi script ini yang melakukannya:
 * memindai panels/, mencari subfolder yang punya manifest.json,
 * lalu menulis daftarnya ke panels/index.json.
 *
 * Pakai: npm run scan
 * Jalankan setiap habis nambah/hapus folder panel.
 */

import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panelsDir = path.join(root, 'panels');

const entries = await readdir(panelsDir, { withFileTypes: true });
const folders = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;

  if (!existsSync(path.join(panelsDir, entry.name, 'manifest.json'))) {
    console.warn(`[scan] Dilewati: "${entry.name}" tidak punya manifest.json`);
    continue;
  }

  folders.push(entry.name);
}

folders.sort();

await writeFile(
  path.join(panelsDir, 'index.json'),
  JSON.stringify(folders, null, 2) + '\n'
);

console.log(`[scan] ${folders.length} panel ditemukan: ${folders.join(', ') || '(kosong)'}`);
