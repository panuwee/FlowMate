(function (root) {
  "use strict";
  const states = {
    waiting_confirmation: "รอ Aof ยืนยัน Loot และ P", needs_data: "ข้อมูลต้นทางยังไม่ครบ",
    source_blocked: "ต้องตรวจข้อมูลต้นทาง", no_pending_month: "ไม่มีเดือนที่รอดำเนินการ",
    running: "กำลังทำงาน", in_progress: "มีรอบที่กำลังทำงาน", busy: "มีรอบที่กำลังทำงาน",
    complete: "สร้างชุดงานแล้ว", review_required: "ต้องตรวจการเปลี่ยนแปลง",
    failed: "ทำงานไม่สำเร็จ", disabled: "พักการทำงาน",
    readiness_checked: "ตรวจความพร้อมแล้ว", google_write_checked: "ทดสอบเขียน Google แล้ว",
    ready: "พร้อมดำเนินการ", resume: "รอดำเนินการต่อ"
  };
  const kinds = { production: "รอบทำงาน", readiness: "ตรวจความพร้อม", probe: "ทดสอบ Google", unknown: "ไม่ระบุประเภท" };
  const stages = { start: "เริ่มทำงาน", google_auth: "เชื่อม Google", inventory: "ตรวจงานเดิม",
    source: "อ่านต้นทาง", claim: "จองรอบทำงาน", google_deck: "สร้างและตรวจ Brief",
    reviewer_access: "ตรวจสิทธิ์ Aof", source_recheck: "ตรวจต้นทางซ้ำ", finalize: "บันทึกชุดงาน",
    post_finalize_recheck: "ตรวจหลังบันทึก", complete: "เสร็จสิ้น", google_access: "ตรวจสิทธิ์ Google",
    database_readiness: "ตรวจความพร้อมฐานข้อมูล", google_write_probe: "ทดสอบ Google" };
  function time(value) {
    if (!value || !Number.isFinite(Date.parse(value))) return "ยังไม่มีข้อมูล";
    return new Intl.DateTimeFormat("th-TH-u-ca-gregory", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
  }
  function status(value) { return states[value] || "สถานะที่ยังไม่รู้จัก — เปิดรายละเอียด"; }
  function model(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.history) || !Array.isArray(data.outputs)
      || !Number.isFinite(Date.parse(data.observedAt))) throw Error("invalid_response");
    const job = data.scheduler;
    const enabled = data.enabled === true && job?.active === true;
    const latest = data.history.find(row => row.kind === "production" || row.kind === "unknown") || null;
    const stale = enabled && (!latest || !Number.isFinite(Date.parse(latest.checkedAt))
      || Date.parse(data.observedAt) - Date.parse(latest.checkedAt) > 65 * 60000);
    return { enabled, latest, stale,
      enabledText: data.enabled == null ? "ตรวจสถานะไม่ได้" : !job ? "ไม่พบตัวตั้งเวลา"
        : enabled ? "เปิดใช้งาน" : data.enabled === false && job.active === false ? "พักการทำงาน" : "เปิดไม่ครบทั้งสองส่วน",
      scheduleText: job?.schedule === "*/30 * * * *" ? "ทุก 30 นาที · นาที :00 และ :30"
        : job?.schedule ? "ตารางเวลา: " + job.schedule : "ยังไม่มีตารางเวลา",
      attention: stale ? "ยังไม่พบผล Worker ใหม่ในช่วง 65 นาที ควรตรวจระบบ"
        : latest?.status === "waiting_confirmation" ? "เมื่อยืนยันครบ ระบบจะตรวจเองในรอบถัดไป"
        : latest?.status === "failed" ? "เปิดรายละเอียดรอบล่าสุดเพื่อดูขั้นตอนและรหัสปัญหา" : ""
    };
  }
  function outputLinks(row) {
    const links = [];
    if (/^CR-\d+$/.test(row.displayId || "")) links.push({ label: row.displayId, href: "./#detail/" + row.displayId });
    if (/^[A-Za-z0-9_-]{10,200}$/.test(row.slideId || "")) links.push({ label: "เปิด Brief", href: "https://docs.google.com/presentation/d/" + row.slideId + "/edit" });
    return links;
  }
  const api = { model, status, time, outputLinks };
  root.BattlePassMonitor = api;
  if (typeof module !== "undefined") module.exports = api;
  if (!root.document) return;
  const document = root.document;
  const el = id => document.getElementById(id);
  const client = root.flowmateSupabase;
  let snapshot = null, sequence = 0, busy = false;
  function node(tag, text) { const n = document.createElement(tag); if (text != null) n.textContent = text; return n; }
  function message(text, error) { el("message").textContent = text; el("message").dataset.error = String(!!error); }
  function clear() {
    snapshot = null; el("monitor").hidden = true; el("history").replaceChildren(); el("outputs").replaceChildren();
    for (const id of ["observed", "enabled", "schedule", "latest", "latest-time", "attention", "cron", "cron-time"]) el(id).textContent = "";
  }
  async function bounded(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = root.setTimeout(() => reject(Error("timeout")), 20000); })]); }
    finally { root.clearTimeout(timer); }
  }
  function history() {
    const filter = el("filter").value;
    const rows = (snapshot?.history || []).filter(row => filter === "all" || (filter === "production" ? row.kind === "production" : ["readiness", "probe"].includes(row.kind)));
    el("history").replaceChildren();
    for (const row of rows) {
      const tr = node("tr");
      for (const text of [time(row.checkedAt), kinds[row.kind] || "ไม่ทราบประเภท", row.period || "—", status(row.status)]) tr.append(node("td", text));
      const td = node("td"), detail = node("details"); detail.append(node("summary", "ดูรายละเอียด"));
      for (const [label, value] of [["Run ID", row.runId], ["สถานะ", row.status], ["ขั้นตอน", stages[row.stage] || row.stage], ["รหัสปัญหา", row.code]]) {
        if (!value) continue;
        const line = node("p", label + ": "); line.append(node("code", value)); detail.append(line);
      }
      td.append(detail); tr.append(td); el("history").append(tr);
    }
    el("history-empty").hidden = rows.length > 0;
  }
  function render(data) {
    const m = model(data); snapshot = data;
    el("observed").textContent = "ข้อมูลจากระบบ ณ " + time(data.observedAt) + " · กดรีเฟรชเพื่ออ่านผลล่าสุด";
    el("enabled").textContent = m.enabledText;
    el("enabled").dataset.tone = m.enabled ? "good" : "warning";
    el("schedule").textContent = m.scheduleText;
    el("latest").textContent = m.latest ? status(m.latest.status) : "ยังไม่พบรอบทำงานในประวัติล่าสุด";
    el("latest").dataset.tone = m.stale || m.latest?.status === "failed" ? "error" : ["complete", "no_pending_month"].includes(m.latest?.status) ? "good" : "warning";
    el("latest-time").textContent = m.latest ? time(m.latest.checkedAt) + (m.latest.period ? " · " + m.latest.period : "") : "";
    el("attention").textContent = m.attention;
    const cron = data.scheduler?.lastRun;
    el("cron").textContent = !cron ? "ยังไม่มีประวัติ" : cron.status === "succeeded" ? "เรียกงานสำเร็จ"
      : cron.status === "failed" ? "เรียกงานไม่สำเร็จ" : "กำลังเรียกงาน (" + cron.status + ")";
    el("cron").dataset.tone = cron?.status === "succeeded" ? "good" : "warning";
    el("cron-time").textContent = cron ? time(cron.startedAt) + " · Cron run #" + cron.runId : "";
    el("outputs").replaceChildren();
    if (!data.outputs.length) el("outputs").append(node("p", "ยังไม่มีชุดงาน production ที่บันทึกไว้"));
    for (const row of data.outputs) {
      const item = node("div"); item.className = "output"; item.append(node("strong", row.period));
      item.append(node("span", row.held ? "พักงานเพื่อตรวจข้อมูลที่เปลี่ยน" : row.state === "complete"
        ? row.reviewReleasedAt ? "Aof ปล่อยงานแล้ว" : "สร้างชุดงานแล้ว · รอ Aof ตรวจ" : status(row.state)));
      for (const link of outputLinks(row)) { const a = node("a", link.label); a.href = link.href; a.target = "_blank"; a.rel = "noopener noreferrer"; item.append(a); }
      el("outputs").append(item);
    }
    history(); el("monitor").hidden = false;
  }
  async function refresh() {
    if (busy) return;
    busy = true; const request = ++sequence; el("refresh").disabled = true; el("login").hidden = true;
    message("กำลังอ่านสถานะล่าสุด…");
    try {
      if (!client?.auth || !client.rpc) throw Error("client_unavailable");
      const user = await bounded(client.auth.getUser());
      if (request !== sequence) return;
      if (user.error || !user.data?.user) { clear(); el("login").hidden = false; message("กรุณาเข้าสู่ระบบก่อนดูสถานะ", true); return; }
      const result = await bounded(client.rpc("battle_pass_monitor"));
      if (request !== sequence) return;
      if (result.error) {
        clear();
        message(result.error.code === "42501" ? "บัญชีนี้ไม่มีสิทธิ์ดูสถานะ ใช้บัญชีผู้เชื่อม Google หรือ Aof"
          : ["PGRST202", "42883"].includes(result.error.code) ? "ระบบสถานะยังไม่ได้ติดตั้ง กรุณาติดต่อผู้ดูแล"
          : "อ่านสถานะไม่สำเร็จ กรุณาลองรีเฟรชอีกครั้ง", true); return;
      }
      render(result.data); message("อ่านสถานะล่าสุดแล้ว");
    } catch { if (request === sequence) { clear(); message("อ่านสถานะไม่สำเร็จ กรุณาลองรีเฟรชอีกครั้ง", true); } }
    finally { if (request === sequence) { busy = false; el("refresh").disabled = false; } }
  }
  el("refresh").addEventListener("click", refresh);
  el("filter").addEventListener("change", history);
  client?.auth?.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
      ++sequence; busy = false; clear(); el("refresh").disabled = false;
      if (event === "SIGNED_OUT") { el("login").hidden = false; message("กรุณาเข้าสู่ระบบก่อนดูสถานะ", true); }
      else root.setTimeout(refresh, 0);
    }
  });
  refresh();
})(typeof window === "undefined" ? globalThis : window);
