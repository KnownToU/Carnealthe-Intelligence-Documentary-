/**
 * shell.js
 * Otak aplikasi. Bertanggung jawab untuk:
 * 1. Memuat panel secara otomatis lewat loader (tanpa daftar hardcode).
 * 2. Inisialisasi router dan drawer.
 * 3. Mendengarkan event navigasi dan menampilkan panel yang sesuai.
 *
 * Shell mengatur, bukan menampung logika bisnis.
 */

import { initRouter } from './core/router.js';
import { get } from './core/registry.js';
import { on } from './core/eventBus.js';
import { loadPanels } from './core/loader.js';
import { initDrawer, openDrawer, closeDrawer } from './ui/drawer.js';
import { buildCtx } from './core/capabilities.js';
// caseStorage.js registrasi dirinya sendiri ke Registry sebagai module type
// STORAGE pas pertama kali di-import. Import-nya sekarang lewat capabilities.js
// (karena saveToCase butuh addNote dari situ), jadi nggak perlu diimpor manual
// di sini lagi — tapi tetep kejamin kesedia sebelum render pertama.

const PANELS_PATH = './panels';
const TOOLS_PATH  = './tools';

function renderPanel(panelId) {
  const contentEl = document.getElementById('shell-content');
  if (!contentEl) return;

  contentEl.innerHTML = '';

  const def = get(panelId);

  if (!def || typeof def.module?.render !== 'function') {
    const placeholder = document.createElement('div');
    placeholder.className = 'panel panel--placeholder';

    const label = document.createElement('p');
    label.className = 'panel__placeholder-label';
    label.textContent = `Panel "${panelId}" belum tersedia. Kalau baru nambah panel, jalankan: npm run scan`;

    placeholder.appendChild(label);
    contentEl.appendChild(placeholder);
    return;
  }

  try {
    const ctx = buildCtx(def.capabilities, def.source);
    contentEl.appendChild(def.module.render(ctx));
  } catch (err) {
    // Panel yang error tidak boleh menjatuhkan aplikasi.
    console.error(`[Shell] Panel "${panelId}" gagal dirender:`, err);
    const msg = document.createElement('p');
    msg.className = 'panel__placeholder-label';
    msg.textContent = `Panel "${panelId}" error saat dirender. Cek console.`;
    contentEl.appendChild(msg);
  }
}

export async function initShell() {
  const drawerEl = document.getElementById('shell-drawer');
  const overlayEl = document.getElementById('shell-overlay');
  const menuBtn = document.getElementById('shell-menu-btn');

  if (!drawerEl || !overlayEl || !menuBtn) {
    console.error('[Shell] Elemen DOM yang dibutuhkan tidak ditemukan. Cek index.html.');
    return;
  }

  // 1. Temukan dan muat semua panel. Harus selesai SEBELUM drawer dan router,
  //    karena keduanya bergantung pada isi Registry.
  const { loaded, failed } = await loadPanels(PANELS_PATH);
  console.info(`[Shell] Panel dimuat: ${loaded.join(', ') || '(tidak ada)'}`);
  if (failed.length) console.warn(`[Shell] Panel gagal: ${failed.join(', ')}`);

  const { loaded: toolsLoaded, failed: toolsFailed } = await loadPanels(TOOLS_PATH);
  console.info(`[Shell] Tool dimuat: ${toolsLoaded.join(', ') || '(tidak ada)'}`);
  if (toolsFailed.length) console.warn(`[Shell] Tool gagal: ${toolsFailed.join(', ')}`);

  // 2. Drawer membangun menu dari Registry (grup dan urutan dari manifest).
  initDrawer(drawerEl, overlayEl);

  // 3. Tombol hamburger.
  menuBtn.addEventListener('click', () => openDrawer(drawerEl, overlayEl));

  // 4. Dengarkan navigasi.
  on('router:change', ({ panelId }) => {
    closeDrawer(drawerEl, overlayEl);
    renderPanel(panelId);
  });

  // 5. Router terakhir, karena ini yang memicu render pertama.
  initRouter();
}
