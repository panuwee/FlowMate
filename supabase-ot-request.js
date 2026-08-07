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
window.createOtRequest = (payload, key) => callOtRequestRpc("ot_create_request", { p_payload: payload, p_idempotency_key: key }, "OT request could not be submitted.");
window.previewOtEventPlan = (payload, employeeUserIds) => callOtRequestRpc("ot_preview_event_plan", { p_payload: payload, p_employee_user_ids: employeeUserIds }, "OT event plan could not be previewed.");
window.createOtEventPlan = (payload, employeeUserIds, key) => callOtRequestRpc("ot_create_event_plan", { p_payload: payload, p_employee_user_ids: employeeUserIds, p_idempotency_key: key }, "OT event plan could not be created.");
window.recordOtConsent = (requestId, accept, key) => callOtRequestRpc("ot_record_consent", { p_request_id: requestId, p_accept: accept, p_idempotency_key: key }, "OT consent could not be recorded.");
window.reviewOtPlan = (requestId, decision, note, key) => callOtRequestRpc("ot_review_plan", { p_request_id: requestId, p_decision: decision, p_note: note, p_idempotency_key: key }, "OT plan could not be reviewed.");
window.submitOtActual = (requestId, payload, key) => callOtRequestRpc("ot_submit_actual", { p_request_id: requestId, p_payload: payload, p_idempotency_key: key }, "OT actuals could not be submitted.");
window.verifyOtActual = (requestId, decision, note, key) => callOtRequestRpc("ot_verify_actual", { p_request_id: requestId, p_decision: decision, p_note: note, p_idempotency_key: key }, "OT actuals could not be verified.");
window.loadOtComplianceQueue = weekStart => callOtRequestRpc("ot_list_compliance_queue", { p_week_start: weekStart || null }, "OT compliance queue could not be loaded.");
window.reviewOtCompliance = (requestId, outcome, note, key) => callOtRequestRpc("ot_review_compliance", { p_request_id: requestId, p_outcome: outcome, p_note: note, p_idempotency_key: key }, "OT compliance review could not be saved.");
window.loadOtRequestAudit = requestId => callOtRequestRpc("ot_list_request_audit", { p_request_id: requestId }, "OT request audit could not be loaded.");
window.loadOtHrReady = weekStart => callOtRequestRpc("ot_list_hr_ready", { p_week_start: weekStart || null }, "HR-ready OT requests could not be loaded.");
window.markOtExported = (requestIds, batchName, key) => callOtRequestRpc("ot_mark_exported", { p_request_ids: requestIds, p_batch_name: batchName, p_idempotency_key: key }, "OT export could not be marked.");
window.setOtApprover = (userId, active, reason, key) => callOtRequestRpc("ot_set_approver", { p_user_id: userId, p_active: active, p_reason: reason, p_idempotency_key: key }, "OT approver could not be updated.");
window.setOtSystemRole = (userId, roleCode, active, reason, key) => callOtRequestRpc("ot_set_system_role", { p_user_id: userId, p_role_code: roleCode, p_active: active, p_reason: reason, p_idempotency_key: key }, "OT system role could not be updated.");
