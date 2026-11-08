import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const ITEMS = ['index.html', 'style.css', 'src', 'panels'];
// fonts/ belum ada, tambahin di sini kalau sudah jadi

async function clean(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

async function main() {
  await clean(WWW);
  for (const item of ITEMS) {
    const src = path.join(ROOT, item);
    try {
      await fs.access(src);
    } catch {
      console.warn(`[copy-web] lewati "${item}" (tidak ada)`);
      continue;
    }
    await copyRecursive(src, path.join(WWW, item));
  }
  console.log(`[copy-web] selesai -> ${WWW}`);
}

main().catch(err => {
  console.error('[copy-web] gagal:', err);
  process.exit(1);
});