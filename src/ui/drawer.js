/**
 * drawer.js
 * Side drawer sebagai navigasi utama aplikasi.
 *
 * Drawer membaca menu dari konfigurasi yang diberikan Shell,
 * lalu hanya menampilkan item yang modul-nya terdaftar di Registry.
 * Menu tanpa modul aktif = tidak muncul. Sesuai spesifikasi.
 *
 * Max kedalaman menu: 2 level (parent > children).
 * Kalau ada sub-sub-menu suatu hari nanti, desain ulang dulu.
 */

import { navigate } from '../core/router.js';
import { has, getByType, MODULE_TYPES } from '../core/registry.js';
import { on } from '../core/eventBus.js';

/**
 * Inisialisasi drawer.
 *
 * @param {HTMLElement} drawerEl  - Elemen DOM untuk drawer
 * @param {HTMLElement} overlayEl - Elemen DOM untuk overlay gelap di belakang drawer
 */
export function initDrawer(drawerEl, overlayEl) {
  renderMenu(drawerEl, buildMenuConfig());
  bindToggleEvents(drawerEl, overlayEl);
  highlightActiveItem(drawerEl);

  // Saat route berubah, update highlight item aktif.
  on('router:change', () => highlightActiveItem(drawerEl));
}

/**
 * Buka drawer.
 */
export function openDrawer(drawerEl, overlayEl) {
  drawerEl.classList.add('is-open');
  overlayEl.classList.add('is-visible');
}

/**
 * Tutup drawer.
 */
export function closeDrawer(drawerEl, overlayEl) {
  drawerEl.classList.remove('is-open');
  overlayEl.classList.remove('is-visible');
}

/**
 * Susun struktur menu dari Registry.
 * Panel tanpa "group" = item level 1. Panel dengan "group" = anak dari grup itu.
 * Urutan mengikuti "order" di manifest, lalu abjad.
 */
function buildMenuConfig() {
  const panels = getByType(MODULE_TYPES.PANEL)
    .slice()
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

  const config = [];
  const groups = new Map();

  panels.forEach(p => {
    if (!p.group) {
      config.push({ label: p.label, panelId: p.id });
      return;
    }

    if (!groups.has(p.group)) {
      const g = { label: p.group, children: [] };
      groups.set(p.group, g);
      config.push(g);
    }
    groups.get(p.group).children.push({ label: p.label, panelId: p.id });
  });

  return config;
}

// --- Internal ---

function renderMenu(drawerEl, menuConfig) {
  const nav = drawerEl.querySelector('[data-drawer-nav]');
  if (!nav) {
    console.error('[Drawer] Elemen [data-drawer-nav] tidak ditemukan di dalam drawer.');
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'drawer-menu';

  menuConfig.forEach(item => {
    const li = buildMenuItem(item, 1);
    if (li) ul.appendChild(li);
  });

  nav.appendChild(ul);
}

/**
 * Bangun satu item menu secara rekursif.
 * Kedalaman dibatasi maksimum 2 level.
 *
 * @param {Object} item
 * @param {number} depth - Kedalaman saat ini (mulai dari 1)
 * @returns {HTMLElement|null}
 */
function buildMenuItem(item, depth) {
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;

  // Kalau tidak punya anak dan tidak ada panelId, item ini tidak berguna.
  if (!hasChildren && !item.panelId) return null;

  // Kalau tidak punya anak, cek apakah modul-nya terdaftar.
  if (!hasChildren && !has(item.panelId)) return null;

  // Kalau punya anak tapi sudah di kedalaman maksimum, abaikan sub-menu-nya.
  if (hasChildren && depth >= 2) {
    console.warn(`[Drawer] Item "${item.label}" melebihi kedalaman menu maksimum (2). Sub-menu diabaikan.`);
    return null;
  }

  const li = document.createElement('li');
  li.className = `drawer-item drawer-item--depth-${depth}`;

  if (hasChildren) {
    // Item parent: tampilkan label + toggle sub-menu.
    li.classList.add('drawer-item--parent');

    const btn = document.createElement('button');
    btn.className = 'drawer-item__btn';
    btn.textContent = item.label;
    btn.setAttribute('aria-expanded', 'false');

    const subUl = document.createElement('ul');
    subUl.className = 'drawer-submenu';
    subUl.hidden = true;

    let hasVisibleChild = false;
    item.children.forEach(child => {
      const childLi = buildMenuItem(child, depth + 1);
      if (childLi) {
        subUl.appendChild(childLi);
        hasVisibleChild = true;
      }
    });

    // Kalau tidak ada anak yang visible (modul belum terdaftar), sembunyikan parent juga.
    if (!hasVisibleChild) return null;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      subUl.hidden = isOpen;
      li.classList.toggle('drawer-item--expanded', !isOpen);
    });

    li.appendChild(btn);
    li.appendChild(subUl);
  } else {
    // Item leaf: klik langsung navigasi.
    const btn = document.createElement('button');
    btn.className = 'drawer-item__btn';
    btn.textContent = item.label;
    btn.dataset.panelId = item.panelId;

    btn.addEventListener('click', () => {
      navigate(item.panelId);
    });

    li.appendChild(btn);
  }

  return li;
}

function bindToggleEvents(drawerEl, overlayEl) {
  // Tombol hamburger di Shell yang trigger ini dikirim lewat event langsung,
  // tapi kita juga bisa expose fungsi open/close untuk dipanggil dari luar.
  overlayEl.addEventListener('click', () => closeDrawer(drawerEl, overlayEl));
}

function highlightActiveItem(drawerEl) {
  const current = window.location.hash.replace('#', '') || 'dashboard';

  // Hapus highlight lama.
  drawerEl.querySelectorAll('.drawer-item__btn--active').forEach(el => {
    el.classList.remove('drawer-item__btn--active');
  });

  // Tambah highlight baru.
  const activeBtn = drawerEl.querySelector(`[data-panel-id="${current}"]`);
  if (activeBtn) {
    activeBtn.classList.add('drawer-item__btn--active');

    // Kalau item aktif ada di dalam sub-menu, buka parent-nya.
    const subMenu = activeBtn.closest('.drawer-submenu');
    if (subMenu) {
      subMenu.hidden = false;
      const parentBtn = subMenu.previousElementSibling;
      if (parentBtn) {
        parentBtn.setAttribute('aria-expanded', 'true');
        parentBtn.closest('.drawer-item')?.classList.add('drawer-item--expanded');
      }
    }
  }
}
