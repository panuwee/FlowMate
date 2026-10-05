/* AUTO-GENERATED from kpi-workspace.ts by build-github.cjs. */
(function () { const module = { exports: {} }; const exports = module.exports;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = exports.routes = exports.labels = exports.organizationCalendar = exports.version = exports.KpiError = void 0;
exports.workingDays = workingDays;
exports.dateKey = dateKey;
exports.period = period;
exports.readMonthPreference = readMonthPreference;
exports.writeMonthPreference = writeMonthPreference;
exports.scopeKey = scopeKey;
exports.menuAllowed = menuAllowed;
exports.validReady = validReady;
exports.facts = facts;
exports.confirmedDeadline = confirmedDeadline;
exports.evidenceContext = evidenceContext;
exports.recordEvidence = recordEvidence;
exports.metrics = metrics;
exports.metricRows = metricRows;
exports.csv = csv;
exports.load = load;
class KpiError extends Error {
    constructor(kind, message, code) {
        super(message);
        this.kind = kind;
        this.code = code;
        this.name = 'KpiError';
    }
}
exports.KpiError = KpiError;
const str = (value) => typeof value === 'string' ? value : '';
const sid = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const obj = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const timestamp = (value) => str(value) && Number.isFinite(Date.parse(str(value))) ? str(value) : null;
const DAY = 86400000;
exports.version = 'kpi-local-20261005-evidence-v3';
// User-confirmed organization calendar, all teams Mon-Fri; never extrapolate to another year.
exports.organizationCalendar = { version: 'organization-2026-v1', start: '2026-01-01', end: '2026-12-31', source: 'Holiday List!A21:D39', holidays: ['2026-01-01', '2026-01-02', '2026-02-17', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-08-12', '2026-10-13', '2026-10-23', '2026-12-07', '2026-12-31'] };
function workingDays(start, end) {
    if (!start || !end || !timestamp(start) || !timestamp(end) || Date.parse(end) < Date.parse(start))
        return null;
    if (dateKey(start) < exports.organizationCalendar.start || dateKey(end) > exports.organizationCalendar.end)
        return null;
    let total = 0, at = Date.parse(start), finish = Date.parse(end);
    while (at < finish) {
        const local = new Date(at + 7 * 3600000), midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 7 * 3600000, next = Math.min(midnight + DAY, finish), weekday = local.getUTCDay();
        if (weekday !== 0 && weekday !== 6 && !exports.organizationCalendar.holidays.includes(dateKey(new Date(at).toISOString())))
            total += (next - at) / DAY;
        at = next;
    }
    return total;
}
exports.labels = { overview: 'ภาพรวม KPI', creative: 'Creative KPI', requester: 'Requester KPI', task: 'Task Assign KPI' };
exports.routes = { overview: 'kpi', creative: 'kpi-creative', requester: 'kpi-requester', task: 'kpi-task' };
function dateKey(value) { return value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 7 * 3600000).toISOString().slice(0, 10) : ''; }
function period(month) {
    if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))
        throw new KpiError('load', 'เดือนรายงานไม่ถูกต้อง');
    const [y, m] = month.split('-').map(Number);
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    return { start: `${month}-01T00:00:00+07:00`, end: `${next}-01T00:00:00+07:00` };
}
function readMonthPreference(storage, viewer, now = new Date().toISOString()) {
    const current = dateKey(now).slice(0, 7);
    try {
        const saved = viewer?.id ? storage.getItem(`flowmate:kpi-month:v1:${viewer.id}`) : null;
        if (saved && saved >= '2026-01' && saved <= current) {
            period(saved);
            return saved;
        }
    }
    catch { }
    return current;
}
function writeMonthPreference(storage, viewer, month, now = new Date().toISOString()) {
    try {
        period(month);
        if (viewer?.id && month >= '2026-01' && month <= dateKey(now).slice(0, 7))
            storage.setItem(`flowmate:kpi-month:v1:${viewer.id}`, month);
    }
    catch { }
}
function scopeKey(user) { return user ? JSON.stringify([user.id, user.role, user.is_active, user.can_access_all_teams, user.canAccessAllTeams, [...(user.accessible_teams ?? [])].sort()]) : ''; }
function menuAllowed(user) { return !!user?.id && user.is_active !== false && user.role !== 'viewer' && (user.role === 'admin' || user.can_access_all_teams === true || user.canAccessAllTeams === true); }
const format = (value, unit = 'count') => value === null ? '—' : `${new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 }).format(value)}${unit === 'percent' ? '%' : unit === 'days' ? ' วัน' : unit === 'score' ? ' / 5' : ' งาน'}`;
exports.format = format;
const before = (value, asOf) => !!value && Date.parse(value) <= Date.parse(asOf);
const inMonth = (value, month, asOf) => before(value, asOf) && dateKey(value).slice(0, 7) === month;
const earliest = (values, asOf) => values.filter((v) => before(v, asOf)).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
const eventAction = (e) => str(obj(e.metadata).action);
const taskEvent = (e, action) => str(obj(e.metadata).source) === 'task_assign_workspace' && eventAction(e) === action;
const resourceRows = (s, key) => s.resources[key]?.status === 'ready' ? s.resources[key].rows : [];
const ready = (s, ...keys) => keys.every(k => s.resources[k]?.status === 'ready');
function validReady(brief, asOf) {
    const submissions = brief.filter(b => b.action === 'submitted' && before(timestamp(b.occurred_at), asOf)).sort((a, b) => Date.parse(str(b.occurred_at)) - Date.parse(str(a.occurred_at)) || Number(b.id) - Number(a.id));
    const latest = submissions[0];
    if (!latest)
        return null;
    const accepts = brief.filter(b => b.action === 'accepted' && sid(b.submission_id) === sid(latest.id) && sid(b.work_item_id) === sid(latest.work_item_id) && before(timestamp(b.occurred_at), asOf) && Date.parse(str(b.occurred_at)) >= Date.parse(str(latest.occurred_at)) && str(b.actor_user_id).trim() && str(b.reason).trim() && str(b.brief_link).trim() && b.brief_link === latest.brief_link);
    return accepts.length === 1 ? timestamp(accepts[0].occurred_at) : null;
}
function facts(snapshot) {
    const events = resourceRows(snapshot, 'history'), milestones = resourceRows(snapshot, 'milestones'), brief = resourceRows(snapshot, 'brief');
    return resourceRows(snapshot, 'work').map(w => {
        const id = sid(w.work_item_id ?? w.id);
        const history = events.filter(e => sid(e.work_item_id) === id), ms = milestones.filter(m => sid(m.work_item_id) === id), br = brief.filter(b => sid(b.work_item_id) === id);
        const reviewAt = earliest([...history.filter(e => e.from_status === 'in_progress' && e.to_status === 'review').map(e => timestamp(e.created_at)), ...ms.filter(m => m.milestone === 'review').map(m => timestamp(m.occurred_at))], snapshot.asOf);
        const deliveredAt = earliest([...history.filter(e => e.to_status === 'delivered').map(e => timestamp(e.created_at)), ...ms.filter(m => m.milestone === 'delivered').map(m => timestamp(m.occurred_at))], snapshot.asOf);
        const attribution = ms.find(m => m.milestone === 'delivered' && timestamp(m.occurred_at) === deliveredAt);
        const assignment = ms.find(m => m.milestone === 'assigned' && before(timestamp(m.occurred_at), snapshot.asOf) && reviewAt && Date.parse(str(m.occurred_at)) <= Date.parse(reviewAt));
        const briefLink = str(resourceRows(snapshot, 'briefLinks').find(b => sid(b.work_item_id) === id)?.brief_link).trim();
        const fact = { id, displayId: str(w.display_id), title: str(w.title), status: str(w.status), team: str(w.requester_team), createdAt: timestamp(w.created_at), requestSubmittedAt: earliest(history.filter(e => e.event_type === 'created' && str(obj(e.metadata).source) === 'task_assign_workspace').map(e => timestamp(e.created_at)), snapshot.asOf), ownerId: str(attribution?.owner_member_id), ownerName: str(attribution?.owner_name) || 'ยังไม่มีเจ้าของ ณ ส่งมอบ', reviewAt, deliveredAt, submitAt: earliest(history.filter(e => taskEvent(e, 'submit') && e.to_status === 'review').map(e => timestamp(e.created_at)), snapshot.asOf), approveAt: earliest(history.filter(e => taskEvent(e, 'approve') && e.to_status === 'delivered').map(e => timestamp(e.created_at)), snapshot.asOf), startedAt: earliest(history.filter(e => taskEvent(e, 'start') && e.to_status === 'in_progress').map(e => timestamp(e.created_at)), snapshot.asOf), surveyAt: earliest(resourceRows(snapshot, 'surveys').filter(r => sid(r.work_item_id) === id).map(r => timestamp(r.recorded_at)), snapshot.asOf), readyAt: validReady(br, snapshot.asOf), briefLink, draftBaselineCandidate: assignment ? str(assignment.due_date) || null : null, events: history, milestones: ms, brief: br };
        fact.readyAt = confirmedReady(snapshot, fact, snapshot.asOf);
        return fact;
    });
}
function missing(id, label, cohort, event, reason) { return { id, label, value: null, unit: 'percent', note: reason, cohort, eligible: [], reasons: { [reason]: cohort.length }, event, available: false }; }
function count(id, label, cohort, event, available) { return { id, label, value: available ? cohort.length : null, unit: 'count', note: available ? 'Task ID ไม่ซ้ำ · เหตุการณ์ครั้งแรกในเดือนที่เลือก' : 'หลักฐานโหลดไม่ครบ กรุณาลองใหม่', cohort, eligible: available ? cohort : [], reasons: available ? {} : { 'โหลดหลักฐานไม่ครบ': cohort.length }, event, available }; }
function evidenceFor(s, f, kind, at = s.asOf) {
    const reset = Math.max(0, ...f.events.filter(e => taskEvent(e, 'forward') && before(timestamp(e.created_at), at)).map(e => Date.parse(str(e.created_at))));
    return resourceRows(s, 'evidence').filter(e => sid(e.work_item_id) === f.id && e.kind === kind && (kind === 'intake' || str(e.actor_user_id).trim()) && before(timestamp(e.recorded_at), at) && (kind === 'intake' || Date.parse(str(e.recorded_at)) >= reset)).sort((a, b) => Date.parse(str(a.recorded_at)) - Date.parse(str(b.recorded_at)) || Number(a.id) - Number(b.id));
}
function confirmedDeadline(s, f, endpoint, at = s.asOf) {
    const record = evidenceFor(s, f, 'deadline', at).find(e => e.endpoint === endpoint);
    return record && /^20\d\d-\d\d-\d\d$/.test(str(record.due_date)) ? str(record.due_date) : null;
}
function confirmedReady(s, f, at) {
    if (!at)
        return null;
    if (s.domain !== 'task')
        return validReady(f.brief, at);
    const resets = f.events.filter(e => ['forward', 'edit', 'edit_brief', 'need_information'].some(a => taskEvent(e, a)) && before(timestamp(e.created_at), at));
    const latestReset = Math.max(0, ...resets.map(e => Date.parse(str(e.created_at))));
    return timestamp(evidenceFor(s, f, 'ready', at).find(e => str(e.brief_fingerprint).trim() && Date.parse(str(e.recorded_at)) >= latestReset)?.recorded_at);
}
async function evidenceContext(client, id) {
    const result = await client.rpc('flowmate_kpi_evidence_context', { p_work_item_id: id });
    if (result.error)
        throw new KpiError('load', 'ยังไม่พร้อมเก็บหลักฐาน KPI กรุณาตรวจการติดตั้งและสิทธิ์', result.error.code);
    if (!result.data || typeof result.data !== 'object')
        throw new KpiError('load', 'ยังไม่ได้ติดตั้งชุดเก็บหลักฐาน KPI');
    return obj(result.data);
}
async function recordEvidence(client, input) {
    const result = await client.rpc('flowmate_kpi_record_evidence', { ...input });
    if (result.error)
        throw new KpiError('load', result.error.code === '40001' ? 'บรีฟเปลี่ยนแล้ว กรุณาเปิดหลักฐานใหม่ก่อนยืนยัน' : result.error.code === '42501' ? 'บัญชีนี้ไม่มีสิทธิ์บันทึกหลักฐานของงานนี้' : 'บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลและลองอีกครั้ง', result.error.code);
    if (!obj(result.data).id)
        throw new KpiError('load', 'ยังไม่ได้รับหลักฐานยืนยันการบันทึก กรุณาลองอีกครั้ง');
}
function measured(id, label, cohort, event, available, measure, unit = 'percent', reason = 'ยังขาดหลักฐานที่ตรงกับนิยาม', elapsed) {
    const samples = available ? cohort.map(f => ({ f, n: measure(f) })).filter((v) => v.n !== null && Number.isFinite(v.n)) : [];
    const value = samples.length ? samples.reduce((sum, v) => sum + v.n, 0) / samples.length : null;
    const totalSamples = elapsed ? samples.map(v => elapsed(v.f)).filter((v) => v !== null) : [];
    return { id, label, event, unit, value, available: available && samples.length > 0, cohort, eligible: samples.map(v => v.f), results: Object.fromEntries(cohort.map(f => { const sample = samples.find(v => v.f.id === f.id); return [f.id, sample ? unit === 'days' || unit === 'score' ? (0, exports.format)(sample.n, unit) : sample.n === 100 ? 'เข้าเกณฑ์' : 'ไม่เข้าเกณฑ์' : reason]; })), reasons: { [reason]: cohort.length - samples.length }, note: `คำนวณได้ ${samples.length}/${cohort.length} งาน${samples.length < cohort.length ? ' · ' + reason : ''}${totalSamples.length ? ' · เวลารวมเฉลี่ย ' + (0, exports.format)(totalSamples.reduce((a, b) => a + b, 0) / totalSamples.length, 'days') : ''}${unit === 'days' ? ' · วันทำงานตาม ' + exports.organizationCalendar.version + ' (ไม่ใช่ชั่วโมงลงแรง)' : ''}` };
}
function punctual(s, id, label, rows, event, endpoint) {
    return measured(id, label, rows, event, ready(s, 'evidence', 'history', 'work', 'eventCandidates', ...(s.domain === 'creative' ? ['milestoneCandidates', 'milestones'] : ['taskCandidates'])), f => { const due = confirmedDeadline(s, f, endpoint, f[event] || s.asOf); return due && f[event] ? dateKey(f[event]) <= due ? 100 : 0 : null; }, 'percent', 'ยังไม่มีวันกำหนดเดิมที่ยืนยันก่อนเหตุการณ์');
}
function duration(s, id, label, rows, event, start, available) {
    return measured(id, label, rows, event, available, f => workingDays(start(f), f[event]), 'days', 'ขาดเวลาเริ่ม/จบที่ยืนยัน หรืออยู่นอกปฏิทิน 2026', f => { const a = start(f), b = f[event]; return a && b && Date.parse(b) >= Date.parse(a) ? (Date.parse(b) - Date.parse(a)) / DAY : null; });
}
function metrics(snapshot, filters = {}) {
    const all = facts(snapshot).filter(f => f.status !== 'cancelled' && (!filters.person || (filters.person === 'unknown' ? !f.ownerId : f.ownerId === filters.person)) && (!filters.team || f.team === filters.team));
    const cohort = (event) => all.filter(f => inMonth(f[event], snapshot.month, snapshot.asOf));
    if (snapshot.domain === 'creative') {
        const review = cohort('reviewAt'), delivery = cohort('deliveredAt');
        return [punctual(snapshot, 'C01', 'ส่งร่างตรงเวลา', review, 'reviewAt', 'creative_draft'), punctual(snapshot, 'C02', 'ส่งมอบจบตรงเวลา', delivery, 'deliveredAt', 'creative_delivery'), duration(snapshot, 'C03', 'Turnaround ถึงจบงาน', delivery, 'deliveredAt', f => confirmedReady(snapshot, f, f.deliveredAt), ready(snapshot, 'history', 'brief', 'eventCandidates', 'milestoneCandidates', 'milestones')), count('C04', 'งานส่งมอบจบ', delivery, 'deliveredAt', ready(snapshot, 'work', 'eventCandidates', 'milestoneCandidates', 'history', 'milestones'))];
    }
    if (snapshot.domain === 'requester') {
        const requests = cohort('createdAt'), eligible = requests.filter(f => f.briefLink);
        const available = ready(snapshot, 'work', 'briefLinks');
        const sla = measured('R01', 'บรีฟพร้อมล่วงหน้าตาม SLA', requests, 'createdAt', ready(snapshot, 'brief', 'evidence'), f => { const readyAt = confirmedReady(snapshot, f, snapshot.asOf), rule = evidenceFor(snapshot, f, 'sla')[0]; if (!readyAt || !rule || Date.parse(String(rule.recorded_at)) > Date.parse(readyAt) || rule.calendar_version !== exports.organizationCalendar.version || !Number.isInteger(rule.sla_workdays) || Number(rule.sla_workdays) < 0)
            return null; const end = str(rule.required_on) + 'T00:00:00+07:00', gap = workingDays(readyAt, end); if (Date.parse(readyAt) > Date.parse(end))
            return workingDays(end, readyAt) === null ? null : 0; return gap === null ? null : gap >= Number(rule.sla_workdays) ? 100 : 0; }, 'percent', 'ขาดผู้รับยืนยัน วันต้องใช้ หรือข้อตกลง SLA');
        const urgent = measured('R02', 'งานด่วน ณ ส่งคำขอ', requests, 'createdAt', ready(snapshot, 'evidence'), f => { const intake = evidenceFor(snapshot, f, 'intake')[0]; return intake && ['low', 'normal', 'high', 'urgent'].includes(str(intake.priority_at_intake)) ? intake.priority_at_intake === 'urgent' ? 100 : 0 : null; }, 'percent', 'ยังไม่มี priority snapshot ณ ส่งคำขอ');
        return [sla, urgent, { id: 'R03', label: 'มี Brief Link', value: available && requests.length ? eligible.length / requests.length * 100 : null, unit: 'percent', note: available ? `${eligible.length}/${requests.length} คำขอมี Brief Link ณ เวลาอ่านข้อมูล` : 'โหลด Brief Link ไม่ครบ กรุณาลองใหม่', cohort: requests, eligible: available ? eligible : [], reasons: available ? { 'ยังไม่มี Brief Link': requests.length - eligible.length } : { 'โหลด Brief Link ไม่ครบ': requests.length }, event: 'createdAt', available }];
    }
    const submissions = cohort('submitAt'), approvals = cohort('approveAt'), requests = cohort('requestSubmittedAt');
    const open = all.filter(f => before(f.createdAt, snapshot.asOf) && !['delivered', 'cancelled'].includes(f.status));
    const complete = ready(snapshot, 'work', 'eventCandidates', 'taskCandidates', 'history');
    const bounce = requests.filter(f => f.events.some(e => taskEvent(e, 'need_information'))), rework = submissions.filter(f => f.events.some(e => taskEvent(e, 'request_changes') && f.submitAt && Date.parse(str(e.created_at)) >= Date.parse(f.submitAt)));
    const rate = (id, label, rows, hits, event, available) => ({ id, label, value: available && rows.length ? hits.length / rows.length * 100 : null, unit: 'percent', note: available ? `${hits.length}/${rows.length} งาน · ติดตามถึงเวลาอ่านข้อมูล` : 'โหลดประวัติไม่ครบ กรุณาลองใหม่', cohort: rows, eligible: available ? rows : [], reasons: available ? {} : { 'โหลดประวัติไม่ครบ': rows.length }, event, available });
    const overdue = (id, label, endpoint, event) => measured(id, label, open.filter(f => !f[event]), 'snapshot', ready(snapshot, 'open', 'history', 'evidence'), f => { const due = confirmedDeadline(snapshot, f, endpoint); return due ? dateKey(snapshot.asOf) > due ? 100 : 0 : null; }, 'percent', 'ยังไม่มีวันกำหนดเดิมของขั้นนี้');
    const planned = measured('T11', 'งานตามแผน ณ ส่งคำขอ', requests, 'requestSubmittedAt', ready(snapshot, 'requested', 'history', 'evidence'), f => { const intake = evidenceFor(snapshot, f, 'intake')[0]; return intake && ['planned', 'unplanned'].includes(str(intake.plan_at_intake)) ? intake.plan_at_intake === 'planned' ? 100 : 0 : null; }, 'percent', 'ยังไม่มีประเภทตามแผน/งานแทรก ณ intake');
    const surveyTasks = all.filter(f => resourceRows(snapshot, 'surveys').some(r => sid(r.work_item_id) === f.id));
    const csat = measured('T12', 'Internal CSAT (ไตรมาสที่เลือก)', surveyTasks, 'surveyAt', ready(snapshot, 'surveys', 'work'), f => { const responses = resourceRows(snapshot, 'surveys').filter(r => sid(r.work_item_id) === f.id && r.survey_definition === 'internal-csat-1to5-v1' && Number.isInteger(r.score) && Number(r.score) >= 1 && Number(r.score) <= 5); return responses.length ? responses.reduce((n, r) => n + Number(r.score), 0) / responses.length : null; }, 'score', 'ยังไม่มีคำตอบ CSAT ที่ตรวจได้');
    csat.note += ' · ' + snapshot.month.slice(0, 4) + '-Q' + Math.ceil(Number(snapshot.month.slice(5)) / 3) + ' · ตามไตรมาสที่ตอบ ไม่ใช่คะแนนเกม/NPS';
    const age = measured('T09', 'อายุงานที่เริ่มแล้วและยังไม่จบ', open.filter(f => f.startedAt), 'snapshot', ready(snapshot, 'work', 'open', 'history'), f => workingDays(f.startedAt, snapshot.asOf), 'days', 'ไม่มีเวลาเริ่มที่ยืนยัน หรืออยู่นอกปฏิทิน 2026', f => f.startedAt ? (Date.parse(snapshot.asOf) - Date.parse(f.startedAt)) / DAY : null);
    return [punctual(snapshot, 'T01', 'ส่งให้ตรวจตรงเวลา', submissions, 'submitAt', 'task_submit'), punctual(snapshot, 'T10', 'ผู้ขอรับมอบจบตรงเวลา', approvals, 'approveAt', 'task_approve'), duration(snapshot, 'T02', 'ระยะเวลาทำงานถึงส่งตรวจ', submissions, 'submitAt', f => f.startedAt, complete), duration(snapshot, 'T04', 'ระยะเวลาตั้งแต่บรีฟครบถึงจบ', approvals, 'approveAt', f => confirmedReady(snapshot, f, f.approveAt), complete && ready(snapshot, 'evidence')), count('T03', 'Throughput รับมอบแล้ว', approvals, 'approveAt', complete), { ...count('T07', 'งานเปิดปัจจุบัน', open, 'snapshot', ready(snapshot, 'work', 'open')), note: 'snapshot ปัจจุบัน · รวม legacy ที่ยังเปิด ไม่ใช่งานค้างย้อนหลัง' }, rate('T05', 'คืนบรีฟเพราะข้อมูลไม่ครบ', requests, bounce, 'requestSubmittedAt', ready(snapshot, 'work', 'requested', 'history')), rate('T06', 'ขอแก้หลังส่งตรวจ', submissions, rework, 'submitAt', complete), overdue('T08S', 'งานเปิดเกินกำหนดส่งตรวจ', 'task_submit', 'submitAt'), overdue('T08F', 'งานเปิดเกินกำหนดรับมอบ', 'task_approve', 'approveAt'), age, planned, csat];
}
function metricRows(metric) { return metric.cohort.map(f => ({ fact: f, result: metric.results?.[f.id] ?? (!metric.available ? metric.note : metric.id === 'R03' ? (f.briefLink ? 'มี Brief Link' : 'ยังไม่มี Brief Link') : metric.id === 'T05' ? (f.events.some(e => taskEvent(e, 'need_information')) ? 'มีการคืนบรีฟ' : 'ไม่มีการคืนบรีฟ') : metric.id === 'T06' ? (f.events.some(e => taskEvent(e, 'request_changes') && f.submitAt && Date.parse(str(e.created_at)) >= Date.parse(f.submitAt)) ? 'มีการขอแก้หลังส่งตรวจ' : 'ไม่มีการขอแก้หลังส่งตรวจ') : 'นับ Task ID 1 ครั้ง') })); }
function csv(snapshot, metric) {
    if (snapshot.partial || !metric.available)
        throw new KpiError('load', 'ยังส่งออกไม่ได้เพราะข้อมูลไม่ครบหรือสูตรยังไม่พร้อม');
    const rows = metricRows(metric);
    const quote = (value) => `"${(/^\s*[=+@\-]|^[\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`;
    return [['definition_version', 'metric', 'month', 'as_of', 'scope', 'task_id', 'title', 'requester_team', 'first_event', 'confirmed_ready', 'brief_link', 'result'], ...rows.map(({ fact: f, result }) => [exports.version, metric.id, snapshot.month, snapshot.asOf, snapshot.scope, f.displayId, f.title, f.team, metric.event === 'snapshot' ? snapshot.asOf : f[metric.event] ?? '', (['C03', 'T04'].includes(metric.id) ? confirmedReady(snapshot, f, metric.event === 'snapshot' ? snapshot.asOf : f[metric.event] ?? snapshot.asOf) : f.readyAt) ?? '', f.briefLink, result])].map(r => r.map(quote).join(',')).join('\r\n');
}
async function read(query, key, signal) {
    let failureCode = 'UNEXPECTED_CLIENT';
    try {
        const rows = [], seen = new Set();
        let expected = null;
        for (let offset = 0; offset <= 5000; offset += 200) {
            if (signal.aborted)
                throw new Error('cancelled');
            const response = await abortable(query().range(offset, offset + 199).abortSignal(signal), signal);
            if (response.error) {
                failureCode = response.error.code?.replace(/[^A-Z0-9_]/g, '') || 'API_ERROR';
                throw new Error('api');
            }
            if (!Array.isArray(response.data) || !Number.isInteger(response.count) || response.count === null) {
                failureCode = 'INCOMPLETE_RESPONSE';
                throw new Error('incomplete');
            }
            if (expected !== null && response.count !== expected) {
                failureCode = 'COUNT_CHANGED';
                throw new Error('changed');
            }
            expected = response.count;
            for (const row of response.data) {
                const id = key(row);
                if (!id || seen.has(id)) {
                    failureCode = !id ? 'INVALID_ROW_ID' : 'DUPLICATE_ROW';
                    throw new Error('duplicate');
                }
                seen.add(id);
                rows.push(row);
            }
            if (rows.length > 5000)
                throw new Error('too large');
            if (response.data.length < 200) {
                if (rows.length !== expected) {
                    failureCode = 'TRUNCATED_ROWS';
                    throw new Error('incomplete');
                }
                return { status: 'ready', rows, message: '' };
            }
        }
        throw new Error('too large');
    }
    catch {
        return { status: 'error', rows: [], errorCode: signal.aborted ? 'ABORTED' : failureCode, message: signal.aborted ? 'การโหลดถูกยกเลิกหรือใช้เวลานานเกินไป' : 'โหลดหลักฐานไม่ครบ กรุณาลองใหม่' };
    }
}
const byId = (r) => sid(r.id);
const byWork = (r) => sid(r.work_item_id);
const byMilestone = (r) => sid(r.work_item_id) && str(r.milestone) ? `${sid(r.work_item_id)}:${str(r.milestone)}` : '';
const WORK_FIELDS = 'work_item_id,display_id,title,status,created_at,requester_team,archived_at';
const TASK_FIELDS = 'id,display_id,title,status,created_at,requester_team,archived_at';
const EVENT_FIELDS = 'id,work_item_id,event_type,created_at,from_status,to_status,metadata';
const MILESTONE_FIELDS = 'work_item_id,milestone,occurred_at,owner_member_id,owner_name,due_date';
async function chunks(ids, build, key, signal) {
    const rows = [];
    for (let i = 0; i < ids.length; i += 50) {
        const part = await read(() => build(ids.slice(i, i + 50)), key, signal);
        if (part.status === 'error')
            return part;
        rows.push(...part.rows);
    }
    return { status: 'ready', rows, message: '' };
}
function abortable(operation, signal) {
    return new Promise((resolve, reject) => {
        const cancel = () => reject(new KpiError('load', 'การโหลดถูกยกเลิกหรือใช้เวลานานเกินไป'));
        if (signal.aborted) {
            cancel();
            return;
        }
        signal.addEventListener('abort', cancel, { once: true });
        Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
    });
}
async function load(client, viewer, domain, month, externalSignal) {
    if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function')
        throw new KpiError('load', 'ตัวเชื่อมข้อมูลยังไม่พร้อม กรุณารีเฟรชแอป');
    const range = period(month);
    if (!menuAllowed(viewer))
        throw new KpiError('denied', 'ต้องมีสิทธิ์ Lead / Supervisor ตามขอบเขต KPI เดิม');
    const control = new AbortController(), cancel = () => control.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });
    if (externalSignal?.aborted)
        control.abort();
    const timer = setTimeout(cancel, 20000), signal = control.signal, asOf = new Date().toISOString(), resources = {};
    let testExcluded = 0;
    try {
        if (signal.aborted)
            throw new KpiError('load', 'การโหลดถูกยกเลิก');
        const access = await abortable(client.rpc('flowmate_kpi_can_view'), signal);
        if (access.error)
            throw new KpiError('load', 'ตรวจสิทธิ์ KPI ไม่สำเร็จ กรุณาลองใหม่');
        if (access.data !== true)
            throw new KpiError('denied', 'บัญชีนี้ไม่มีสิทธิ์อ่าน KPI ตามกติกาเดิม');
        const bounded = (q, field) => q.gte(field, range.start).lt(field, range.end).lte(field, asOf);
        if (domain === 'requester') {
            // Bound the cheap base-table scan before evaluating the lifetime reporting view.
            resources.requested = await read(() => bounded(client.from('work_items').select('id', { count: 'exact' }).eq('work_type', 'creative_request'), 'created_at').order('id', { ascending: true }), byId, signal);
            if (resources.requested.status === 'error')
                throw new KpiError('load', resources.requested.message, resources.requested.errorCode);
            resources.work = await chunks(resources.requested.rows.map(byId), ids => bounded(client.from('flowmate_creative_kpi_report_v').select(WORK_FIELDS, { count: 'exact' }).in('work_item_id', ids), 'created_at').order('work_item_id', { ascending: true }), byWork, signal);
            const ids = resources.work.rows.map(byWork);
            resources.briefLinks = await chunks(ids, ids => client.from('creative_request_details').select('work_item_id,brief_link', { count: 'exact' }).in('work_item_id', ids).order('work_item_id', { ascending: true }), byWork, signal);
        }
        else {
            const queries = [read(() => { let q = client.from('work_item_events').select(EVENT_FIELDS, { count: 'exact' }).in('to_status', ['review', 'delivered']); if (domain === 'task')
                    q = q.contains('metadata', { source: 'task_assign_workspace' }); return bounded(q, 'created_at').order('id', { ascending: true }); }, byId, signal)];
            if (domain === 'creative')
                queries.push(read(() => bounded(client.from('creative_kpi_milestones').select(MILESTONE_FIELDS, { count: 'exact' }).in('milestone', ['review', 'delivered']), 'occurred_at').order('work_item_id', { ascending: true }).order('milestone', { ascending: true }), byMilestone, signal));
            const candidates = await Promise.all(queries);
            resources.eventCandidates = candidates[0];
            if (domain === 'creative')
                resources.milestoneCandidates = candidates[1];
            const ids = [...new Set(candidates.flatMap(r => r.rows.map(byWork)).filter(Boolean))];
            if (domain === 'task') {
                const quarterStart = Math.floor((Number(month.slice(5)) - 1) / 3) * 3 + 1, quarterMonth = month.slice(0, 4) + '-' + String(quarterStart).padStart(2, '0'), quarterEnd = new Date(Date.UTC(Number(month.slice(0, 4)), quarterStart + 2, 1)).toISOString().slice(0, 10) + 'T00:00:00+07:00';
                const surveys = await read(() => client.from('flowmate_kpi_measurement_evidence').select('id,work_item_id,kind,score,survey_definition,survey_period,recorded_at', { count: 'exact' }).eq('kind', 'csat').eq('work_domain', 'quick_task').gte('recorded_at', period(quarterMonth).start).lt('recorded_at', quarterEnd).lte('recorded_at', asOf).order('id', { ascending: true }), byId, signal);
                resources.surveys = surveys.status === 'error' && ['42P01', 'PGRST205'].includes(surveys.errorCode || '') ? { status: 'unavailable', rows: [], message: 'ยังไม่ได้ติดตั้งชุดเก็บหลักฐาน KPI' } : surveys;
                const [requested, open] = await Promise.all([
                    read(() => bounded(client.from('work_items').select(TASK_FIELDS, { count: 'exact' }).eq('work_type', 'quick_task'), 'created_at').order('id', { ascending: true }), byId, signal),
                    read(() => client.from('work_items').select(TASK_FIELDS, { count: 'exact' }).eq('work_type', 'quick_task').not('status', 'in', '(delivered,cancelled)').is('archived_at', null).lte('created_at', asOf).order('id', { ascending: true }), byId, signal)
                ]);
                // Candidate IDs can include Creative events; explicitly constrain the task query.
                const taskWork = await chunks([...new Set([...ids, ...resources.surveys.rows.map(byWork)])], ids => client.from('work_items').select(TASK_FIELDS, { count: 'exact' }).eq('work_type', 'quick_task').in('id', ids).order('id', { ascending: true }), byId, signal);
                resources.requested = requested;
                resources.open = open;
                resources.taskCandidates = taskWork;
                const union = [...new Map([...taskWork.rows, ...requested.rows, ...open.rows].map(w => [byId(w), w])).values()];
                const classified = [];
                let failed = false;
                for (let i = 0; i < union.length; i += 4) {
                    if (signal.aborted)
                        throw new KpiError('load', 'การโหลดถูกยกเลิก');
                    await Promise.all(union.slice(i, i + 4).map(async (w) => { const r = await abortable(client.rpc('activity_automation_is_test', { p_work_item: byId(w) }), signal); if (r.error || typeof r.data !== 'boolean') {
                        failed = true;
                        return;
                    } if (r.data)
                        testExcluded++;
                    else
                        classified.push(w); }));
                }
                resources.work = failed ? { status: 'error', rows: [], message: 'ตรวจ TEST registry ไม่ครบ กรุณาลองใหม่' } : { status: 'ready', rows: classified, message: '' };
            }
            else
                resources.work = await chunks(ids, ids => client.from('flowmate_creative_kpi_report_v').select(WORK_FIELDS, { count: 'exact' }).in('work_item_id', ids).order('work_item_id', { ascending: true }), byWork, signal);
            const selected = resources.work.rows.map(w => sid(w.work_item_id ?? w.id));
            const [history, milestones] = await Promise.all([
                chunks(selected, ids => client.from('work_item_events').select(EVENT_FIELDS, { count: 'exact' }).in('work_item_id', ids).lte('created_at', asOf).order('id', { ascending: true }), byId, signal),
                domain === 'creative' ? chunks(selected, ids => client.from('creative_kpi_milestones').select(MILESTONE_FIELDS, { count: 'exact' }).in('work_item_id', ids).lte('occurred_at', asOf).order('work_item_id', { ascending: true }).order('milestone', { ascending: true }), byMilestone, signal) : Promise.resolve({ status: 'ready', rows: [], message: '' })
            ]);
            resources.history = history;
            resources.milestones = milestones;
        }
        const selectedIds = resources.work.rows.map(w => sid(w.work_item_id ?? w.id));
        const [brief, evidence] = await Promise.all([
            domain === 'task' ? Promise.resolve({ status: 'ready', rows: [], message: '' }) : chunks(selectedIds, ids => client.from('creative_kpi_brief_evidence').select('id,work_item_id,action,submission_id,actor_user_id,occurred_at,reason,brief_link', { count: 'exact' }).in('work_item_id', ids).lte('occurred_at', asOf).order('id', { ascending: true }), byId, signal),
            chunks(selectedIds, ids => client.from('flowmate_kpi_measurement_evidence').select('id,work_item_id,kind,endpoint,due_date,required_on,sla_workdays,calendar_version,priority_at_intake,plan_at_intake,brief_fingerprint,recorded_at,actor_user_id,score,survey_definition,survey_period', { count: 'exact' }).in('work_item_id', ids).lte('recorded_at', asOf).order('id', { ascending: true }), byId, signal)
        ]);
        resources.brief = brief.status === 'error' && ['42P01', 'PGRST205'].includes(brief.errorCode || '') ? { status: 'unavailable', rows: [], message: 'ยังไม่มีชุดหลักฐานบรีฟที่อ่านได้' } : brief;
        resources.evidence = evidence.status === 'error' && ['42P01', 'PGRST205', 'PGRST202'].includes(evidence.errorCode || '') ? { status: 'unavailable', rows: [], message: 'ยังไม่ได้ติดตั้งชุดเก็บหลักฐาน KPI' } : evidence;
        if (signal.aborted)
            throw new KpiError('load', 'การโหลดใช้เวลานานเกินไป กรุณาลองใหม่');
        if (resources.work.status === 'error')
            throw new KpiError('load', resources.work.message, resources.work.errorCode);
        return { domain, month, asOf, scope: scopeKey(viewer), resources, partial: Object.values(resources).some(r => r.status === 'error'), testExcluded, loadDurationMs: Math.max(0, Date.now() - Date.parse(asOf)) };
    }
    finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', cancel);
    }
}
const api = { version: exports.version, labels: exports.labels, routes: exports.routes, period, scopeKey, menuAllowed, readMonthPreference, writeMonthPreference, format: exports.format, dateKey, facts, metrics, metricRows, csv, load, validReady, workingDays, organizationCalendar: exports.organizationCalendar, confirmedDeadline, evidenceContext, recordEvidence };
globalThis.FlowMateKpi = api;

})();
