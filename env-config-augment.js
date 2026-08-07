(async function () {
  // Integrate renderGPTModal with Supabase + LocalForage
  // This file augments the existing env-config.js fallback to save to Supabase when available
  if (!window.renderGPTModal) return; // rely on existing fallback

  // helper: attempt Supabase save using global sb (index.html defines sb variable for supabase client)
  async function saveCustomGPTToSupabase(gpt) {
    try {
      if (typeof sb === 'undefined' || !sb) return null;
      const userId = (window.S && window.S.user && window.S.user.id) || null;
      if (!userId) return null;
      // call existing edge: insert into custom_gpts
      const payload = {
        user_id: userId,
        name: gpt.name,
        description: gpt.description || null,
        avatar_url: gpt.avatar_url || null,
        system_prompt: gpt.system_prompt || null,
        instructions: gpt.instructions || null,
        is_public: gpt.is_public || false,
      };
      const { data, error } = await sb.from('custom_gpts').insert(payload).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase save failed:', err.message || err);
      return null;
    }
  }

  // helper: update existing GPT on Supabase
  async function updateCustomGPTOnSupabase(gptId, updates) {
    try {
      if (typeof sb === 'undefined' || !sb) return null;
      const { data, error } = await sb.from('custom_gpts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', gptId).select().single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Supabase update failed:', err.message || err);
      return null;
    }
  }

  // helper: persist to localforage
  async function saveCustomGPTToLocal(gpt) {
    try {
      window.localforage = window.localforage || null;
      if (!window.localforage) return null;
      const key = 'custom_gpts_v1';
      const list = (await localforage.getItem(key)) || [];
      // if editing, replace
      const idx = list.findIndex((x) => x.id === gpt.id);
      if (idx >= 0) list[idx] = gpt;
      else list.push(gpt);
      await localforage.setItem(key, list);
      return gpt;
    } catch (err) {
      console.warn('localforage save failed:', err.message || err);
      return null;
    }
  }

  // Patch the existing renderGPTModal to wire saving to Supabase + LocalForage
  const original = window.renderGPTModal;
  window.renderGPTModal = async function () {
    await original();

    // hook save button to enhanced behavior
    const saveBtn = document.getElementById('gpt-save');
    if (!saveBtn) return;

    // Avoid double-binding
    if (saveBtn.dataset.enhanced === '1') return;
    saveBtn.dataset.enhanced = '1';

    saveBtn.addEventListener('click', async (e) => {
      // Wait a tick for original handler to update window.S
      await new Promise((r) => setTimeout(r, 50));
      try {
        const S = window.S || {};
        const editing = S.gptBuilderEditing;
        const name = (document.getElementById('gpt-name').value || '').trim();
        const desc = (document.getElementById('gpt-desc').value || '').trim();
        if (!name) return; // original shows toast

        // Build GPT object
        let gptObj;
        if (editing && editing.id) {
          // update local entry
          gptObj = { ...editing, name, description: desc, updated_at: new Date().toISOString() };
          // try update on supabase
          const updated = await updateCustomGPTOnSupabase(editing.id, { name, description: desc });
          if (updated) gptObj = updated;
        } else {
          gptObj = { id: `gpt_${Date.now()}`, name, description: desc, avatar_url: '', created_at: new Date().toISOString() };
          const saved = await saveCustomGPTToSupabase(gptObj);
          if (saved) gptObj = saved;
        }

        // Persist locally as fallback
        await saveCustomGPTToLocal(gptObj);

        // Ensure global state updated
        window.S = window.S || {};
        window.S.customGPTs = window.S.customGPTs || [];
        const idx = window.S.customGPTs.findIndex((x) => x.id === gptObj.id);
        if (idx >= 0) window.S.customGPTs[idx] = gptObj;
        else window.S.customGPTs.unshift(gptObj);

        // Close modal and refresh UI
        if (window.setState) window.setState({ gptBuilderOpen: false, gptBuilderEditing: null });
        if (window.updateGPTSection) window.updateGPTSection();
        if (window.render) window.render();
      } catch (err) {
        console.error('Enhanced save failed:', err);
      }
    });
  };
})();
