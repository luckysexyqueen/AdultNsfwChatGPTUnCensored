(async function () {
  // Enhanced augment for renderGPTModal: styling, file upload, model load, Supabase + localforage sync
  if (!window.renderGPTModal) {
    console.warn('renderGPTModal not found; augment aborted');
    return;
  }

  // Utilities
  const want = (id) => document.getElementById(id);
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }

  // Inject CSS for modal (keeps visual consistent with index.html variables)
  if (!document.getElementById('gpt-modal-styles')) {
    const s = document.createElement('style');
    s.id = 'gpt-modal-styles';
    s.textContent = `
      #gpt-modal .gpt-modal-box{position:relative;max-width:860px;margin:48px auto;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,0.6)}
      #gpt-modal .gpt-row{display:flex;gap:12px;align-items:flex-start}
      #gpt-modal .gpt-col{flex:1;min-width:0}
      #gpt-modal .gpt-file-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
      #gpt-modal .gpt-file-chip{background:var(--bg3);border:1px solid var(--border);padding:6px 8px;border-radius:8px;font-size:12px;display:flex;align-items:center;gap:8px}
      #gpt-modal .gpt-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
      #gpt-modal .gpt-meta{margin-top:8px;color:var(--text-muted);font-size:12px}
      @media (max-width:640px){ #gpt-modal .gpt-row{flex-direction:column} }
    `;
    document.head.appendChild(s);
  }

  // LocalForage helpers
  async function saveLocalGptList(list) {
    try {
      window.localforage = window.localforage || null;
      if (!window.localforage) return null;
      await localforage.setItem('custom_gpts_v1', list);
      return true;
    } catch (err) {
      console.warn('saveLocalGptList failed', err);
      return false;
    }
  }
  async function loadLocalGptList() {
    try {
      window.localforage = window.localforage || null;
      if (!window.localforage) return [];
      const v = (await localforage.getItem('custom_gpts_v1')) || [];
      return v;
    } catch (err) {
      console.warn('loadLocalGptList failed', err);
      return [];
    }
  }

  // File storage helpers
  async function uploadFileToSupabase(file, userId, destFolder = 'custom-gpt-files') {
    try {
      if (typeof sb === 'undefined' || !sb) throw new Error('sb not available');
      const safe = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_');
      const path = `${userId}/${destFolder}/${Date.now()}_${safe}`;
      const { data, error } = await sb.storage.from('chat-files').upload(path, file);
      if (error) throw error;
      const { data: signed } = await sb.storage.from('chat-files').createSignedUrl(data.path, 60 * 60 * 24);
      return { path: data.path, url: signed?.signedUrl || null };
    } catch (err) {
      console.warn('uploadFileToSupabase failed', err.message || err);
      return null;
    }
  }

  // Background sync: when online try to push local items
  let syncing = false;
  async function backgroundSync() {
    if (syncing) return;
    syncing = true;
    try {
      if (!navigator.onLine) return;
      if (typeof sb === 'undefined' || !sb) return;
      const userId = (window.S && window.S.user && window.S.user.id) || null;
      if (!userId) return;

      const list = await loadLocalGptList();
      if (!Array.isArray(list) || list.length === 0) return;

      for (const item of list.slice()) {
        // if item already has id that looks like server UUID (has -) skip
        if (item._synced) continue;
        try {
          // attempt server save
          const payload = {
            user_id: userId,
            name: item.name,
            description: item.description || null,
            avatar_url: item.avatar_url || null,
            system_prompt: item.system_prompt || null,
            instructions: item.instructions || null,
            is_public: item.is_public || false,
          };
          const { data, error } = await sb.from('custom_gpts').insert(payload).select().single();
          if (!error && data) {
            item.id = data.id;
            item.created_at = data.created_at;
            item._synced = true;
            // update local list
            const cur = await loadLocalGptList();
            const idx = cur.findIndex((x) => x._tempId === item._tempId || x.id === item.id);
            if (idx >= 0) cur[idx] = item;
            else cur.unshift(item);
            await saveLocalGptList(cur);
          }
        } catch (err) {
          console.warn('backgroundSync item failed', err);
        }
      }
    } finally {
      syncing = false;
    }
  }

  window.addEventListener('online', () => {
    setTimeout(() => backgroundSync(), 1200);
  });

  // Patch renderGPTModal to enhance UI with file upload, model load controls
  const original = window.renderGPTModal;
  window.renderGPTModal = async function () {
    await original();

    const modal = document.getElementById('gpt-modal');
    if (!modal) return;

    // ensure modal content wrapper exists
    let box = modal.querySelector('.gpt-modal-box');
    if (!box) {
      // find inner content (the first child div that isn't backdrop)
      const inner = Array.from(modal.children).find((n) => n.id !== 'gpt-modal-backdrop');
      if (inner) {
        inner.classList.add('gpt-modal-box');
        box = inner;
      }
    }

    // build enhanced UI region only once
    if (!modal.querySelector('.gpt-enhanced')) {
      const enhanced = el('div', { class: 'gpt-enhanced' });

      // Row: title + simple meta
      const meta = el('div', { class: 'gpt-meta' }, '모든 파일은 인증 사용자일 때 Supabase에 업로드됩니다. 오프라인/게스트는 로컬에 보관됩니다.');

      // File upload controls
      const fileInput = el('input', { type: 'file', id: 'gpt-file-input', multiple: 'multiple' });
      const fileList = el('div', { class: 'gpt-file-list', id: 'gpt-file-list' });

      // Model controls
      const modelNote = el('div', { id: 'gpt-model-note', class: 'gpt-meta' }, '모델 파일(예: .gguf)을 업로드하면 모델 로드 버튼이 활성화됩니다.');
      const loadModelBtn = el('button', { id: 'gpt-load-model', class: 'auth-btn outline', type: 'button', style: 'margin-left:auto' }, '모델 로드');
      loadModelBtn.disabled = true;

      // Actions (Save handled by original; we keep Save but add Upload action)
      const uploadFilesBtn = el('button', { id: 'gpt-upload-files', class: 'auth-btn' }, '파일 업로드');

      enhanced.appendChild(meta);
      enhanced.appendChild(el('div', { class: 'gpt-row' }, el('div', { class: 'gpt-col' }, fileInput, fileList), el('div', { class: 'gpt-col' }, modelNote, el('div', { class: 'gpt-actions' }, loadModelBtn, uploadFilesBtn))));

      box.appendChild(enhanced);

      // file input change
      fileInput.addEventListener('change', async (e) => {
        fileList.innerHTML = '';
        const files = Array.from(e.target.files || []);
        for (const f of files) {
          const chip = el('div', { class: 'gpt-file-chip' }, el('span', {}, f.name), el('button', { class: 'gpt-file-remove', type: 'button', style: 'background:none;border:none;color:var(--text-muted);cursor:pointer' }, '✕'));
          fileList.appendChild(chip);
          chip.querySelector('button').addEventListener('click', () => {
            const df = Array.from(fileInput.files || []).filter((x) => x !== f);
            // can't directly set FileList, so clear input
            fileInput.value = '';
            fileList.removeChild(chip);
          });
        }
        // enable model load button if any file looks like model
        const hasModel = files.some((x) => /\.gguf$|\.bin$|\.pt$|\.safetensors$/i.test(x.name));
        loadModelBtn.disabled = !hasModel;
      });

      // upload files handler
      uploadFilesBtn.addEventListener('click', async () => {
        const files = Array.from(fileInput.files || []);
        if (files.length === 0) {
          if (window.toast) window.toast('업로드할 파일을 선택하세요', 'error');
          return;
        }
        const userId = (window.S && window.S.user && window.S.user.id) || null;
        for (const f of files) {
          // show temporary tag
          const tag = el('div', { class: 'gpt-file-chip' }, `업로드 ��: ${f.name}`);
          fileList.appendChild(tag);
          try {
            if (navigator.onLine && userId && typeof sb !== 'undefined' && sb) {
              const r = await uploadFileToSupabase(f, userId, 'custom-gpt-files');
              if (r && r.url) {
                tag.innerHTML = '';
                const a = el('a', { href: r.url, target: '_blank' }, f.name);
                tag.appendChild(a);
              } else {
                tag.textContent = `업로드 실패(서버): ${f.name}`;
              }
            } else {
              // save to localforage
              try {
                window.localforage = window.localforage || null;
                if (localforage) {
                  const key = `gpt-file-temp-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
                  await localforage.setItem(key, f);
                  tag.innerHTML = '';
                  tag.appendChild(document.createTextNode(`로컬에 저장됨: ${f.name}`));
                } else {
                  tag.textContent = `로컬 저장 불가: ${f.name}`;
                }
              } catch (err) {
                tag.textContent = `로컬 저장 실패: ${f.name}`;
              }
            }
          } catch (err) {
            tag.textContent = `오류: ${f.name}`;
          }
        }
        // clear input
        fileInput.value = '';
        if (window.toast) window.toast('파일 업로드 시도 완료', 'info');
      });

      // model load
      loadModelBtn.addEventListener('click', async () => {
        const files = Array.from(fileInput.files || []);
        const modelFile = files.find((x) => /\.gguf$|\.bin$|\.pt$|\.safetensors$/i.test(x.name));
        if (!modelFile) {
          if (window.toast) window.toast('모델 파일을 선택하세요', 'error');
          return;
        }
        // If a global gguf loader exists (ggufWllama or similar), try to use it
        if (window.ggufWllama && window.ggufWllama.loadModelFromFile) {
          try {
            const statusDiv = modelNote;
            statusDiv.textContent = '모델 로드 중...';
            await window.ggufWllama.loadModelFromFile(modelFile, { progress_callback: (p) => { statusDiv.textContent = `로딩 ${Math.round(p*100)}%`; } });
            statusDiv.textContent = '모델 로드 완료';
            if (window.toast) window.toast('모델 로드 완료', 'success');
          } catch (err) {
            console.error('model load error', err);
            if (window.toast) window.toast('모델 로드 실패', 'error');
          }
        } else {
          if (window.toast) window.toast('브라우저에서 모델 로드 지원이 없습니다', 'error');
          modelNote.textContent = '주의: 현재 빌드에는 모델 로드 지원 스크립트가 없습니다.';
        }
      });
    }

    // Enhance Save button behavior already patched by earlier augment; ensure Save triggers UI updates
    const saveBtn = want('gpt-save');
    if (saveBtn && saveBtn.dataset.styleHook !== '1') {
      saveBtn.dataset.styleHook = '1';
      // allow Enter to trigger save when focused inside modal
      modal.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          saveBtn.click();
        }
      });
    }

    // ensure background sync kicked off
    setTimeout(() => backgroundSync(), 1500);
  };
})();
