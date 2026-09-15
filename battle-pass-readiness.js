(function (root) {
  "use strict";
  const labels = {
    working_sheet_link: "ลิงก์ Working Sheet ใน O ไม่ครบหรือไม่ถูกต้อง", start_time: "เวลาเริ่มกิจกรรมไม่ครบ",
    end_date: "วันสิ้นสุดกิจกรรมไม่ถูกต้อง", tier: "Tier ไม่ครบหรือไม่รองรับ",
    source_month_missing: "ไม่พบเดือนถัดไปใน SSoT", incomplete_inventory: "อ่านรายการต้นทางหรืองานเดิมไม่ครบ",
    duplicate_source_month: "พบเดือนซ้ำในต้นทาง", database_not_ready: "แผนรายเดือน Revenue หรือบัญชีผู้รับผิดชอบยังไม่พร้อม",
    target_plan_missing_or_ambiguous: "ไม่พบแผนรายเดือนที่ชัดเจน", target_plan_not_active: "แผนรายเดือนยังไม่เปิดใช้งาน",
    revenue_missing_or_ambiguous: "ไม่พบ Revenue ที่ชัดเจน", identity_readiness_failed: "บัญชีผู้รับผิดชอบยังไม่พร้อม",
    google_refresh_failed: "เชื่อม Google ไม่สำเร็จ", google_write_access_unavailable: "สิทธิ์โฟลเดอร์หรือต้นแบบ Google ยังไม่พร้อม",
    source_changed: "ข้อมูลต้นทางเปลี่ยนระหว่างตรวจ กรุณาตรวจอีกครั้ง", loot_dates_mismatch: "วันที่ใน Loot ไม่ตรงกับ SSoT",
    loot_title_mismatch: "ชื่อเดือนใน Loot ไม่ตรงกับแคมเปญ", loot_schema_changed: "รูปแบบ Loot เปลี่ยน ต้องตรวจตาราง",
    readiness_request_failed: "คำขอตรวจไม่สำเร็จ กรุณาลองอีกครั้ง",
    readiness_result_unavailable: "ยังยืนยันผลคำขอนี้ไม่ได้ ตรวจประวัติหรือส่งคำขอตรวจใหม่ได้",
    readiness_response_invalid: "ผลตอบกลับไม่ครบหรือไม่ตรงกับบันทึก Worker"
  };
  const answer = value => value === true ? "ผ่าน" : value === false ? "ยังไม่ผ่าน" : "ยังตรวจยืนยันไม่ได้";
  function summarize(r) {
    if (r.state === "failed") return { title: labels[r.code] || "ตรวจไม่สำเร็จ กรุณาดูรหัสปัญหา", checks: [] };
    const noPending = r.planState === "planned" && !r.period && !r.nextState;
    const ready = r.sourceReady === true && r.googleReady === true && r.databaseReady === true;
    const checks = ["สิทธิ์โฟลเดอร์และต้นแบบ Google: " + answer(r.googleReady)];
    if (!noPending) checks.push(
      "ลิงก์ Working Sheet (O): " + answer(r.workingSheetLinked),
      "ยืนยัน Loot (P): " + (r.confirmed === false ? "รอ Aof ยืนยัน" : answer(r.confirmed)),
      "ข้อมูลเดือนและ Loot: " + (r.confirmed === false ? "รอ P ก่อนตรวจ Loot" : answer(r.sourceReady)),
      "แผนรายเดือน / Revenue / ผู้รับผิดชอบ: " + answer(r.databaseReady)
    );
    for (const issue of [...(Array.isArray(r.issues) ? r.issues : []), r.databaseCode].filter(Boolean))
      checks.push(labels[issue] || "รายการที่ต้องตรวจ: " + issue);
    return { title: noPending ? "ตรวจแล้ว — ไม่มีเดือนที่รอดำเนินการ" : ready ? "ตรวจแล้ว — ข้อมูลพร้อม ณ เวลาที่ตรวจ"
      : r.confirmed === false ? "ตรวจแล้ว — รอ Aof ยืนยัน Loot และ P" : "ตรวจแล้ว — ยังมีข้อมูลที่ต้องตรวจ", checks };
  }
  root.BattlePassReadiness = { summarize };
  if (typeof module !== "undefined") module.exports = root.BattlePassReadiness;
  if (!root.document) return;
  const el = id => root.document.getElementById(id), client = root.flowmateSupabase;
  if (!el("readiness-start")) return;
  let allowed = false, active = false, initialized = false, generation = 0, timer = null;
  const time = value => root.BattlePassMonitor?.time(value) || value || "—";
  function text(value, error) { el("readiness-message").textContent = value; el("readiness-message").dataset.error = String(!!error); }
  function cancel() { ++generation; root.clearTimeout(timer); timer = null; active = false; }
  function reset() {
    cancel(); initialized = false; el("readiness-start").disabled = true;
    el("readiness-recover").hidden = true; el("readiness-checks").replaceChildren();
    el("readiness-message").textContent = ""; el("readiness-meta").textContent = "";
  }
  async function rpc(name, args) {
    let timeout;
    try {
      const result = await Promise.race([client.rpc(name, args), new Promise((_, reject) => {
        timeout = root.setTimeout(() => reject(Error("request_timeout")), 20000);
      })]);
      if (result.error) throw Object.assign(Error("readiness_rpc_failed"), { code: result.error.code });
      if (!result.data || typeof result.data !== "object") throw Error("readiness_response_invalid");
      return result.data;
    } finally { root.clearTimeout(timeout); }
  }
  function failed(error, token) {
    if (token !== generation || !allowed) return;
    active = false;
    if (error.code === "42501") { allowed = false; reset(); text("บัญชีนี้ไม่มีสิทธิ์ตรวจความพร้อม", true); return; }
    if (["PGRST202", "42883"].includes(error.code)) {
      text("ส่วนตรวจความพร้อมยังไม่ได้ติดตั้ง กรุณาติดต่อผู้ดูแล", true);
    } else text("ยังอ่านผลไม่ได้ กดดูผลคำขอล่าสุดเพื่อเช็กคำขอเดิมก่อนส่งใหม่", true);
    el("readiness-start").disabled = true; el("readiness-recover").hidden = false;
  }
  function render(result) {
    el("readiness-checks").replaceChildren();
    const summary = summarize(result); text(summary.title, result.state === "failed");
    el("readiness-meta").textContent = "คำขอ #" + result.requestId + " · ส่งเมื่อ " + time(result.requestedAt)
      + (result.checkedAt ? " · ผลตรวจ " + time(result.checkedAt) : "")
      + (result.period ? " · " + result.period : "") + (result.runId ? " · Run ID: " + result.runId : "")
      + (result.code ? " · " + result.code : "");
    for (const value of summary.checks) { const li = root.document.createElement("li"); li.textContent = value; el("readiness-checks").append(li); }
  }
  async function poll(id, token, attempt = 0) {
    if (token !== generation || !allowed) return;
    try {
      const result = await rpc("battle_pass_readiness_status", { p_request_id: id || null });
      if (token !== generation || !allowed) return;
      if (result.state === "empty") {
        if (id) throw Error("readiness_response_missing");
        text("ยังไม่มีคำขอตรวจด้วยตนเอง"); active = false; el("readiness-start").disabled = false; return;
      }
      if (!/^\d+$/.test(result.requestId || "") || (id && result.requestId !== id)) throw Error("readiness_response_mismatch");
      if (result.state === "pending") {
        text("กำลังอ่าน Google และ SSoT… คุณเปิดหน้านี้ไว้เพื่อรอผลได้");
        el("readiness-meta").textContent = "คำขอ #" + result.requestId + " · ส่งเมื่อ " + time(result.requestedAt);
        if (attempt >= 90) throw Error("readiness_poll_timeout");
        timer = root.setTimeout(() => poll(result.requestId, token, attempt + 1), 2000); return;
      }
      if (!["complete", "failed"].includes(result.state)) throw Error("readiness_response_invalid");
      render(result); active = false; el("readiness-start").disabled = false;
    } catch (error) { failed(error, token); }
  }
  async function restore() {
    if (!allowed || active) return;
    cancel(); active = true; el("readiness-start").disabled = true; el("readiness-recover").hidden = true;
    text("กำลังดูผลคำขอล่าสุด…"); await poll(null, generation);
  }
  el("readiness-start").addEventListener("click", async () => {
    if (!allowed || active) return;
    cancel(); active = true; const token = generation;
    el("readiness-start").disabled = true; el("readiness-recover").hidden = true;
    el("readiness-checks").replaceChildren(); el("readiness-meta").textContent = ""; text("กำลังส่งคำขอตรวจความพร้อม…");
    try {
      const result = await rpc("battle_pass_request_readiness", {});
      if (token !== generation || !allowed) return;
      if (!/^\d+$/.test(result.requestId || "")) throw Error("invalid_request_id");
      await poll(result.requestId, token);
    } catch (error) { failed(error, token); }
  });
  el("readiness-recover").addEventListener("click", restore);
  function access(value) {
    allowed = value === true;
    if (!allowed) { reset(); return; }
    if (!initialized) { initialized = true; restore(); }
  }
  root.addEventListener("flowmate:bp-monitor-access", event => access(event.detail));
  root.addEventListener("pagehide", () => { allowed = false; reset(); });
  root.addEventListener("pageshow", () => access(el("monitor")?.hidden === false));
  access(el("monitor")?.hidden === false);
})(typeof window === "undefined" ? globalThis : window);
