(function (root) {
  "use strict";
  // Phase 2B.1 operator controls. Every button calls one guarded RPC and shows what it did.
  // The only control here that changes production state is Pause/Resume, which flips
  // monthly_settings.enabled. Run Now and Retry only ask the existing worker to run sooner
  // than its next 30-minute tick; they mutate nothing themselves.
  const labels = {
    run_now: "สั่งรันตอนนี้", retry: "ลองใหม่", pause: "พักการทำงาน", resume: "เปิดการทำงาน"
  };
  const codes = {
    action_request_failed: "คำขอไม่สำเร็จ กรุณาลองอีกครั้ง",
    action_response_invalid: "ผลตอบกลับไม่ตรงกับบันทึกของ Worker",
    action_result_unavailable: "ยังยืนยันผลคำขอนี้ไม่ได้ · ดูประวัติการสั่งงานด้านล่าง"
  };
  const errors = {
    "Automation is paused": "ระบบอัตโนมัติถูกพักอยู่ · กดเปิดการทำงานก่อน",
    "Completed month cannot be retried": "เดือนนี้สร้างงานเสร็จแล้ว ลองใหม่ไม่ได้",
    "Run already in flight": "รอบนี้กำลังทำงานอยู่ · รอให้จบก่อน",
    "No production run for this period": "ยังไม่มีรอบทำงานของเดือนนี้",
    "Invalid production period": "เดือนที่เลือกไม่ถูกต้อง",
    "Run dispatch unavailable": "สั่งงานไม่สำเร็จ · ระบบอัตโนมัติอาจถูกพักอยู่",
    "Retry dispatch unavailable": "สั่งลองใหม่ไม่สำเร็จ"
  };
  function heldMessage(message) {
    const match = /^Held for review \(([a-z0-9_]{1,50})\)/.exec(String(message || ""));
    return match ? "รอบนี้ถูกพักไว้ให้คนตรวจ (" + match[1] + ") · ต้องเคลียร์ข้อมูลต้นทางก่อน "
      + "ระบบไม่อนุญาตให้สั่งลองใหม่ เพราะเสี่ยงสร้างงานจากข้อมูลเก่า" : null;
  }
  function describe(message) {
    return heldMessage(message) || errors[message]
      || (/^Only a failed run can be retried/.test(String(message || ""))
        ? "สั่งลองใหม่ได้เฉพาะรอบที่ล้มเหลวเท่านั้น" : null);
  }
  root.BattlePassOperator = { labels, codes, describe };
  if (typeof module !== "undefined") module.exports = root.BattlePassOperator;
  if (!root.document) return;

  const doc = root.document, el = id => doc.getElementById(id), client = root.flowmateSupabase;
  if (!el("op-run")) return;
  let allowed = false, active = false, initialized = false, generation = 0, timer = null;
  let enabled = null;
  const time = value => root.BattlePassMonitor?.time(value) || value || "—";
  const node = (tag, text) => { const n = doc.createElement(tag); if (text != null) n.textContent = text; return n; };

  function text(value, error) {
    el("op-message").textContent = value;
    el("op-message").dataset.error = String(!!error);
  }
  function cancel() { ++generation; root.clearTimeout(timer); timer = null; active = false; }
  function buttons(disabled) {
    for (const id of ["op-run", "op-toggle", "op-retry"]) el(id).disabled = disabled || !allowed;
    el("op-period").disabled = disabled || !allowed;
  }
  function reset() {
    cancel(); initialized = false; enabled = null; buttons(true);
    el("op-audit").replaceChildren(); el("op-message").textContent = "";
    el("op-meta").textContent = ""; el("op-toggle").textContent = "พัก / เปิดการทำงาน";
  }
  async function rpc(name, args) {
    let timeout;
    try {
      const result = await Promise.race([client.rpc(name, args), new Promise((_, reject) => {
        timeout = root.setTimeout(() => reject(Error("request_timeout")), 20000);
      })]);
      if (result.error) throw Object.assign(Error(result.error.message || "operator_rpc_failed"),
        { code: result.error.code });
      if (!result.data || typeof result.data !== "object") throw Error("operator_response_invalid");
      return result.data;
    } finally { root.clearTimeout(timeout); }
  }
  function failed(error, token) {
    if (token !== generation || !allowed) return;
    active = false; buttons(false);
    if (error.code === "42501" && !describe(error.message)) {
      allowed = false; reset(); text("บัญชีนี้ไม่มีสิทธิ์สั่งงาน", true); return;
    }
    if (["PGRST202", "42883"].includes(error.code)) {
      text("ส่วนควบคุมยังไม่ได้ติดตั้ง กรุณาติดต่อผู้ดูแล", true); buttons(true); return;
    }
    text(describe(error.message) || "สั่งงานไม่สำเร็จ · ดูประวัติด้านล่างก่อนสั่งซ้ำ", true);
  }

  // Periods come from the rendered monitor output list so this module never needs its own
  // copy of the monthly state. Newest first, which is what an operator retries.
  function periods() {
    return [...doc.querySelectorAll("#outputs .output strong")]
      .map(n => n.textContent.trim())
      .filter(value => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value));
  }
  function fillPeriods() {
    const current = el("op-period").value, list = periods();
    el("op-period").replaceChildren();
    if (!list.length) {
      const option = node("option", "— ยังไม่มีเดือนให้เลือก —");
      option.value = ""; el("op-period").append(option); el("op-retry").disabled = true; return;
    }
    for (const period of list) {
      const option = node("option", period); option.value = period; el("op-period").append(option);
    }
    if (list.includes(current)) el("op-period").value = current;
  }
  function renderAudit(data) {
    enabled = data.automationEnabled === true;
    el("op-toggle").textContent = enabled ? "พักการทำงาน" : "เปิดการทำงาน";
    el("op-audit").replaceChildren();
    const rows = Array.isArray(data.actions) ? data.actions : [];
    if (!rows.length) { el("op-audit").append(node("li", "ยังไม่มีประวัติการสั่งงาน")); return; }
    for (const row of rows.slice(0, 20)) {
      const li = node("li");
      li.append(node("strong", labels[row.action] || row.action));
      li.append(node("span", " · " + time(row.requestedAt) + " · โดย " + (row.requestedBy || "—")
        + (row.period ? " · " + row.period : "")
        + (row.requestId ? " · คำขอ #" + row.requestId : "")));
      const state = row.result && typeof row.result === "object" ? row.result : null;
      if (state) {
        const detail = state.workerState ? "ผล Worker: " + state.workerState + (state.code ? " (" + state.code + ")" : "")
          : state.state === "failed" ? (codes[state.code] || "ไม่สำเร็จ")
          : typeof state.enabled === "boolean" ? (state.enabled ? "เปิดการทำงาน" : "พักการทำงาน")
          : null;
        if (detail) li.append(node("span", " · " + detail));
      } else li.append(node("span", " · รอผล"));
      el("op-audit").append(li);
    }
  }
  async function loadAudit(token) {
    const data = await rpc("battle_pass_audit_trail", { p_limit: 20 });
    if (token !== generation || !allowed) return;
    renderAudit(data);
  }
  async function poll(actionId, token, attempt = 0) {
    if (token !== generation || !allowed) return;
    try {
      const result = await rpc("battle_pass_action_status", { p_action_id: actionId });
      if (token !== generation || !allowed) return;
      if (result.state === "pending") {
        text("กำลังทำงาน… คุณเปิดหน้านี้ไว้เพื่อรอผลได้");
        if (attempt >= 90) throw Error("operator_poll_timeout");
        timer = root.setTimeout(() => poll(actionId, token, attempt + 1), 2000); return;
      }
      if (result.state === "failed") text(codes[result.code] || "ไม่สำเร็จ · ดูประวัติด้านล่าง", true);
      else text("สั่งงานสำเร็จ" + (result.workerState ? " · ผล Worker: " + result.workerState : "")
        + (result.code ? " (" + result.code + ")" : ""));
      el("op-meta").textContent = "คำขอ #" + (result.requestId || "—")
        + (result.period ? " · " + result.period : "")
        + (result.runId ? " · Run ID: " + result.runId : "");
      active = false; buttons(false); await loadAudit(token);
    } catch (error) { failed(error, token); }
  }
  async function send(label, call) {
    if (!allowed || active) return;
    cancel(); active = true; const token = generation;
    buttons(true); el("op-meta").textContent = ""; text(label);
    try {
      const result = await call();
      if (token !== generation || !allowed) return;
      if (result.changed === false) {
        text("สถานะเป็นแบบนี้อยู่แล้ว ไม่มีการเปลี่ยนแปลง");
        active = false; buttons(false); await loadAudit(token); return;
      }
      if (result.actionId && result.requestId) {
        if (result.reused === true) text("ใช้คำขอเดิมที่ส่งไปแล้วภายใน 60 วินาที");
        await poll(Number(result.actionId), token); return;
      }
      text("ดำเนินการแล้ว"); active = false; buttons(false); await loadAudit(token);
    } catch (error) { failed(error, token); }
  }

  el("op-run").addEventListener("click", () =>
    send("กำลังสั่งรัน…", () => rpc("battle_pass_run_now", {})));

  el("op-retry").addEventListener("click", () => {
    const period = el("op-period").value;
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) { text("เลือกเดือนก่อนสั่งลองใหม่", true); return; }
    if (!root.confirm("สั่งให้ระบบลองทำงานเดือน " + period + " ใหม่ตอนนี้?\n\n"
      + "ระบบจะไม่แก้ข้อมูลใด ๆ เอง เพียงให้ Worker เริ่มทำงานทันทีแทนการรอรอบถัดไป "
      + "และจะปฏิเสธถ้ารอบนั้นเสร็จแล้ว กำลังทำงาน หรือถูกพักไว้ให้คนตรวจ")) return;
    send("กำลังสั่งลองใหม่…", () => rpc("battle_pass_retry", { p_period: period }));
  });

  el("op-toggle").addEventListener("click", () => {
    if (enabled === null) { text("ยังอ่านสถานะระบบไม่ได้ กดรีเฟรชสถานะก่อน", true); return; }
    const target = !enabled;
    if (!root.confirm(target ? "เปิดการทำงานอัตโนมัติ?" : "พักการทำงานอัตโนมัติ?\n\n"
      + "รอบที่กำลังทำงานอยู่จะทำต่อจนจบ การพักจะมีผลกับรอบถัดไป")) return;
    send(target ? "กำลังเปิดการทำงาน…" : "กำลังพักการทำงาน…",
      () => rpc("battle_pass_set_automation", { p_enabled: target }));
  });

  async function start() {
    if (!allowed) return;
    const token = generation;
    fillPeriods(); buttons(false); text("พร้อมสั่งงาน");
    try { await loadAudit(token); } catch (error) { failed(error, token); }
  }
  function access(value) {
    allowed = value === true;
    if (!allowed) { reset(); return; }
    fillPeriods();
    if (!initialized) { initialized = true; start(); } else buttons(false);
  }
  root.addEventListener("flowmate:bp-monitor-access", event => access(event.detail));
  root.addEventListener("pagehide", () => { allowed = false; reset(); });
  root.addEventListener("pageshow", () => access(el("monitor")?.hidden === false));
  access(el("monitor")?.hidden === false);
})(typeof window === "undefined" ? globalThis : window);
