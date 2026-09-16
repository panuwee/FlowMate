(function (root) {
  "use strict";
  // Phase 2B.4 controlled recovery panel: AI proposes, a human approves or rejects.
  //
  // This is the one panel in the whole Battle Pass automation surface that can trigger a
  // production action from an AI-authored suggestion - and even then, only by pressing the
  // same battle_pass_retry() the manual "ลองใหม่" button above already calls. There is no
  // other write path: rejecting only ever records a decision, and every guard is re-evaluated
  // server-side both when this list is built and again the instant a decision is submitted, so
  // nothing here can be trusted from a stale page. See PHASE_2B4_MVP_SPEC.md §0/§7.

  const blockedReasons = {
    schema_version_unknown: "รูปแบบผลวินิจฉัยไม่ตรงกับเวอร์ชันที่ระบบรองรับ",
    low_confidence: "AI มั่นใจต่ำกว่า 60% — ใช้เป็นข้อมูลประกอบเท่านั้น ไม่แนะนำให้อนุมัติ",
    risk_high: "ความเสี่ยงสูง — ต้องให้คนตรวจสอบเอง ระบบไม่เปิดให้อนุมัติผ่านหน้านี้",
    no_fingerprint: "คำแนะนำนี้บันทึกไว้ก่อนระบบตรวจสอบสถานะจะพร้อม ไม่สามารถยืนยันความสดใหม่ได้",
    state_changed: "สถานะของรอบทำงานเปลี่ยนไปหลังจาก AI วิเคราะห์ — ต้องขอวิเคราะห์ใหม่ก่อน",
    stale: "คำแนะนำนี้มีอายุเกิน 60 นาทีแล้ว",
    superseded: "มีผลตรวจจาก Worker ใหม่กว่าคำแนะนำนี้แล้ว",
    action_not_supported: "ระบบยังไม่มีปุ่มสั่งงานสำหรับคำแนะนำนี้ — ปฏิเสธได้ แต่อนุมัติไม่ได้",
    repeated_failure: "อนุมัติให้ลองใหม่ปัญหานี้ไปแล้ว 2 ครั้งในช่วง 7 วัน — ควรตรวจสาเหตุ ไม่ใช่ลองซ้ำอีก",
    held: "รอบนี้ถูกพักไว้ให้คนตรวจ — ต้องเคลียร์ข้อมูลต้นทางก่อน ระบบไม่อนุญาตให้ลองใหม่",
    not_failed: "รอบนี้ไม่ได้อยู่ในสถานะล้มเหลวแล้ว จึงลองใหม่ไม่ได้",
    bad_period: "เดือนที่ระบุไม่ถูกต้อง",
    automation_paused: "ระบบอัตโนมัติถูกพักอยู่ — เปิดการทำงานที่ควบคุมด้วยตนเองก่อน จึงจะอนุมัติได้",
    no_run: "ไม่พบรอบทำงานของเดือนนี้",
    already_complete: "เดือนนี้สร้างงานเสร็จแล้ว ลองใหม่ไม่ได้",
    run_in_flight: "รอบนี้กำลังทำงานอยู่ ต้องรอให้จบก่อน",
  };
  const risks = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" };
  const decisionLabels = { approved: "อนุมัติ", rejected: "ปฏิเสธ" };
  const errors = {
    "The suggested action changed since this page loaded - refresh and retry":
      "คำแนะนำเปลี่ยนไปตั้งแต่โหลดหน้านี้ — กดรีเฟรชแล้วลองใหม่",
    "The run state changed since this page loaded - refresh and retry":
      "สถานะรอบทำงานเปลี่ยนไปตั้งแต่โหลดหน้านี้ — กดรีเฟรชแล้วลองใหม่",
    "This suggestion has already been decided": "คำแนะนำนี้ถูกตัดสินใจไปแล้ว — กดรีเฟรช",
    "This diagnosis is not an executable proposal": "คำแนะนำนี้ไม่ใช่ข้อเสนอที่ดำเนินการได้แล้ว — กดรีเฟรช",
  };
  const label = (map, value, fallback) => map[value] || fallback || value || "—";
  function describeError(message) {
    const text = String(message || "");
    if (errors[text]) return errors[text];
    if (/^Not approvable/.test(text)) return "เงื่อนไขไม่ครบสำหรับอนุมัติ — กดรีเฟรชเพื่อดูเหตุผลล่าสุด";
    return null;
  }
  root.BattlePassRecovery = { blockedReasons, risks, decisionLabels, errors, label, describeError };
  if (typeof module !== "undefined") module.exports = root.BattlePassRecovery;
  if (!root.document) return;

  const doc = root.document, el = id => doc.getElementById(id), client = root.flowmateSupabase;
  if (!el("rec-list")) return;
  let allowed = false, active = false, initialized = false, generation = 0;
  const time = value => root.BattlePassMonitor?.time(value) || value || "—";
  const node = (tag, text) => { const n = doc.createElement(tag); if (text != null) n.textContent = text; return n; };

  function text(value, error) {
    el("rec-message").textContent = value;
    el("rec-message").dataset.error = String(!!error);
  }
  function cancel() { ++generation; active = false; }
  function reset() {
    cancel(); initialized = false;
    el("rec-list").replaceChildren(); el("rec-history").replaceChildren();
    el("rec-message").textContent = ""; el("rec-meta").textContent = "";
    el("rec-refresh").disabled = true;
  }
  async function rpc(name, args) {
    let timeout;
    try {
      const result = await Promise.race([client.rpc(name, args), new Promise((_, reject) => {
        timeout = root.setTimeout(() => reject(Error("request_timeout")), 20000);
      })]);
      if (result.error) throw Object.assign(Error(result.error.message || "recovery_rpc_failed"),
        { code: result.error.code });
      if (!result.data || typeof result.data !== "object") throw Error("recovery_response_invalid");
      return result.data;
    } finally { root.clearTimeout(timeout); }
  }
  function failed(error, token) {
    if (token !== generation || !allowed) return;
    active = false; el("rec-refresh").disabled = false;
    if (error.code === "42501" && !describeError(error.message)) {
      allowed = false; reset(); text("บัญชีนี้ไม่มีสิทธิ์ดูคำแนะนำนี้", true); return;
    }
    if (["PGRST202", "42883"].includes(error.code)) {
      text("ส่วนนี้ยังไม่ได้ติดตั้ง กรุณาติดต่อผู้ดูแล", true); el("rec-refresh").disabled = true; return;
    }
    text(describeError(error.message) || "อ่านคำแนะนำไม่สำเร็จ กรุณาลองอีกครั้ง", true);
  }

  // ---------------------------------------------------------------- render one proposal card
  // Order below is a safety requirement, not a preference (spec §7): evidence and impact
  // before the recommendation, the recommendation before any blocked-reason sentence, and the
  // disclaimer before the controls. A test can assert on this by reading childNodes order.
  function renderCard(p) {
    const card = node("article"); card.className = "proposal"; card.dataset.diagnosisId = p.diagnosisId;
    // Captured at render time, not re-read from the server on click: the whole point of the
    // decide RPC's two checksums is to catch drift between what THIS PAGE showed and what is
    // true now. Fetching a fresh value right before sending it would make the checksum compare
    // "now" against "now" and never catch anything - it must be what the operator actually saw.
    card.dataset.proposedAction = p.proposedAction || "";
    card.dataset.fingerprint = p.fingerprint || "";
    card.dataset.period = p.period || "";

    const head = node("p"); head.className = "value";
    const state = p.runState || {};
    head.textContent = "เดือน " + (p.period || "—") + " · สถานะล่าสุด: " + (state.state || "—")
      + (state.lastTickCode ? " · " + state.lastTickCode : "");
    if (state.held) { head.dataset.tone = "warning"; }
    card.append(head);
    if (state.held) card.append(node("p", "🔒 รอบนี้ถูกพักไว้ให้คนตรวจ"
      + (state.holdReason ? " (" + state.holdReason + ")" : "")));

    if (p.evidence) card.append(node("h3", "หลักฐานที่ใช้"), node("pre", p.evidence));
    if (p.impact) card.append(node("h3", "ผลกระทบ"), node("p", p.impact));
    card.append(node("h3", "สาเหตุที่วิเคราะห์ได้"), node("p", p.diagnosis || "—"));

    card.append(node("h3", "คำแนะนำของ AI"));
    const rec = node("p"); rec.className = "value";
    const conf = Number(p.confidence);
    rec.textContent = "ความเสี่ยง: " + label(risks, p.risk)
      + " · ความมั่นใจ " + (Number.isFinite(conf) ? conf + "%" : "—")
      + (p.agentVersion ? " · " + p.agentVersion : "");
    rec.dataset.tone = p.risk === "low" ? "good" : p.risk === "high" ? "error" : "warning";
    card.append(rec);
    if (p.recommendedActionRaw) card.append(node("p", p.recommendedActionRaw));

    const blocked = Array.isArray(p.blockedBy) ? p.blockedBy : [];
    if (blocked.length) {
      const list = node("ul");
      for (const reason of blocked) list.append(node("li", label(blockedReasons, reason)));
      card.append(list);
    }

    card.append(node("p",
      "นี่คือคำแนะนำจากระบบวินิจฉัย คุณเป็นผู้ตัดสินใจ การกดอนุมัติจะกดปุ่ม \"ลองใหม่\" "
      + "แบบเดียวกับที่อยู่ในควบคุมด้วยตนเองด้านบน"));

    const controls = node("div"); controls.className = "control-row";
    const approve = node("button", "อนุมัติให้ลองใหม่"); approve.type = "button";
    approve.dataset.action = "approve"; approve.disabled = p.approvable !== true;
    const reject = node("button", "ปฏิเสธคำแนะนำ"); reject.type = "button";
    reject.dataset.action = "reject";
    controls.append(approve, reject);
    card.append(controls);

    return card;
  }

  function renderList(data) {
    const proposals = Array.isArray(data.proposals) ? data.proposals : [];
    el("rec-list").replaceChildren();
    if (!proposals.length) {
      text("ไม่มีคำแนะนำจาก AI ที่รออนุมัติตอนนี้");
      el("rec-meta").textContent = "";
      return;
    }
    text(proposals.length + " คำแนะนำรออนุมัติ");
    el("rec-meta").textContent = "อ่านล่าสุด: " + time(data.observedAt);
    for (const p of proposals) el("rec-list").append(renderCard(p));
  }

  function renderHistory(data) {
    const rows = Array.isArray(data.decisions) ? data.decisions : [];
    el("rec-history").replaceChildren();
    if (!rows.length) { el("rec-history").append(node("li", "ยังไม่มีประวัติการตัดสินใจ")); return; }
    for (const row of rows.slice(0, 20)) {
      const li = node("li");
      li.append(node("strong", label(decisionLabels, row.decision)));
      li.append(node("span", " · เดือน " + (row.period || "—")
        + " · " + time(row.decidedAt) + " · โดย " + (row.decidedBy || "—")
        + (row.note ? " · " + row.note : "")));
      el("rec-history").append(li);
    }
  }

  async function load(token) {
    const [proposals, history] = await Promise.all([
      rpc("battle_pass_recovery_proposals", { p_limit: 20 }),
      rpc("battle_pass_recovery_history", { p_limit: 20 }),
    ]);
    if (token !== generation || !allowed) return;
    renderList(proposals); renderHistory(history);
    el("rec-refresh").disabled = false; active = false;
  }

  async function decide(diagnosisId, decision, expectedAction, expectedFingerprint, note) {
    if (!allowed || active) return;
    cancel(); active = true; const token = generation;
    el("rec-refresh").disabled = true;
    text(decision === "approve" ? "กำลังอนุมัติ…" : "กำลังบันทึกการปฏิเสธ…");
    try {
      await rpc("battle_pass_recovery_decide", {
        p_diagnosis_id: Number(diagnosisId), p_decision: decision,
        p_expected_action: expectedAction, p_expected_fingerprint: expectedFingerprint,
        p_note: note || null,
      });
      if (token !== generation || !allowed) return;
      text(decision === "approve" ? "อนุมัติแล้ว — ระบบกำลังลองใหม่" : "บันทึกการปฏิเสธแล้ว");
      await load(token);
    } catch (error) { failed(error, token); }
  }

  // Event delegation: one listener for every card's buttons, since cards are re-rendered on
  // every refresh. No control here decides more than one proposal at a time (spec §7.2).
  el("rec-list").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || !allowed || active) return;
    const card = button.closest(".proposal");
    const diagnosisId = card?.dataset.diagnosisId;
    if (!diagnosisId) return;
    const expectedAction = card.dataset.proposedAction || null;
    const expectedFingerprint = card.dataset.fingerprint || null;
    const period = card.dataset.period || "";

    if (button.dataset.action === "approve") {
      if (!root.confirm("อนุมัติคำแนะนำ AI: สั่งลองใหม่เดือน " + period + " ตอนนี้?\n\n"
        + "การกดนี้จะกดปุ่ม \"ลองใหม่\" แบบเดียวกับที่อยู่ในควบคุมด้วยตนเองด้านบน "
        + "ระบบจะตรวจสิทธิ์และเงื่อนไขทั้งหมดอีกครั้งก่อนทำงานจริง")) return;
      decide(diagnosisId, "approve", expectedAction, expectedFingerprint, null);
    } else {
      if (!root.confirm("ปฏิเสธคำแนะนำของ AI สำหรับเดือน " + period + " อย่างถาวร?\n\n"
        + "หลังกดแล้วจะไม่สามารถกลับมาอนุมัติคำแนะนำนี้ได้อีก "
        + "แต่คุณยังสั่งลองใหม่ได้เองที่ \"ควบคุมด้วยตนเอง\" เสมอ")) return;
      decide(diagnosisId, "reject", expectedAction, expectedFingerprint, null);
    }
  });

  el("rec-refresh").addEventListener("click", () => {
    if (!allowed || active) return;
    cancel(); const token = generation;
    text("กำลังอ่านคำแนะนำล่าสุด…"); el("rec-refresh").disabled = true;
    load(token).catch(error => failed(error, token));
  });

  async function start() {
    if (!allowed) return;
    const token = generation;
    text("กำลังอ่านคำแนะนำล่าสุด…");
    try { await load(token); } catch (error) { failed(error, token); }
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
