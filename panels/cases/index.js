/**
 * Panel Cases — langkah 1: list case + bikin case baru.
 * Detail/notes per case nyusul langkah berikutnya.
 *
 * Pola sama persis kayak panels/settingsModules/index.js: panel ini CUMA
 * render + event, logika data (validasi, simpan) semua di caseStorage.js.
 * Teks dari user (title) selalu lewat textContent, bukan innerHTML — aman XSS.
 */
import { listCases, createCase } from '../../src/services/caseStorage.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export default {
  render() {
    const root = el('div', 'panel panel--cases');
    const list = el('ul', 'module-list');
    const feedback = el('p', 'module-feedback');
    feedback.setAttribute('role', 'status');

    const newBtn = el('button', 'btn btn--primary', 'Case Baru');
    newBtn.type = 'button';

    function setFeedback(text, kind = 'info') {
      feedback.textContent = text;
      feedback.className = `module-feedback module-feedback--${kind}`;
    }

    function renderRow(item) {
      const row = el('li', 'module-row');
      const info = el('div', 'module-row__info');
      info.append(
        el('div', 'module-row__name', item.title),
        el('div', 'module-row__meta', `${item.id} · ${new Date(item.createdAt).toLocaleString()}`)
      );
      row.append(info);
      return row;
    }

    async function refreshList() {
      list.replaceChildren();
      try {
        const items = await listCases();
        if (items.length === 0) {
          list.append(el('li', 'module-empty', 'Belum ada case.'));
          return;
        }
        items.forEach((item) => list.append(renderRow(item)));
      } catch (err) {
        setFeedback(`Gagal membaca daftar case: ${err.message}`, 'error');
      }
    }

    newBtn.addEventListener('click', async () => {
      const title = prompt('Judul case baru:');
      if (title === null) return; // user cancel

      newBtn.disabled = true;
      try {
        await createCase(title);
        setFeedback('Case dibuat.', 'success');
        await refreshList();
      } catch (err) {
        setFeedback(err.message, 'error');
      } finally {
        newBtn.disabled = false;
      }
    });

    root.append(
      el('h1', 'panel__title', 'Cases'),
      el('p', 'panel__subtitle', 'Daftar case'),
      newBtn,
      list,
      feedback
    );

    refreshList();
    return root;
  },
};
