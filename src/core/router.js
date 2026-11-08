/**
 * router.js
 * Mengatur panel mana yang sedang aktif.
 *
 * Ini bukan router URL seperti di framework besar.
 * Tugasnya sederhana: dengar hash di URL, cari panel yang sesuai di Registry,
 * lalu minta Shell untuk menampilkannya.
 *
 * Hash hanya dipakai sebagai KEY lookup — tidak pernah dirender langsung ke DOM.
 * Ini yang mencegah XSS dari hash manipulation.
 */

import { emit } from './eventBus.js';
import { has } from './registry.js';

const DEFAULT_PANEL = 'dashboard';

/**
 * Mulai router. Panggil ini satu kali saat aplikasi pertama kali jalan.
 */
export function initRouter() {
  // Tangani perpindahan hash (user klik link atau back button).
  window.addEventListener('hashchange', handleRouteChange);

  // Tangani load pertama kali.
  handleRouteChange();
}

/**
 * Pindah ke panel tertentu secara programatik.
 * Gunakan ini dari Drawer atau tombol navigasi lainnya.
 *
 * @param {string} panelId - ID panel yang terdaftar di Registry
 */
export function navigate(panelId) {
  window.location.hash = panelId;
}

/**
 * Baca hash saat ini dan emit event navigasi.
 * Dipanggil saat hashchange atau load pertama.
 */
function handleRouteChange() {
  // Ambil hash, buang karakter '#' di depan.
  const raw = window.location.hash.replace('#', '').trim();

  // Validasi: hash hanya boleh berisi huruf, angka, dan tanda hubung/titik.
  // Karakter lain langsung diganti ke default. Ini lapisan keamanan router.
  const panelId = /^[a-zA-Z0-9._-]+$/.test(raw) ? raw : DEFAULT_PANEL;

  // Kalau panel tidak terdaftar di Registry, fallback ke default.
  const target = has(panelId) ? panelId : DEFAULT_PANEL;

  // Kalau bahkan default pun tidak ada (belum diregister), emit warning.
  if (!has(target)) {
    console.warn(`[Router] Panel "${target}" belum terdaftar di Registry.`);
    emit('router:change', { panelId: target, available: false });
    return;
  }

  emit('router:change', { panelId: target, available: true });
}
