/**
 * scripts/scan.js
 * Jalan di Node/Termux (BUKAN di browser).
 *
 * Memindai panels/ dan tools/, mencari subfolder yang punya manifest.json,
 * lalu menulis daftarnya ke masing-masing index.json.
 *
 * Pakai: npm run scan
 * Jalankan setiap habis nambah/hapus folder panel atau tool.
 */

import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function scanDir(dirName) {
  const dirPath = path.join(root, dirName);

  // Kalau foldernya belum ada, buat kosong dan return array kosong.
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
    console.warn(`[scan] Folder "${dirName}/" belum ada, dibuat kosong.`);
    await writeFile(path.join(dirPath, 'index.json'), '[]\n');
    return [];
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  const folders = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (!existsSync(path.join(dirPath, entry.name, 'manifest.json'))) {
      console.warn(`[scan] Dilewati: "${dirName}/${entry.name}" tidak punya manifest.json`);
      continue;
    }

    folders.push(entry.name);
  }

  folders.sort();

  await writeFile(
    path.join(dirPath, 'index.json'),
    JSON.stringify(folders, null, 2) + '\n'
  );

  return folders;
}

const panels = await scanDir('panels');
console.log(`[scan] ${panels.length} panel ditemukan: ${panels.join(', ') || '(kosong)'}`);

const tools = await scanDir('tools');
console.log(`[scan] ${tools.length} tool ditemukan: ${tools.join(', ') || '(kosong)'}`);
