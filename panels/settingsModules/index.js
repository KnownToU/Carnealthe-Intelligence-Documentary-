/**
 * Panel Settings -> Modules.
 * Menampilkan plugin terinstal, memasang plugin baru, dan menghapusnya.
 * Semua logika ada di pluginService; panel ini hanya tampilan dan interaksi.
 */

import {
  getInstalled,
  install,
  uninstall,
  validatePluginInput,
  MAX_FILE_BYTES,
} from '../../src/services/pluginService.js';

const WARNING_TEXT =
  'Plugin adalah kode dari luar. Plugin berjalan dengan akses penuh ke aplikasi ini ' +
  'dan BELUM ADA sandbox. Install hanya dari sumber yang kamu percaya.';

const STATUS_VIEW = {
  active:   { text: 'Active',               cls: 'success' },
  pending:  { text: 'Pending (perlu reload)', cls: 'pending' },
  conflict: { text: 'Warning: ID bentrok',  cls: 'warning' },
  failed:   { text: 'Error',                cls: 'error' },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent, bukan innerHTML: aman dari XSS
  return node;
}

export default {
  render() {
    const root = el('div', 'panel panel--modules');
    const list = el('ul', 'module-list');
    const feedback = el('p', 'module-feedback');
    feedback.setAttribute('role', 'status');

    const input = el('input', 'module-file');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.json,.js';

    const installBtn = el('button', 'btn btn--primary', 'Install');
    installBtn.type = 'button';

    function setFeedback(text, kind = 'info') {
      feedback.textContent = text;
      feedback.className = `module-feedback module-feedback--${kind}`;
    }

    function reload() {
      window.location.reload();
    }

    function renderRow(item) {
      const view = STATUS_VIEW[item.status] || STATUS_VIEW.failed;
      const row = el('li', 'module-row');

      const info = el('div', 'module-row__info');
      info.append(
        el('div', 'module-row__name', item.label),
        el('div', 'module-row__meta', item.version ? `${item.id} · v${item.version}` : item.id)
      );
      if (item.error) info.append(el('div', 'module-row__error', item.error));

      const badge = el('span', `badge badge--${view.cls}`, view.text);

      const removeBtn = el('button', 'btn btn--danger', 'Remove');
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', async () => {
        const ok = confirm(`Hapus plugin "${item.label}" (${item.id})?\n\nAplikasi akan reload setelah penghapusan.`);
        if (!ok) return;
        removeBtn.disabled = true;
        try {
          await uninstall(item.id);
          reload();
        } catch (err) {
          setFeedback(`Gagal menghapus: ${err.message}`, 'error');
          removeBtn.disabled = false;
        }
      });

      row.append(info, badge, removeBtn);
      return row;
    }

    async function refreshList() {
      list.replaceChildren();
      try {
        const items = await getInstalled();
        if (items.length === 0) {
          list.append(el('li', 'module-empty', 'Belum ada plugin terinstal.'));
          return;
        }
        items.forEach(item => list.append(renderRow(item)));
      } catch (err) {
        setFeedback(`Gagal membaca daftar plugin: ${err.message}`, 'error');
      }
    }

    installBtn.addEventListener('click', async () => {
      const files = Array.from(input.files || []);
      const manifestFile = files.find(f => f.name === 'manifest.json');
      const entryFile = files.find(f => f.name === 'index.js');

      if (!manifestFile || !entryFile) {
        setFeedback('Pilih dua file sekaligus: manifest.json dan index.js.', 'error');
        return;
      }
      // Cek ukuran SEBELUM membaca isi file (jangan baca file raksasa ke memori).
      if (manifestFile.size > MAX_FILE_BYTES || entryFile.size > MAX_FILE_BYTES) {
        setFeedback(`Ukuran file melebihi ${MAX_FILE_BYTES / 1024} KB.`, 'error');
        return;
      }

      installBtn.disabled = true;
      try {
        const manifestText = await manifestFile.text();
        const codeText = await entryFile.text();

        const { manifest } = validatePluginInput(manifestText, codeText);

        const ok = confirm(
          `Install plugin "${manifest.label}" (${manifest.id}) v${manifest.version}?\n\n` +
          'Plugin adalah kode dari luar dan berjalan dengan akses penuh ke aplikasi ini. ' +
          'Install hanya dari sumber yang kamu percaya.\n\n' +
          'Aplikasi akan reload setelah instalasi.'
        );
        if (!ok) {
          setFeedback('Instalasi dibatalkan.', 'info');
          return;
        }

        await install({ manifestText, codeText });
        setFeedback('Terinstal. Memuat ulang aplikasi...', 'success');
        reload();
      } catch (err) {
        setFeedback(err.message, 'error');
      } finally {
        installBtn.disabled = false;
      }
    });

    root.append(
      el('h1', 'panel__title', 'Modules'),
      el('p', 'panel__subtitle', 'Plugin terinstal'),
      el('div', 'notice notice--warning', WARNING_TEXT),
      list,
      el('h2', 'module-section-title', 'Install plugin'),
      el('p', 'module-hint', `Pilih manifest.json dan index.js sekaligus (maks ${MAX_FILE_BYTES / 1024} KB per file).`),
      input,
      installBtn,
      feedback
    );

    refreshList();
    return root;
  },
};
