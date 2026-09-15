(function (root) {
  "use strict";
  // Phase 2B.2 AI diagnosis panel.
  //
  // This panel is read-only by design. It renders what the AI concluded and what it
  // recommends as TEXT ONLY. There is deliberately no button that executes a
  // recommendation: acting is a separate human decision using the operator controls
  // above. That separation is the visible form of "AI never touches production state".
  const reasons = {
    not_a_failure: "รอบนี้ไม่ได้ล้มเหลว จึงไม่ต้องวินิจฉัย",
    unknown_run: "ไม่พบรอบทำงานนี้",
    cached_diagnosis_exists: "ใช้ผลวินิจฉัยที่มีอยู่แล้ว ไม่เรียก AI ซ้ำ",
    rate_limited: "ใช้โควตา AI ครบสำหรับ 24 ชั่วโมงนี้แล้ว",
    deterministic_state: "สถานะนี้มีวิธีแก้ที่แน่นอนอยู่แล้ว ไม่ต้องใช้ AI",
    known_code: "ปัญหานี้รู้จักแล้ว มีวิธีแก้ที่แน่นอน ไม่ต้องใช้ AI",
    no_action_needed: "ไม่มีสิ่งที่ต้องทำ",
    unknown_code: "รหัสปัญหานี้ยังไม่รู้จัก — ส่งให้ AI ช่วยวิเคราะห์",
    ambiguous_no_code: "ไม่มีรหัสปัญหา — ส่งให้ AI ช่วยวิเคราะห์",
    repeated_failure: "ล้มเหลวซ้ำในรอบ 7 วัน — ส่งให้ AI ช่วยวิเคราะห์",
    ai_eligible_code: "ปัญหานี้ต้องใช้การวิเคราะห์ — ส่งให้ AI"
  };
  const actions = {
    retry_run: "สั่งลองใหม่ได้ (ความเสี่ยงต่ำ)",
    resume_from_create_cr: "ทำต่อจากขั้นสร้าง CR — ห้ามสร้าง Brief ใหม่",
    revalidate_source: "ให้คนตรวจข้อมูลต้นทางก่อน",
    wait_for_confirmation: "รอการยืนยัน ไม่ต้องทำอะไร",
    manual_review: "ต้องให้คนตรวจสอบ",
    no_action: "ไม่ต้องทำอะไร"
  };
  const risks = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" };
  const failures = {
    alpha_not_configured: "ยังไม่ได้ตั้งค่าเชื่อมต่อ AI (ขาด secrets)",
    alpha_request_failed: "เรียก AI ไม่สำเร็จ · ตรวจ API key หรือสถานะ publish ของ agent",
    alpha_execution_failed: "AI ทำงานไม่สำเร็จ",
    alpha_timeout: "AI ใช้เวลานานเกิน 60 วินาที",
    alpha_response_invalid: "ผลตอบกลับจาก AI ไม่ถูกรูปแบบ",
    rpc_failed: "อ่านข้อมูลไม่สำเร็จ"
  };
  const label = (map, value, fallback) => map[value] || fallback || value || "—";
  root.BattlePassDiagnosis = { reasons, actions, risks, failures, label };
  if (typeof module !== "undefined") module.exports = root.BattlePassDiagnosis;
  if (!root.document) return;

  const doc = root.document, el = id => doc.getElementById(id), client = root.flowmateSupabase;
  if (!el("diag-run")) return;
  let allowed = false, active = false, initialized = false, generation = 0, timer = null;
  const time = value => root.BattlePassMonitor?.time(value) || value || "—";
  const node = (tag, text) => { const n = doc.createElement(tag); if (text != null) n.textContent = text; return n; };

  function text(value, error) {
    el("diag-message").textContent = value;
    el("diag-message").dataset.error = String(!!error);
  }
  function cancel() { ++generation; root.clearTimeout(timer); timer = null; active = false; }
  function reset() {
    cancel(); initialized = false;
    el("diag-run").disabled = true; el("diag-ask").disabled = true;
    el("diag-run").replaceChildren(); el("diag-result").replaceChildren();
    el("diag-message").textContent = ""; el("diag-meta").textContent = "";
  }
  async function rpc(name, args) {
    let timeout;
    try {
      const result = await Promise.race([client.rpc(name, args), new Promise((_, reject) => {
        timeout = root.setTimeout(() => reject(Error("request_timeout")), 20000);
      })]);
      if (result.error) throw Object.assign(Error(result.error.message || "diagnosis_rpc_failed"),
        { code: result.error.code });
      if (!result.data || typeof result.data !== "object") throw Error("diagnosis_response_invalid");
      return result.data;
    } finally { root.clearTimeout(timeout); }
  }
  function failed(error, token) {
    if (token !== generation || !allowed) return;
    active = false; el("diag-ask").disabled = false; el("diag-run").disabled = false;
    if (error.code === "42501") { allowed = false; reset(); text("บัญชีนี้ไม่มีสิทธิ์ดูผลวินิจฉัย", true); return; }
    if (["PGRST202", "42883"].includes(error.code)) {
      text("ส่วนวินิจฉัยยังไม่ได้ติดตั้ง กรุณาติดต่อผู้ดูแล", true);
      el("diag-ask").disabled = true; return;
    }
    text("อ่านผลวินิจฉัยไม่สำเร็จ กรุณาลองอีกครั้ง", true);
  }

  async function loadRuns(token) {
    const data = await rpc("battle_pass_failed_runs", { p_limit: 10 });
    if (token !== generation || !allowed) return;
    const runs = Array.isArray(data.runs) ? data.runs : [];
    el("diag-run").replaceChildren();
    if (!runs.length) {
      const option = node("option", "— ไม่มีรอบที่ล้มเหลว —"); option.value = "";
      el("diag-run").append(option);
      el("diag-run").disabled = true; el("diag-ask").disabled = true;
      text("ยังไม่มีรอบที่ล้มเหลวให้วินิจฉัย ซึ่งเป็นเรื่องดี");
      return;
    }
    for (const run of runs) {
      const option = node("option", time(run.checkedAt)
        + (run.period ? " · " + run.period : "")
        + " · " + (run.code || run.status || "—"));
      option.value = run.runId; el("diag-run").append(option);
    }
    el("diag-run").disabled = false;
    await show(el("diag-run").value, token);
  }
  function renderRoute(data) {
    const route = data.route, reason = data.reason;
    el("diag-meta").textContent = "Run ID: " + (data.runId || "—")
      + (data.code ? " · " + data.code : "") + (data.stage ? " · ขั้น " + data.stage : "")
      + " · ใช้ AI ไปแล้ว " + (data.gateCounters?.aiCallsLast24h ?? "—")
      + "/" + (data.gateCounters?.aiDailyCap ?? "—") + " ครั้งใน 24 ชม.";
    el("diag-result").replaceChildren();

    if (route === "runbook") {
      el("diag-result").append(node("h3", "วิธีแก้ที่กำหนดไว้แล้ว (ไม่ได้ใช้ AI)"));
      if (data.recoveryHint) el("diag-result").append(node("p", data.recoveryHint));
      if (data.runbookRef) el("diag-result").append(node("p", "อ้างอิง: " + data.runbookRef));
    }
    text(label(reasons, reason, "สถานะ: " + route),
      route === "runbook" && /critical/i.test(String(data.code || "")));
    return route;
  }
  function renderDiagnosis(data) {
    const d = data.diagnosis;
    if (!d || typeof d !== "object") return false;
    const wrap = node("div"); wrap.className = "diagnosis";
    const conf = Number(d.confidence);
    const lowConfidence = !Number.isFinite(conf) || conf < 60;

    const head = node("p"); head.className = "value";
    head.textContent = "ความเสี่ยง: " + label(risks, d.risk)
      + " · ความมั่นใจ " + (Number.isFinite(conf) ? conf + "%" : "—");
    head.dataset.tone = d.risk === "low" ? "good" : d.risk === "high" ? "error" : "warning";
    wrap.append(head);
    if (lowConfidence) wrap.append(node("p", "ความมั่นใจต่ำ — ใช้เป็นข้อมูลประกอบเท่านั้น"));

    wrap.append(node("h3", "สาเหตุที่วิเคราะห์ได้"), node("p", d.diagnosis || "—"));
    if (d.evidence) wrap.append(node("h3", "หลักฐานที่ใช้"), node("pre", d.evidence));
    if (d.impact) wrap.append(node("h3", "ผลกระทบ"), node("p", d.impact));

    // Recommendation is shown as text only. No execute button, on purpose.
    wrap.append(node("h3", "คำแนะนำ (ต้องให้คนตัดสินใจและกดเอง)"));
    if (!lowConfidence) {
      const action = node("p");
      action.textContent = label(actions, d.recommendedAction?.code);
      action.dataset.tone = d.recommendedAction?.code === "retry_run" ? "good" : "warning";
      wrap.append(action);
      if (d.recommendedAction?.raw) wrap.append(node("p", d.recommendedAction.raw));
    } else wrap.append(node("p", "ซ่อนคำแนะนำไว้เพราะความมั่นใจต่ำกว่า 60%"));

    el("diag-result").append(wrap);
    return true;
  }
  async function show(runId, token) {
    if (!runId) return;
    try {
      const data = await rpc("battle_pass_diagnosis_get", { p_run_id: runId });
      if (token !== generation || !allowed) return;
      const route = renderRoute(data);
      const rendered = renderDiagnosis(data);
      if (!rendered && data.errorCode) {
        el("diag-result").append(node("p", "ครั้งก่อนวินิจฉัยไม่สำเร็จ: "
          + label(failures, data.errorCode)));
      }
      if (!rendered && data.schemaValid === false) {
        el("diag-result").append(node("p",
          "AI ตอบมาในรูปแบบที่อ่านไม่ได้ · ระบบเก็บคำตอบดิบไว้ให้ผู้ดูแลตรวจแล้ว"));
      }
      // Asking is only offered when the gate would actually allow it.
      el("diag-ask").disabled = !(route === "ai"
        || ["known_code", "deterministic_state", "no_action_needed"].includes(data.reason));
      el("diag-ask").textContent = rendered ? "วินิจฉัยใหม่" : "ให้ AI วินิจฉัย";
      active = false;
    } catch (error) { failed(error, token); }
  }
  async function poll(runId, token, attempt = 0) {
    if (token !== generation || !allowed) return;
    try {
      const data = await rpc("battle_pass_diagnosis_get", { p_run_id: runId });
      if (token !== generation || !allowed) return;
      const done = data.diagnosis && typeof data.diagnosis === "object";
      if (!done && !data.errorCode && attempt < 20) {
        text("AI กำลังวิเคราะห์… ปกติใช้เวลาไม่เกิน 15 วินาที");
        timer = root.setTimeout(() => poll(runId, token, attempt + 1), 2000); return;
      }
      await show(runId, token);
    } catch (error) { failed(error, token); }
  }
  el("diag-run").addEventListener("change", () => {
    if (!allowed || active) return;
    cancel(); el("diag-result").replaceChildren(); show(el("diag-run").value, generation);
  });
  el("diag-ask").addEventListener("click", async () => {
    if (!allowed || active) return;
    const runId = el("diag-run").value;
    if (!runId) return;
    cancel(); active = true; const token = generation;
    el("diag-ask").disabled = true; el("diag-result").replaceChildren();
    text("กำลังส่งข้อมูลที่กรองแล้วให้ AI…");
    try {
      const result = await rpc("battle_pass_request_diagnosis", { p_run_id: runId });
      if (token !== generation || !allowed) return;
      if (result.requested === false && result.reused !== true) {
        text(label(reasons, result.blockedBy || result.reason, "ยังไม่ต้องวินิจฉัยรอบนี้"));
        await show(runId, token); return;
      }
      await poll(runId, token);
    } catch (error) { failed(error, token); }
  });

  async function start() {
    if (!allowed) return;
    const token = generation;
    text("กำลังอ่านรายการรอบที่ล้มเหลว…");
    try { await loadRuns(token); } catch (error) { failed(error, token); }
  }
  function access(value) {
    allowed = value === true;
    if (!allowed) { reset(); return; }
    if (!initialized) { initialized = true; start(); }
  }
  root.addEventListener("flowmate:bp-monitor-access", event => access(event.detail));
  root.addEventListener("pagehide", () => { allowed = false; reset(); });
  root.addEventListener("pageshow", () => access(el("monitor")?.hidden === false));
  access(el("monitor")?.hidden === false);
})(typeof window === "undefined" ? globalThis : window);
