async function callOtRequestRpc(name, params, fallbackMessage) {
  if (!window.flowmateSupabase) throw new Error("OT Request data service is not ready.");
  const { data, error } = await window.flowmateSupabase.rpc(name, params || {});
  if (error) {
    throw new Error(window.flowmateUserError
      ? window.flowmateUserError(error, fallbackMessage)
      : error.message || fallbackMessage);
  }
  return data;
}

window.loadOtAccessContext = () => callOtRequestRpc("ot_get_access_context", {}, "OT access could not be loaded.");
window.loadMyOtDashboard = weekStart => callOtRequestRpc("ot_get_my_dashboard", { p_week_start: weekStart }, "Your OT dashboard could not be loaded.");
window.loadMyOtRequests = weekStart => callOtRequestRpc("ot_list_my_requests", { p_week_start: weekStart || null }, "Your OT requests could not be loaded.");
window.loadOtManagerDashboard = (weekStart, functionCode) => callOtRequestRpc("ot_get_manager_dashboard", { p_week_start: weekStart, p_function_code: functionCode || null }, "Team OT could not be loaded.");
window.loadOtEligibleApprovers = () => callOtRequestRpc("ot_list_eligible_approvers", {}, "OT approvers could not be loaded.");
window.loadOtPeopleForEvent = () => callOtRequestRpc("ot_list_people_for_event", {}, "Event participants could not be loaded.");
window.loadOtAccessAdminIdentities = () => callOtRequestRpc("ot_list_access_admin_identities", {}, "OT access identities could not be loaded.");
window.createOtRequest = (payload, key) => callOtRequestRpc("ot_create_request", { p_payload: payload, p_idempotency_key: key }, "OT request could not be submitted.");
window.resubmitOtPlan = (requestId, payload, consentVersion, key) =>
  callOtRequestRpc("ot_resubmit_plan", {
    p_request_id: requestId,
    p_payload: payload,
    p_consent_statement_version: consentVersion,
    p_idempotency_key: key,
  }, "OT request revision could not be resubmitted.");
window.previewOtEventPlan = (payload, employeeUserIds) => callOtRequestRpc("ot_preview_event_plan", { p_payload: payload, p_employee_user_ids: employeeUserIds }, "OT event plan could not be previewed.");
window.createOtEventPlan = (payload, employeeUserIds, key) => callOtRequestRpc("ot_create_event_plan", { p_payload: payload, p_employee_user_ids: employeeUserIds, p_idempotency_key: key }, "OT event plan could not be created.");
window.recordOtConsent = (requestId, accepted, consentStatementVersion, key) => callOtRequestRpc("ot_record_consent", { p_request_id: requestId, p_accept: accepted, p_consent_statement_version: consentStatementVersion, p_idempotency_key: key }, "OT consent could not be recorded.");
window.reviewOtPlan = (requestId, decision, note, key) => callOtRequestRpc("ot_review_plan", { p_request_id: requestId, p_decision: decision, p_note: note, p_idempotency_key: key }, "OT plan could not be reviewed.");
window.submitOtActual = (requestId, payload, key) => callOtRequestRpc("ot_submit_actual", { p_request_id: requestId, p_payload: payload, p_idempotency_key: key }, "OT actuals could not be submitted.");
window.requestOtActualAmendment = (requestId, reason, key) =>
  callOtRequestRpc("ot_request_actual_amendment", {
    p_request_id: requestId,
    p_reason: reason,
    p_idempotency_key: key,
  }, "OT actual amendment could not be requested.");
window.verifyOtActual = (requestId, decision, note, key) => callOtRequestRpc("ot_verify_actual", { p_request_id: requestId, p_decision: decision, p_note: note, p_idempotency_key: key }, "OT actuals could not be verified.");
window.loadOtComplianceQueue = weekStart => callOtRequestRpc("ot_list_compliance_queue", { p_week_start: weekStart || null }, "OT compliance queue could not be loaded.");
window.reviewOtCompliance = (requestId, outcome, note, key) => callOtRequestRpc("ot_review_compliance", { p_request_id: requestId, p_outcome: outcome, p_note: note, p_idempotency_key: key }, "OT compliance review could not be saved.");
window.loadOtRequestAudit = requestId => callOtRequestRpc("ot_list_request_audit", { p_request_id: requestId }, "OT request audit could not be loaded.");
window.loadOtHrReady = weekStart => callOtRequestRpc("ot_list_hr_ready", { p_week_start: weekStart || null }, "HR-ready OT requests could not be loaded.");
window.markOtExported = (requestIds, batchName, key) => callOtRequestRpc("ot_mark_exported", { p_request_ids: requestIds, p_batch_name: batchName, p_idempotency_key: key }, "OT export could not be marked.");
window.reassignPendingOtApprover = (fromUserId, toUserId, reason, key) =>
  callOtRequestRpc("ot_reassign_pending_approver", {
    p_from_user_id: fromUserId,
    p_to_user_id: toUserId,
    p_reason: reason,
    p_idempotency_key: key,
  }, "Pending OT approver work could not be reassigned.");
window.setOtApprover = (userId, active, reason, key) => callOtRequestRpc("ot_set_approver", { p_user_id: userId, p_active: active, p_reason: reason, p_idempotency_key: key }, "OT approver could not be updated.");
window.setOtSystemRole = (userId, roleCode, active, reason, key) => callOtRequestRpc("ot_set_system_role", { p_user_id: userId, p_role_code: roleCode, p_active: active, p_reason: reason, p_idempotency_key: key }, "OT system role could not be updated.");

const OT_HR_CSV_COLUMNS = "request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at".split(",");

function getOtHrBangkokDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function otHrCsvValue(row, column) {
  const fields = {
    request_id: row.request_id ?? row.requestId ?? row.id,
    employee_email: row.employee_email ?? row.employeeEmail,
    function: row.function ?? row.function_code ?? row.functionCode,
    assignment: row.assignment ?? row.title,
    event_id: row.event_id ?? row.event_plan_id ?? row.eventPlanId,
    work_date: row.work_date ?? row.workDate ?? getOtHrBangkokDate(row.actual_start_at ?? row.actualStartAt ?? row.planned_start_at ?? row.plannedStartAt),
    day_type: row.day_type ?? row.dayType,
    planned_start: row.planned_start ?? row.planned_start_at ?? row.plannedStartAt,
    planned_end: row.planned_end ?? row.planned_end_at ?? row.plannedEndAt,
    planned_break_minutes: row.planned_break_minutes ?? row.plannedBreakMinutes,
    planned_minutes: row.planned_minutes ?? row.plannedMinutes,
    actual_start: row.actual_start ?? row.actual_start_at ?? row.actualStartAt,
    actual_end: row.actual_end ?? row.actual_end_at ?? row.actualEndAt,
    actual_break_minutes: row.actual_break_minutes ?? row.actualBreakMinutes,
    actual_minutes: row.actual_minutes ?? row.actualMinutes,
    reason_code: row.reason_code ?? row.reasonCode,
    reason_detail: row.reason_detail ?? row.reasonDetail,
    approver_email: row.approver_email ?? row.approverEmail,
    employee_confirmed_at: row.employee_confirmed_at ?? row.actual_submitted_at ?? row.actualSubmittedAt,
    verified_at: row.verified_at ?? row.actual_verified_at ?? row.actualVerifiedAt,
    compliance_outcome: row.compliance_outcome ?? row.complianceOutcome,
    hr_ready_at: row.hr_ready_at ?? row.hrReadyAt,
  };
  return fields[column] ?? "";
}

function escapeOtHrCsvCell(value) {
  const text = String(value ?? "");
  const spreadsheetSafeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(spreadsheetSafeText) ? `"${spreadsheetSafeText.replace(/"/g, '""')}"` : spreadsheetSafeText;
}

function buildOtHrCsv(rows) {
  const records = Array.isArray(rows) ? rows : [];
  return [
    OT_HR_CSV_COLUMNS.join(","),
    ...records.map(row => OT_HR_CSV_COLUMNS.map(column => escapeOtHrCsvCell(otHrCsvValue(row || {}, column))).join(",")),
  ].join("\r\n");
}

window.FlowMateOtIntent = Object.freeze({
  signature(parts) {
    return JSON.stringify(Array.isArray(parts) ? parts : [parts]);
  },
  establish(current, signature, createKey) {
    if (current?.key && current.signature === signature) return current;
    return { key: createKey(), signature };
  },
  complete() {
    return null;
  },
});

window.FlowMateOtHrCsv = Object.freeze({
  columns: Object.freeze(OT_HR_CSV_COLUMNS.slice()),
  escapeCell: escapeOtHrCsvCell,
  build: buildOtHrCsv,
});

window.FlowMateOtHrExport = Object.freeze({
  establish(current, signature, createKey) {
    const established = window.FlowMateOtIntent.establish(current, signature, createKey);
    return established === current ? current : { ...established, downloaded: false };
  },
  createLocalFile(rows, batchName, initiateDownload, buildCsv = buildOtHrCsv) {
    try {
      const csv = buildCsv(rows);
      if (initiateDownload(csv, batchName) !== true) {
        throw new Error("The browser did not initiate the CSV download.");
      }
      return { ok: true };
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? error.message
        : String(error || "Local CSV creation failed.");
      return { ok: false, error: new Error(message) };
    }
  },
  markDownloaded(intent) {
    return { ...intent, downloaded: true };
  },
  phase(intent) {
    return intent?.downloaded ? "mark" : "download";
  },
});
