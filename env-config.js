(function () {
  // env-config.js now also provides a safe fallback implementation for renderGPTModal
  if (window.renderGPTModal) return;

  window.renderGPTModal = async function () {
    try {
      const S = window.S || {};
      const setState = window.setState || function (s) { Object.assign(window.S || {}, s); };
      const updateGPTSection = window.updateGPTSection || function () {};
      const render = window.render || function () {};
      const toast = window.toast || function () {};

      let modal = document.getElementById("gpt-modal");
      if (!modal) {
        modal = document.createElement("div");
        modal.id = "gpt-modal";
        modal.style.position = "fixed";
        modal.style.inset = "0";
        modal.style.zIndex = 9999;
        modal.style.display = "none";
        modal.style.fontFamily = 'inherit';
        modal.innerHTML = `
          <div id="gpt-modal-backdrop" style="position:absolute;inset:0;background:rgba(0,0,0,0.5)"></div>
          <div style="position:relative;max-width:760px;margin:60px auto;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <h3 style="margin:0 0 8px 0;font-size:18px">커스텀 GPT 빌더</h3>
            <input id="gpt-name" class="auth-input" placeholder="이름" style="width:100%;margin-bottom:8px" />
            <textarea id="gpt-desc" class="auth-input" placeholder="설명" style="width:100%;height:100px;margin-bottom:8px"></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button id="gpt-cancel" class="auth-btn outline">취소</button>
              <button id="gpt-save" class="auth-btn primary">저장</button>
            </div>
            <div id="gpt-modal-note" style="margin-top:8px;color:var(--text-muted);font-size:12px"></div>
          </div>
        `;
        document.body.appendChild(modal);

        // Close handlers
        modal.querySelector("#gpt-modal-backdrop").addEventListener("click", () => {
          setState({ gptBuilderOpen: false, gptBuilderEditing: null });
          render();
        });
        modal.querySelector("#gpt-cancel").addEventListener("click", () => {
          setState({ gptBuilderOpen: false, gptBuilderEditing: null });
          render();
        });

        modal.querySelector("#gpt-save").addEventListener("click", async () => {
          const name = (document.getElementById("gpt-name").value || "").trim();
          const desc = (document.getElementById("gpt-desc").value || "").trim();
          if (!name) {
            toast("이름을 입력하세요", "error");
            return;
          }
          // Ensure S.customGPTs exists
          window.S = window.S || {};
          window.S.customGPTs = window.S.customGPTs || [];

          if (window.S.gptBuilderEditing && window.S.gptBuilderEditing.id) {
            const idx = window.S.customGPTs.findIndex((x) => x.id === window.S.gptBuilderEditing.id);
            if (idx >= 0) {
              window.S.customGPTs[idx] = { ...window.S.customGPTs[idx], name, description: desc };
            }
          } else {
            const newG = {
              id: `gpt_${Date.now()}`,
              name,
              description: desc,
              avatar_url: "",
            };
            window.S.customGPTs.push(newG);
          }

          setState({ gptBuilderOpen: false, gptBuilderEditing: null });
          try { updateGPTSection(); } catch (e) {}
          toast("저장되었습니다", "success");
          render();
        });
      }

      // Populate values if editing
      const nameInput = document.getElementById("gpt-name");
      const descInput = document.getElementById("gpt-desc");
      const note = document.getElementById("gpt-modal-note");
      if (S.gptBuilderEditing) {
        nameInput.value = S.gptBuilderEditing.name || "";
        descInput.value = S.gptBuilderEditing.description || "";
        if (note) note.textContent = "편집 모드입니다";
      } else {
        nameInput.value = "";
        descInput.value = "";
        if (note) note.textContent = "";
      }

      modal.style.display = S.gptBuilderOpen ? "block" : "none";
    } catch (err) {
      console.error("renderGPTModal fallback error:", err);
    }
  };
})();

// --- Ensure GPT builder buttons open the modal even if the page is SPA/dynamic ---
(function bindGptBuilderButtons(){
  function openBuilder() {
    try {
      // Open modal via renderGPTModal if available
      if (window.renderGPTModal) {
        window.renderGPTModal();
        return;
      }
      // Fallback: set S and call render if available
      window.S = window.S || {};
      window.S.gptBuilderOpen = true;
      if (window.render) try { window.render(); } catch(e){}
    } catch (e) {
      console.warn('openBuilder error', e);
    }
  }

  function bind() {
    document.querySelectorAll('.btn-create-gpt, #btn-create-gpt').forEach((btn) => {
      try {
        if (btn.dataset.gptBound) return;
        btn.addEventListener('click', (e) => { e.preventDefault(); openBuilder(); });
        btn.dataset.gptBound = '1';
      } catch (e) {}
    });
  }

  // initial bind after a short delay (DOM may not be ready in head)
  setTimeout(bind, 300);
  // periodic bind to catch dynamic content
  const iv = setInterval(bind, 1500);
  // stop after 30s
  setTimeout(() => clearInterval(iv), 30000);

  // delegate as extra safeguard
  if (!document.body.dataset.gptDelegate) {
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.btn-create-gpt, #btn-create-gpt');
      if (b) {
        e.preventDefault();
        openBuilder();
      }
    });
    document.body.dataset.gptDelegate = '1';
  }
})();
