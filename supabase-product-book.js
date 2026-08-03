// FlowMate Product Book Mini CMS client.
// Supabase is authoritative; static monthly data remains a read-only fallback.
(function () {
  function requireProductBookClient() {
    if (!window.flowmateSupabase) throw new Error("Supabase client is not ready.");
    return window.flowmateSupabase;
  }

  function normalizeProductBookRpcRows(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }

  async function loadProductBookPatches(options) {
    const settings = options || {};
    const client = requireProductBookClient();
    const result = await client.rpc("product_book_list_patches", {
      p_include_drafts: settings.includeDrafts === true,
      p_include_archived: settings.includeArchived === true,
    });
    if (result.error) throw result.error;
    return normalizeProductBookRpcRows(result.data);
  }

  async function saveProductBookDraft(payload) {
    const client = requireProductBookClient();
    const result = await client.rpc("product_book_save_draft", { p_payload: payload || {} });
    if (result.error) throw result.error;
    return result.data;
  }

  async function publishProductBookPatch(patchCode) {
    const client = requireProductBookClient();
    const result = await client.rpc("product_book_publish", { p_patch_code: patchCode });
    if (result.error) throw result.error;
    return result.data;
  }

  async function archiveProductBookPatch(patchCode) {
    const client = requireProductBookClient();
    const result = await client.rpc("product_book_archive", { p_patch_code: patchCode });
    if (result.error) throw result.error;
    return result.data;
  }

  async function restoreProductBookPatch(patchCode) {
    const client = requireProductBookClient();
    const result = await client.rpc("product_book_restore", { p_patch_code: patchCode });
    if (result.error) throw result.error;
    return result.data;
  }

  window.loadProductBookPatches = loadProductBookPatches;
  window.saveProductBookDraft = saveProductBookDraft;
  window.publishProductBookPatch = publishProductBookPatch;
  window.archiveProductBookPatch = archiveProductBookPatch;
  window.restoreProductBookPatch = restoreProductBookPatch;
  window.normalizeProductBookRpcRows = normalizeProductBookRpcRows;
})();

