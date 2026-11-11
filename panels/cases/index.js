/**
 * Panel Cases.
 * Langkah 1: list case + bikin case baru.
 * Langkah 2: klik satu case -> tampilin detail + notes-nya (getCase udah
 *   mengembalikan notes sekalian, jadi nggak perlu panggil listNotes terpisah).
 *
 * Pola sama persis kayak panels/settingsModules/index.js: panel ini CUMA
 * render + event, logika data (validasi, simpan) semua di caseStorage.js.
 * Teks dari user (title/note) selalu lewat textContent, bukan innerHTML —
 * aman XSS.
 *
 * Nggak ada "router" buat pindah list <-> detail: cuma dua fungsi
 * (showList/showDetail) yang gantian ngisi `body` yang sama. Lebih simpel
 * daripada daftarin panel/hash baru buat sekadar tampilan sub-view.
 */
import { listCases, createCase, getCase, addNote } from '../../src/services/caseStorage.js';
import { listEvidence } from '../../src/services/evidenceStorage.js';
import { uploadEvidenceFile } from '../../src/services/evidenceUpload.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function itemRow(name, meta) {
  const row = el('li', 'module-row');
  const info = el('div', 'module-row__info');
  info.append(el('div', 'module-row__name', name), el('div', 'module-row__meta', meta));
  row.append(info);
  return row;
}

export default {
  render() {
    const root = el('div', 'panel panel--cases');
    const body = el('div', 'panel__body');
    root.append(el('h1', 'panel__title', 'Cases'), el('p', 'panel__subtitle', 'Daftar case'), body);

    function showList() {
      body.replaceChildren();

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
        const row = itemRow(item.title, `${item.id} · ${new Date(item.createdAt).toLocaleString()}`);
        row.addEventListener('click', () => showDetail(item.id));
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

      body.append(newBtn, list, feedback);
      refreshList();
    }

    async function showDetail(caseId) {
      body.replaceChildren();

      const backBtn = el('button', 'btn btn--primary', '← Kembali');
      backBtn.type = 'button';
      backBtn.addEventListener('click', showList);

      const caseTitle = el('h2', 'panel__title', '...');
      const evidenceCount = el('p', 'panel__subtitle', '');

      const uploadBtn = el('button', 'btn btn--primary', 'Upload Evidence');
      uploadBtn.type = 'button';
      const fileInput = el('input');
      fileInput.type = 'file';
      fileInput.style.display = 'none';

      const notesList = el('ul', 'module-list');

      const noteInput = el('input', 'input');
      noteInput.type = 'text';
      noteInput.placeholder = 'Tulis catatan...';

      const addNoteBtn = el('button', 'btn btn--primary', 'Tambah Note');
      addNoteBtn.type = 'button';

      const feedback = el('p', 'module-feedback');
      feedback.setAttribute('role', 'status');

      body.append(backBtn, caseTitle, evidenceCount, uploadBtn, fileInput, notesList, noteInput, addNoteBtn, feedback);

      function setFeedback(text, kind = 'info') {
        feedback.textContent = text;
        feedback.className = `module-feedback module-feedback--${kind}`;
      }

      async function refreshNotes() {
        notesList.replaceChildren();
        const kasus = await getCase(caseId); // biar NOT_FOUND/CORRUPT ketangkep di pemanggil
        if (kasus.notes.length === 0) {
          notesList.append(el('li', 'module-empty', 'Belum ada catatan di case ini.'));
          return;
        }
        kasus.notes.forEach((note) => {
          notesList.append(itemRow(note.text, new Date(note.createdAt).toLocaleString()));
        });
      }

      async function refreshEvidence() {
        try {
          const evidence = await listEvidence(caseId);
          evidenceCount.textContent = `${evidence.length} evidence`;
        } catch (err) {
          evidenceCount.textContent = '? evidence';
          console.error('Gagal membaca evidence:', err);
        }
      }

      uploadBtn.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return; // user buka dialog lalu cancel

        uploadBtn.disabled = true;
        setFeedback('Mengunggah...', 'info');
        try {
          await uploadEvidenceFile(caseId, file);
          setFeedback('Evidence terunggah.', 'success');
          await refreshEvidence();
        } catch (err) {
          setFeedback(`Gagal upload evidence: ${err.message}`, 'error');
        } finally {
          uploadBtn.disabled = false;
          fileInput.value = ''; // biar file yang sama bisa dipilih ulang
        }
      });

      addNoteBtn.addEventListener('click', async () => {
        const text = noteInput.value;
        addNoteBtn.disabled = true;
        try {
          await addNote(caseId, text);
          noteInput.value = '';
          setFeedback('Note ditambahkan.', 'success');
          await refreshNotes();
        } catch (err) {
          setFeedback(err.message, 'error');
        } finally {
          addNoteBtn.disabled = false;
        }
      });

      try {
        const kasus = await getCase(caseId);
        caseTitle.textContent = kasus.title;
        await refreshNotes();
      } catch (err) {
        caseTitle.textContent = 'Case';
        setFeedback(`Gagal memuat case: ${err.message}`, 'error');
      }

      // Terpisah dari try di atas: evidence gagal dibaca nggak boleh
      // bikin notes ikut nggak ke-render.
      await refreshEvidence();
    }

    showList();
    return root;
  },
};
